import { type OrganizationId } from '@acs/domain';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  model: string;
  messages: ChatMessage[];
  /** JSON Schema the model must satisfy; provider adapter enforces mode. */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface LlmCompletionResult {
  content: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmStreamChunk {
  delta: string;
}

/**
 * Replaceable LLM provider port. Adapters own timeouts, retries with jittered
 * backoff, and circuit breaking. Application code never imports vendor SDKs.
 */
export interface LlmProviderPort {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
  stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void,
  ): Promise<LlmCompletionResult>;
}

export interface EmbeddingProviderPort {
  embed(texts: string[], model: string): Promise<{ vectors: number[][]; usage: LlmUsage }>;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  title: string;
  section: string | null;
  url: string | null;
  content: string;
  /** Fused hybrid score in [0, 1]. */
  score: number;
}

/** Tenant-isolated hybrid retrieval. Implementations MUST filter by tenant. */
export interface RetrievalPort {
  search(input: {
    organizationId: OrganizationId;
    query: string;
    limit: number;
    minScore: number;
    tags?: string[];
  }): Promise<RetrievedChunk[]>;
}

export interface PromptDefinition {
  name: string;
  version: string;
  system: string;
}

/** Versioned prompt registry; every AI run records the version it used. */
export interface PromptRegistryPort {
  get(name: string): Promise<PromptDefinition>;
}

export interface AiBudgetPort {
  /** Returns false when the tenant exhausted its AI budget. */
  tryConsume(organizationId: OrganizationId, estimatedCostUsd: number): Promise<boolean>;
}
