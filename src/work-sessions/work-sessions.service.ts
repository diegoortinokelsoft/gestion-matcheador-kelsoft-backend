import { Injectable } from '@nestjs/common';
import { v4 as uuidV4 } from 'uuid';
import { AppError } from '../common/errors/app-error';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { AppsScriptClientService } from '../upstream/apps-script-client.service';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import {
  WorkSessionItemRecord,
  WorkSessionRecord,
} from './types/work-session.types';

@Injectable()
export class WorkSessionsService {
  constructor(private readonly appsScriptClient: AppsScriptClientService) {}

  async getSessionByUserAndDate(actor: AuthUser, dto: CreateSessionDto) {
    await this.assertCanManageUser(actor, dto.user_id);
    return this.fetchSessionByUserAndDate(dto.user_id, dto.date);
  }

  async ensureSession(actor: AuthUser, dto: CreateSessionDto) {
    await this.assertCanManageUser(actor, dto.user_id);

    const existing = await this.fetchSessionByUserAndDate(dto.user_id, dto.date);
    if (existing) {
      return existing;
    }

    const userProfile = await this.fetchUserProfile(dto.user_id);
    const now = this.nowDateTime();

    const createPayload: WorkSessionRecord = {
      session_id: uuidV4(),
      session_date: dto.date,
      user_id: dto.user_id,
      user_name: this.toText(userProfile?.user_name),
      user_team: this.toText(userProfile?.user_team),
      session_status: 'DRAFT',
      created_at: now,
      updated_at: now,
      updated_by: actor.user_id,
    };

    return this.appsScriptClient.call<WorkSessionRecord>(
      'create_session',
      createPayload,
    );
  }

  async updateSession(
    actor: AuthUser,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    const session = await this.fetchSessionById(sessionId);
    await this.assertCanManageSession(actor, session);

    const patch: Record<string, unknown> = {};

    if (dto.user_name !== undefined) {
      patch.user_name = dto.user_name;
    }
    if (dto.user_team !== undefined) {
      patch.user_team = dto.user_team;
    }
    if (dto.session_status !== undefined) {
      patch.session_status = dto.session_status;
    }
    if (dto.closed_at !== undefined) {
      patch.closed_at = dto.closed_at;
    }
    if (dto.closed_by !== undefined) {
      patch.closed_by = dto.closed_by;
    }

    patch.updated_at = this.nowDateTime();
    patch.updated_by = actor.user_id;

    return this.appsScriptClient.call<WorkSessionRecord>(
      'update_session',
      {
        session_id: sessionId,
        patch,
      },
    );
  }

  async closeSession(actor: AuthUser, sessionId: string) {
    const session = await this.fetchSessionById(sessionId);
    await this.assertCanManageSession(actor, session);

    const now = this.nowDateTime();

    return this.appsScriptClient.call<WorkSessionRecord>(
      'update_session',
      {
        session_id: sessionId,
        patch: {
          session_status: 'FINAL',
          closed_at: now,
          closed_by: actor.user_id,
          updated_at: now,
          updated_by: actor.user_id,
        },
      },
    );
  }

  async reopenSession(actor: AuthUser, sessionId: string) {
    const session = await this.fetchSessionById(sessionId);
    await this.assertCanManageSession(actor, session);

    const now = this.nowDateTime();

    return this.appsScriptClient.call<WorkSessionRecord>(
      'update_session',
      {
        session_id: sessionId,
        patch: {
          session_status: 'DRAFT',
          closed_at: '',
          closed_by: '',
          updated_at: now,
          updated_by: actor.user_id,
        },
      },
    );
  }

  async listItemsBySession(actor: AuthUser, sessionId: string) {
    const session = await this.fetchSessionById(sessionId);
    await this.assertCanManageSession(actor, session);

    const data = await this.appsScriptClient.call<unknown>('list_items_by_session', {
      session_id: sessionId,
    });

    return this.asRows(data);
  }

  async createItem(actor: AuthUser, sessionId: string, dto: CreateItemDto) {
    const session = await this.fetchSessionById(sessionId);
    await this.assertCanManageSession(actor, session);

    const existing = await this.fetchItemBySessionAndInitiative(
      sessionId,
      dto.initiative_id,
    );
    if (existing) {
      throw new AppError(
        'ITEM_ALREADY_EXISTS',
        'An item already exists for this session and initiative',
      );
    }

    const now = this.nowDateTime();
    const userId = this.requirePositiveInt(session.user_id, 'Invalid session user_id');

    const createPayload: WorkSessionItemRecord = {
      item_id: uuidV4(),
      session_id: sessionId,
      session_date: this.toText(session.session_date),
      user_id: userId,
      initiative_id: dto.initiative_id,
      initiative_name: dto.initiative_name,
      task_type: dto.task_type,
      tasks_done_count: dto.tasks_done_count,
      notes: dto.notes ?? '',
      created_at: now,
      updated_at: now,
      updated_by: actor.user_id,
    };

    return this.appsScriptClient.call<WorkSessionItemRecord>(
      'create_item',
      createPayload,
    );
  }

  async updateItem(actor: AuthUser, itemId: string, dto: UpdateItemDto) {
    const item = await this.fetchItemById(itemId);
    const sessionId = this.toText(item.session_id);
    if (!sessionId) {
      throw new AppError('ITEM_NOT_FOUND', 'Item not found');
    }

    const session = await this.fetchSessionById(sessionId);
    await this.assertCanManageSession(actor, session);

    const patch: Record<string, unknown> = {};
    if (dto.initiative_name !== undefined) {
      patch.initiative_name = dto.initiative_name;
    }
    if (dto.task_type !== undefined) {
      patch.task_type = dto.task_type;
    }
    if (dto.tasks_done_count !== undefined) {
      patch.tasks_done_count = dto.tasks_done_count;
    }
    if (dto.notes !== undefined) {
      patch.notes = dto.notes;
    }
    patch.updated_at = this.nowDateTime();
    patch.updated_by = actor.user_id;

    return this.appsScriptClient.call<WorkSessionItemRecord>(
      'update_item',
      {
        item_id: itemId,
        patch,
      },
    );
  }

  async deleteItem(actor: AuthUser, itemId: string) {
    const item = await this.fetchItemById(itemId);
    const sessionId = this.toText(item.session_id);
    if (!sessionId) {
      throw new AppError('ITEM_NOT_FOUND', 'Item not found');
    }

    const session = await this.fetchSessionById(sessionId);
    await this.assertCanManageSession(actor, session);

    return this.appsScriptClient.call(
      'delete_item',
      {
        item_id: itemId,
      },
    );
  }

  private async fetchSessionById(sessionId: string): Promise<WorkSessionRecord> {
    const session = await this.appsScriptClient.call<WorkSessionRecord | null>(
      'get_session_by_id',
      {
        session_id: sessionId,
      },
    );

    if (!session || !session.session_id) {
      throw new AppError('SESSION_NOT_FOUND', 'Session not found');
    }

    return session;
  }

  private async fetchSessionByUserAndDate(
    userId: number,
    date: string,
  ): Promise<WorkSessionRecord | null> {
    const session = await this.appsScriptClient.call<WorkSessionRecord | null>(
      'get_session_by_user_and_date',
      {
        user_id: userId,
        session_date: date,
      },
    );

    if (!session || !session.session_id) {
      return null;
    }

    return session;
  }

  private async fetchItemById(itemId: string): Promise<WorkSessionItemRecord> {
    const item = await this.appsScriptClient.call<WorkSessionItemRecord | null>(
      'get_item_by_id',
      {
        item_id: itemId,
      },
    );

    if (!item || !item.item_id) {
      throw new AppError('ITEM_NOT_FOUND', 'Item not found');
    }

    return item;
  }

  private async fetchItemBySessionAndInitiative(
    sessionId: string,
    initiativeId: string,
  ): Promise<WorkSessionItemRecord | null> {
    const item = await this.appsScriptClient.call<WorkSessionItemRecord | null>(
      'get_item_by_session_and_initiative',
      {
        session_id: sessionId,
        initiative_id: initiativeId,
      },
    );

    if (!item || !item.item_id) {
      return null;
    }

    return item;
  }

  private async fetchUserProfile(userId: number): Promise<Record<string, unknown> | null> {
    try {
      const user = await this.appsScriptClient.call<Record<string, unknown>>(
        'get_user_by_id',
        { user_id: userId },
        { legacyArgs: [userId] },
      );

      if (!user || user.user_id == null) {
        return null;
      }

      return user;
    } catch {
      return null;
    }
  }

  private async assertCanManageSession(
    actor: AuthUser,
    session: WorkSessionRecord,
  ) {
    const ownerUserId = this.requirePositiveInt(
      session.user_id,
      'Invalid session owner',
    );
    await this.assertCanManageUser(actor, ownerUserId);
  }

  private async assertCanManageUser(actor: AuthUser, targetUserId: number) {
    if (actor.role === 'ADMIN' || actor.user_id === targetUserId) {
      return;
    }

    if (actor.role === 'LEADER') {
      const teamUserIds = await this.getTeamUserIds(actor.user_id);
      if (teamUserIds.includes(targetUserId)) {
        return;
      }
    }

    throw new AppError('FORBIDDEN', 'No access to this user');
  }

  private async getTeamUserIds(leaderId: number): Promise<number[]> {
    const usersData = await this.appsScriptClient.call<unknown>(
      'get_users_by_leader_id',
      { leader_id: leaderId },
      { legacyArgs: [leaderId] },
    );

    const rows = this.asRows(usersData);
    const userIds = rows
      .map((row) => Number(row.user_id))
      .filter((userId) => Number.isInteger(userId) && userId > 0);

    if (!userIds.includes(leaderId)) {
      userIds.push(leaderId);
    }

    return userIds;
  }

  private nowDateTime(): string {
    const date = new Date();
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  private requirePositiveInt(value: unknown, message: string): number {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new AppError('INTERNAL_ERROR', message);
    }
    return numeric;
  }

  private toText(value: unknown): string {
    if (value == null) {
      return '';
    }
    return String(value);
  }

  private asRows(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value as Record<string, unknown>[];
    }

    if (value && typeof value === 'object') {
      const rowObject = value as Record<string, unknown>;
      for (const key of ['items', 'data', 'rows']) {
        const candidate = rowObject[key];
        if (Array.isArray(candidate)) {
          return candidate as Record<string, unknown>[];
        }
      }
    }

    return [];
  }
}
