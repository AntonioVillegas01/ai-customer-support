import { FakeEmbeddingProvider, FakeLlmProvider } from '@acs/testing';
import { type AppConfig } from '@acs/config';
import { OpenRouterAdapter } from './openrouter.adapter';

export function createAiProviders(config: AppConfig): { llm: FakeLlmProvider | OpenRouterAdapter; embeddings: FakeEmbeddingProvider | OpenRouterAdapter } {
  if (config.AI_PROVIDER === 'openrouter') {
    const adapter = new OpenRouterAdapter({ apiKey: config.OPENROUTER_API_KEY, baseUrl: config.OPENROUTER_BASE_URL, timeoutMs: config.AI_TIMEOUT_MS, maxRetries: config.AI_MAX_RETRIES, maxConcurrency: config.AI_MAX_CONCURRENCY });
    return { llm: adapter, embeddings: adapter };
  }
  return { llm: new FakeLlmProvider(), embeddings: new FakeEmbeddingProvider(config.AI_EMBEDDING_DIMENSIONS) };
}
