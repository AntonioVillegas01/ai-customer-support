import { DomainError } from '@acs/domain';

export class StableHttpError extends DomainError {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
