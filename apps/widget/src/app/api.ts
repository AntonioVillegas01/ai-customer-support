declare const __API_URL__: string;

/** Typed API client for the widget-scoped endpoints. */

export const API_URL: string = __API_URL__;

export interface Branding {
  title: string;
  primaryColor: string;
  locale: string;
}

export interface WidgetMessage {
  id: string;
  conversationId: string;
  role: 'customer' | 'assistant' | 'agent' | 'system';
  content: string;
  processingState: 'accepted' | 'processing' | 'delivered' | 'failed';
  citations: Array<{ title: string; url: string | null; snippet: string }>;
  aiGenerated: boolean;
  createdAt: string;
}

export interface WidgetConversation {
  id: string;
  status: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API ${status} ${code}`);
  }
}

async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!response.ok) {
    let code = 'UNKNOWN';
    try {
      const body = (await response.json()) as { code?: string; error?: { code?: string } };
      code = body.code ?? body.error?.code ?? 'UNKNOWN';
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, code);
  }
  return (await response.json()) as T;
}

export async function mintToken(widgetKey: string): Promise<{ token: string; expiresAt: string; branding: Branding }> {
  return request('/v1/widget/token', null, { method: 'POST', body: JSON.stringify({ widgetKey }) });
}

export async function createConversation(token: string): Promise<WidgetConversation> {
  return request('/v1/widget/conversations', token, { method: 'POST', body: JSON.stringify({}) });
}

export async function listMessages(
  token: string,
  conversationId: string,
  cursor?: string,
): Promise<{ items: WidgetMessage[]; nextCursor: string | null }> {
  const query = cursor === undefined ? '?limit=50' : `?limit=50&cursor=${encodeURIComponent(cursor)}`;
  return request(`/v1/widget/conversations/${conversationId}/messages${query}`, token);
}

export async function postMessage(
  token: string,
  conversationId: string,
  content: string,
  idempotencyKey: string,
): Promise<{ accepted: boolean; duplicate: boolean; message: WidgetMessage }> {
  return request(`/v1/widget/conversations/${conversationId}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({ content, idempotencyKey }),
  });
}

export async function confirmTool(
  token: string,
  conversationId: string,
  confirmationId: string,
  decision: 'approve' | 'reject',
): Promise<void> {
  await request(`/v1/conversations/${conversationId}/tool-executions/${confirmationId}/widget-confirm`, token, {
    method: 'POST',
    body: JSON.stringify({ confirmationId, decision }),
  });
}

export function eventsUrl(conversationId: string): string {
  return `${API_URL}/v1/widget/conversations/${conversationId}/events`;
}
