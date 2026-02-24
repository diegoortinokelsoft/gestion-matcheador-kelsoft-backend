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
import { CreateVacationDto } from './dto/create-vacation.dto';
import { ListVacationsQueryDto } from './dto/list-vacations-query.dto';

export interface NormalizedVacation extends Record<string, unknown> {
  vacation_id: string;
  user_id: number;
  start_date: string;
  end_date: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  user_team?: string;
}


@Injectable()
export class VacationsService {
  private readonly listTtlSec: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly appsScriptClient: AppsScriptClientService,
    private readonly auditService: AuditService,
  ) {
    this.listTtlSec = Number(this.configService.get('CACHE_TTL_LISTS_SEC') ?? 60);
  }

  async listVacations(actor: AuthUser, query: ListVacationsQueryDto) {
    const key = cacheKey(
      'vacations',
      actor.user_id,
      actor.role,
      query.status ?? '',
      query.user_id ?? '',
      query.team_id ?? '',
      query.date_from ?? '',
      query.date_to ?? '',
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    const cached = await this.cacheManager.get(key);
    if (cached) {
      return cached;
    }

    const allData = await this.appsScriptClient.call<unknown>('get_all_vacations', {}, {
      legacyArgs: [],
    });

    let vacations = this.asRows(allData).map((row) => this.normalizeVacation(row));

    vacations = await this.filterByRole(actor, vacations);

    if (query.user_id) {
      vacations = vacations.filter((row) => Number(row.user_id) === query.user_id);
    }

    if (query.team_id) {
      vacations = vacations.filter((row) => String(row.user_team ?? '') === query.team_id);
    }

    if (query.status) {
      vacations = vacations.filter((row) => row.status === query.status);
    }

    if (query.date_from) {
      const from = this.parseDate(query.date_from);
      if (from) {
        vacations = vacations.filter((row) => {
          const start = this.parseDate(String(row.start_date));
          return !!start && start >= from;
        });
      }
    }

    if (query.date_to) {
      const to = this.parseDate(query.date_to);
      if (to) {
        vacations = vacations.filter((row) => {
          const end = this.parseDate(String(row.end_date));
          return !!end && end <= to;
        });
      }
    }

    const response = paginateArray(vacations, {
      page: query.page,
      pageSize: query.pageSize,
    });

    await this.cacheManager.set(key, response, cacheTtlMs(this.listTtlSec));

    return response;
  }

  async getVacationById(actor: AuthUser, vacationId: string) {
    const vacation = await this.fetchVacationById(vacationId);
    await this.assertCanAccessVacation(actor, vacation);

    return this.normalizeVacation(vacation);
  }

  async createVacation(actor: AuthUser, dto: CreateVacationDto) {
    const targetUserId = await this.resolveVacationOwner(actor, dto.user_id);

    const start = this.parseDate(dto.start_date);
    const end = this.parseDate(dto.end_date);
    if (!start || !end || start > end) {
      throw new AppError(
        'VACATION_INVALID_DATES',
        'Invalid vacation date range',
      );
    }

    await this.validateOverlap(targetUserId, start, end);

    const vacationData = {
      vacation_init_date: this.toSheetDate(start),
      vacation_end_date: this.toSheetDate(end),
      reason: dto.reason ?? '',
    };

    const created = await this.appsScriptClient.call('set_new_vacation', {
      user_id: targetUserId,
      vacation_data: vacationData,
    }, {
      legacyArgs: [targetUserId, vacationData],
    });

    const vacationId = String(
      (created as Record<string, unknown>)?.vacation_id ?? 'unknown',
    );

    await this.auditService.record(
      'vacation.create',
      actor.user_id,
      'vacation',
      vacationId,
      {
        user_id: targetUserId,
        start_date: dto.start_date,
        end_date: dto.end_date,
      },
    );

    await this.clearCache();

    return {
      vacation_id: vacationId,
      status: 'PENDING',
    };
  }

  async approveVacation(actor: AuthUser, vacationId: string) {
    const vacation = await this.fetchVacationById(vacationId);
    await this.assertCanReviewVacation(actor, vacation);

    const normalized = this.normalizeVacation(vacation);
    if (normalized.status !== 'PENDING') {
      throw new AppError('VACATION_IMMUTABLE', 'Vacation is immutable');
    }

    await this.callApproveVacation(vacationId);

    try {
      await this.appsScriptClient.call('modify_user', {
        user_id: Number(vacation.user_id),
        user_data: {
          user_status: 'De vacaciones',
          user_status_detail: `vacation:${vacationId}`,
        },
      }, {
        legacyArgs: [
          Number(vacation.user_id),
          {
            user_status: 'De vacaciones',
            user_status_detail: `vacation:${vacationId}`,
          },
        ],
      });
    } catch {
      // No bloquear la aprobación por un error secundario.
    }

    await this.auditService.record(
      'vacation.approve',
      actor.user_id,
      'vacation',
      vacationId,
      {
        user_id: Number(vacation.user_id),
      },
    );

    await this.clearCache();

    return {
      vacation_id: vacationId,
      status: 'APPROVED',
    };
  }

  async denyVacation(actor: AuthUser, vacationId: string) {
    const vacation = await this.fetchVacationById(vacationId);
    await this.assertCanReviewVacation(actor, vacation);

    const normalized = this.normalizeVacation(vacation);
    if (normalized.status !== 'PENDING') {
      throw new AppError('VACATION_IMMUTABLE', 'Vacation is immutable');
    }

    await this.appsScriptClient.call('deny_vacation', {
      vacation_id: vacationId,
    }, {
      legacyArgs: [vacationId],
    });

    await this.auditService.record(
      'vacation.deny',
      actor.user_id,
      'vacation',
      vacationId,
      {
        user_id: Number(vacation.user_id),
      },
    );

    await this.clearCache();

    return {
      vacation_id: vacationId,
      status: 'DENIED',
    };
  }

  private async callApproveVacation(vacationId: string) {
    try {
      await this.appsScriptClient.call('approve_vacation', {
        vacation_id: vacationId,
      }, {
        legacyArgs: [vacationId],
      });
      return;
    } catch {
      // Compatibilidad con typo en data-layer actual.
    }

    await this.appsScriptClient.call('aprobe_vacation', {
      vacation_id: vacationId,
    }, {
      legacyArgs: [vacationId],
    });
  }

  private async fetchVacationById(vacationId: string): Promise<Record<string, unknown>> {
    const vacation = await this.appsScriptClient.call<Record<string, unknown>>(
      'get_vacation_by_id',
      { vacation_id: vacationId },
      { legacyArgs: [vacationId] },
    );

    if (!vacation || !vacation.vacation_id) {
      throw new AppError('VACATION_NOT_FOUND', 'Vacation not found');
    }

    return vacation;
  }

  private async resolveVacationOwner(actor: AuthUser, requestedUserId?: number) {
    if (!requestedUserId) {
      return actor.user_id;
    }

    if (actor.role === 'ADMIN') {
      return requestedUserId;
    }

    if (actor.role === 'LEADER') {
      const teamIds = await this.getTeamUserIds(actor.user_id);
      if (teamIds.includes(requestedUserId)) {
        return requestedUserId;
      }
    }

    if (actor.user_id === requestedUserId) {
      return requestedUserId;
    }

    throw new AppError('FORBIDDEN', 'Cannot create vacation for this user');
  }

  private async assertCanAccessVacation(
    actor: AuthUser,
    vacation: Record<string, unknown>,
  ) {
    if (actor.role === 'ADMIN') {
      return;
    }

    if (Number(vacation.user_id) === actor.user_id) {
      return;
    }

    if (actor.role === 'LEADER') {
      const teamIds = await this.getTeamUserIds(actor.user_id);
      if (teamIds.includes(Number(vacation.user_id))) {
        return;
      }
    }

    throw new AppError('FORBIDDEN', 'No access to this vacation');
  }

  private async assertCanReviewVacation(
    actor: AuthUser,
    vacation: Record<string, unknown>,
  ) {
    if (actor.role === 'ADMIN') {
      return;
    }

    if (actor.role === 'LEADER') {
      const teamIds = await this.getTeamUserIds(actor.user_id);
      if (teamIds.includes(Number(vacation.user_id))) {
        return;
      }
    }

    throw new AppError('FORBIDDEN', 'Cannot review this vacation');
  }

  private async filterByRole(
    actor: AuthUser,
    vacations: NormalizedVacation[],
  ) {
    if (actor.role === 'ADMIN') {
      return vacations;
    }

    if (actor.role === 'USER') {
      return vacations.filter((row) => Number(row.user_id) === actor.user_id);
    }

    const teamIds = await this.getTeamUserIds(actor.user_id);
    return vacations.filter((row) => teamIds.includes(Number(row.user_id)));
  }

  private async getTeamUserIds(leaderId: number): Promise<number[]> {
    const usersData = await this.appsScriptClient.call<unknown>('get_users_by_leader_id', {
      leader_id: leaderId,
    }, {
      legacyArgs: [leaderId],
    });

    const users = this.asRows(usersData);
    const ids = users
      .map((user) => Number(user.user_id))
      .filter((id) => Number.isFinite(id));

    if (!ids.includes(leaderId)) {
      ids.push(leaderId);
    }

    return ids;
  }

  private async validateOverlap(userId: number, start: Date, end: Date) {
    const existingData = await this.appsScriptClient.call<unknown>('get_vacations_by_user', {
      user_id: userId,
    }, {
      legacyArgs: [userId],
    });

    const existing = this.asRows(existingData).map((row) => this.normalizeVacation(row));

    const overlaps = existing.some((vacation) => {
      if (vacation.status === 'DENIED') {
        return false;
      }

      const from = this.parseDate(vacation.start_date);
      const to = this.parseDate(vacation.end_date);
      if (!from || !to) {
        return false;
      }

      return start <= to && end >= from;
    });

    if (overlaps) {
      throw new AppError('VACATION_OVERLAP', 'Vacation dates overlap with an existing request');
    }
  }

  private normalizeVacation(row: Record<string, unknown>): NormalizedVacation {
    const approval = row.vacation_is_approved_by_leader;
    const status =
      approval === true || String(approval).toLowerCase() === 'true'
        ? 'APPROVED'
        : approval === false || String(approval).toLowerCase() === 'false'
          ? 'DENIED'
          : 'PENDING';

    return {
      ...row,
      vacation_id: String(row.vacation_id ?? ''),
      user_id: Number(row.user_id),
      start_date: this.normalizeDateOutput(row.vacation_init_date),
      end_date: this.normalizeDateOutput(row.vacation_end_date),
      status,
    };
  }

  private normalizeDateOutput(value: unknown): string {
    const date = this.parseDate(value);
    if (!date) {
      return '';
    }
    return date.toISOString().slice(0, 10);
  }

  private toSheetDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private parseDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    const asString = String(value).trim();
    if (!asString) {
      return null;
    }

    const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(asString);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const isoDate = new Date(asString);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }

  private asRows(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value as Record<string, unknown>[];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['items', 'data', 'vacations', 'rows']) {
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



