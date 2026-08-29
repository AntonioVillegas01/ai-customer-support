import {
  and,
  desc,
  eq,
  getTableColumns,
  ilike,
  lt,
  or,
  sql,
  type InferSelectModel,
} from 'drizzle-orm';
import {
  type AiRunRecord,
  type CitationRecord,
  type ConversationRepository,
  type MessageRepository,
  type OutboxPort,
  type PersistedMessage,
  type ToolExecutionRecord,
  type ToolExecutionRepository,
  type AiRunRepository,
} from '@acs/application';
import { asId, Conversation, type ConversationId, type OrganizationId } from '@acs/domain';
import { type DbClient } from '../db';
import {
  aiRuns,
  conversations,
  messages,
  outboxEvents,
  toolExecutions,
} from '../schema';
import { rethrowUniqueViolation } from '../errors';

const abstentionPrefix = 'I don’t have enough verified information';
type ConversationRow = InferSelectModel<typeof conversations>;
type MessageRow = InferSelectModel<typeof messages>;
type ToolExecutionRow = InferSelectModel<typeof toolExecutions>;

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: DbClient) {}

  async findById(organizationId: OrganizationId, id: ConversationId): Promise<Conversation | null> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, id)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : mapConversation(row);
  }

  async save(conversation: Conversation): Promise<void> {
    const props = conversation.toProps();
    await this.db
      .insert(conversations)
      .values({
        id: props.id,
        organizationId: props.organizationId,
        customerId: props.customerId,
        status: props.status,
        priority: props.priority,
        subject: props.subject,
        assignedAgentId: props.assignedAgentId,
        escalationReasonCode: props.escalationReasonCode,
        language: props.language,
        intent: props.intent,
        sentiment: props.sentiment,
        urgency: props.urgency,
        tags: props.tags,
        lastMessageAt: props.lastMessageAt,
        firstResponseAt: props.firstResponseAt,
        resolvedAt: props.resolvedAt,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      })
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          customerId: props.customerId,
          status: props.status,
          priority: props.priority,
          subject: props.subject,
          assignedAgentId: props.assignedAgentId,
          escalationReasonCode: props.escalationReasonCode,
          language: props.language,
          intent: props.intent,
          sentiment: props.sentiment,
          urgency: props.urgency,
          tags: props.tags,
          lastMessageAt: props.lastMessageAt,
          firstResponseAt: props.firstResponseAt,
          resolvedAt: props.resolvedAt,
          updatedAt: props.updatedAt,
        },
      });
  }
}

export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: DbClient) {}

  async findByIdempotencyKey(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    idempotencyKey: string,
  ): Promise<PersistedMessage | null> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, organizationId),
          eq(messages.conversationId, conversationId),
          eq(messages.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : mapMessage(row);
  }

  async insert(message: PersistedMessage): Promise<void> {
    try {
      await this.db.insert(messages).values(messageToInsert(message));
    } catch (error) {
      rethrowUniqueViolation(error, 'Message idempotency key already exists for this conversation');
    }
  }

  async updateProcessingState(
    organizationId: OrganizationId,
    messageId: PersistedMessage['id'],
    state: PersistedMessage['processingState'],
  ): Promise<void> {
    await this.db
      .update(messages)
      .set({ processingState: state })
      .where(and(eq(messages.organizationId, organizationId), eq(messages.id, messageId)));
  }

  async listRecent(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    limit: number,
  ): Promise<PersistedMessage[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.organizationId, organizationId), eq(messages.conversationId, conversationId)))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return rows.map(mapMessage);
  }

  async insertAssistantMessage(message: PersistedMessage): Promise<void> {
    await this.insert({ ...message, role: 'assistant', aiGenerated: true });
  }

  async countConsecutiveAssistantAbstentions(
    organizationId: OrganizationId,
    conversationId: ConversationId,
  ): Promise<number> {
    const rows = await this.db
      .select({ content: messages.content, role: messages.role })
      .from(messages)
      .where(and(eq(messages.organizationId, organizationId), eq(messages.conversationId, conversationId)))
      .orderBy(desc(messages.createdAt))
      .limit(50);
    let count = 0;
    for (const row of rows) {
      if (row.role !== 'assistant') break;
      if (!row.content.startsWith(abstentionPrefix)) break;
      count += 1;
    }
    return count;
  }
}

export class DrizzleOutbox implements OutboxPort {
  constructor(private readonly db: DbClient) {}

  async publish(event: {
    id: string;
    type: string;
    organizationId: OrganizationId;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void> {
    await this.db.insert(outboxEvents).values({
      id: event.id,
      type: event.type,
      organizationId: event.organizationId,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
  }
}

export class DrizzleAiRunRepository implements AiRunRepository {
  constructor(private readonly db: DbClient) {}

  async insert(run: AiRunRecord): Promise<void> {
    await this.db.insert(aiRuns).values({
      id: run.id,
      organizationId: run.organizationId,
      conversationId: run.conversationId,
      kind: run.kind,
      model: run.model,
      promptVersion: run.promptVersion,
      status: run.status,
      latencyMs: run.latencyMs,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      estimatedCostUsd: run.estimatedCostUsd.toFixed(6),
      retrievedChunkIds: run.retrievedChunkIds,
      selectedTools: run.selectedTools,
      validationErrors: run.validationErrors,
      failureReason: run.failureReason,
      createdAt: run.createdAt,
    });
  }
}

export class DrizzleToolExecutionRepository implements ToolExecutionRepository {
  constructor(private readonly db: DbClient) {}

  async insert(execution: ToolExecutionRecord): Promise<void> {
    try {
      await this.db.insert(toolExecutions).values(toolExecutionToInsert(execution));
    } catch (error) {
      rethrowUniqueViolation(error, 'Tool execution idempotency key already exists for this organization');
    }
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ToolExecutionRecord | null> {
    const rows = await this.db
      .select()
      .from(toolExecutions)
      .where(and(eq(toolExecutions.organizationId, organizationId), eq(toolExecutions.id, id)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : mapToolExecution(row);
  }

  async update(execution: ToolExecutionRecord): Promise<void> {
    await this.db
      .update(toolExecutions)
      .set({
        status: execution.status,
        argsJson: parseObjectJson(execution.argsJson),
        resultSummary: execution.resultSummary,
        errorCode: execution.errorCode,
        confirmationExpiresAt: execution.confirmationExpiresAt,
        updatedAt: execution.updatedAt,
      })
      .where(and(eq(toolExecutions.organizationId, execution.organizationId), eq(toolExecutions.id, execution.id)));
  }
}

export interface ConversationListFilters {
  status?: ConversationRow['status'];
  assignedAgentId?: string;
  search?: string;
  cursor?: string;
  limit: number;
}

export interface ConversationListResult {
  items: Conversation[];
  nextCursor: string | null;
}

export class PgConversationRepositoryHelpers {
  constructor(private readonly db: DbClient) {}

  async listByOrganization(
    organizationId: OrganizationId,
    filters: ConversationListFilters,
  ): Promise<ConversationListResult> {
    const decoded = filters.cursor === undefined ? null : decodeConversationCursor(filters.cursor);
    const predicates = [eq(conversations.organizationId, organizationId)];
    if (filters.status !== undefined) predicates.push(eq(conversations.status, filters.status));
    if (filters.assignedAgentId !== undefined) predicates.push(eq(conversations.assignedAgentId, filters.assignedAgentId));
    if (filters.search !== undefined && filters.search.trim().length > 0) {
      predicates.push(ilike(conversations.subject, `%${filters.search.trim()}%`));
    }
    if (decoded !== null) {
      predicates.push(
        or(
          lt(conversations.createdAt, decoded.createdAt),
          and(eq(conversations.createdAt, decoded.createdAt), lt(conversations.id, decoded.id)),
        ) ?? sql`false`,
      );
    }
    const rows = await this.db
      .select(getTableColumns(conversations))
      .from(conversations)
      .where(and(...predicates))
      .orderBy(desc(conversations.createdAt), desc(conversations.id))
      .limit(filters.limit + 1);
    const page = rows.slice(0, filters.limit);
    const last = page.at(-1);
    return {
      items: page.map(mapConversation),
      nextCursor: rows.length > filters.limit && last !== undefined ? encodeConversationCursor(last) : null,
    };
  }
}

function mapConversation(row: ConversationRow): Conversation {
  return Conversation.fromProps({
    id: asId<'ConversationId'>(row.id),
    organizationId: asId<'OrganizationId'>(row.organizationId),
    customerId: row.customerId === null ? null : asId<'CustomerId'>(row.customerId),
    status: row.status as ReturnType<Conversation['toProps']>['status'],
    priority: row.priority as ReturnType<Conversation['toProps']>['priority'],
    subject: row.subject,
    assignedAgentId: row.assignedAgentId === null ? null : asId<'UserId'>(row.assignedAgentId),
    escalationReasonCode: row.escalationReasonCode,
    language: row.language,
    intent: row.intent,
    sentiment: row.sentiment,
    urgency: row.urgency,
    tags: row.tags,
    lastMessageAt: row.lastMessageAt,
    firstResponseAt: row.firstResponseAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function mapMessage(row: MessageRow): PersistedMessage {
  return {
    id: asId<'MessageId'>(row.id),
    conversationId: asId<'ConversationId'>(row.conversationId),
    organizationId: asId<'OrganizationId'>(row.organizationId),
    role: row.role as PersistedMessage['role'],
    content: row.content,
    processingState: row.processingState as PersistedMessage['processingState'],
    idempotencyKey: row.idempotencyKey,
    aiGenerated: row.aiGenerated,
    citations: parseCitations(row.citations),
    createdAt: row.createdAt,
  };
}

function messageToInsert(message: PersistedMessage): typeof messages.$inferInsert {
  return {
    id: message.id,
    organizationId: message.organizationId,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    processingState: message.processingState,
    idempotencyKey: message.idempotencyKey,
    aiGenerated: message.aiGenerated,
    citations: message.citations,
    createdAt: message.createdAt,
  };
}

function mapToolExecution(row: ToolExecutionRow): ToolExecutionRecord {
  return {
    id: row.id,
    organizationId: asId<'OrganizationId'>(row.organizationId),
    conversationId: asId<'ConversationId'>(row.conversationId),
    toolName: row.toolName,
    status: row.status as ToolExecutionRecord['status'],
    argsJson: JSON.stringify(row.argsJson),
    resultSummary: row.resultSummary,
    errorCode: row.errorCode,
    idempotencyKey: row.idempotencyKey,
    confirmationExpiresAt: row.confirmationExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toolExecutionToInsert(execution: ToolExecutionRecord): typeof toolExecutions.$inferInsert {
  return {
    id: execution.id,
    organizationId: execution.organizationId,
    conversationId: execution.conversationId,
    toolName: execution.toolName,
    status: execution.status,
    argsJson: parseObjectJson(execution.argsJson),
    resultSummary: execution.resultSummary,
    errorCode: execution.errorCode,
    idempotencyKey: execution.idempotencyKey,
    confirmationExpiresAt: execution.confirmationExpiresAt,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
  };
}

function parseObjectJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Tool execution argsJson must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function parseCitations(value: unknown): CitationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCitationRecord);
}

function isCitationRecord(value: unknown): value is CitationRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.documentId === 'string' &&
    typeof record.documentVersionId === 'string' &&
    typeof record.chunkId === 'string' &&
    typeof record.title === 'string' &&
    (typeof record.section === 'string' || record.section === null) &&
    (typeof record.url === 'string' || record.url === null) &&
    typeof record.snippet === 'string' &&
    typeof record.score === 'number'
  );
}

function encodeConversationCursor(row: Pick<ConversationRow, 'createdAt' | 'id'>): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
}

function decodeConversationCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.createdAt !== 'string' || typeof value.id !== 'string') return null;
    const createdAt = new Date(value.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: value.id };
  } catch {
    return null;
  }
}
