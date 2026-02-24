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
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TaskCreateDto } from './dto/task-create.dto';
import { TaskUpdateDto } from './dto/task-update.dto';

@Injectable()
export class TasksService {
  private readonly listTtlSec: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly appsScriptClient: AppsScriptClientService,
    private readonly auditService: AuditService,
  ) {
    this.listTtlSec = Number(this.configService.get('CACHE_TTL_LISTS_SEC') ?? 60);
  }

  async listTasks(actor: AuthUser, query: ListTasksQueryDto) {
    const key = cacheKey(
      'tasks',
      actor.user_id,
      actor.role,
      query.status ?? '',
      query.assigned_to ?? '',
      query.leader_id ?? '',
      query.team_id ?? '',
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    const cached = await this.cacheManager.get(key);
    if (cached) {
      return cached;
    }

    const allData = await this.appsScriptClient.call<unknown>('get_all_tasks', {}, {
      legacyArgs: [],
    });

    let tasks = this.asRows(allData);
    tasks = await this.filterTasksByRole(actor, tasks);

    if (query.assigned_to) {
      tasks = tasks.filter((task) => Number(task.user_id) === query.assigned_to);
    }

    if (query.leader_id) {
      tasks = tasks.filter((task) => Number(task.assigned_by) === query.leader_id);
    }

    if (query.team_id) {
      tasks = tasks.filter((task) => String(task.user_team ?? '') === query.team_id);
    }

    if (query.status) {
      tasks = tasks.filter(
        (task) => String(task.status ?? task.task_status ?? '').toUpperCase() === query.status?.toUpperCase(),
      );
    }

    const response = paginateArray(tasks, {
      page: query.page,
      pageSize: query.pageSize,
    });

    await this.cacheManager.set(key, response, cacheTtlMs(this.listTtlSec));

    return response;
  }

  async createTask(actor: AuthUser, dto: TaskCreateDto) {
    await this.assertCanAssignToUser(actor, dto.user_id);

    const taskData = {
      task_name: dto.task_name,
      task_link: dto.task_link ?? '',
      task_notes: dto.task_notes ?? '',
      assigned_by: actor.user_id,
    };

    const created = await this.appsScriptClient.call('set_new_task', {
      user_id: dto.user_id,
      task_data: taskData,
    }, {
      legacyArgs: [dto.user_id, taskData],
    });

    await this.auditService.record(
      'task.create',
      actor.user_id,
      'task',
      String((created as Record<string, unknown>)?.task_id ?? 'unknown'),
      {
        user_id: dto.user_id,
        task_name: dto.task_name,
      },
    );

    await this.clearCache();
    return created;
  }

  async createTasksBulk(actor: AuthUser, data: TaskCreateDto[]) {
    for (const task of data) {
      await this.assertCanAssignToUser(actor, task.user_id);
    }

    const bulkPayload = data.map((task) => ({
      user_id: task.user_id,
      task_name: task.task_name,
      task_link: task.task_link ?? '',
      task_notes: task.task_notes ?? '',
      assigned_by: actor.user_id,
    }));

    const created = await this.appsScriptClient.call('set_multiple_task', {
      data: bulkPayload,
    }, {
      legacyArgs: [bulkPayload],
    });

    await this.auditService.record(
      'task.bulk_create',
      actor.user_id,
      'task',
      'bulk',
      {
        count: data.length,
      },
    );

    await this.clearCache();
    return created;
  }

  async updateTask(actor: AuthUser, taskId: string, dto: TaskUpdateDto) {
    const existing = await this.fetchTaskById(taskId);
    await this.assertCanManageTask(actor, existing);

    if (dto.user_id && dto.user_id !== Number(existing.user_id)) {
      await this.assertCanAssignToUser(actor, dto.user_id);
    }

    const patch = {
      ...(dto.task_name ? { task_name: dto.task_name } : {}),
      ...(dto.task_link !== undefined ? { task_link: dto.task_link } : {}),
      ...(dto.task_notes !== undefined ? { task_notes: dto.task_notes } : {}),
      ...(dto.user_id ? { user_id: dto.user_id } : {}),
    };

    const updated = await this.appsScriptClient.call('modify_task', {
      task_id: taskId,
      task_data: patch,
    }, {
      legacyArgs: [taskId, patch],
    });

    await this.auditService.record(
      'task.edit',
      actor.user_id,
      'task',
      taskId,
      patch,
    );

    await this.clearCache();
    return updated;
  }

  async deleteTasks(actor: AuthUser, taskIds: string[]) {
    for (const taskId of taskIds) {
      const task = await this.fetchTaskById(taskId);
      await this.assertCanManageTask(actor, task);
    }

    const deleted = await this.appsScriptClient.call('delete_task', {
      task_ids: taskIds,
    }, {
      legacyArgs: [taskIds],
    });

    await this.auditService.record(
      'task.delete',
      actor.user_id,
      'task',
      'bulk-delete',
      {
        task_ids: taskIds,
      },
    );

    await this.clearCache();
    return deleted;
  }

  private async fetchTaskById(taskId: string): Promise<Record<string, unknown>> {
    const task = await this.appsScriptClient.call<Record<string, unknown>>(
      'get_task_by_id',
      { task_id: taskId },
      { legacyArgs: [taskId] },
    );

    if (!task || !task.task_id) {
      throw new AppError('TASK_NOT_FOUND', 'Task not found');
    }

    return task;
  }

  private async assertCanAssignToUser(actor: AuthUser, userId: number) {
    if (actor.role === 'ADMIN') {
      return;
    }

    const teamIds = await this.getTeamUserIds(actor.user_id);
    if (teamIds.includes(userId)) {
      return;
    }

    throw new AppError('FORBIDDEN', 'Cannot assign task to this user');
  }

  private async assertCanManageTask(
    actor: AuthUser,
    task: Record<string, unknown>,
  ) {
    if (actor.role === 'ADMIN') {
      return;
    }

    const teamIds = await this.getTeamUserIds(actor.user_id);
    const taskUserId = Number(task.user_id);

    if (teamIds.includes(taskUserId)) {
      return;
    }

    throw new AppError('FORBIDDEN', 'No permissions for this task');
  }

  private async filterTasksByRole(
    actor: AuthUser,
    tasks: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (actor.role === 'ADMIN') {
      return tasks;
    }

    if (actor.role === 'USER') {
      return tasks.filter((task) => Number(task.user_id) === actor.user_id);
    }

    const teamIds = await this.getTeamUserIds(actor.user_id);
    return tasks.filter((task) => teamIds.includes(Number(task.user_id)));
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

  private asRows(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value as Record<string, unknown>[];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['items', 'data', 'tasks', 'rows']) {
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
