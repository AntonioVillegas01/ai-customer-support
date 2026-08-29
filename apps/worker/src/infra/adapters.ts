import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { Queue } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { type AiBudgetPort, type AuditPort, type ConversationEventPublisher, type JobQueuePort, type RateLimiterPort } from '@acs/application';
import { type ConversationId, type OrganizationId } from '@acs/domain';
import { auditEvents, usageRecords, type Database } from '@acs/persistence';

export class SystemClock { now(): Date { return new Date(); } }
export class UuidGenerator { uuid(): string { return randomUUID(); } }

// BullMQ forbids ':' in custom job ids; dedupe keys keep their semantic form elsewhere.
function toJobId(dedupeKey: string): string { return dedupeKey.replace(/:/g, '-'); }

export class RedisPublisher implements ConversationEventPublisher {
  constructor(private readonly redis: Redis) {}
  publish(organizationId: OrganizationId, conversationId: ConversationId, event: unknown): void { void this.redis.publish(`org:${organizationId}:conversation:${conversationId}`, JSON.stringify({ id: randomUUID(), event })); }
}

export class WorkerQueueAdapter implements JobQueuePort {
  private readonly ai: Queue;
  private readonly ingestion: Queue;
  constructor(connection: Redis) { this.ai = new Queue('ai-generation', { connection }); this.ingestion = new Queue('ingestion', { connection }); }
  async enqueueAiGeneration(job: Parameters<JobQueuePort['enqueueAiGeneration']>[0]): Promise<void> { await this.ai.add('generate', job, { jobId: toJobId(job.dedupeKey), attempts: 4, backoff: { type: 'exponential', delay: 1000 } }); }
  async enqueueIngestion(job: Parameters<JobQueuePort['enqueueIngestion']>[0]): Promise<void> { await this.ingestion.add('ingest', job, { jobId: toJobId(job.dedupeKey), attempts: 4, backoff: { type: 'exponential', delay: 1000 } }); }
  async close(): Promise<void> { await Promise.all([this.ai.close(), this.ingestion.close()]); }
}

export class NoopRateLimiter implements RateLimiterPort { async allow(): Promise<boolean> { return true; } }

export class DbAudit implements AuditPort {
  constructor(private readonly db: Database) {}
  async record(event: Parameters<AuditPort['record']>[0]): Promise<void> { await this.db.insert(auditEvents).values({ organizationId: event.organizationId, actorType: event.actorType, actorId: event.actorId, action: event.action, resourceType: event.resourceType, resourceId: event.resourceId, metadata: event.metadata, occurredAt: event.occurredAt }); }
}

export class MonthlyBudgetAdapter implements AiBudgetPort {
  constructor(private readonly db: Database, private readonly defaultBudgetUsd: number) {}
  async tryConsume(organizationId: OrganizationId, estimatedCostUsd: number): Promise<boolean> {
    const month = new Date().toISOString().slice(0, 7);
    const rows = await this.db.select({ cost: usageRecords.aiCostUsd }).from(usageRecords).where(and(eq(usageRecords.organizationId, organizationId), eq(usageRecords.periodMonth, month))).limit(1);
    const current = Number(rows[0]?.cost ?? 0);
    if (current + estimatedCostUsd > this.defaultBudgetUsd) return false;
    await this.db.insert(usageRecords).values({ organizationId, periodMonth: month, aiCostUsd: estimatedCostUsd.toFixed(6), tokens: 0 }).onConflictDoUpdate({ target: [usageRecords.organizationId, usageRecords.periodMonth], set: { aiCostUsd: sql`${usageRecords.aiCostUsd} + ${estimatedCostUsd.toFixed(6)}`, updatedAt: new Date() } });
    return true;
  }
}
