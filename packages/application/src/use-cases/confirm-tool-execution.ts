import { type ConversationId, type CustomerId, type OrganizationId, DomainError, assertToolTransition } from '@acs/domain';
import { type Clock, type UnitOfWork } from '../ports/persistence';
import { type AuditPort, type ConversationEventPublisher } from '../ports/infrastructure';
import { type ToolRegistryPort } from '../ports/tools';

export class ToolConfirmationNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor() {
    super('Tool confirmation not found');
  }
}
export class ToolConfirmationExpiredError extends DomainError {
  readonly code = 'TOOL_CONFIRMATION_EXPIRED';
  constructor() {
    super('Tool confirmation has expired');
  }
}

export interface ConfirmToolExecutionInput {
  organizationId: OrganizationId;
  conversationId: ConversationId;
  confirmationId: string;
  decision: 'approve' | 'reject';
  actor: { type: 'customer' | 'user'; id: string | null };
  customerId: string | null;
}

/**
 * Workflow 4 gate: the customer (or an agent) explicitly approves or rejects
 * a consequential tool proposal. Execution is idempotent — the execution's
 * idempotency key is derived from conversation + tool + args, so a retried
 * confirmation cannot run the side effect twice.
 */
export class ConfirmToolExecutionUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tools: ToolRegistryPort,
    private readonly events: ConversationEventPublisher,
    private readonly audit: AuditPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: ConfirmToolExecutionInput): Promise<{
    status: 'succeeded' | 'failed' | 'rejected';
    resultSummary: string | null;
  }> {
    const now = this.clock.now();

    const prepared = await this.uow.run(async (tx) => {
      const record = await tx.toolExecutions.findById(input.organizationId, input.confirmationId);
      if (record === null || record.conversationId !== input.conversationId) {
        throw new ToolConfirmationNotFoundError();
      }
      if (record.status !== 'awaiting_confirmation') {
        // Idempotent replay: a finished record reports its terminal state.
        return { record, replay: true };
      }
      if (record.confirmationExpiresAt !== null && record.confirmationExpiresAt < now) {
        assertToolTransition(record.status, 'expired');
        record.status = 'expired';
        record.updatedAt = now;
        await tx.toolExecutions.update(record);
        throw new ToolConfirmationExpiredError();
      }
      const next = input.decision === 'approve' ? 'confirmed' : 'rejected';
      assertToolTransition(record.status, next);
      record.status = next;
      record.updatedAt = now;
      await tx.toolExecutions.update(record);
      return { record, replay: false };
    });

    await this.audit.record({
      organizationId: input.organizationId,
      actorType: input.actor.type,
      actorId: input.actor.id,
      action: `tool.confirmation_${input.decision}`,
      resourceType: 'tool_execution',
      resourceId: input.confirmationId,
      metadata: { toolName: prepared.record.toolName },
      occurredAt: now,
    });

    if (prepared.replay) {
      return {
        status:
          prepared.record.status === 'succeeded'
            ? 'succeeded'
            : prepared.record.status === 'rejected'
              ? 'rejected'
              : 'failed',
        resultSummary: prepared.record.resultSummary,
      };
    }

    if (input.decision === 'reject') {
      return { status: 'rejected', resultSummary: null };
    }

    // Approved: execute deterministically.
    const handler = await this.tools.getEnabled(input.organizationId, prepared.record.toolName);
    if (handler === null) {
      await this.markTerminal(input, 'failed', null, 'TOOL_NOT_APPROVED');
      return { status: 'failed', resultSummary: null };
    }

    await this.uow.run(async (tx) => {
      const record = await tx.toolExecutions.findById(input.organizationId, input.confirmationId);
      if (record === null) return;
      assertToolTransition(record.status, 'executing');
      record.status = 'executing';
      record.updatedAt = this.clock.now();
      await tx.toolExecutions.update(record);
    });

    try {
      const args = handler.inputSchema.parse(JSON.parse(prepared.record.argsJson));
      const raw = await handler.execute(
        {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          customerId: input.customerId as CustomerId | null,
          idempotencyKey: prepared.record.idempotencyKey,
        },
        args,
      );
      const sanitized = handler.sanitizeResult(handler.outputSchema.parse(raw));
      const summary = Object.entries(sanitized)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(', ');
      await this.markTerminal(input, 'succeeded', summary, null);
      this.events.publish(input.organizationId, input.conversationId, {
        type: 'conversation.updated',
        toolExecution: { id: input.confirmationId, status: 'succeeded', resultSummary: summary },
      });
      return { status: 'succeeded', resultSummary: summary };
    } catch {
      await this.markTerminal(input, 'failed', null, 'TOOL_EXECUTION_FAILED');
      return { status: 'failed', resultSummary: null };
    }
  }

  private async markTerminal(
    input: ConfirmToolExecutionInput,
    status: 'succeeded' | 'failed',
    resultSummary: string | null,
    errorCode: string | null,
  ): Promise<void> {
    const now = this.clock.now();
    await this.uow.run(async (tx) => {
      const record = await tx.toolExecutions.findById(input.organizationId, input.confirmationId);
      if (record === null) return;
      record.status = status;
      record.resultSummary = resultSummary;
      record.errorCode = errorCode;
      record.updatedAt = now;
      await tx.toolExecutions.update(record);
    });
    await this.audit.record({
      organizationId: input.organizationId,
      actorType: 'system',
      actorId: null,
      action: `tool.${status}`,
      resourceType: 'tool_execution',
      resourceId: input.confirmationId,
      metadata: { errorCode },
      occurredAt: now,
    });
  }
}
