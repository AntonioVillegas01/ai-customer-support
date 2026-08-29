import { z } from 'zod';
import { createFaqRequestSchema, createUrlSourceRequestSchema, ingestionJobSchema, knowledgeSourceSchema, type KnowledgeSource } from '@acs/contracts';
import { apiFetch, jsonBody } from '@/lib/api-client';
import { knowledgeSearchSchema, type KnowledgeSearchResult, knowledgeSourceListSchema } from '@/lib/schemas';

export async function fetchKnowledgeSources(orgId: string): Promise<KnowledgeSource[]> {
  const result = await apiFetch(`/v1/orgs/${orgId}/knowledge/sources`, knowledgeSourceListSchema);
  return result.map((item) => knowledgeSourceSchema.parse(item));
}

export async function createFaq(orgId: string, input: z.infer<typeof createFaqRequestSchema>): Promise<unknown> {
  return apiFetch(`/v1/orgs/${orgId}/knowledge/sources/faq`, z.unknown(), { method: 'POST', body: jsonBody(input) });
}

export async function createUrlSource(orgId: string, input: z.infer<typeof createUrlSourceRequestSchema>): Promise<unknown> {
  return apiFetch(`/v1/orgs/${orgId}/knowledge/sources/url`, z.unknown(), { method: 'POST', body: jsonBody(input) });
}

export async function createFileSource(orgId: string, form: FormData): Promise<unknown> {
  return apiFetch(`/v1/orgs/${orgId}/knowledge/sources/file`, z.unknown(), { method: 'POST', body: form });
}

export async function reprocessSource(orgId: string, sourceId: string) {
  return apiFetch(`/v1/orgs/${orgId}/knowledge/sources/${sourceId}/reprocess`, ingestionJobSchema, { method: 'POST' });
}

export async function deleteSource(orgId: string, sourceId: string): Promise<{ ok: true }> {
  return apiFetch(`/v1/orgs/${orgId}/knowledge/sources/${sourceId}`, z.object({ ok: z.literal(true) }), { method: 'DELETE' });
}

export async function searchKnowledge(orgId: string, query: string): Promise<KnowledgeSearchResult[]> {
  const result = await apiFetch(`/v1/orgs/${orgId}/knowledge/search?q=${encodeURIComponent(query)}`, knowledgeSearchSchema);
  return Array.isArray(result) ? result : result.items;
}

export const faqFormSchema = createFaqRequestSchema.extend({ tagsText: z.string().optional() }).omit({ tags: true });
export const urlFormSchema = createUrlSourceRequestSchema.extend({ tagsText: z.string().optional() }).omit({ tags: true });
