import { z } from 'zod';

const commaSeparated = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('api'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_KNOWLEDGE: z.string().min(1),
  S3_BUCKET_ATTACHMENTS: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  API_PORT: z.coerce.number().int().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
  WIDGET_BASE_URL: z.string().url().default('http://localhost:3002'),
  CORS_ALLOWED_ORIGINS: commaSeparated.default('http://localhost:3000,http://localhost:3002'),
  SESSION_SECRET: z.string().min(32),
  WIDGET_TOKEN_SECRET: z.string().min(32),
  API_KEY_PEPPER: z.string().min(32),
  REQUEST_BODY_LIMIT_MB: z.coerce.number().positive().default(2),
  WORKER_HEALTH_PORT: z.coerce.number().int().default(3003),
  KNOWLEDGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),

  AI_PROVIDER: z.enum(['openrouter', 'gemini', 'fake']).default('fake'),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  AI_MODEL_GENERATION: z.string().default('openai/gpt-4o-mini'),
  AI_MODEL_CLASSIFICATION: z.string().default('openai/gpt-4o-mini'),
  AI_MODEL_SUMMARIZATION: z.string().default('openai/gpt-4o-mini'),
  AI_MODEL_EMBEDDING: z.string().default('openai/text-embedding-3-small'),
  AI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  AI_MONTHLY_BUDGET_USD_DEFAULT: z.coerce.number().positive().default(50),
  AI_MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(''),
  LANGFUSE_PUBLIC_KEY: z.string().optional().default(''),
  LANGFUSE_SECRET_KEY: z.string().optional().default(''),
  LANGFUSE_BASE_URL: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Invalid environment configuration:\n${issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validates process environment at startup. Fails fast with a precise report.
 * Never logs raw values, only variable names and violation messages.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }
  if (result.data.NODE_ENV === 'production') {
    assertProductionSafety(result.data);
  }
  return result.data;
}

function assertProductionSafety(config: AppConfig): void {
  const problems: string[] = [];
  for (const key of ['SESSION_SECRET', 'WIDGET_TOKEN_SECRET', 'API_KEY_PEPPER'] as const) {
    if (config[key].includes('change_me')) {
      problems.push(`${key} must not use the development placeholder in production`);
    }
  }
  if (config.AI_PROVIDER === 'openrouter' && config.OPENROUTER_API_KEY.length === 0) {
    problems.push('OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter');
  }
  if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY.length === 0) {
    problems.push('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  }
  if (problems.length > 0) {
    throw new ConfigValidationError(
      problems.map((message) => ({ code: 'custom', message, path: [] }) as z.ZodIssue),
    );
  }
}
