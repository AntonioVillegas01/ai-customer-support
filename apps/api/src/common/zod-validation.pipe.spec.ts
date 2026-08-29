import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  it('returns parsed data and rejects invalid input', () => {
    const pipe = new ZodValidationPipe(z.object({ count: z.coerce.number().int() }));
    expect(pipe.transform({ count: '2' })).toEqual({ count: 2 });
    expect(() => pipe.transform({ count: 'x' })).toThrow();
  });
});
