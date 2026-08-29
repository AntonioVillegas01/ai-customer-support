import { z } from 'zod';
import { apiKeySchema, conversationSchema, errorEnvelopeSchema, isoDateTime, knowledgeSourceSchema, messageSchema, organizationRoleSchema, toolDefinitionSchema, uuid } from '@acs/contracts';

export const authMembershipSchema = z.object({ organizationId: uuid, role: organizationRoleSchema });
export const authUserSchema = z.object({ userId: uuid, email: z.string().email(), memberships: z.array(authMembershipSchema) });
export const meResponseSchema = z.object({ user: authUserSchema.nullable() });
export const loginResponseSchema = z.object({ user: authUserSchema, csrfToken: z.string().min(1) });
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthMembership = z.infer<typeof authMembershipSchema>;

export const conversationListSchema = z.object({ items: z.array(conversationSchema), nextCursor: z.string().nullable() });
export const internalNoteSchema = z.object({ id: uuid, organizationId: uuid, conversationId: uuid, authorId: uuid, content: z.string(), createdAt: isoDateTime });
export type InternalNote = z.infer<typeof internalNoteSchema>;
export const conversationDetailSchema = z.object({ conversation: conversationSchema, messages: z.object({ items: z.array(messageSchema), nextCursor: z.string().nullable() }), notes: z.array(internalNoteSchema) });
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const knowledgeSourceListSchema = z.array(knowledgeSourceSchema.extend({ latestIngestionStatus: z.string().nullable().optional() }).passthrough());
export const knowledgeSearchResultSchema = z.object({ documentId: uuid.optional(), documentVersionId: uuid.optional(), chunkId: uuid.optional(), title: z.string(), section: z.string().nullable().optional(), url: z.string().url().nullable().optional(), content: z.string().optional(), snippet: z.string().optional(), score: z.number() }).passthrough();
export const knowledgeSearchSchema = z.array(knowledgeSearchResultSchema).or(z.object({ items: z.array(knowledgeSearchResultSchema) }));
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;

export const toolListSchema = z.array(toolDefinitionSchema);
export const apiKeyListSchema = z.array(apiKeySchema);
export const apiKeyCreatedResponseSchema = apiKeySchema.extend({ key: z.string() });
export type ApiKeyCreatedResponse = z.infer<typeof apiKeyCreatedResponseSchema>;

export const widgetConfigSchema = z.object({ id: uuid, organizationId: uuid, publicKey: z.string(), title: z.string(), primaryColor: z.string(), locale: z.string(), createdAt: isoDateTime.optional(), updatedAt: isoDateTime.optional() }).passthrough();
export const auditEventSchema = z.object({ id: uuid, actorType: z.string(), actorId: uuid.nullable(), action: z.string(), resourceType: z.string(), resourceId: z.string(), metadata: z.record(z.unknown()).optional(), occurredAt: isoDateTime, createdAt: isoDateTime.optional() }).passthrough();
export const auditListSchema = z.array(auditEventSchema);
export const usageSummarySchema = z.object({ periodMonth: z.string().optional(), aiCostUsd: z.union([z.string(), z.number()]).optional(), tokens: z.number().optional(), conversations: z.number().optional(), aiRuns: z.number().optional(), escalationRate: z.number().optional() }).passthrough();
export type UsageSummary = z.infer<typeof usageSummarySchema>;


export function parseErrorEnvelope(value: unknown) {
  return errorEnvelopeSchema.safeParse(value);
}
