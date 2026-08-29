import { describe, expect, it } from 'vitest';
import { FakeLlmProvider } from '@acs/testing';
import { type AppConfig } from '@acs/config';
import { createAiProviders } from './provider-factory';

const baseConfig = {
  NODE_ENV: 'test', APP_NAME: 'worker', DATABASE_URL: 'postgres://u:p@localhost:5433/db', DATABASE_POOL_MAX: 1, REDIS_URL: 'redis://localhost:6380', S3_ENDPOINT: 'http://localhost:9000', S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'x', S3_BUCKET_KNOWLEDGE: 'k', S3_BUCKET_ATTACHMENTS: 'a', S3_FORCE_PATH_STYLE: true, API_PORT: 3001, API_BASE_URL: 'http://localhost:3001', WEB_BASE_URL: 'http://localhost:3000', WIDGET_BASE_URL: 'http://localhost:3002', CORS_ALLOWED_ORIGINS: ['http://localhost:3000'], SESSION_SECRET: 'x'.repeat(32), WIDGET_TOKEN_SECRET: 'y'.repeat(32), API_KEY_PEPPER: 'z'.repeat(32), REQUEST_BODY_LIMIT_MB: 1, WORKER_HEALTH_PORT: 3002, KNOWLEDGE_UPLOAD_MAX_BYTES: 1024, AI_PROVIDER: 'fake', OPENROUTER_API_KEY: '', OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1', AI_MODEL_GENERATION: 'g', AI_MODEL_CLASSIFICATION: 'c', AI_MODEL_SUMMARIZATION: 's', AI_MODEL_EMBEDDING: 'e', AI_EMBEDDING_DIMENSIONS: 8, AI_TIMEOUT_MS: 1000, AI_MAX_RETRIES: 1, AI_MONTHLY_BUDGET_USD_DEFAULT: 1, AI_MAX_CONCURRENCY: 1, OTEL_EXPORTER_OTLP_ENDPOINT: '', LANGFUSE_PUBLIC_KEY: '', LANGFUSE_SECRET_KEY: '', LANGFUSE_BASE_URL: '', LOG_LEVEL: 'error'
} satisfies AppConfig;

describe('createAiProviders', () => {
  it('uses deterministic fake providers by default', () => {
    const providers = createAiProviders(baseConfig);
    expect(providers.llm).toBeInstanceOf(FakeLlmProvider);
  });
});
