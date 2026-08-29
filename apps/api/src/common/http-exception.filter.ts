import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { type Response } from 'express';
import { DomainError } from '@acs/domain';
import { ErrorCodes, type ErrorCode } from '@acs/contracts';
import { LOGGER } from './tokens';
import { type RequestWithContext } from './types';
import { type Logger } from '@acs/logger';

const statusByCode: Partial<Record<ErrorCode | string, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  INVALID_API_KEY: 401,
  INVALID_WIDGET_TOKEN: 401,
  FORBIDDEN: 403,
  MEMBERSHIP_REQUIRED: 403,
  ORIGIN_NOT_ALLOWED: 403,
  CSRF_TOKEN_INVALID: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  CONVERSATION_CLOSED: 409,
  TOOL_CONFIRMATION_EXPIRED: 410,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  AI_PROVIDER_UNAVAILABLE: 503,
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithContext>();
    const correlationId = req.context?.requestId;
    const mapped = this.map(exception);
    if (mapped.status >= 500) {
      this.logger.error({ err: exception, correlationId }, 'request failed');
    }
    res.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details.length > 0 ? { details: mapped.details } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
      },
    });
  }

  private map(exception: unknown): { status: number; code: string; message: string; details: { path: string; message: string }[] } {
    if (exception instanceof DomainError) {
      return { status: statusByCode[exception.code] ?? 400, code: exception.code, message: exception.message, details: [] };
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const record = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
      const code = typeof record.code === 'string' ? record.code : this.codeForStatus(exception.getStatus());
      const details = Array.isArray(record.details) ? record.details.filter(isDetail) : [];
      return { status: exception.getStatus(), code, message: exception.message, details };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: ErrorCodes.INTERNAL_ERROR, message: 'Internal server error', details: [] };
  }

  private codeForStatus(status: number): string {
    if (status === 400) return ErrorCodes.VALIDATION_FAILED;
    if (status === 401) return ErrorCodes.UNAUTHENTICATED;
    if (status === 403) return ErrorCodes.FORBIDDEN;
    if (status === 404) return ErrorCodes.NOT_FOUND;
    if (status === 429) return ErrorCodes.RATE_LIMITED;
    return ErrorCodes.INTERNAL_ERROR;
  }
}

function isDetail(value: unknown): value is { path: string; message: string } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.path === 'string' && typeof record.message === 'string';
}
