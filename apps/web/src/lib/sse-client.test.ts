import { describe, expect, it } from 'vitest';
import { parseSseFrames } from './sse-client';

describe('parseSseFrames', () => {
  it('parses complete data frames and preserves partial data', () => {
    const parsed = parseSseFrames('id: 1\nevent: message\ndata: {"type":"message.delta","messageId":"550e8400-e29b-41d4-a716-446655440000","delta":"Hi"}\n\ndata: {');
    expect(parsed.events).toEqual([{ type: 'message.delta', messageId: '550e8400-e29b-41d4-a716-446655440000', delta: 'Hi' }]);
    expect(parsed.remainder).toBe('data: {');
  });
});
