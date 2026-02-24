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

    const data = await this.appsScriptClient.call<unknown>('list_sessions', {
      user_id: query.user_id,
      team_id: query.team_id,
      leader_id: query.leader_id,
      date_from: query.date_from,
      date_to: query.date_to,
      status: query.status,
    }, {
      legacyArgs: [
        {
          user_id: query.user_id,
          team_id: query.team_id,
          leader_id: query.leader_id,
          date_from: query.date_from,
          date_to: query.date_to,
          status: query.status,
        },
      ],
    });

    let sessions = this.asRows(data);

    sessions = await this.filterByRole(actor, sessions);

    if (query.user_id) {
      sessions = sessions.filter((session) => Number(session.user_id) === query.user_id);
    }
    if (query.status) {
      sessions = sessions.filter(
        (session) => String(session.session_status ?? '').toUpperCase() === query.status,
      );
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
