import { type EmbeddingProviderPort, type LlmProviderPort } from '@acs/application';
import { FakeEmbeddingProvider, FakeLlmProvider } from '@acs/testing';
import { type AppConfig } from '@acs/config';
import { OpenRouterAdapter } from './openrouter.adapter';
import { GeminiAdapter } from './gemini.adapter';

export interface AiProviders {
  llm: LlmProviderPort;
  embeddings: EmbeddingProviderPort;
}

/**
 * Single composition point selecting the AI provider adapter from config.
 * `fake` keeps the platform fully offline and deterministic.
 */
export function createAiProviders(config: AppConfig): AiProviders {
  if (config.AI_PROVIDER === 'openrouter') {
    const adapter = new OpenRouterAdapter({ apiKey: config.OPENROUTER_API_KEY, baseUrl: config.OPENROUTER_BASE_URL, timeoutMs: config.AI_TIMEOUT_MS, maxRetries: config.AI_MAX_RETRIES, maxConcurrency: config.AI_MAX_CONCURRENCY });
    return { llm: adapter, embeddings: adapter };
  }
  if (config.AI_PROVIDER === 'gemini') {
    const adapter = new GeminiAdapter({ apiKey: config.GEMINI_API_KEY, baseUrl: config.GEMINI_BASE_URL, timeoutMs: config.AI_TIMEOUT_MS, maxRetries: config.AI_MAX_RETRIES, maxConcurrency: config.AI_MAX_CONCURRENCY, embeddingDimensions: config.AI_EMBEDDING_DIMENSIONS });
    return { llm: adapter, embeddings: adapter };
  }
  return { llm: new FakeLlmProvider(), embeddings: new FakeEmbeddingProvider(config.AI_EMBEDDING_DIMENSIONS) };
}
