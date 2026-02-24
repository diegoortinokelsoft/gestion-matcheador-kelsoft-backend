import { statusByErrorCode } from '../constants/error-codes';

export class AppError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
    statusCode?: number,
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.statusCode = statusCode ?? statusByErrorCode(code);
  }
}
