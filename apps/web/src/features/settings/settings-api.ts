import { z } from 'zod';
import { createApiKeyRequestSchema, type ApiKey } from '@acs/contracts';
import { apiFetch, jsonBody } from '@/lib/api-client';
import { apiKeyCreatedResponseSchema, apiKeyListSchema, auditListSchema, usageSummarySchema, widgetConfigSchema, type ApiKeyCreatedResponse, type UsageSummary } from '@/lib/schemas';

export type ApiKeyList = ApiKey[];
export type { ApiKeyCreatedResponse };
export type AuditList = z.infer<typeof auditListSchema>;
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export async function fetchApiKeys(orgId: string): Promise<ApiKeyList> { return apiFetch(`/v1/orgs/${orgId}/api-keys`, apiKeyListSchema); }
export async function createApiKey(orgId: string, input: z.infer<typeof createApiKeyRequestSchema>): Promise<ApiKeyCreatedResponse> { return apiFetch(`/v1/orgs/${orgId}/api-keys`, apiKeyCreatedResponseSchema, { method: 'POST', body: jsonBody(input) }); }
export async function revokeApiKey(orgId: string, keyId: string): Promise<{ ok: true }> { return apiFetch(`/v1/orgs/${orgId}/api-keys/${keyId}`, z.object({ ok: z.literal(true) }), { method: 'DELETE' }); }
export async function createWidget(orgId: string, input: { title: string; primaryColor: string; locale: string; origins: string[] }): Promise<WidgetConfig> { return apiFetch(`/v1/orgs/${orgId}/widgets`, widgetConfigSchema, { method: 'POST', body: jsonBody(input) }); }
export async function fetchAudit(orgId: string): Promise<AuditList> { return apiFetch(`/v1/orgs/${orgId}/audit`, auditListSchema); }
export async function fetchUsage(orgId: string): Promise<UsageSummary> { return apiFetch(`/v1/orgs/${orgId}/usage`, usageSummarySchema); }

export const createApiKeyFormSchema = createApiKeyRequestSchema.extend({ scopesText: z.string().min(1) }).omit({ scopes: true });
export const widgetFormSchema = z.object({ title: z.string().min(1).max(100), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), locale: z.string().min(2).max(16), originsText: z.string().min(1) });
