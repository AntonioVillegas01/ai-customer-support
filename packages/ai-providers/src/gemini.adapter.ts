import { type EmbeddingProviderPort, type LlmCompletionRequest, type LlmCompletionResult, type LlmProviderPort, type LlmStreamChunk, type LlmUsage } from '@acs/application';
import { CircuitOpenError } from './openrouter.adapter';

/**
 * Google Gemini adapter (REST, no vendor SDK) implementing the LLM and
 * embedding ports. Enforces structured JSON output via responseMimeType +
 * responseJsonSchema, applies retry with jittered backoff, a concurrency
 * gate, and a failure-threshold circuit breaker — mirroring the OpenRouter
 * adapter's reliability semantics.
 */
export class GeminiAdapter implements LlmProviderPort, EmbeddingProviderPort {
  private failures = 0;
  private openedAt: number | null = null;
  private active = 0;
  constructor(private readonly options: { apiKey: string; baseUrl: string; timeoutMs: number; maxRetries: number; maxConcurrency: number; embeddingDimensions: number }) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    return this.withCircuit(async () => {
      const started = Date.now();
      const systemText = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const contents = request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const generationConfig: Record<string, unknown> = {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      };
      if (request.responseSchema !== undefined) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseJsonSchema = request.responseSchema;
      }
      const response = await this.requestJson(
        `${this.options.baseUrl}/models/${request.model}:generateContent`,
        {
          contents,
          ...(systemText.length > 0 ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
          generationConfig,
        },
        request.timeoutMs ?? this.options.timeoutMs,
      );
      const content = extractText(response) ?? '{}';
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
      const response = await this.requestJson(
        `${this.options.baseUrl}/models/${model}:batchEmbedContents`,
        {
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: this.options.embeddingDimensions,
          })),
        },
        this.options.timeoutMs,
      );
      const embeddings = getArray(response, 'embeddings');
      const vectors = embeddings.map((item) => {
        const values = typeof item === 'object' && item !== null ? (item as Record<string, unknown>).values : undefined;
        const vector = Array.isArray(values) ? values.filter((v): v is number => typeof v === 'number') : [];
        // Truncated Gemini embeddings are not unit-normalized; normalize for cosine search.
        return normalize(vector);
      });
      const inputTokens = texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
      return { vectors, usage: { inputTokens, outputTokens: 0, estimatedCostUsd: inputTokens * 0.00000015 } };
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
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'x-goog-api-key': this.options.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.ok) return response.json() as Promise<unknown>;
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === this.options.maxRetries) {
          throw new Error(`Gemini error ${response.status}`);
        }
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.floor(Math.random() * 100)));
    }
    throw new Error('Gemini retries exhausted');
  }
}

function extractText(value: unknown): string | null {
  const candidates = getArray(value, 'candidates');
  const first = candidates[0];
  if (typeof first !== 'object' || first === null) return null;
  const content = (first as Record<string, unknown>).content;
  if (typeof content !== 'object' || content === null) return null;
  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => (typeof part === 'object' && part !== null && typeof (part as Record<string, unknown>).text === 'string' ? (part as Record<string, unknown>).text as string : ''))
    .join('');
  return text.length > 0 ? text : null;
}

function getArray(value: unknown, key: string): unknown[] {
  if (typeof value !== 'object' || value === null) return [];
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field : [];
}

function parseUsage(value: unknown): LlmUsage {
  const metadata = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).usageMetadata : undefined;
  const record = typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : {};
  const inputTokens = numberField(record.promptTokenCount);
  const outputTokens = numberField(record.candidatesTokenCount) + numberField(record.thoughtsTokenCount);
  return { inputTokens, outputTokens, estimatedCostUsd: inputTokens * 0.0000005 + outputTokens * 0.0000015 };
}

function numberField(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}
