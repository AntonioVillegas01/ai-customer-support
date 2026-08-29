import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import Redis from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import { loadConfig, type AppConfig } from '@acs/config';
import { createLogger } from '@acs/logger';
import { createDb, DrizzlePromptRegistry, DrizzleUnitOfWork, HybridRetrievalAdapter, type Database } from '@acs/persistence';
import { FakeEmbeddingProvider } from '@acs/testing';
import { AuthController } from './auth/auth.controller';
import { SessionService } from './auth/session.service';
import { AuthGuard, OrgContextGuard, PermissionsGuard, ApiKeyGuard } from './auth/guards';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AUDIT, CONFIG, DB, DB_BUNDLE, EVENTS, LOGGER, PG_POOL, QUEUE, RATE_LIMITER, REDIS, STORAGE, TOOL_REGISTRY, UOW } from './common/tokens';
import { HttpErrorFilter } from './common/http-exception.filter';
import { HealthController } from './health.controller';
import { BullMqQueueAdapter, ClockService, DbAuditAdapter, IdService, RedisEventPublisher, RedisRateLimiter } from './infra/basic';
import { S3ObjectStorageAdapter } from './infra/storage.adapter';
import { WidgetTokenService } from './widget/widget-token.service';
import { WidgetTokenGuard } from './widget/widget.guard';
import { WidgetController } from './widget/widget.controller';
import { StaffConversationsController, WidgetConversationsController } from './conversation/conversations.controller';
import { SandboxToolRegistry } from './tools/sandbox-tool-registry';
import { ToolsController, ToolConfirmController } from './tools/tools.controller';
import { KnowledgeController } from './knowledge/knowledge.controller';
import { AdminController } from './admin/admin.controller';

@Module({
  controllers: [HealthController, AuthController, WidgetController, WidgetConversationsController, StaffConversationsController, ToolsController, ToolConfirmController, KnowledgeController, AdminController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: LOGGER, useFactory: (config: AppConfig) => createLogger({ appName: 'api', level: config.LOG_LEVEL }), inject: [CONFIG] },
    { provide: REDIS, useFactory: (config: AppConfig) => new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }), inject: [CONFIG] },
    { provide: DB_BUNDLE, useFactory: (config: AppConfig) => createDb({ databaseUrl: config.DATABASE_URL, poolMax: config.DATABASE_POOL_MAX }), inject: [CONFIG] },
    { provide: PG_POOL, useFactory: (bundle: ReturnType<typeof createDb>) => bundle.pool, inject: [DB_BUNDLE] },
    { provide: DB, useFactory: (bundle: ReturnType<typeof createDb>) => bundle.db, inject: [DB_BUNDLE] },
    { provide: UOW, useFactory: (db: Database) => new DrizzleUnitOfWork(db), inject: [DB] },
    { provide: QUEUE, useClass: BullMqQueueAdapter },
    { provide: EVENTS, useClass: RedisEventPublisher },
    { provide: RATE_LIMITER, useClass: RedisRateLimiter },
    { provide: AUDIT, useClass: DbAuditAdapter },
    { provide: TOOL_REGISTRY, useClass: SandboxToolRegistry },
    { provide: STORAGE, useFactory: (config: AppConfig) => new S3ObjectStorageAdapter(new S3Client({ region: config.S3_REGION, endpoint: config.S3_ENDPOINT, forcePathStyle: config.S3_FORCE_PATH_STYLE, credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY } })), inject: [CONFIG] },
    { provide: 'RETRIEVAL', useFactory: (db: Database, config: AppConfig) => new HybridRetrievalAdapter(db, new FakeEmbeddingProvider(config.AI_EMBEDDING_DIMENSIONS), config.AI_MODEL_EMBEDDING), inject: [DB, CONFIG] },
    { provide: 'PROMPTS', useFactory: (db: Database) => new DrizzlePromptRegistry(db), inject: [DB] },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
    SessionService, AuthGuard, OrgContextGuard, PermissionsGuard, ApiKeyGuard, WidgetTokenService, WidgetTokenGuard, ClockService, IdService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void { consumer.apply(RequestIdMiddleware).forRoutes('*'); }
}
