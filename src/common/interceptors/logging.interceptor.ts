import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AppError } from '../errors/app-error';
import { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
      requestId?: string;
      user?: AuthUser;
    }>();

    const started = Date.now();
    const route = `${request.method} ${request.originalUrl ?? request.url}`;

    return next.handle().pipe(
      tap(() => {
        const payload = {
          route,
          user_id: request.user?.user_id ?? null,
          request_id: request.requestId ?? null,
          latency_ms: Date.now() - started,
          ok: true,
          error_code: null,
        };

        this.logger.log(JSON.stringify(payload));
      }),
      catchError((error: unknown) => {
        const payload = {
          route,
          user_id: request.user?.user_id ?? null,
          request_id: request.requestId ?? null,
          latency_ms: Date.now() - started,
          ok: false,
          error_code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        };

        this.logger.error(JSON.stringify(payload));
        return throwError(() => error);
      }),
    );
  }
}
