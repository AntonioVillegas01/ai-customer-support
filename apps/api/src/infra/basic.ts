import { randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { type AuditPort, type ConversationEventPublisher, type JobQueuePort, type RateLimiterPort } from '@acs/application';
import { type ConversationId, type OrganizationId } from '@acs/domain';
import { auditEvents } from '@acs/persistence';
import { type Database } from '@acs/persistence';
import { DB, REDIS } from '../common/tokens';

@Injectable()
export class ClockService { now(): Date { return new Date(); } }
@Injectable()
export class IdService { uuid(): string { return randomUUID(); } }

// BullMQ forbids ':' in custom job ids; dedupe keys keep their semantic form elsewhere.
function toJobId(dedupeKey: string): string { return dedupeKey.replace(/:/g, '-'); }

@Injectable()
export class BullMqQueueAdapter implements JobQueuePort, OnModuleDestroy {
  private readonly aiQueue: Queue;
  private readonly ingestionQueue: Queue;
  constructor(@Inject(REDIS) connection: Redis) {
    this.aiQueue = new Queue('ai-generation', { connection });
    this.ingestionQueue = new Queue('ingestion', { connection });
  }
  async enqueueAiGeneration(job: Parameters<JobQueuePort['enqueueAiGeneration']>[0]): Promise<void> {
    await this.aiQueue.add('generate', job, { jobId: toJobId(job.dedupeKey), attempts: 4, backoff: { type: 'exponential', delay: 1000 } });
  }
  async enqueueIngestion(job: Parameters<JobQueuePort['enqueueIngestion']>[0]): Promise<void> {
    await this.ingestionQueue.add('ingest', job, { jobId: toJobId(job.dedupeKey), attempts: 4, backoff: { type: 'exponential', delay: 1000 } });
  }
  async onModuleDestroy(): Promise<void> { await Promise.all([this.aiQueue.close(), this.ingestionQueue.close()]); }
}

@Injectable()
export class RedisEventPublisher implements ConversationEventPublisher {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  publish(organizationId: OrganizationId, conversationId: ConversationId, event: unknown): void {
    const id = randomUUID();
    void this.redis.publish(`org:${organizationId}:conversation:${conversationId}`, JSON.stringify({ id, event }));
  }
}

@Injectable()
export class RedisRateLimiter implements RateLimiterPort {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const redisKey = `rl:${key}`;
    const min = now - windowSeconds * 1000;
    const member = `${now}:${randomUUID()}`;
    const results = await this.redis.multi().zremrangebyscore(redisKey, 0, min).zadd(redisKey, now, member).zcard(redisKey).expire(redisKey, windowSeconds).exec();
    const countResult = results?.[2]?.[1];
    return typeof countResult === 'number' ? countResult <= limit : false;
  }
}

@Injectable()
export class DbAuditAdapter implements AuditPort {
  constructor(@Inject(DB) private readonly db: Database) {}
  async record(event: Parameters<AuditPort['record']>[0]): Promise<void> {
    await this.db.insert(auditEvents).values({
      organizationId: event.organizationId,
      actorType: event.actorType,
      actorId: event.actorId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: event.metadata,
      occurredAt: event.occurredAt,
    });
  }
}
