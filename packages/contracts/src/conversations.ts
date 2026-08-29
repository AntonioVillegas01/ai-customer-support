import { z } from 'zod';
import { isoDateTime, uuid } from './common';

export const conversationStatusSchema = z.enum([
  'open_ai',
  'pending_customer',
  'escalated',
  'assigned_human',
  'resolved',
  'closed',
]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const conversationPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type ConversationPriority = z.infer<typeof conversationPrioritySchema>;

export const messageRoleSchema = z.enum(['customer', 'assistant', 'agent', 'system']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageProcessingStateSchema = z.enum([
  'accepted',
  'processing',
  'delivered',
  'failed',
]);
export type MessageProcessingState = z.infer<typeof messageProcessingStateSchema>;

export const citationSchema = z.object({
  documentId: uuid,
  documentVersionId: uuid,
  chunkId: uuid,
  title: z.string(),
  section: z.string().nullable(),
  url: z.string().url().nullable(),
  snippet: z.string(),
  score: z.number(),
});
export type Citation = z.infer<typeof citationSchema>;

export const messageSchema = z.object({
  id: uuid,
  conversationId: uuid,
  role: messageRoleSchema,
  content: z.string(),
  processingState: messageProcessingStateSchema,
  citations: z.array(citationSchema).default([]),
  aiGenerated: z.boolean().default(false),
  createdAt: isoDateTime,
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: uuid,
  organizationId: uuid,
  customerId: uuid.nullable(),
  status: conversationStatusSchema,
  priority: conversationPrioritySchema,
  subject: z.string().nullable(),
  assignedAgentId: uuid.nullable(),
  escalationReasonCode: z.string().nullable(),
  language: z.string().nullable(),
  intent: z.string().nullable(),
  sentiment: z.string().nullable(),
  urgency: z.string().nullable(),
  tags: z.array(z.string()).default([]),
  lastMessageAt: isoDateTime.nullable(),
  firstResponseAt: isoDateTime.nullable(),
  resolvedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Conversation = z.infer<typeof conversationSchema>;

export const postMessageRequestSchema = z.object({
  content: z.string().min(1).max(8000),
  /** Client-generated UUID preventing duplicate submission on retry. */
  idempotencyKey: uuid,
});

export const escalateRequestSchema = z.object({
  reasonCode: z.string().min(1).max(64),
  note: z.string().max(2000).optional(),
});

// SSE event payloads for conversation streams
export const conversationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message.created'), message: messageSchema }),
  z.object({
    type: z.literal('message.delta'),
    messageId: uuid,
    delta: z.string(),
  }),
  z.object({
    type: z.literal('message.completed'),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('message.failed'),
    messageId: uuid,
    errorCode: z.string(),
  }),
  z.object({
    type: z.literal('conversation.updated'),
    conversation: conversationSchema,
  }),
  z.object({
    type: z.literal('tool.confirmation_requested'),
    confirmationId: uuid,
    toolName: z.string(),
    summary: z.string(),
    expiresAt: isoDateTime,
  }),
]);
export type ConversationEvent = z.infer<typeof conversationEventSchema>;
