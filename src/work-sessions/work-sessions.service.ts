import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/errors/app-error';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { cacheKey, cacheTtlMs } from '../common/utils/cache.util';
import { paginateArray } from '../common/utils/pagination.util';
import { AppsScriptClientService } from '../upstream/apps-script-client.service';
import { CreateWorkSessionDto } from './dto/create-work-session.dto';
import { GenerateDailyWorkSessionsDto } from './dto/generate-daily-work-sessions.dto';
import { ListWorkSessionsQueryDto } from './dto/list-work-sessions-query.dto';
import { PatchSessionItemDto } from './dto/patch-session-item.dto';
import { UpsertSessionItemDto } from './dto/upsert-session-item.dto';

@Injectable()
export class WorkSessionsService {
  private readonly listTtlSec: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly appsScriptClient: AppsScriptClientService,
    private readonly auditService: AuditService,
  ) {
    this.listTtlSec = Number(this.configService.get('CACHE_TTL_LISTS_SEC') ?? 60);
  }

  async createSession(actor: AuthUser, dto: CreateWorkSessionDto) {
    if (actor.role !== 'ADMIN' && actor.role !== 'LEADER') {
      throw new AppError('FORBIDDEN', 'Cannot create sessions');
    }

    const userId = this.normalizeUserId(dto.user_id);
    const sessionDate = this.normalizeSessionDate(dto.session_date);

    if (actor.role === 'LEADER') {
      await this.assertLeaderCanManageUser(actor.user_id, userId);
    }

    const existingOpen = await this.getOpenSessionByUserAndDate(userId, sessionDate);
    if (existingOpen) {
      return {
        created: false,
        session: existingOpen,
      };
    }

    const sessionData: Record<string, unknown> = {
      session_date: sessionDate,
      session_status: dto.session_status ?? 'OPEN',
      ...(dto.user_name ? { user_name: dto.user_name } : {}),
      ...(dto.user_team ? { user_team: dto.user_team } : {}),
      ...(dto.user_leader ? { user_leader: dto.user_leader } : {}),
      ...(dto.goal_mode ? { goal_mode: dto.goal_mode } : {}),
      ...(dto.goal_target_total != null ? { goal_target_total: dto.goal_target_total } : {}),
    };

    const createdSession = await this.appsScriptClient.call<Record<string, unknown>>(
      'create_session',
      {
        user_id: userId,
        session_data: sessionData,
      },
      {
        legacyArgs: [userId, sessionData],
      },
    );

    await this.auditService.record(
      'work_session.create',
      actor.user_id,
      'work_session',
      String(createdSession.session_id ?? 'unknown'),
      {
        user_id: userId,
        session_date: sessionDate,
      },
    );

    await this.clearCache();

    return {
      created: true,
      session: createdSession,
    };
  }

  async generateDaily(actor: AuthUser, dto: GenerateDailyWorkSessionsDto) {
    if (actor.role !== 'ADMIN' && actor.role !== 'LEADER') {
      throw new AppError('FORBIDDEN', 'Cannot generate daily sessions');
    }

    if (actor.role !== 'ADMIN' && (dto.leader_id != null || dto.team_id)) {
      throw new AppError('FORBIDDEN', 'Only ADMIN can use leader_id or team_id filters');
    }

    const sessionDate = this.normalizeSessionDate(dto.session_date);
    const seedItems = dto.seed_items ?? true;
    const allowClosed = dto.allow_closed ?? false;

    const initiatives = await this.getInitiativesForDate(sessionDate);
    const skipped: { user_id: string; reason: string }[] = [];
    const sessionsSummary: Record<string, unknown>[] = [];

    if (initiatives.length === 0) {
      return {
        session_date: sessionDate,
        created_sessions: 0,
        existing_sessions: 0,
        seeded_items: 0,
        skipped,
        sessions: sessionsSummary,
      };
    }

    const leaderScopeIds =
      actor.role === 'LEADER' ? await this.getTeamUserIds(actor.user_id) : null;

    const adminLeaderScopeIds =
      actor.role === 'ADMIN' && dto.leader_id != null
        ? await this.getTeamUserIds(dto.leader_id)
        : null;

    const userInitiatives = new Map<number, Map<string, Record<string, unknown>>>();
    const userMetadata = new Map<number, Record<string, unknown>>();

    for (const initiative of initiatives) {
      const initiativeId = String(initiative.initiative_id ?? '');
      if (!initiativeId) {
        continue;
      }

      const membersData = await this.appsScriptClient.call<unknown>(
        'list_members_by_initiative',
        {
          initiative_id: initiativeId,
          only_active: true,
        },
        {
          legacyArgs: [initiativeId, true],
        },
      );

      const members = this.asRows(membersData);
      for (const member of members) {
        const rawUserId = member.user_id;
        const userId = Number(rawUserId);
        if (!Number.isInteger(userId) || userId <= 0) {
          continue;
        }

        const memberTeam = String(member.user_team ?? '');
        if (actor.role === 'ADMIN' && dto.team_id && dto.team_id !== memberTeam) {
          continue;
        }

        if (actor.role === 'ADMIN' && adminLeaderScopeIds && !adminLeaderScopeIds.includes(userId)) {
          continue;
        }

        if (actor.role === 'LEADER' && leaderScopeIds && !leaderScopeIds.includes(userId)) {
          this.pushSkipped(skipped, userId, 'not_in_leader_scope');
          continue;
        }

        let initiativesByUser = userInitiatives.get(userId);
        if (!initiativesByUser) {
          initiativesByUser = new Map<string, Record<string, unknown>>();
          userInitiatives.set(userId, initiativesByUser);
        }

        initiativesByUser.set(initiativeId, initiative);
        if (!userMetadata.has(userId)) {
          userMetadata.set(userId, member);
        }
      }
    }

    const existingForDate = await this.fetchSessionsForDate(sessionDate);
    const sessionsByUser = this.groupSessionsByUser(existingForDate);

    let createdSessions = 0;
    let existingSessions = 0;
    let seededItems = 0;

    for (const [userId, initiativesByUser] of userInitiatives.entries()) {
      const openSession = sessionsByUser.get(userId)?.open;
      const closedSession = sessionsByUser.get(userId)?.closed;

      let session: Record<string, unknown> | null = openSession ?? null;
      let created = false;

      if (!session) {
        const directOpenSession = await this.getOpenSessionByUserAndDate(userId, sessionDate);
        if (directOpenSession) {
          session = directOpenSession;
        }
      }

      if (!session) {
        if (closedSession && !allowClosed) {
          this.pushSkipped(skipped, userId, 'closed_exists');
          continue;
        }

        const metadata = userMetadata.get(userId) ?? {};
        const sessionData: Record<string, unknown> = {
          session_date: sessionDate,
          session_status: 'OPEN',
          ...(metadata.user_name ? { user_name: metadata.user_name } : {}),
          ...(metadata.user_team ? { user_team: metadata.user_team } : {}),
          ...(metadata.user_leader != null ? { user_leader: String(metadata.user_leader) } : {}),
        };

        session = await this.appsScriptClient.call<Record<string, unknown>>(
          'create_session',
          {
            user_id: userId,
            session_data: sessionData,
          },
          {
            legacyArgs: [userId, sessionData],
          },
        );

        created = true;
        createdSessions += 1;
      } else {
        existingSessions += 1;
      }

      const sessionId = String(session.session_id ?? '');
      if (!sessionId) {
        continue;
      }

      sessionsSummary.push({
        session_id: sessionId,
        user_id: userId,
        session_date: sessionDate,
        session_status: String(session.session_status ?? ''),
        source: created ? 'created' : 'existing',
      });

      if (seedItems) {
        const initiativesToSeed = Array.from(initiativesByUser.values());
        const seeded = await this.seedSessionItems(sessionId, initiativesToSeed, actor.user_id);
        seededItems += seeded;
      }
    }

    await this.auditService.record(
      'work_session.generate_daily',
      actor.user_id,
      'work_session',
      `date:${sessionDate}`,
      {
        session_date: sessionDate,
        created_sessions: createdSessions,
        existing_sessions: existingSessions,
        seeded_items: seededItems,
      },
    );

    await this.clearCache();

    return {
      session_date: sessionDate,
      created_sessions: createdSessions,
      existing_sessions: existingSessions,
      seeded_items: seededItems,
      skipped,
      sessions: sessionsSummary,
    };
  }

  async upsertItem(
    actor: AuthUser,
    sessionId: string,
    dto: UpsertSessionItemDto,
  ) {
    const session = await this.fetchSessionById(sessionId);
    await this.assertCanWriteSession(actor, session);

    if (String(session.session_status ?? '').toUpperCase() !== 'OPEN') {
      throw new AppError('SESSION_CLOSED', 'Session is not open');
    }

    const initiative = await this.fetchInitiativeById(dto.initiative_id);
    if (String(initiative.initiative_status ?? '').toUpperCase() !== 'ACTIVE') {
      throw new AppError('INITIATIVE_NOT_ACTIVE', 'Initiative is not active');
    }

    const isAssigned = await this.isUserAssignedToInitiative(
      Number(session.user_id),
      dto.initiative_id,
    );

    if (!isAssigned) {
      throw new AppError('USER_NOT_ASSIGNED', 'User is not assigned to initiative');
    }

    const response = await this.appsScriptClient.call(
      'upsert_session_item',
      {
        session_id: sessionId,
        initiative_id: dto.initiative_id,
        tasks_done: dto.tasks_done,
        updated_by: actor.user_id,
      },
      {
        legacyArgs: [
          sessionId,
          dto.initiative_id,
          dto.tasks_done,
          { updated_by: actor.user_id },
        ],
      },
    );

    await this.auditService.record(
      'work_session.item_upsert',
      actor.user_id,
      'work_session',
      sessionId,
      {
        initiative_id: dto.initiative_id,
        tasks_done: dto.tasks_done,
      },
    );

    await this.clearCache();

    return {
      updated: true,
      item: response,
    };
  }

  async patchItem(
    actor: AuthUser,
    sessionId: string,
    itemId: string,
    dto: PatchSessionItemDto,
  ) {
    const session = await this.fetchSessionById(sessionId);

    if (String(session.session_status ?? '').toUpperCase() !== 'OPEN') {
      throw new AppError('SESSION_CLOSED', 'Session is not open');
    }

    const patchData: Record<string, unknown> = {
      ...dto,
    };

    if (dto.tasks_done != null) {
      patchData.tasks_done_count = dto.tasks_done;
      delete patchData.tasks_done;
    }

    const response = await this.appsScriptClient.call(
      'update_session_item',
      {
        item_id: itemId,
        patch_data: patchData,
        updated_by: actor.user_id,
      },
      {
        legacyArgs: [itemId, patchData, actor.user_id],
      },
    );

    await this.auditService.record(
      'work_session.item_edit',
      actor.user_id,
      'work_session_item',
      itemId,
      {
        session_id: sessionId,
        patch: patchData,
      },
    );

    await this.clearCache();
    return response;
  }

  async closeSession(actor: AuthUser, sessionId: string) {
    const session = await this.fetchSessionById(sessionId);
    await this.assertCanCloseSession(actor, session);

    const sessionStatus = String(session.session_status ?? '').toUpperCase();
    if (sessionStatus === 'CLOSED') {
      throw new AppError('SESSION_ALREADY_CLOSED', 'Session is already closed');
    }

    if (sessionStatus !== 'OPEN') {
      throw new AppError('SESSION_CLOSED', 'Session cannot be closed');
    }

    const itemsData = await this.appsScriptClient.call<unknown>('list_items_by_session', {
      session_id: sessionId,
    }, {
      legacyArgs: [sessionId],
    });

    const items = this.asRows(itemsData);
    const totalTasks = items.reduce(
      (sum, item) => sum + Number(item.tasks_done_count ?? item.tasks_done ?? 0),
      0,
    );
    const totalInitiatives = new Set(
      items.map((item) => String(item.initiative_id ?? '')),
    ).size;

    const goalMode = String(session.goal_mode ?? 'SESSION_TOTAL').toUpperCase();
    const goalIsMet = this.calculateGoalIsMet(goalMode, session, items, totalTasks);

    const patchData = {
      session_status: 'CLOSED',
      session_end_at: new Date().toISOString(),
      total_tasks_done: totalTasks,
      total_initiatives_count: totalInitiatives,
      goal_is_met: goalIsMet,
    };

    await this.appsScriptClient.call(
      'update_session',
      {
        session_id: sessionId,
        patch_data: patchData,
        updated_by: actor.user_id,
      },
      {
        legacyArgs: [sessionId, patchData, actor.user_id],
      },
    );

    await this.auditService.record(
      'work_session.close',
      actor.user_id,
      'work_session',
      sessionId,
      patchData,
    );

    await this.clearCache();

    return {
      session_closed: true,
      goal_met: goalIsMet,
      total_tasks_done: totalTasks,
      total_initiatives_count: totalInitiatives,
    };
  }

  async listSessions(actor: AuthUser, query: ListWorkSessionsQueryDto) {
    const key = cacheKey(
      'work_sessions',
      actor.user_id,
      actor.role,
      query.user_id ?? '',
      query.team_id ?? '',
      query.leader_id ?? '',
      query.date_from ?? '',
      query.date_to ?? '',
      query.status ?? '',
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    const cached = await this.cacheManager.get(key);
    if (cached) {
      return cached;
    }

    const normalizedDateFrom = query.date_from
      ? this.normalizeSessionDate(query.date_from)
      : undefined;
    const normalizedDateTo = query.date_to
      ? this.normalizeSessionDate(query.date_to)
      : undefined;

    const filters: Record<string, unknown> = {
      ...(query.user_id != null ? { user_id: query.user_id } : {}),
      ...(query.team_id ? { user_team: query.team_id } : {}),
      ...(query.leader_id != null ? { user_leader: query.leader_id } : {}),
      ...(query.status ? { session_status: query.status } : {}),
      ...(normalizedDateFrom && normalizedDateTo && normalizedDateFrom === normalizedDateTo
        ? { session_date: normalizedDateFrom }
        : {}),
    };

    const data = await this.appsScriptClient.call<unknown>(
      'list_sessions',
      filters,
      {
        legacyArgs: [filters],
      },
    );

    let sessions = this.asRows(data);

    sessions = await this.filterByRole(actor, sessions);

    if (query.user_id) {
      sessions = sessions.filter((session) => Number(session.user_id) === query.user_id);
    }
    if (query.team_id) {
      sessions = sessions.filter((session) => String(session.user_team ?? '') === query.team_id);
    }
    if (query.leader_id != null) {
      sessions = sessions.filter((session) => {
        const leaderValue = session.user_leader ?? session.user_leader_id;
        return (
          Number(leaderValue) === query.leader_id ||
          String(leaderValue) === String(query.leader_id)
        );
      });
    }
    if (query.status) {
      sessions = sessions.filter(
        (session) => String(session.session_status ?? '').toUpperCase() === query.status,
      );
    }
    if (normalizedDateFrom) {
      const fromDate = this.parseDate(normalizedDateFrom);
      if (fromDate) {
        sessions = sessions.filter((session) => {
          const sessionDate = this.parseDate(session.session_date);
          return !!sessionDate && sessionDate >= fromDate;
        });
      }
    }
    if (normalizedDateTo) {
      const toDate = this.parseDate(normalizedDateTo);
      if (toDate) {
        sessions = sessions.filter((session) => {
          const sessionDate = this.parseDate(session.session_date);
          return !!sessionDate && sessionDate <= toDate;
        });
      }
    }

    const response = paginateArray(sessions, {
      page: query.page,
      pageSize: query.pageSize,
    });

    await this.cacheManager.set(key, response, cacheTtlMs(this.listTtlSec));

    return response;
  }

  private async filterByRole(
    actor: AuthUser,
    sessions: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (actor.role === 'ADMIN') {
      return sessions;
    }

    if (actor.role === 'USER') {
      return sessions.filter((session) => Number(session.user_id) === actor.user_id);
    }

    const teamUserIds = await this.getTeamUserIds(actor.user_id);
    return sessions.filter((session) => teamUserIds.includes(Number(session.user_id)));
  }

  private async fetchSessionById(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.appsScriptClient.call<Record<string, unknown>>(
      'get_session_by_id',
      { session_id: sessionId },
      { legacyArgs: [sessionId] },
    );

    if (!session || !session.session_id) {
      throw new AppError('SESSION_NOT_FOUND', 'Session not found');
    }

    return session;
  }

  private async fetchInitiativeById(initiativeId: string) {
    const initiative = await this.appsScriptClient.call<Record<string, unknown>>(
      'get_initiative_by_id',
      { initiative_id: initiativeId },
      { legacyArgs: [initiativeId] },
    );

    if (!initiative || !initiative.initiative_id) {
      throw new AppError('INITIATIVE_NOT_FOUND', 'Initiative not found');
    }

    return initiative;
  }

  private async isUserAssignedToInitiative(
    userId: number,
    initiativeId: string,
  ): Promise<boolean> {
    const membersData = await this.appsScriptClient.call<unknown>('list_members_by_initiative', {
      initiative_id: initiativeId,
      only_active: true,
    }, {
      legacyArgs: [initiativeId, true],
    });

    const members = this.asRows(membersData);
    return members.some((member) => Number(member.user_id) === userId);
  }

  private async assertCanWriteSession(
    actor: AuthUser,
    session: Record<string, unknown>,
  ) {
    if (actor.role === 'ADMIN') {
      return;
    }

    const ownerId = Number(session.user_id);
    if (actor.user_id === ownerId) {
      return;
    }

    throw new AppError('FORBIDDEN', 'Cannot write on this session');
  }

  private async assertCanCloseSession(
    actor: AuthUser,
    session: Record<string, unknown>,
  ) {
    if (actor.role === 'ADMIN') {
      return;
    }

    const ownerId = Number(session.user_id);
    if (actor.user_id === ownerId) {
      return;
    }

    if (actor.role === 'LEADER') {
      const teamUserIds = await this.getTeamUserIds(actor.user_id);
      if (teamUserIds.includes(ownerId)) {
        return;
      }
    }

    throw new AppError('FORBIDDEN', 'Cannot close this session');
  }

  private calculateGoalIsMet(
    goalMode: string,
    session: Record<string, unknown>,
    items: Record<string, unknown>[],
    totalTasks: number,
  ): boolean {
    if (goalMode === 'PER_INITIATIVE') {
      return items.every((item) => {
        const target = Number(item.target_task_count ?? 0);
        if (target <= 0) {
          return true;
        }

        const done = Number(item.tasks_done_count ?? item.tasks_done ?? 0);
        return done >= target;
      });
    }

    const targetTotal = Number(session.goal_target_total ?? 0);
    if (targetTotal <= 0) {
      return totalTasks > 0;
    }

    return totalTasks >= targetTotal;
  }

  private async getOpenSessionByUserAndDate(
    userId: number,
    sessionDate: string,
  ): Promise<Record<string, unknown> | null> {
    const session = await this.appsScriptClient.call<Record<string, unknown> | null>(
      'get_open_session_by_user_and_date',
      {
        user_id: userId,
        session_date: sessionDate,
      },
      {
        legacyArgs: [userId, sessionDate],
      },
    );

    if (!session || typeof session !== 'object' || !session.session_id) {
      return null;
    }

    return session;
  }

  private async fetchSessionsForDate(sessionDate: string): Promise<Record<string, unknown>[]> {
    const data = await this.appsScriptClient.call<unknown>(
      'list_sessions',
      {
        session_date: sessionDate,
      },
      {
        legacyArgs: [{ session_date: sessionDate }],
      },
    );

    const targetDate = this.parseDate(sessionDate);
    if (!targetDate) {
      return [];
    }

    return this.asRows(data).filter((row) => {
      const date = this.parseDate(row.session_date);
      return !!date && date.getTime() === targetDate.getTime();
    });
  }

  private groupSessionsByUser(
    sessions: Record<string, unknown>[],
  ): Map<number, { open: Record<string, unknown> | null; closed: boolean }> {
    const grouped = new Map<number, { open: Record<string, unknown> | null; closed: boolean }>();

    for (const session of sessions) {
      const userId = Number(session.user_id);
      if (!Number.isInteger(userId) || userId <= 0) {
        continue;
      }

      const state = grouped.get(userId) ?? { open: null, closed: false };
      const status = String(session.session_status ?? '').toUpperCase();
      if (status === 'OPEN') {
        state.open = session;
      }
      if (status === 'CLOSED') {
        state.closed = true;
      }

      grouped.set(userId, state);
    }

    return grouped;
  }

  private async getInitiativesForDate(sessionDate: string): Promise<Record<string, unknown>[]> {
    const targetDate = this.parseDate(sessionDate);
    if (!targetDate) {
      throw new AppError('VALIDATION_ERROR', 'Invalid session_date');
    }

    let data: unknown;
    try {
      data = await this.appsScriptClient.call<unknown>(
        'list_initiatives_for_date',
        { session_date: sessionDate },
        { legacyArgs: [sessionDate] },
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'UPSTREAM_ERROR') {
        throw error;
      }

      data = await this.appsScriptClient.call<unknown>(
        'list_initiatives',
        {
          status: 'ACTIVE',
        },
        {
          legacyArgs: [{ status: 'ACTIVE' }],
        },
      );
    }

    const initiatives = this.asRows(data);
    return initiatives.filter((initiative) => this.initiativeMatchesDate(initiative, targetDate));
  }

  private initiativeMatchesDate(
    initiative: Record<string, unknown>,
    targetDate: Date,
  ): boolean {
    const status = String(initiative.initiative_status ?? '').toUpperCase();
    if (status && status !== 'ACTIVE') {
      return false;
    }

    const startDate = this.readDateField(initiative, [
      'active_from',
      'initiative_active_from',
      'initiative_start_date',
      'start_date',
    ]);
    const endDate = this.readDateField(initiative, [
      'active_to',
      'initiative_active_to',
      'initiative_end_date',
      'end_date',
    ]);

    if (startDate && targetDate < startDate) {
      return false;
    }
    if (endDate && targetDate > endDate) {
      return false;
    }

    const allowedDays = this.readDaysOfWeek(initiative);
    if (!allowedDays) {
      return true;
    }

    return allowedDays.includes(targetDate.getDay());
  }

  private readDateField(
    row: Record<string, unknown>,
    fieldNames: string[],
  ): Date | null {
    for (const fieldName of fieldNames) {
      const value = row[fieldName];
      const date = this.parseDate(value);
      if (date) {
        return date;
      }
    }

    return null;
  }

  private readDaysOfWeek(row: Record<string, unknown>): number[] | null {
    const value =
      row.days_of_week ??
      row.initiative_days_of_week ??
      row.active_days_of_week ??
      row.schedule_days;

    if (value == null) {
      return null;
    }

    const normalized: number[] = [];

    const parseToken = (token: unknown): number | null => {
      if (typeof token === 'number' && token >= 0 && token <= 6) {
        return token;
      }

      const text = String(token).trim().toUpperCase();
      if (!text) {
        return null;
      }

      if (/^\d+$/.test(text)) {
        const numeric = Number(text);
        if (numeric >= 0 && numeric <= 6) {
          return numeric;
        }
      }

      const map: Record<string, number> = {
        SUN: 0,
        SUNDAY: 0,
        DOM: 0,
        DOMINGO: 0,
        MON: 1,
        MONDAY: 1,
        LUN: 1,
        LUNES: 1,
        TUE: 2,
        TUESDAY: 2,
        MAR: 2,
        MARTES: 2,
        WED: 3,
        WEDNESDAY: 3,
        MIE: 3,
        MIERCOLES: 3,
        THU: 4,
        THURSDAY: 4,
        JUE: 4,
        JUEVES: 4,
        FRI: 5,
        FRIDAY: 5,
        VIE: 5,
        VIERNES: 5,
        SAT: 6,
        SATURDAY: 6,
        SAB: 6,
        SABADO: 6,
      };

      const key = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\./g, '');

      return map[key] ?? null;
    };

    const tokens = Array.isArray(value)
      ? value
      : String(value)
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    for (const token of tokens) {
      const day = parseToken(token);
      if (day != null && !normalized.includes(day)) {
        normalized.push(day);
      }
    }

    return normalized.length > 0 ? normalized : null;
  }

  private async seedSessionItems(
    sessionId: string,
    initiatives: Record<string, unknown>[],
    actorUserId: number,
  ): Promise<number> {
    const byInitiativeId = new Map<string, Record<string, unknown>>();
    for (const initiative of initiatives) {
      const initiativeId = String(initiative.initiative_id ?? '');
      if (!initiativeId) {
        continue;
      }

      byInitiativeId.set(initiativeId, {
        initiative_id: initiativeId,
        initiative_name: String(initiative.initiative_name ?? ''),
        ...(initiative.task_type != null ? { task_type: initiative.task_type } : {}),
        ...(initiative.initiative_task_count_target != null
          ? { target_task_count: Number(initiative.initiative_task_count_target) }
          : initiative.target_task_count != null
            ? { target_task_count: Number(initiative.target_task_count) }
            : {}),
        tasks_done_count: 0,
      });
    }

    const items = Array.from(byInitiativeId.values());
    if (items.length === 0) {
      return 0;
    }

    try {
      const response = await this.appsScriptClient.call<unknown>(
        'seed_session_items',
        {
          session_id: sessionId,
          items,
          updated_by: actorUserId,
        },
        {
          legacyArgs: [sessionId, items, actorUserId],
        },
      );

      return this.extractSeededCount(response, items.length);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'UPSTREAM_ERROR') {
        throw error;
      }
    }

    const existingItemsData = await this.appsScriptClient.call<unknown>(
      'list_items_by_session',
      { session_id: sessionId },
      { legacyArgs: [sessionId] },
    );

    const existingInitiativeIds = new Set(
      this.asRows(existingItemsData).map((item) => String(item.initiative_id ?? '')),
    );

    let seededCount = 0;
    for (const item of items) {
      const initiativeId = String(item.initiative_id ?? '');
      if (!initiativeId || existingInitiativeIds.has(initiativeId)) {
        continue;
      }

      await this.appsScriptClient.call(
        'upsert_session_item',
        {
          session_id: sessionId,
          initiative_id: initiativeId,
          tasks_done: 0,
          patch_data: item,
          updated_by: actorUserId,
        },
        {
          legacyArgs: [sessionId, initiativeId, 0, { ...item, updated_by: actorUserId }],
        },
      );

      seededCount += 1;
    }

    return seededCount;
  }

  private extractSeededCount(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      for (const key of ['seeded_items', 'seeded_count', 'created_count', 'count']) {
        const candidate = Number(row[key]);
        if (Number.isFinite(candidate) && candidate >= 0) {
          return candidate;
        }
      }
    }

    return fallback;
  }

  private pushSkipped(
    skipped: { user_id: string; reason: string }[],
    userId: number,
    reason: string,
  ) {
    const userIdText = String(userId);
    const alreadyExists = skipped.some(
      (entry) => entry.user_id === userIdText && entry.reason === reason,
    );

    if (!alreadyExists) {
      skipped.push({ user_id: userIdText, reason });
    }
  }

  private normalizeUserId(value: unknown): number {
    const userId = Number(value);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Invalid user_id');
    }

    return userId;
  }

  private normalizeSessionDate(value: unknown): string {
    const date = this.parseDate(value);
    if (!date) {
      throw new AppError('VALIDATION_ERROR', 'Invalid session_date. Expected DD/MM/YYYY');
    }

    return this.toSheetDate(date);
  }

  private parseDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const text = String(value).trim();
    if (!text) {
      return null;
    }

    const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      const day = Number(dd);
      const month = Number(mm);
      const year = Number(yyyy);
      const date = new Date(year, month - 1, day);
      if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }
      return date;
    }

    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (isoDate) {
      const [, yyyy, mm, dd] = isoDate;
      const day = Number(dd);
      const month = Number(mm);
      const year = Number(yyyy);
      const date = new Date(year, month - 1, day);
      if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }
      return date;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private toSheetDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private async assertLeaderCanManageUser(leaderId: number, userId: number) {
    const teamUserIds = await this.getTeamUserIds(leaderId);
    if (!teamUserIds.includes(userId)) {
      throw new AppError('FORBIDDEN', 'Leader cannot manage this user');
    }
  }

  private async getTeamUserIds(leaderId: number): Promise<number[]> {
    const usersData = await this.appsScriptClient.call<unknown>('get_users_by_leader_id', {
      leader_id: leaderId,
    }, {
      legacyArgs: [leaderId],
    });

    const users = this.asRows(usersData);
    const ids = users
      .map((item) => Number(item.user_id))
      .filter((id) => Number.isFinite(id));

    if (!ids.includes(leaderId)) {
      ids.push(leaderId);
    }

    return ids;
  }

  private asRows(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value as Record<string, unknown>[];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['items', 'data', 'sessions', 'rows']) {
        const candidate = record[key];
        if (Array.isArray(candidate)) {
          return candidate as Record<string, unknown>[];
        }
      }
    }

    return [];
  }

  private async clearCache() {
    const cache = this.cacheManager as unknown as { clear?: () => Promise<void> };
    if (cache.clear) {
      await cache.clear();
    }
  }
}
