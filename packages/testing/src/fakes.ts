import {
  type AiRunRecord,
  type AiRunRepository,
  type AuditPort,
  type Clock,
  type ConversationEventPublisher,
  type ConversationRepository,
  type IdGenerator,
  type JobQueuePort,
  type MessageRepository,
  type OutboxPort,
  type PersistedMessage,
  type RateLimiterPort,
  type ToolExecutionRecord,
  type ToolExecutionRepository,
  type TransactionalPorts,
  type UnitOfWork,
} from '@acs/application';
import { Conversation, type ConversationId, type OrganizationId } from '@acs/domain';

export class FixedClock implements Clock {
  constructor(private current = new Date('2026-01-01T00:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  uuid(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

export class InMemoryConversationRepository implements ConversationRepository {
  readonly store = new Map<string, Conversation>();
  async findById(organizationId: OrganizationId, id: ConversationId): Promise<Conversation | null> {
    const found = this.store.get(id);
    if (found === undefined) return null;
    if (found.organizationId !== organizationId) return null; // tenant scope
    return Conversation.fromProps(found.toProps());
  }
  async save(conversation: Conversation): Promise<void> {
    this.store.set(conversation.id, Conversation.fromProps(conversation.toProps()));
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  readonly store: PersistedMessage[] = [];
  async findByIdempotencyKey(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    idempotencyKey: string,
  ): Promise<PersistedMessage | null> {
    return (
      this.store.find(
        (m) =>
          m.organizationId === organizationId &&
          m.conversationId === conversationId &&
          m.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }
  async insert(message: PersistedMessage): Promise<void> {
    if (
      message.idempotencyKey !== null &&
      (await this.findByIdempotencyKey(
        message.organizationId,
        message.conversationId,
        message.idempotencyKey,
      )) !== null
    ) {
      throw new Error('unique_violation: idempotency key');
    }
    this.store.push({ ...message });
  }
  async updateProcessingState(
    organizationId: OrganizationId,
    messageId: string,
    state: PersistedMessage['processingState'],
  ): Promise<void> {
    const m = this.store.find((x) => x.organizationId === organizationId && x.id === messageId);
    if (m !== undefined) m.processingState = state;
  }
  async listRecent(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    limit: number,
  ): Promise<PersistedMessage[]> {
    return this.store
      .filter((m) => m.organizationId === organizationId && m.conversationId === conversationId)
      .slice(-limit)
      .map((m) => ({ ...m }));
  }
  async insertAssistantMessage(message: PersistedMessage): Promise<void> {
    await this.insert(message);
  }
  async countConsecutiveAssistantAbstentions(): Promise<number> {
    return 0;
  }
}

export class InMemoryOutbox implements OutboxPort {
  readonly events: Parameters<OutboxPort['publish']>[0][] = [];
  async publish(event: Parameters<OutboxPort['publish']>[0]): Promise<void> {
    this.events.push(event);
  }
}

export class InMemoryAiRunRepository implements AiRunRepository {
  readonly runs: AiRunRecord[] = [];
  async insert(run: AiRunRecord): Promise<void> {
    this.runs.push(run);
  }
}

export class InMemoryToolExecutionRepository implements ToolExecutionRepository {
  readonly store = new Map<string, ToolExecutionRecord>();
  async insert(execution: ToolExecutionRecord): Promise<void> {
    for (const e of this.store.values()) {
      if (e.idempotencyKey === execution.idempotencyKey && e.status === 'succeeded') {
        throw new Error('unique_violation: tool idempotency key');
      }
    }
    this.store.set(execution.id, { ...execution });
  }
  async findById(organizationId: OrganizationId, id: string): Promise<ToolExecutionRecord | null> {
    const found = this.store.get(id);
    if (found === undefined || found.organizationId !== organizationId) return null;
    return { ...found };
  }
  async update(execution: ToolExecutionRecord): Promise<void> {
    this.store.set(execution.id, { ...execution });
  }
}

export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    readonly conversations = new InMemoryConversationRepository(),
    readonly messages = new InMemoryMessageRepository(),
    readonly outbox = new InMemoryOutbox(),
    readonly aiRuns = new InMemoryAiRunRepository(),
    readonly toolExecutions = new InMemoryToolExecutionRepository(),
  ) {}
  async run<T>(fn: (tx: TransactionalPorts) => Promise<T>): Promise<T> {
    // In-memory fake: no rollback semantics; unit tests assert behavior only.
    return fn({
      conversations: this.conversations,
      messages: this.messages,
      outbox: this.outbox,
      aiRuns: this.aiRuns,
      toolExecutions: this.toolExecutions,
    });
  }
}

export class RecordingQueue implements JobQueuePort {
  readonly aiJobs: Parameters<JobQueuePort['enqueueAiGeneration']>[0][] = [];
  readonly ingestionJobs: Parameters<JobQueuePort['enqueueIngestion']>[0][] = [];
  async enqueueAiGeneration(job: Parameters<JobQueuePort['enqueueAiGeneration']>[0]): Promise<void> {
    this.aiJobs.push(job);
  }
  async enqueueIngestion(job: Parameters<JobQueuePort['enqueueIngestion']>[0]): Promise<void> {
    this.ingestionJobs.push(job);
  }
}

export class RecordingEventPublisher implements ConversationEventPublisher {
  readonly published: { organizationId: string; conversationId: string; event: unknown }[] = [];
  publish(organizationId: OrganizationId, conversationId: ConversationId, event: unknown): void {
    this.published.push({ organizationId, conversationId, event });
  }
}

export class AllowAllRateLimiter implements RateLimiterPort {
  async allow(): Promise<boolean> {
    return true;
  }
}

export class DenyAllRateLimiter implements RateLimiterPort {
  async allow(): Promise<boolean> {
    return false;
  }
}

export class RecordingAudit implements AuditPort {
  readonly records: Parameters<AuditPort['record']>[0][] = [];
  async record(event: Parameters<AuditPort['record']>[0]): Promise<void> {
    this.records.push(event);
  }
}
