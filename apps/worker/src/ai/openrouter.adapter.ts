import { type EmbeddingProviderPort, type LlmCompletionRequest, type LlmCompletionResult, type LlmProviderPort, type LlmStreamChunk, type LlmUsage } from '@acs/application';

export class CircuitOpenError extends Error {}

export class OpenRouterAdapter implements LlmProviderPort, EmbeddingProviderPort {
  private failures = 0;
  private openedAt: number | null = null;
  private active = 0;
  constructor(private readonly options: { apiKey: string; baseUrl: string; timeoutMs: number; maxRetries: number; maxConcurrency: number }) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    return this.withCircuit(async () => {
      const started = Date.now();
      const response = await this.requestJson(`${this.options.baseUrl}/chat/completions`, {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        response_format: request.responseSchema === undefined ? undefined : { type: 'json_schema', json_schema: { name: 'acs_response', schema: request.responseSchema, strict: true } },
      }, request.timeoutMs ?? this.options.timeoutMs);
      const content = getString(response, ['choices', '0', 'message', 'content']) ?? '{}';
      return { content, usage: parseUsage(response), latencyMs: Date.now() - started };
    });
  }

  async stream(request: LlmCompletionRequest, onChunk: (chunk: LlmStreamChunk) => void): Promise<LlmCompletionResult> {
    const result = await this.complete(request);
    onChunk({ delta: result.content });
    return result;
  }

  async embed(texts: string[], model: string): Promise<{ vectors: number[][]; usage: LlmUsage }> {
    return this.withCircuit(async () => {
      const response = await this.requestJson(`${this.options.baseUrl}/embeddings`, { model, input: texts }, this.options.timeoutMs);
      const data = Array.isArray((response as Record<string, unknown>).data) ? (response as Record<string, unknown>).data as unknown[] : [];
      const vectors = data.map((item) => {
        if (typeof item !== 'object' || item === null) return [];
        const embedding = (item as Record<string, unknown>).embedding;
        return Array.isArray(embedding) ? embedding.filter((v): v is number => typeof v === 'number') : [];
      });
      return { vectors, usage: parseUsage(response) };
    });
  }

  private async withCircuit<T>(fn: () => Promise<T>): Promise<T> {
    if (this.openedAt !== null && Date.now() - this.openedAt < 30_000) throw new CircuitOpenError('AI circuit is open');
    while (this.active >= this.options.maxConcurrency) await new Promise((resolve) => setTimeout(resolve, 25));
    this.active += 1;
    try {
      const result = await fn();
      this.failures = 0;
      this.openedAt = null;
      return result;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= 5) this.openedAt = Date.now();
      throw error;
    } finally {
      this.active -= 1;
    }
  }

  private async requestJson(url: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${this.options.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (response.ok) return response.json() as Promise<unknown>;
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === this.options.maxRetries) throw new Error(`OpenRouter error ${response.status}`);
      } finally { clearTimeout(timer); }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.floor(Math.random() * 100)));
    }
    throw new Error('OpenRouter retries exhausted');
  }
}

function parseUsage(value: unknown): LlmUsage {
  const usage = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).usage : undefined;
  const record = typeof usage === 'object' && usage !== null ? usage as Record<string, unknown> : {};
  const inputTokens = numberField(record.prompt_tokens);
  const outputTokens = numberField(record.completion_tokens);
  return { inputTokens, outputTokens, estimatedCostUsd: (inputTokens + outputTokens) * 0.000001 };
}
function numberField(value: unknown): number { return typeof value === 'number' ? value : 0; }
function getString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const part of path) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (typeof current === 'object' && current !== null) current = (current as Record<string, unknown>)[part];
    else return null;
  }
  return typeof current === 'string' ? current : null;
}
