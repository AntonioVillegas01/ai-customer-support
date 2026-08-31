import { Controller, Get, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, Queue, type Job } from 'bullmq';
import Redis from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import { and, eq, sql } from 'drizzle-orm';
import { GenerateAiResponseUseCase } from '@acs/application';
import { loadConfig } from '@acs/config';
import { asId } from '@acs/domain';
import { createLogger, type Logger } from '@acs/logger';
import { createDb, closeDb, DrizzlePromptRegistry, DrizzleUnitOfWork, HybridRetrievalAdapter, messages, outboxEvents, type Database } from '@acs/persistence';
import { createAiProviders } from '@acs/ai-providers';
import { DbAudit, MonthlyBudgetAdapter, RedisPublisher, SystemClock, UuidGenerator, WorkerQueueAdapter } from './infra/adapters';
import { WorkerSandboxToolRegistry } from './infra/sandbox-tools';
import { S3ObjectStorageAdapter } from './infra/storage.adapter';
import { IngestionService } from './ingestion/ingestion.service';

interface AiJob { organizationId: string; conversationId: string; messageId: string; }
interface IngestionJob { organizationId: string; sourceId: string; ingestionJobId: string; }

@Controller('health')
class WorkerHealthController { @Get('live') live(): { status: 'ok' } { return { status: 'ok' }; } @Get('ready') ready(): { status: 'ok' } { return { status: 'ok' }; } }

@Injectable()
export class WorkerRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly config = loadConfig({ ...process.env, APP_NAME: 'worker' });
  private readonly logger: Logger = createLogger({ appName: 'worker', level: this.config.LOG_LEVEL });
  private readonly redis = new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: null });
  private readonly dbBundle = createDb({ databaseUrl: this.config.DATABASE_URL, poolMax: this.config.DATABASE_POOL_MAX });
  private readonly queues = new WorkerQueueAdapter(this.redis);
  private readonly aiDlq = new Queue('ai-generation-dlq', { connection: this.redis });
  private readonly ingestionDlq = new Queue('ingestion-dlq', { connection: this.redis });
  private workers: Worker[] = [];

  onModuleInit(): void {
    const providers = createAiProviders(this.config);
    const db = this.dbBundle.db;
    const useCase = new GenerateAiResponseUseCase(new DrizzleUnitOfWork(db), providers.llm, new HybridRetrievalAdapter(db, providers.embeddings, this.config.AI_MODEL_EMBEDDING), new DrizzlePromptRegistry(db), new WorkerSandboxToolRegistry(db), new MonthlyBudgetAdapter(db, this.config.AI_MONTHLY_BUDGET_USD_DEFAULT), new RedisPublisher(this.redis), new DbAudit(db), new SystemClock(), new UuidGenerator(), { generation: this.config.AI_MODEL_GENERATION, classification: this.config.AI_MODEL_CLASSIFICATION });
    const storage = new S3ObjectStorageAdapter(new S3Client({ region: this.config.S3_REGION, endpoint: this.config.S3_ENDPOINT, forcePathStyle: this.config.S3_FORCE_PATH_STYLE, credentials: { accessKeyId: this.config.S3_ACCESS_KEY_ID, secretAccessKey: this.config.S3_SECRET_ACCESS_KEY } }));
    const ingestion = new IngestionService(db, storage, providers.embeddings, this.config);
    this.workers = [
      new Worker('ai-generation', async (job: Job<AiJob>) => { await useCase.execute({ organizationId: asId<'OrganizationId'>(job.data.organizationId), conversationId: asId<'ConversationId'>(job.data.conversationId), messageId: job.data.messageId }); }, { connection: this.redis, concurrency: 4 }),
      new Worker('ingestion', async (job: Job<IngestionJob>) => { await ingestion.process(job.data); }, { connection: this.redis, concurrency: 2 }),
      new Worker('outbox-drain', async () => { await drainOutbox(db, this.queues); }, { connection: this.redis, concurrency: 1 }),
    ];
    void new Queue('outbox-drain', { connection: this.redis }).add('drain', {}, { repeat: { every: 10_000 }, jobId: 'outbox-drain' });
    this.workers[0]?.on('failed', async (job, err) => { if (job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1)) await this.handleAiFailure(job as Job<AiJob>, err); });
    this.workers[1]?.on('failed', async (job, err) => { if (job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1)) { await this.ingestionDlq.add('failed', { id: job.id, data: job.data, error: err.message }); await ingestion.fail(job.data as IngestionJob, err.message); } });
    this.logger.info('workers started');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([this.queues.close(), this.aiDlq.close(), this.ingestionDlq.close()]);
    this.redis.disconnect();
    await closeDb(this.dbBundle.pool);
  }

  private async handleAiFailure(job: Job<AiJob>, err: Error): Promise<void> {
    await this.aiDlq.add('failed', { id: job.id, data: job.data, error: err.message });
    await this.dbBundle.db.update(messages).set({ processingState: 'failed' }).where(and(eq(messages.organizationId, job.data.organizationId), eq(messages.id, job.data.messageId)));
    new RedisPublisher(this.redis).publish(asId<'OrganizationId'>(job.data.organizationId), asId<'ConversationId'>(job.data.conversationId), { type: 'message.failed', messageId: job.data.messageId, errorCode: 'AI_PROVIDER_UNAVAILABLE' });
  }
}

async function drainOutbox(db: Database, queues: WorkerQueueAdapter): Promise<void> {
  const result = await db.execute(sql`select id, organization_id, type, payload from outbox_events where processed_at is null order by occurred_at limit 50 for update skip locked`);
  const rows = Array.isArray(result) ? result : 'rows' in result ? result.rows : [];
  for (const raw of rows) {
    const row = raw as { id: string; organization_id: string; type: string; payload: Record<string, unknown> };
    if (row.type === 'conversation.message_accepted' && typeof row.payload.conversationId === 'string' && typeof row.payload.messageId === 'string' && row.payload.aiControlled === true) {
      await queues.enqueueAiGeneration({ organizationId: asId<'OrganizationId'>(row.organization_id), conversationId: asId<'ConversationId'>(row.payload.conversationId), messageId: row.payload.messageId, dedupeKey: `ai-gen:${row.payload.messageId}` });
    }
    await db.update(outboxEvents).set({ processedAt: new Date() }).where(eq(outboxEvents.id, row.id));
  }
}

@Module({ controllers: [WorkerHealthController], providers: [WorkerRuntime] })
export class WorkerModule {}
