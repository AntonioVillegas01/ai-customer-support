import {
  type ConversationId,
  type MessageId,
  type OrganizationId,
  acceptsCustomerMessages,
  isAiControlled,
  DomainError,
  asId,
} from '@acs/domain';
import {
  type Clock,
  type IdGenerator,
  type PersistedMessage,
  type UnitOfWork,
} from '../ports/persistence';
import { type ConversationEventPublisher, type JobQueuePort, type RateLimiterPort } from '../ports/infrastructure';

export class ConversationClosedError extends DomainError {
  readonly code = 'CONVERSATION_CLOSED';
  constructor() {
    super('Conversation is closed and does not accept new messages');
  }
}

export class ConversationNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor() {
    super('Conversation not found');
  }
}

export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  constructor() {
    super('Too many messages; slow down');
  }
}

export interface PostCustomerMessageInput {
  organizationId: OrganizationId;
  conversationId: ConversationId;
  customerId: string | null;
  content: string;
  idempotencyKey: string;
}

export interface PostCustomerMessageResult {
  message: PersistedMessage;
  /** True when this call re-returned an already accepted message. */
  duplicate: boolean;
  aiProcessingEnqueued: boolean;
}

/**
 * Accepts a customer message durably BEFORE any AI work:
 *  1. rate limit → 2. load tenant-scoped conversation → 3. idempotency check
 *  4. persist message + outbox event in one transaction
 *  5. enqueue AI generation only when the conversation is AI-controlled.
 * A crash after step 4 is recovered by the outbox drainer; duplicates are
 * impossible thanks to the idempotency key unique constraint.
 */
export class PostCustomerMessageUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queue: JobQueuePort,
    private readonly events: ConversationEventPublisher,
    private readonly rateLimiter: RateLimiterPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: PostCustomerMessageInput): Promise<PostCustomerMessageResult> {
    const allowed = await this.rateLimiter.allow(
      `msg:${input.organizationId}:${input.conversationId}`,
      20,
      60,
    );
    if (!allowed) {
      throw new RateLimitedError();
    }

    const now = this.clock.now();
    const result = await this.uow.run(async (tx) => {
      const conversation = await tx.conversations.findById(
        input.organizationId,
        input.conversationId,
      );
      if (conversation === null) {
        throw new ConversationNotFoundError();
      }
      if (!acceptsCustomerMessages(conversation.status)) {
        throw new ConversationClosedError();
      }

      const existing = await tx.messages.findByIdempotencyKey(
        input.organizationId,
        input.conversationId,
        input.idempotencyKey,
      );
      if (existing !== null) {
        return { message: existing, duplicate: true, aiControlled: false };
      }

      const message: PersistedMessage = {
        id: asId<'MessageId'>(this.ids.uuid()) as MessageId,
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        role: 'customer',
        content: input.content,
        processingState: 'accepted',
        idempotencyKey: input.idempotencyKey,
        aiGenerated: false,
        citations: [],
        createdAt: now,
      };
      await tx.messages.insert(message);

      conversation.recordCustomerMessage(now);
      const aiControlled = isAiControlled(conversation.status);
      if (conversation.status === 'pending_customer') {
        conversation.transitionTo('open_ai', now);
      }
      await tx.conversations.save(conversation);

      await tx.outbox.publish({
        id: this.ids.uuid(),
        type: 'conversation.message_accepted',
        organizationId: input.organizationId,
        payload: {
          conversationId: input.conversationId,
          messageId: message.id,
          aiControlled,
        },
        occurredAt: now,
      });

      return { message, duplicate: false, aiControlled };
    });

    if (result.duplicate) {
      return { message: result.message, duplicate: true, aiProcessingEnqueued: false };
    }

    // Enqueue after commit; the outbox drainer re-enqueues if this fails.
    let enqueued = false;
    if (result.aiControlled) {
      await this.queue.enqueueAiGeneration({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        messageId: result.message.id,
        dedupeKey: `ai-gen:${result.message.id}`,
      });
      enqueued = true;
    }

    this.events.publish(input.organizationId, input.conversationId, {
      type: 'message.created',
      message: serializeMessage(result.message),
    });

    return { message: result.message, duplicate: false, aiProcessingEnqueued: enqueued };
  }
}

export function serializeMessage(m: PersistedMessage): Record<string, unknown> {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    processingState: m.processingState,
    citations: m.citations,
    aiGenerated: m.aiGenerated,
    createdAt: m.createdAt.toISOString(),
  };
}
