import { conversationEventSchema, type ConversationEvent } from '@acs/contracts';
import { API_URL } from '@/lib/env';

export type SseEventHandler = (event: ConversationEvent) => void;

export function parseSseFrames(buffer: string): { events: unknown[]; remainder: string } {
  const normalized = buffer.replaceAll('\r\n', '\n');
  const parts = normalized.split('\n\n');
  const remainder = parts.pop() ?? '';
  const events = parts.flatMap((frame) => {
    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (data.length === 0) return [];
    try {
      return [JSON.parse(data) as unknown];
    } catch {
      return [];
    }
  });
  return { events, remainder };
}

export async function subscribeConversationEvents(input: { orgId: string; conversationId: string; signal: AbortSignal; onEvent: SseEventHandler; onError: (message: string) => void }): Promise<void> {
  const response = await fetch(`${API_URL}/v1/orgs/${input.orgId}/conversations/${input.conversationId}/events`, {
    headers: { accept: 'text/event-stream' },
    credentials: 'include',
    signal: input.signal,
  });
  if (!response.ok || response.body === null) throw new Error('SSE connection failed');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (!input.signal.aborted) {
    const result = await reader.read();
    if (result.done) return;
    buffer += result.value;
    const parsed = parseSseFrames(buffer);
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      const checked = conversationEventSchema.safeParse(event);
      if (checked.success) input.onEvent(checked.data);
      else input.onError(checked.error.message);
    }
  }
}
