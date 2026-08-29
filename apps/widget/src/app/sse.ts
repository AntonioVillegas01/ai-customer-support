/** SSE frame parser for fetch-ReadableStream transport. */

export interface SseEvent {
  id: string | null;
  event: string;
  data: string;
}

/**
 * Incremental parser: feed arbitrary chunks, get complete events. Handles
 * frames split across chunks and multiple events per chunk.
 */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    let separatorIndex = this.buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const raw = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      const parsed = parseFrame(raw);
      if (parsed !== null) events.push(parsed);
      separatorIndex = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}

function parseFrame(raw: string): SseEvent | null {
  let id: string | null = null;
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue; // comment / heartbeat
    if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { id, event, data: dataLines.join('\n') };
}

export interface SseConnectionOptions {
  url: string;
  token: string;
  onEvent: (event: SseEvent) => void;
  onReconnect: () => void;
  signal: AbortSignal;
}

/** Connect with automatic exponential-backoff reconnection. */
export async function connectSse(options: SseConnectionOptions): Promise<void> {
  let attempt = 0;
  while (!options.signal.aborted) {
    try {
      const response = await fetch(options.url, {
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'text/event-stream' },
        signal: options.signal,
      });
      if (!response.ok || response.body === null) throw new Error(`SSE HTTP ${response.status}`);
      if (attempt > 0) options.onReconnect();
      attempt = 0;
      const parser = new SseParser();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) options.onEvent(event);
      }
    } catch {
      if (options.signal.aborted) return;
    }
    attempt += 1;
    const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
