/** Branded identifier types preventing accidental cross-entity ID mixing. */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type UserId = Brand<string, 'UserId'>;
export type CustomerId = Brand<string, 'CustomerId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type KnowledgeSourceId = Brand<string, 'KnowledgeSourceId'>;
export type DocumentId = Brand<string, 'DocumentId'>;
export type DocumentVersionId = Brand<string, 'DocumentVersionId'>;
export type ChunkId = Brand<string, 'ChunkId'>;
export type ToolExecutionId = Brand<string, 'ToolExecutionId'>;
export type AiRunId = Brand<string, 'AiRunId'>;

export const asId = <T extends string>(value: string): Brand<string, T> =>
  value as Brand<string, T>;
