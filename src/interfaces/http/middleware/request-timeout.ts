import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../infrastructure/logger/logger.js';

export interface RequestTimeoutOptions {
  timeoutMs: number;
  message?: string;
}

const DEFAULT_TIMEOUT_MS = 30000;

export function requestTimeoutMiddleware(options?: Partial<RequestTimeoutOptions>) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const message = options?.message ?? 'Request timeout';

  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timed out', {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          timeoutMs,
        });
        res.status(408).json({
          error: {
            code: 'REQUEST_TIMEOUT',
            message,
          },
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timer);
    });

    next();
  };
}
