export class PersistenceConflictError extends Error {
  constructor(message: string, public readonly constraint?: string) {
    super(message);
    this.name = 'PersistenceConflictError';
  }
}

export function isUniqueViolation(error: unknown): error is { code: '23505'; constraint?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function rethrowUniqueViolation(error: unknown, message: string): never {
  if (isUniqueViolation(error)) {
    throw new PersistenceConflictError(message, error.constraint);
  }
  throw error;
}
