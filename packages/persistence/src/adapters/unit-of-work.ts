import { type TransactionalPorts, type UnitOfWork } from '@acs/application';
import { type Database } from '../db';
import {
  DrizzleAiRunRepository,
  DrizzleConversationRepository,
  DrizzleMessageRepository,
  DrizzleOutbox,
  DrizzleToolExecutionRepository,
} from './repositories';

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  async run<T>(fn: (tx: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.db.transaction(async (transaction) => {
      const ports: TransactionalPorts = {
        conversations: new DrizzleConversationRepository(transaction),
        messages: new DrizzleMessageRepository(transaction),
        outbox: new DrizzleOutbox(transaction),
        aiRuns: new DrizzleAiRunRepository(transaction),
        toolExecutions: new DrizzleToolExecutionRepository(transaction),
      };
      return fn(ports);
    });
  }
}
