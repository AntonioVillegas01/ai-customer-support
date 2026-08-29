import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Response } from 'express';
import { type RequestWithContext } from './types';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId = incoming !== undefined && incoming.length <= 128 ? incoming : randomUUID();
    req.context = { ...(req.context ?? {}), requestId };
    res.setHeader('x-request-id', requestId);
    next();
  }
}
