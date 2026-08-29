import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '@acs/contracts';
import { mapApiError } from './api-client';

describe('mapApiError', () => {
  it('maps stable API error envelopes', () => {
    const error = mapApiError(403, { error: { code: ErrorCodes.CSRF_TOKEN_INVALID, message: 'CSRF token invalid', correlationId: 'req-1' } });
    expect(error.code).toBe(ErrorCodes.CSRF_TOKEN_INVALID);
    expect(error.status).toBe(403);
    expect(error.correlationId).toBe('req-1');
  });

  it('falls back for non-envelope responses', () => {
    const error = mapApiError(502, 'bad gateway');
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.message).toBe('bad gateway');
  });
});
