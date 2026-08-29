import pino, { type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

/** Keys whose values are always redacted from structured logs. */
const REDACT_PATHS = [
  'password',
  '*.password',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
  'secret',
  '*.secret',
  'token',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
  'email',
  '*.email',
];

export interface CreateLoggerOptions {
  appName: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  return pino({
    name: options.appName,
    level: options.level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { app: options.appName },
  });
}

/**
 * Returns a child logger carrying correlation metadata. Tenant identifiers are
 * allowed; message bodies, secrets, and customer PII are not.
 */
export function withContext(
  logger: Logger,
  context: {
    correlationId?: string;
    requestId?: string;
    organizationId?: string;
    conversationId?: string;
    jobId?: string;
  },
): Logger {
  return logger.child(context);
}
