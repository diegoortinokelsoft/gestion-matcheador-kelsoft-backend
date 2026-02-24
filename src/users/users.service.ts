import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { AppError } from '../common/errors/app-error';
import { cacheKey, cacheTtlMs } from '../common/utils/cache.util';
import { AppsScriptClientService } from '../upstream/apps-script-client.service';
import { UserConfigsService } from '../user-configs/user-configs.service';

@Injectable()
export class UsersService {
  private readonly profileTtlSec: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly appsScriptClient: AppsScriptClientService,
    private readonly userConfigsService: UserConfigsService,
  ) {
    this.profileTtlSec = Number(
      this.configService.get('CACHE_TTL_PROFILE_SEC') ?? 300,
    );
  }

  async getMe(currentUser: AuthUser) {
    const key = cacheKey('profile', currentUser.user_id, currentUser.role);
    const cached = await this.cacheManager.get(key);
    if (cached) {
      return cached;
    }

    const user = await this.fetchUserById(currentUser.user_id);
    const configs = await this.userConfigsService.getConfigs(currentUser.user_id);

    const profile = {
      user,
      configs,
      presets: await this.resolvePresetRefs(configs),
      permissions: this.buildPermissions(currentUser),
    };

    await this.cacheManager.set(
      key,
      profile,
      cacheTtlMs(this.profileTtlSec),
    );

    return profile;
  }

  async getUserConfigs(
    actor: AuthUser,
    userId: number,
    namespace?: string,
  ) {
    await this.assertCanAccessUser(actor, userId);
    return this.userConfigsService.getConfigs(userId, namespace);
  }

  async updateUserConfig(
    actor: AuthUser,
    userId: number,
    namespace: string,
    key: string,
    value: unknown,
    scope?: string,
  ) {
    await this.assertCanAccessUser(actor, userId);

    const result = await this.userConfigsService.setConfig(
      userId,
      {
        namespace,
        key,
        value,
        scope,
      },
      actor.user_id,
    );

    await this.invalidateProfileCache(userId);

    return result;
  }

  private async assertCanAccessUser(actor: AuthUser, targetUserId: number) {
    if (actor.role === 'ADMIN' || actor.user_id === targetUserId) {
      return;
    }

    if (actor.role === 'LEADER') {
      const teamUsers = await this.appsScriptClient.call<Record<string, unknown>[]>(
        'get_users_by_leader_id',
        { leader_id: actor.user_id },
        { legacyArgs: [actor.user_id] },
      );

      const hasAccess = teamUsers.some(
        (user) => Number(user.user_id) === targetUserId,
      );

      if (hasAccess) {
        return;
      }
    }

    throw new AppError('FORBIDDEN', 'You do not have access to this user');
  }

  private async fetchUserById(userId: number) {
    const user = await this.appsScriptClient.call<Record<string, unknown>>(
      'get_user_by_id',
      { user_id: userId },
      { legacyArgs: [userId] },
    );

    if (!user || user.user_id == null) {
      throw new AppError('UNAUTHORIZED', 'User not found');
    }

    return {
      user_id: Number(user.user_id),
      user_name: user.user_name,
      user_mail: user.user_mail,
      user_team: user.user_team,
      user_role: user.user_role,
      user_status: user.user_status,
      user_leader_id: user.user_leader_id,
      user_is_active: user.user_is_active,
    };
  }

  private async resolvePresetRefs(configs: Record<string, unknown>[]) {
    const configMap = new Map<string, string>();
    for (const config of configs) {
      const namespace = String(config.config_namespace ?? '');
      const key = String(config.config_key ?? '');
      const value = String(config.value ?? '');
      if (namespace && key) {
        configMap.set(`${namespace}.${key}`, value);
      }
    }

    const themePresetId = configMap.get('ui.theme_preset_id');
    const taskPresetId = configMap.get('tasks.preset_id');

    let themePreset: unknown = null;
    let taskPreset: unknown = null;

    if (themePresetId) {
      try {
        themePreset = await this.appsScriptClient.call('get_theme_preset_by_id', {
          theme_preset_id: themePresetId,
          is_active: true,
        }, {
          legacyArgs: [themePresetId, true],
        });
      } catch {
        themePreset = null;
      }
    }

    if (taskPresetId) {
      try {
        taskPreset = await this.appsScriptClient.call('get_task_preset_by_id', {
          preset_id: taskPresetId,
          is_active: true,
        }, {
          legacyArgs: [taskPresetId, true],
        });
      } catch {
        taskPreset = null;
      }
    }

    return {
      theme_preset: themePreset,
      task_preset: taskPreset,
    };
  }

  private buildPermissions(user: AuthUser) {
    return {
      can_manage_initiatives: user.role === 'ADMIN',
      can_review_vacations: user.role === 'ADMIN' || user.role === 'LEADER',
      can_manage_tasks: user.role === 'ADMIN' || user.role === 'LEADER',
      can_admin_sessions: user.role === 'ADMIN',
    };
  }

  private async invalidateProfileCache(userId: number) {
    await this.cacheManager.del(cacheKey('profile', userId, 'ADMIN'));
    await this.cacheManager.del(cacheKey('profile', userId, 'LEADER'));
    await this.cacheManager.del(cacheKey('profile', userId, 'USER'));
  }
}
