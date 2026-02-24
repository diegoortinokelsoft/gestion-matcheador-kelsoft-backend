import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { AppsScriptClientService } from '../upstream/apps-script-client.service';
import { AppError } from '../common/errors/app-error';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { cacheKey, cacheTtlMs } from '../common/utils/cache.util';
import { paginateArray } from '../common/utils/pagination.util';
import { ListInitiativesQueryDto } from './dto/list-initiatives-query.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InitiativesService {
  private readonly listTtlSec: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly appsScriptClient: AppsScriptClientService,
    private readonly auditService: AuditService,
  ) {
    this.listTtlSec = Number(this.configService.get('CACHE_TTL_LISTS_SEC') ?? 60);
  }

  async listInitiatives(user: AuthUser, query: ListInitiativesQueryDto) {
    const key = cacheKey(
      'initiatives',
      user.user_id,
      user.role,
      query.status ?? '',
      query.q ?? '',
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    const cached = await this.cacheManager.get(key);
    if (cached) {
      return cached;
    }

    let initiatives = await this.loadInitiativesByScope(user, query);

    if (query.status) {
      initiatives = initiatives.filter(
        (item) => String(item.initiative_status ?? '').toUpperCase() === query.status?.toUpperCase(),
      );
    }

    if (query.q) {
      const q = query.q.toLowerCase();
      initiatives = initiatives.filter((item) => {
        const name = String(item.initiative_name ?? '').toLowerCase();
        return name.includes(q);
      });
    }

    const response = paginateArray(initiatives, {
      page: query.page,
      pageSize: query.pageSize,
    });

    await this.cacheManager.set(key, response, cacheTtlMs(this.listTtlSec));

    return response;
  }

  async getInitiative(user: AuthUser, initiativeId: string) {
    const initiative = await this.fetchInitiativeById(initiativeId);
    const members = await this.listMembers(initiativeId);

    const canViewMembers = await this.canViewMembers(user, initiative, members);
    const canViewInitiative =
      canViewMembers ||
      (user.role === 'USER' && members.some((member) => Number(member.user_id) === user.user_id));

    if (!canViewInitiative) {
      throw new AppError('FORBIDDEN', 'No access to this initiative');
    }

    return {
      initiative,
      members: canViewMembers ? members : undefined,
    };
  }

  async createInitiative(user: AuthUser, dto: CreateInitiativeDto) {
    const payload = {
      ...dto,
      initiative_owner_user_id: user.user_id,
      initiative_status: dto.initiative_status ?? 'DRAFT',
    };

    const created = await this.appsScriptClient.call('create_initiative', payload, {
      legacyArgs: [payload],
    });

    await this.auditService.record(
      'initiative.create',
      user.user_id,
      'initiative',
      String((created as Record<string, unknown>)?.initiative_id ?? 'unknown'),
      payload,
    );

    await this.clearCache();
    return created;
  }

  async updateInitiative(
    user: AuthUser,
    initiativeId: string,
    dto: UpdateInitiativeDto,
  ) {
    await this.fetchInitiativeById(initiativeId);

    const updated = await this.appsScriptClient.call(
      'update_initiative',
      {
        initiative_id: initiativeId,
        patch_data: dto,
        updated_by: user.user_id,
      },
      {
        legacyArgs: [initiativeId, dto, user.user_id],
      },
    );

    await this.auditService.record(
      'initiative.update',
      user.user_id,
      'initiative',
      initiativeId,
      dto as Record<string, unknown>,
    );

    await this.clearCache();
    return updated;
  }

  async changeStatus(
    user: AuthUser,
    initiativeId: string,
    targetStatus: string,
  ) {
    const initiative = await this.fetchInitiativeById(initiativeId);
    const currentStatus = String(initiative.initiative_status ?? '').toUpperCase();

    if (!this.isValidStatusTransition(currentStatus, targetStatus)) {
      throw new AppError('INVALID_STATE_TRANSITION', 'Invalid initiative status transition');
    }

    const changed = await this.appsScriptClient.call(
      'set_initiative_status',
      {
        initiative_id: initiativeId,
        status: targetStatus,
        updated_by: user.user_id,
      },
      {
        legacyArgs: [initiativeId, targetStatus, user.user_id],
      },
    );

    await this.auditService.record(
      'initiative.status_change',
      user.user_id,
      'initiative',
      initiativeId,
      {
        from: currentStatus,
        to: targetStatus,
      },
    );

    await this.clearCache();
    return changed;
  }

  async assignMembers(user: AuthUser, initiativeId: string, userIds: number[]) {
    const initiative = await this.fetchInitiativeById(initiativeId);
    await this.assertCanManageMembers(user, initiative);

    const response = await this.appsScriptClient.call(
      'bulk_assign_users',
      {
        initiative_id: initiativeId,
        user_ids: userIds,
        assigned_by: user.user_id,
      },
      {
        legacyArgs: [initiativeId, userIds, user.user_id],
      },
    );

    await this.auditService.record(
      'initiative.assign_members',
      user.user_id,
      'initiative',
      initiativeId,
      {
        user_ids: userIds,
      },
    );

    await this.clearCache();
    return response;
  }

  async removeMembers(user: AuthUser, initiativeId: string, userIds: number[]) {
    const initiative = await this.fetchInitiativeById(initiativeId);
    await this.assertCanManageMembers(user, initiative);

    const response = await this.appsScriptClient.call(
      'bulk_remove_users',
      {
        initiative_id: initiativeId,
        user_ids: userIds,
        updated_by: user.user_id,
      },
      {
        legacyArgs: [initiativeId, userIds, user.user_id],
      },
    );

    await this.auditService.record(
      'initiative.unassign_members',
      user.user_id,
      'initiative',
      initiativeId,
      {
        user_ids: userIds,
      },
    );

    await this.clearCache();
    return response;
  }

  private async loadInitiativesByScope(
    user: AuthUser,
    query: ListInitiativesQueryDto,
  ): Promise<Record<string, unknown>[]> {
    if (user.role === 'ADMIN') {
      const data = await this.appsScriptClient.call<unknown>('list_initiatives', {
        status: query.status,
        q: query.q,
      }, {
        legacyArgs: [{ status: query.status, q: query.q }],
      });
      return this.asRows(data);
    }

    if (user.role === 'USER') {
      const data = await this.appsScriptClient.call<unknown>('list_initiatives_by_user', {
        user_id: user.user_id,
        only_active: true,
      }, {
        legacyArgs: [user.user_id, true],
      });
      return this.asRows(data);
    }

    const teamUserIds = await this.getTeamUserIds(user.user_id);
    const initiativesByUser = await Promise.all(
      teamUserIds.map((teamUserId) =>
        this.appsScriptClient.call<unknown>('list_initiatives_by_user', {
          user_id: teamUserId,
          only_active: true,
        }, {
          legacyArgs: [teamUserId, true],
        }),
      ),
    );

    const merged = new Map<string, Record<string, unknown>>();
    for (const chunk of initiativesByUser) {
      for (const initiative of this.asRows(chunk)) {
        const id = String(initiative.initiative_id ?? '');
        if (!id) {
          continue;
        }
        merged.set(id, initiative);
      }
    }

    return Array.from(merged.values());
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

  private async listMembers(initiativeId: string): Promise<Record<string, unknown>[]> {
    const data = await this.appsScriptClient.call<unknown>('list_members_by_initiative', {
      initiative_id: initiativeId,
      only_active: true,
    }, {
      legacyArgs: [initiativeId, true],
    });

    return this.asRows(data);
  }

  private async canViewMembers(
    user: AuthUser,
    initiative: Record<string, unknown>,
    members: Record<string, unknown>[],
  ): Promise<boolean> {
    if (user.role === 'ADMIN') {
      return true;
    }

    if (Number(initiative.initiative_owner_user_id) === user.user_id) {
      return true;
    }

    if (user.role === 'LEADER') {
      const teamUserIds = await this.getTeamUserIds(user.user_id);
      return members.some((member) => teamUserIds.includes(Number(member.user_id)));
    }

    return false;
  }

  private async assertCanManageMembers(
    actor: AuthUser,
    initiative: Record<string, unknown>,
  ) {
    if (actor.role === 'ADMIN') {
      return;
    }

    if (Number(initiative.initiative_owner_user_id) === actor.user_id) {
      return;
    }

    throw new AppError('FORBIDDEN', 'Only ADMIN or OWNER can manage members');
  }

  private isValidStatusTransition(from: string, to: string): boolean {
    if (from === to) {
      return true;
    }

    const rules: Record<string, string[]> = {
      DRAFT: ['ACTIVE'],
      ACTIVE: ['PAUSED', 'DONE'],
      PAUSED: ['ACTIVE', 'DONE'],
      DONE: ['ARCHIVED'],
      ARCHIVED: [],
    };

    return (rules[from] ?? []).includes(to);
  }

  private async getTeamUserIds(leaderId: number): Promise<number[]> {
    const users = await this.appsScriptClient.call<unknown>('get_users_by_leader_id', {
      leader_id: leaderId,
    }, {
      legacyArgs: [leaderId],
    });

    const rows = this.asRows(users);
    const ids = rows
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
      for (const key of ['items', 'data', 'initiatives', 'members', 'rows']) {
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
