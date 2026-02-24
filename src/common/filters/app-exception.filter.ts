import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AppError } from '../errors/app-error';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: Record<string, unknown> = {};

    if (exception instanceof AppError) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details ?? {};
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse() as
        | string
        | { message?: string | string[]; error?: string; code?: string; details?: Record<string, unknown> };

      if (status === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
      } else if (status === HttpStatus.UNAUTHORIZED) {
        code = 'UNAUTHORIZED';
      } else if (status === HttpStatus.FORBIDDEN) {
        code = 'FORBIDDEN';
      }

      if (typeof payload === 'string') {
        message = payload;
      } else {
        const msg = payload?.message;
        message = Array.isArray(msg) ? msg.join(', ') : msg || exception.message;
        if (payload?.code) {
          code = payload.code;
        }
        if (payload?.details) {
          details = payload.details;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    const requestId = request.requestId;
    if (requestId) {
      details = { ...details, request_id: requestId };
    }

    response.status(status).json({
      ok: false,
      error: {
        code,
        message,
        details,
      },
    });
  }
}
