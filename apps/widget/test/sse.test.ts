import { describe, expect, it } from 'vitest';
import { SseParser } from '../src/app/sse';

describe('SseParser', () => {
  it('parses a complete frame', () => {
    const parser = new SseParser();
    const events = parser.push('id: 42\nevent: message\ndata: {"type":"message.created"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ id: '42', event: 'message', data: '{"type":"message.created"}' });
  });

  it('handles frames split across chunks', () => {
    const parser = new SseParser();
    expect(parser.push('id: 1\nevent: mess')).toHaveLength(0);
    expect(parser.push('age\ndata: {"a"')).toHaveLength(0);
    const events = parser.push(':1}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('{"a":1}');
  });

  it('parses multiple events in one chunk', () => {
    const parser = new SseParser();
    const events = parser.push('data: one\n\ndata: two\n\n');
    expect(events.map((event) => event.data)).toEqual(['one', 'two']);
  });

  it('ignores heartbeat comments', () => {
    const parser = new SseParser();
    expect(parser.push(': heartbeat\n\n')).toHaveLength(0);
    expect(parser.push(': ping\n\ndata: real\n\n')).toHaveLength(1);
  });

  it('joins multi-line data fields', () => {
    const parser = new SseParser();
    const events = parser.push('data: line1\ndata: line2\n\n');
    expect(events[0]?.data).toBe('line1\nline2');
  });

  it('defaults event name to message when omitted', () => {
    const parser = new SseParser();
    const events = parser.push('data: x\n\n');
    expect(events[0]?.event).toBe('message');
    expect(events[0]?.id).toBeNull();
  });
});
