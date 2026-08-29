/** Base class for all domain errors. Carries a stable machine-readable code. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot transition conversation from '${from}' to '${to}'`);
  }
}

export class TenantMismatchError extends DomainError {
  readonly code = 'TENANT_MISMATCH';
  constructor() {
    super('Resource does not belong to the acting tenant');
  }
}

export class PermissionDeniedError extends DomainError {
  readonly code = 'FORBIDDEN';
  constructor(permission: string) {
    super(`Missing required permission '${permission}'`);
  }
}

export class InvariantViolationError extends DomainError {
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
  }
}
