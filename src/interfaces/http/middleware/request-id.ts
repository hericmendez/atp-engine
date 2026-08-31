import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { runWithContext } from '../../../infrastructure/request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';
const MAX_HEADER_LENGTH = 128;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers[REQUEST_ID_HEADER] as string | undefined;
  const requestId = raw && raw.length <= MAX_HEADER_LENGTH ? raw : randomUUID();

  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithContext({ requestId }, () => {
    next();
  });
}
