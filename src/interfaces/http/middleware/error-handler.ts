import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../../shared/errors/errors.js';
import { logger } from '../../../infrastructure/logger/logger.js';
import { REQUEST_ID_HEADER } from './request-id.js';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

// Express requires 4 parameters to recognize error-handling middleware
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId || (req.headers?.[REQUEST_ID_HEADER] as string);

  if (err instanceof SyntaxError && 'body' in err) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed request body',
        requestId,
      },
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        requestId,
      },
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: err.stack,
  });

  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  };
  res.status(500).json(response);
}
