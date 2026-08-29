import {
  type Conversation,
  type ConversationId,
  type MessageId,
  type OrganizationId,
} from '@acs/domain';

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
}

/**
 * Transactional boundary. Repositories obtained inside `run` participate in
 * the same database transaction, including outbox writes.
 */
export interface UnitOfWork {
  run<T>(fn: (tx: TransactionalPorts) => Promise<T>): Promise<T>;
}

export interface TransactionalPorts {
  conversations: ConversationRepository;
  messages: MessageRepository;
  outbox: OutboxPort;
  aiRuns: AiRunRepository;
  toolExecutions: ToolExecutionRepository;
}

export interface PersistedMessage {
  id: MessageId;
  conversationId: ConversationId;
  organizationId: OrganizationId;
  role: 'customer' | 'assistant' | 'agent' | 'system';
  content: string;
  processingState: 'accepted' | 'processing' | 'delivered' | 'failed';
  idempotencyKey: string | null;
  aiGenerated: boolean;
  citations: CitationRecord[];
  createdAt: Date;
}

export interface CitationRecord {
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  title: string;
  section: string | null;
  url: string | null;
  snippet: string;
  score: number;
}

export interface ConversationRepository {
  /** Tenant-scoped lookup. Returns null when not found in the organization. */
  findById(organizationId: OrganizationId, id: ConversationId): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
}

export interface MessageRepository {
  findByIdempotencyKey(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    idempotencyKey: string,
  ): Promise<PersistedMessage | null>;
  insert(message: PersistedMessage): Promise<void>;
  updateProcessingState(
    organizationId: OrganizationId,
    messageId: MessageId,
    state: PersistedMessage['processingState'],
  ): Promise<void>;
  listRecent(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    limit: number,
  ): Promise<PersistedMessage[]>;
  insertAssistantMessage(message: PersistedMessage): Promise<void>;
  countConsecutiveAssistantAbstentions(
    organizationId: OrganizationId,
    conversationId: ConversationId,
  ): Promise<number>;
}

export interface OutboxPort {
  /** Enqueues a domain event durably within the ambient transaction. */
  publish(event: {
    id: string;
    type: string;
    organizationId: OrganizationId;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void>;
}

export interface AiRunRepository {
  insert(run: AiRunRecord): Promise<void>;
}

export interface AiRunRecord {
  id: string;
  organizationId: OrganizationId;
  conversationId: ConversationId | null;
  kind: 'generation' | 'classification' | 'summarization' | 'suggestion' | 'embedding';
  model: string;
  promptVersion: string;
  status: 'succeeded' | 'failed' | 'abstained';
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  retrievedChunkIds: string[];
  selectedTools: string[];
  validationErrors: string[] | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface ToolExecutionRepository {
  insert(execution: ToolExecutionRecord): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<ToolExecutionRecord | null>;
  update(execution: ToolExecutionRecord): Promise<void>;
}

export interface ToolExecutionRecord {
  id: string;
  organizationId: OrganizationId;
  conversationId: ConversationId;
  toolName: string;
  status:
    | 'proposed'
    | 'awaiting_confirmation'
    | 'confirmed'
    | 'rejected'
    | 'executing'
    | 'succeeded'
    | 'failed'
    | 'expired';
  argsJson: string;
  resultSummary: string | null;
  errorCode: string | null;
  /** Idempotency key derived from conversation + tool + args hash. */
  idempotencyKey: string;
  confirmationExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
