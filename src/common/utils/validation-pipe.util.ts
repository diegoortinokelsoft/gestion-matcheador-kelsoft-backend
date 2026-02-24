import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { AppError } from '../errors/app-error';

function flattenValidationErrors(errors: ValidationError[]): string[] {
  const result: string[] = [];

  for (const error of errors) {
    if (error.constraints) {
      result.push(...Object.values(error.constraints));
    }
    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children));
    }
  }

  return result;
}

export function createGlobalValidationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const messages = flattenValidationErrors(errors);
      throw new AppError('VALIDATION_ERROR', 'Validation failed', {
        issues: messages,
      });
    },
  });
}
