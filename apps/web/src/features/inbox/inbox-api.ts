import { z } from 'zod';
import { conversationSchema, conversationStatusSchema, messageSchema, type Conversation, type ConversationStatus, type Message } from '@acs/contracts';
import { apiFetch, jsonBody } from '@/lib/api-client';
import { conversationDetailSchema, conversationListSchema, internalNoteSchema, type ConversationDetail, type InternalNote } from '@/lib/schemas';

export type InboxFilter = ConversationStatus | 'all' | 'unassigned';

export async function fetchConversations(orgId: string, cursor: string | null, filter: InboxFilter): Promise<{ items: Conversation[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: '25' });
  if (cursor !== null) params.set('cursor', cursor);
  if (filter !== 'all' && filter !== 'unassigned') params.set('status', filter);
  if (filter === 'unassigned') params.set('assigned', 'unassigned');
  return apiFetch(`/v1/orgs/${orgId}/conversations?${params.toString()}`, conversationListSchema);
}

export async function fetchConversationDetail(orgId: string, id: string): Promise<ConversationDetail> {
  return apiFetch(`/v1/orgs/${orgId}/conversations/${id}`, conversationDetailSchema);
}

export async function sendAgentMessage(orgId: string, id: string, content: string): Promise<Message> {
  return apiFetch(`/v1/orgs/${orgId}/conversations/${id}/messages`, messageSchema, { method: 'POST', body: jsonBody({ content }) });
}

export async function addInternalNote(orgId: string, id: string, content: string): Promise<InternalNote> {
  return apiFetch(`/v1/orgs/${orgId}/conversations/${id}/notes`, internalNoteSchema, { method: 'POST', body: jsonBody({ content }) });
}

export async function updateConversationStatus(orgId: string, id: string, status: ConversationStatus): Promise<Conversation> {
  return apiFetch(`/v1/orgs/${orgId}/conversations/${id}/status`, conversationSchema, { method: 'POST', body: jsonBody({ status }) });
}

export const replySchema = z.object({ content: z.string().min(1).max(8000) });
export const noteSchema = z.object({ content: z.string().min(1).max(2000) });
export const filterStatuses = ['all', 'open_ai', 'escalated', 'assigned_human', 'resolved', 'unassigned'] as const;
export const statusOptions = conversationStatusSchema.options;
