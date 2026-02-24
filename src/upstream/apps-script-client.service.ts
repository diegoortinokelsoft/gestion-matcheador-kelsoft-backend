import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { v4 as uuidV4 } from 'uuid';
import { AppError } from '../common/errors/app-error';

interface UpstreamEnvelope {
  ok: boolean;
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

interface CallOptions {
  timeoutMs?: number;
  retryMax?: number;
  requestId?: string;
  legacyArgs?: unknown[];
}

@Injectable()
export class AppsScriptClientService {
  private readonly logger = new Logger(AppsScriptClientService.name);
  private readonly baseUrl: string;
  private readonly backendKey: string;
  private readonly defaultTimeout: number;
  private readonly defaultRetryMax: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.requireEnv('APPS_SCRIPT_BASE_URL');
    this.backendKey = this.requireEnv('BACKEND_KEY');
    this.defaultTimeout = Number(
      this.configService.get('UPSTREAM_TIMEOUT_MS_DEFAULT') ?? 12000,
    );
    this.defaultRetryMax = Number(
      this.configService.get('UPSTREAM_RETRY_MAX') ?? 2,
    );
  }

  async call<T>(
    action: string,
    params: Record<string, unknown> = {},
    options: CallOptions = {},
  ): Promise<T> {
    const requestId = options.requestId ?? uuidV4();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeout;
    const retryMax = options.retryMax ?? this.defaultRetryMax;
    const startedAt = Date.now();

    let attempt = 0;

    while (attempt <= retryMax) {
      try {
        const payload = {
          action,
          params,
          request_id: requestId,
          // Compatibilidad con la capa actual (function/parameters).
          function: action,
          parameters: options.legacyArgs ?? this.defaultLegacyArgs(params),
          key: this.backendKey,
        };

        const response = await this.httpService.axiosRef.post(
          this.baseUrl,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              BACKEND_KEY: this.backendKey,
            },
            params: {
              key: this.backendKey,
            },
            timeout: timeoutMs,
            validateStatus: () => true,
          },
        );

        const latency = Date.now() - startedAt;

        if (response.status === 429) {
          throw new AxiosError('Rate limited by upstream', undefined, undefined, undefined, response);
        }

        if (response.status >= 500) {
          throw new AxiosError('Upstream unavailable', undefined, undefined, undefined, response);
        }

        const envelope = response.data;
        if (!this.isEnvelope(envelope)) {
          throw new AppError('UPSTREAM_INVALID_RESPONSE', 'Invalid upstream response', {
            action,
            request_id: requestId,
          });
        }

        if (!envelope.ok) {
          this.logger.warn(
            JSON.stringify({
              action,
              request_id: requestId,
              latency_ms: latency,
              ok: false,
              upstream_error_code: envelope.error?.code ?? null,
              upstream_error_message: envelope.error?.message ?? null,
              upstream_error_mapped: 'UPSTREAM_ERROR',
            }),
          );

          throw new AppError('UPSTREAM_ERROR', 'Upstream request failed', {
            action,
            request_id: requestId,
          });
        }

        this.logger.log(
          JSON.stringify({
            action,
            request_id: requestId,
            latency_ms: latency,
            ok: true,
            upstream_error_mapped: null,
          }),
        );

        return envelope.data as T;
      } catch (error) {
        const mappedError = this.mapError(error, action, requestId);
        const shouldRetry =
          attempt < retryMax && this.isRetryable(error, mappedError.code);

        if (shouldRetry) {
          const backoffMs = attempt === 0 ? 250 : 750;
          await this.sleep(backoffMs);
          attempt += 1;
          continue;
        }

        throw mappedError;
      }
    }

    throw new AppError('UPSTREAM_UNAVAILABLE', 'Upstream unavailable');
  }

  private requireEnv(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new Error(`Missing required env var: ${name}`);
    }
    return value;
  }

  private isEnvelope(value: unknown): value is UpstreamEnvelope {
    if (!value || typeof value !== 'object') {
      return false;
    }

    return 'ok' in (value as Record<string, unknown>);
  }

  private defaultLegacyArgs(params: Record<string, unknown>): unknown[] {
    if (!params || Object.keys(params).length === 0) {
      return [];
    }

    return [params];
  }

  private isRetryable(error: unknown, mappedCode: string): boolean {
    if (
      mappedCode === 'UPSTREAM_TIMEOUT' ||
      mappedCode === 'UPSTREAM_UNAVAILABLE' ||
      mappedCode === 'UPSTREAM_RATE_LIMIT'
    ) {
      return true;
    }

    if (error instanceof AxiosError && error.response?.status) {
      return error.response.status === 429 || error.response.status >= 500;
    }

    return false;
  }

  private mapError(
    error: unknown,
    action: string,
    requestId: string,
  ): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED') {
        return new AppError('UPSTREAM_TIMEOUT', 'Upstream timeout', {
          action,
          request_id: requestId,
        });
      }

      if (error.response?.status === 429) {
        return new AppError('UPSTREAM_RATE_LIMIT', 'Upstream rate limited', {
          action,
          request_id: requestId,
        });
      }

      if ((error.response?.status ?? 0) >= 500) {
        return new AppError('UPSTREAM_UNAVAILABLE', 'Upstream unavailable', {
          action,
          request_id: requestId,
          status: error.response?.status,
        });
      }

      if (!error.response) {
        return new AppError('UPSTREAM_UNAVAILABLE', 'Upstream unavailable', {
          action,
          request_id: requestId,
        });
      }
    }

    return new AppError('UPSTREAM_ERROR', 'Upstream request failed', {
      action,
      request_id: requestId,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
