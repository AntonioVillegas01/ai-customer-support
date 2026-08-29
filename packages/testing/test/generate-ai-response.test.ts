import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  Conversation,
  asId,
  type ConversationId,
  type MessageId,
  type OrganizationId,
} from '@acs/domain';
import {
  GenerateAiResponseUseCase,
  type PersistedMessage,
  type RetrievedChunk,
  type ToolHandler,
} from '@acs/application';
import {
  FakeLlmProvider,
  FixedClock,
  InMemoryToolRegistry,
  InMemoryUnitOfWork,
  RecordingAudit,
  RecordingEventPublisher,
  SequentialIdGenerator,
  StaticPromptRegistry,
  StaticRetrieval,
  UnlimitedBudget,
  ExhaustedBudget,
} from '../src';

const ORG = asId<'OrganizationId'>('11111111-1111-1111-1111-111111111111') as OrganizationId;
const CONV = asId<'ConversationId'>('22222222-2222-2222-2222-222222222222') as ConversationId;
const MSG = '44444444-4444-4444-4444-444444444444';

const EVIDENCE: RetrievedChunk[] = [
  {
    chunkId: 'c1',
    documentId: 'd1',
    documentVersionId: 'v1',
    title: 'Shipping policy',
    section: 'Delivery times',
    url: 'https://example.com/shipping',
    content: 'Standard shipping takes 3-5 business days.',
    score: 0.82,
  },
];

async function setup(options?: {
  evidence?: RetrievedChunk[];
  llm?: FakeLlmProvider;
  budgetExhausted?: boolean;
  tools?: InMemoryToolRegistry;
}) {
  const uow = new InMemoryUnitOfWork();
  const clock = new FixedClock();
  const events = new RecordingEventPublisher();
  const audit = new RecordingAudit();
  const llm = options?.llm ?? new FakeLlmProvider();
  const retrieval = new StaticRetrieval(new Map([[ORG, options?.evidence ?? EVIDENCE]]));
  const tools = options?.tools ?? new InMemoryToolRegistry();
  const useCase = new GenerateAiResponseUseCase(
    uow,
    llm,
    retrieval,
    new StaticPromptRegistry(),
    tools,
    options?.budgetExhausted === true ? new ExhaustedBudget() : new UnlimitedBudget(),
    events,
    audit,
    clock,
    new SequentialIdGenerator(),
    { generation: 'fake/gen', classification: 'fake/cls' },
  );

  const conversation = Conversation.start({
    id: CONV,
    organizationId: ORG,
    customerId: null,
    subject: null,
    now: clock.now(),
  });
  await uow.conversations.save(conversation);
  const trigger: PersistedMessage = {
    id: asId<'MessageId'>(MSG) as MessageId,
    conversationId: CONV,
    organizationId: ORG,
    role: 'customer',
    content: 'How long does shipping take?',
    processingState: 'accepted',
    idempotencyKey: 'k1',
    aiGenerated: false,
    citations: [],
    createdAt: clock.now(),
  };
  await uow.messages.insert(trigger);
  return { uow, clock, events, audit, llm, useCase };
}

describe('GenerateAiResponseUseCase', () => {
  it('answers with citations that map to actually retrieved evidence', async () => {
    const { uow, useCase } = await setup();
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('answered');
    const assistant = uow.messages.store.find((m) => m.role === 'assistant');
    expect(assistant?.citations).toHaveLength(1);
    expect(assistant?.citations[0]?.chunkId).toBe('c1');
    expect(assistant?.aiGenerated).toBe(true);
    // Trigger message marked delivered; AI run recorded with prompt version.
    expect(uow.messages.store.find((m) => m.id === MSG)?.processingState).toBe('delivered');
    expect(uow.aiRuns.runs[0]?.promptVersion).toBe('grounded-answer@test-1');
    expect(uow.aiRuns.runs[0]?.retrievedChunkIds).toEqual(['c1']);
  });

  it('abstains when evidence is insufficient instead of inventing an answer', async () => {
    const { uow, useCase, audit } = await setup({ evidence: [] });
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('abstained');
    const assistant = uow.messages.store.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('don’t have enough verified information');
    expect(assistant?.citations).toHaveLength(0);
    expect(audit.records.some((r) => r.action === 'ai.abstained')).toBe(true);
  });

  it('abstains when the model fabricates citation indexes', async () => {
    const llm = new FakeLlmProvider().script(
      (req) => (req.messages[0]?.content ?? '').includes('untrusted data'),
      () =>
        JSON.stringify({
          answer: 'Fabricated claim.',
          citedEvidence: [7], // out of range → invalid citation
          toolCall: null,
          confidence: 'high',
        }),
    );
    const { useCase } = await setup({ llm });
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('abstained');
  });

  it('escalates when the customer requests a human, with a reason code', async () => {
    const llm = new FakeLlmProvider().script(
      (req) => (req.messages[0]?.content ?? '').includes('classify'),
      () =>
        JSON.stringify({
          language: 'en',
          intent: 'human_request',
          sentiment: 'neutral',
          urgency: 'normal',
          requestsHuman: true,
        }),
    );
    const { uow, useCase } = await setup({ llm });
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('escalated');
    const conversation = await uow.conversations.findById(ORG, CONV);
    expect(conversation?.status).toBe('escalated');
    expect(conversation?.toProps().escalationReasonCode).toBe('customer.requested_human');
    expect(uow.outbox.events.map((e) => e.type)).toContain('conversation.escalated');
  });

  it('escalates deterministically on safety keywords even if the classifier misses them', async () => {
    const { uow, useCase } = await setup();
    uow.messages.store[0] = {
      ...(uow.messages.store[0] as PersistedMessage),
      content: 'I want to dispute the charge on my card, this is a fraudulent charge',
    };
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('escalated');
    const conversation = await uow.conversations.findById(ORG, CONV);
    expect(conversation?.toProps().escalationReasonCode).toBe('safety.payment_dispute');
  });

  it('requests confirmation for consequential tool proposals instead of executing', async () => {
    const updateAddress: ToolHandler = {
      name: 'update_shipping_address',
      description: 'Update the shipping address of an order',
      inputSchema: z.object({ orderId: z.string(), address: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      risk: 'consequential',
      requiresConfirmation: true,
      timeoutMs: 5000,
      summarize: (a) => `Change shipping address of order ${a.orderId}`,
      execute: async () => ({ ok: true }),
      sanitizeResult: (r) => r,
    };
    const tools = new InMemoryToolRegistry().register(ORG, updateAddress);
    const llm = new FakeLlmProvider().script(
      (req) => (req.messages[0]?.content ?? '').includes('untrusted data'),
      () =>
        JSON.stringify({
          answer: 'I can update that address for you. [1]',
          citedEvidence: [0],
          toolCall: {
            name: 'update_shipping_address',
            arguments: { orderId: 'o-1', address: '123 New St' },
          },
          confidence: 'high',
        }),
    );
    const { uow, events, useCase } = await setup({ llm, tools });
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('tool_confirmation_requested');
    const execution = [...uow.toolExecutions.store.values()][0];
    expect(execution?.status).toBe('awaiting_confirmation');
    expect(
      events.published.some(
        (e) => (e.event as { type?: string }).type === 'tool.confirmation_requested',
      ),
    ).toBe(true);
  });

  it('rejects tool proposals for tools not enabled for the tenant', async () => {
    const llm = new FakeLlmProvider().script(
      (req) => (req.messages[0]?.content ?? '').includes('untrusted data'),
      () =>
        JSON.stringify({
          answer: 'Let me look that up. [1]',
          citedEvidence: [0],
          toolCall: { name: 'lookup_order', arguments: { orderId: 'o-1' } },
          confidence: 'high',
        }),
    );
    const { useCase, audit } = await setup({ llm }); // no tools registered
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('abstained');
    expect(audit.records.some((r) => r.action === 'tool.proposal_rejected')).toBe(true);
  });

  it('is idempotent: replayed jobs do not create duplicate assistant messages', async () => {
    const { uow, useCase } = await setup();
    await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    const second = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(second.outcome).toBe('skipped');
    expect(uow.messages.store.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it('fails the message and rethrows on provider outage so the queue retries', async () => {
    const llm = new FakeLlmProvider();
    llm.failuresRemaining = 10;
    const { uow, useCase } = await setup({ llm });
    await expect(
      useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG }),
    ).rejects.toThrow();
    expect(uow.messages.store.find((m) => m.id === MSG)?.processingState).toBe('failed');
    // The accepted customer message is still durably stored.
    expect(uow.messages.store.find((m) => m.id === MSG)).toBeDefined();
  });

  it('stops when the tenant AI budget is exhausted', async () => {
    const { uow, useCase } = await setup({ budgetExhausted: true });
    const result = await useCase.execute({ organizationId: ORG, conversationId: CONV, messageId: MSG });
    expect(result.outcome).toBe('skipped');
    expect(uow.messages.store.find((m) => m.id === MSG)?.processingState).toBe('failed');
  });
});
