export type IngestionStatus = 'pending' | 'processing' | 'indexed' | 'failed' | 'cancelled';

/**
 * A document version becomes searchable only when 'indexed'. A failed
 * ingestion never touches the currently active version.
 */
export function isSearchable(status: IngestionStatus): boolean {
  return status === 'indexed';
}

export interface ChunkingStrategy {
  maxTokens: number;
  overlapTokens: number;
}

export const DEFAULT_CHUNKING: ChunkingStrategy = {
  maxTokens: 400,
  overlapTokens: 60,
};
