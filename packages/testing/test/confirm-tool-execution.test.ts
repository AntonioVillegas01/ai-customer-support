import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { asId, type ConversationId, type OrganizationId } from '@acs/domain';
import { ConfirmToolExecutionUseCase, type ToolHandler } from '@acs/application';
import {
  FixedClock,
  InMemoryToolRegistry,
  InMemoryUnitOfWork,
  RecordingAudit,
  RecordingEventPublisher,
} from '../src';

const ORG = asId<'OrganizationId'>('11111111-1111-1111-1111-111111111111') as OrganizationId;
const OTHER_ORG = asId<'OrganizationId'>('99999999-9999-9999-9999-999999999999') as OrganizationId;
const CONV = asId<'ConversationId'>('22222222-2222-2222-2222-222222222222') as ConversationId;
const EXEC_ID = '55555555-5555-5555-5555-555555555555';

function makeTool(executions: { count: number }): ToolHandler {
  return {
    name: 'create_return',
    description: 'Create a return request',
    inputSchema: z.object({ orderId: z.string() }),
    outputSchema: z.object({ returnId: z.string(), status: z.string() }),
    risk: 'consequential',
    requiresConfirmation: true,
    timeoutMs: 5000,
    summarize: (a) => `Create return for order ${a.orderId}`,
    execute: async () => {
      executions.count += 1;
      return { returnId: 'r-1', status: 'created' };
    },
    sanitizeResult: (r) => ({ returnId: r.returnId, status: r.status }),
  };
}

async function setup() {
  const uow = new InMemoryUnitOfWork();
  const clock = new FixedClock();
  const audit = new RecordingAudit();
  const events = new RecordingEventPublisher();
  const executions = { count: 0 };
  const tools = new InMemoryToolRegistry().register(ORG, makeTool(executions));
  const useCase = new ConfirmToolExecutionUseCase(uow, tools, events, audit, clock);
  await uow.toolExecutions.insert({
    id: EXEC_ID,
    organizationId: ORG,
    conversationId: CONV,
    toolName: 'create_return',
    status: 'awaiting_confirmation',
    argsJson: JSON.stringify({ orderId: 'o-1' }),
    resultSummary: null,
    errorCode: null,
    idempotencyKey: `${CONV}:create_return:abc`,
    confirmationExpiresAt: new Date(clock.now().getTime() + 600_000),
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  return { uow, clock, audit, events, executions, useCase };
}

describe('ConfirmToolExecutionUseCase', () => {
  it('executes on approval, sanitizes the result, and audits', async () => {
    const { uow, audit, executions, useCase } = await setup();
    const result = await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      confirmationId: EXEC_ID,
      decision: 'approve',
      actor: { type: 'customer', id: 'cust-1' },
      customerId: 'cust-1',
    });
    expect(result.status).toBe('succeeded');
    expect(result.resultSummary).toContain('returnId: r-1');
    expect(executions.count).toBe(1);
    expect((await uow.toolExecutions.findById(ORG, EXEC_ID))?.status).toBe('succeeded');
    expect(audit.records.map((r) => r.action)).toEqual(
      expect.arrayContaining(['tool.confirmation_approve', 'tool.succeeded']),
    );
  });

  it('rejects on customer rejection without executing', async () => {
    const { executions, useCase } = await setup();
    const result = await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      confirmationId: EXEC_ID,
      decision: 'reject',
      actor: { type: 'customer', id: 'cust-1' },
      customerId: 'cust-1',
    });
    expect(result.status).toBe('rejected');
    expect(executions.count).toBe(0);
  });

  it('is idempotent: a duplicate approval does not execute twice', async () => {
    const { executions, useCase } = await setup();
    await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      confirmationId: EXEC_ID,
      decision: 'approve',
      actor: { type: 'customer', id: 'cust-1' },
      customerId: 'cust-1',
    });
    const replay = await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      confirmationId: EXEC_ID,
      decision: 'approve',
      actor: { type: 'customer', id: 'cust-1' },
      customerId: 'cust-1',
    });
    expect(replay.status).toBe('succeeded');
    expect(executions.count).toBe(1);
  });

  it('expires stale confirmations instead of executing them', async () => {
    const { clock, executions, useCase } = await setup();
    clock.advance(11 * 60_000);
    await expect(
      useCase.execute({
        organizationId: ORG,
        conversationId: CONV,
        confirmationId: EXEC_ID,
        decision: 'approve',
        actor: { type: 'customer', id: 'cust-1' },
        customerId: 'cust-1',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_CONFIRMATION_EXPIRED' });
    expect(executions.count).toBe(0);
  });

  it('denies cross-tenant confirmation attempts', async () => {
    const { executions, useCase } = await setup();
    await expect(
      useCase.execute({
        organizationId: OTHER_ORG,
        conversationId: CONV,
        confirmationId: EXEC_ID,
        decision: 'approve',
        actor: { type: 'customer', id: 'attacker' },
        customerId: 'attacker',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(executions.count).toBe(0);
  });
});
