import { describe, expect, it } from 'vitest';
import { Conversation, asId, type ConversationId, type OrganizationId } from '@acs/domain';
import {
  ConversationClosedError,
  PostCustomerMessageUseCase,
  RateLimitedError,
} from '@acs/application';
import {
  AllowAllRateLimiter,
  DenyAllRateLimiter,
  FixedClock,
  InMemoryUnitOfWork,
  RecordingEventPublisher,
  RecordingQueue,
  SequentialIdGenerator,
} from '../src';

const ORG = asId<'OrganizationId'>('11111111-1111-1111-1111-111111111111') as OrganizationId;
const OTHER_ORG = asId<'OrganizationId'>('99999999-9999-9999-9999-999999999999') as OrganizationId;
const CONV = asId<'ConversationId'>('22222222-2222-2222-2222-222222222222') as ConversationId;
const IDEMPOTENCY = '33333333-3333-3333-3333-333333333333';

async function setup(rateLimiter = new AllowAllRateLimiter()) {
  const uow = new InMemoryUnitOfWork();
  const queue = new RecordingQueue();
  const events = new RecordingEventPublisher();
  const clock = new FixedClock();
  const useCase = new PostCustomerMessageUseCase(
    uow,
    queue,
    events,
    rateLimiter,
    clock,
    new SequentialIdGenerator(),
  );
  const conversation = Conversation.start({
    id: CONV,
    organizationId: ORG,
    customerId: null,
    subject: null,
    now: clock.now(),
  });
  await uow.conversations.save(conversation);
  return { uow, queue, events, useCase, clock };
}

describe('PostCustomerMessageUseCase', () => {
  it('persists the message durably and enqueues AI generation', async () => {
    const { uow, queue, useCase } = await setup();
    const result = await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      customerId: null,
      content: 'Where is my order?',
      idempotencyKey: IDEMPOTENCY,
    });
    expect(result.duplicate).toBe(false);
    expect(result.aiProcessingEnqueued).toBe(true);
    expect(uow.messages.store).toHaveLength(1);
    expect(uow.messages.store[0]?.processingState).toBe('accepted');
    expect(uow.outbox.events.map((e) => e.type)).toContain('conversation.message_accepted');
    expect(queue.aiJobs[0]?.dedupeKey).toBe(`ai-gen:${result.message.id}`);
  });

  it('is idempotent: a retried submission returns the original message', async () => {
    const { uow, queue, useCase } = await setup();
    const first = await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      customerId: null,
      content: 'Where is my order?',
      idempotencyKey: IDEMPOTENCY,
    });
    const second = await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      customerId: null,
      content: 'Where is my order?',
      idempotencyKey: IDEMPOTENCY,
    });
    expect(second.duplicate).toBe(true);
    expect(second.message.id).toBe(first.message.id);
    expect(uow.messages.store).toHaveLength(1);
    expect(queue.aiJobs).toHaveLength(1); // no duplicate AI job
  });

  it('rejects messages for another tenant (tenant scoping)', async () => {
    const { useCase } = await setup();
    await expect(
      useCase.execute({
        organizationId: OTHER_ORG,
        conversationId: CONV,
        customerId: null,
        content: 'hi',
        idempotencyKey: IDEMPOTENCY,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects messages on closed conversations', async () => {
    const { uow, useCase, clock } = await setup();
    const conversation = await uow.conversations.findById(ORG, CONV);
    if (conversation === null) throw new Error('setup failed');
    conversation.transitionTo('resolved', clock.now());
    conversation.transitionTo('closed', clock.now());
    await uow.conversations.save(conversation);
    await expect(
      useCase.execute({
        organizationId: ORG,
        conversationId: CONV,
        customerId: null,
        content: 'hello?',
        idempotencyKey: IDEMPOTENCY,
      }),
    ).rejects.toBeInstanceOf(ConversationClosedError);
  });

  it('does not enqueue AI work for human-controlled conversations', async () => {
    const { uow, queue, useCase, clock } = await setup();
    const conversation = await uow.conversations.findById(ORG, CONV);
    if (conversation === null) throw new Error('setup failed');
    conversation.escalate('customer.requested_human', clock.now());
    await uow.conversations.save(conversation);
    const result = await useCase.execute({
      organizationId: ORG,
      conversationId: CONV,
      customerId: null,
      content: 'talking to the human now',
      idempotencyKey: IDEMPOTENCY,
    });
    expect(result.aiProcessingEnqueued).toBe(false);
    expect(queue.aiJobs).toHaveLength(0);
  });

  it('applies rate limiting', async () => {
    const { useCase } = await setup(new DenyAllRateLimiter());
    await expect(
      useCase.execute({
        organizationId: ORG,
        conversationId: CONV,
        customerId: null,
        content: 'spam',
        idempotencyKey: IDEMPOTENCY,
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});
