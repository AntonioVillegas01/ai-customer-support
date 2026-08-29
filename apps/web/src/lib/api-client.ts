import type { z } from 'zod';
import { API_URL } from '@/lib/env';
import { parseErrorEnvelope } from '@/lib/schemas';

let csrfToken: string | null = null;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly correlationId: string | null;
  readonly details: readonly { path: string; message: string }[];

  constructor(input: { code: string; message: string; status: number; correlationId?: string; details?: readonly { path: string; message: string }[] }) {
    super(input.message);
    this.name = 'ApiError';
    this.code = input.code;
    this.status = input.status;
    this.correlationId = input.correlationId ?? null;
    this.details = input.details ?? [];
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  if (csrfToken !== null) return csrfToken;
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('acs_csrf='));
  return cookie === undefined ? null : decodeURIComponent(cookie.slice('acs_csrf='.length));
}

export async function apiFetch<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = init.method ?? 'GET';
  const hasBody = init.body !== undefined;
  if (hasBody && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    const token = getCsrfToken();
    if (token !== null) headers.set('x-csrf-token', token);
  }
  const response = await fetch(`${API_URL}${path}`, { ...init, method, headers, credentials: 'include' });
  const contentType = response.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw mapApiError(response.status, body);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError({ code: 'CLIENT_SCHEMA_MISMATCH', message: parsed.error.message, status: response.status });
  return parsed.data;
}

export function mapApiError(status: number, body: unknown): ApiError {
  const parsed = parseErrorEnvelope(body);
  if (parsed.success) {
    return new ApiError({ status, code: parsed.data.error.code, message: parsed.data.error.message, ...(parsed.data.error.details === undefined ? {} : { details: parsed.data.error.details }), ...(parsed.data.error.correlationId === undefined ? {} : { correlationId: parsed.data.error.correlationId }) });
  }
  return new ApiError({ status, code: 'HTTP_ERROR', message: typeof body === 'string' && body.length > 0 ? body : 'Request failed' });
}

export function jsonBody(value: unknown): BodyInit {
  return JSON.stringify(value);
}
