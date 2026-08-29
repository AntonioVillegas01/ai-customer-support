import { type ConversationId, type OrganizationId } from '@acs/domain';

export interface JobQueuePort {
  /** Enqueues AI response generation for a persisted customer message. */
  enqueueAiGeneration(job: {
    organizationId: OrganizationId;
    conversationId: ConversationId;
    messageId: string;
    /** Dedupe key so retried API calls never enqueue twice. */
    dedupeKey: string;
  }): Promise<void>;
  enqueueIngestion(job: {
    organizationId: OrganizationId;
    sourceId: string;
    ingestionJobId: string;
    dedupeKey: string;
  }): Promise<void>;
}

export interface ConversationEventPublisher {
  /** Fan-out to live SSE subscribers. Best-effort; durable state is in PG. */
  publish(organizationId: OrganizationId, conversationId: ConversationId, event: unknown): void;
}

export interface AuditPort {
  record(event: {
    organizationId: OrganizationId;
    actorType: 'user' | 'customer' | 'api_key' | 'system' | 'ai';
    actorId: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void>;
}

export interface ObjectStoragePort {
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: string, key: string): Promise<Buffer>;
  delete(bucket: string, key: string): Promise<void>;
}

export interface RateLimiterPort {
  /** Sliding-window limiter. Returns false when the caller is throttled. */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
