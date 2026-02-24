import { Injectable } from '@nestjs/common';
import { AppsScriptClientService } from '../upstream/apps-script-client.service';
import { AppError } from '../common/errors/app-error';

export interface UserConfigUpdateInput {
  namespace: string;
  key: string;
  value: unknown;
  scope?: string;
}

@Injectable()
export class UserConfigsService {
  constructor(private readonly appsScriptClient: AppsScriptClientService) {}

  async getConfigs(
    userId: number,
    namespace?: string,
  ): Promise<Record<string, unknown>[]> {
    try {
      if (namespace) {
        const result = await this.appsScriptClient.call<unknown>(
          'get_user_configs_by_namespace',
          {
            user_id: userId,
            config_namespace: namespace,
            scope: 'user',
            is_active: true,
          },
          {
            legacyArgs: [userId, namespace, 'user', true],
          },
        );

        return this.extractRows(result);
      }

      const all = await this.appsScriptClient.call<unknown>(
        'get_all_user_configs',
        {
          user_id: userId,
          scope: 'user',
          is_active: true,
        },
        {
          legacyArgs: [userId, 'user', true],
        },
      );

      return this.extractRows(all);
    } catch (error) {
      if (error instanceof AppError && error.code === 'UPSTREAM_ERROR') {
        return [];
      }
      throw error;
    }
  }

  async setConfig(
    userId: number,
    input: UserConfigUpdateInput,
    actorUserId: number,
  ) {
    const scope = input.scope ?? 'user';
    const valueType = this.inferValueType(input.value);

    return this.appsScriptClient.call('set_user_config', {
      user_id: userId,
      config_namespace: input.namespace,
      config_key: input.key,
      value_type: valueType,
      value: this.serializeValue(input.value),
      scope,
      updated_by: actorUserId,
    }, {
      legacyArgs: [
        userId,
        input.namespace,
        input.key,
        valueType,
        this.serializeValue(input.value),
        scope,
        actorUserId,
      ],
    });
  }

  private inferValueType(value: unknown): 'string' | 'number' | 'boolean' | 'json' {
    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return 'number';
    }

    if (typeof value === 'string') {
      return 'string';
    }

    return 'json';
  }

  private serializeValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value ?? null);
  }

  private extractRows(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value as Record<string, unknown>[];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['items', 'data', 'configs', 'rows']) {
        const candidate = record[key];
        if (Array.isArray(candidate)) {
          return candidate as Record<string, unknown>[];
        }
      }
    }

    return [];
  }
}
