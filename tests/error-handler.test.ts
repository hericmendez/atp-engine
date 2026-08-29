import { describe, it, expect } from 'vitest';
import { AppError, ValidationError } from '../src/shared/errors/errors.js';
import { ZodError } from 'zod';
import { errorHandler } from '../src/interfaces/http/middleware/error-handler.js';
import type { Request, Response, NextFunction } from 'express';

function createMockResponse() {
  const mock = {
    statusCode: 200 as number,
    body: null as unknown,
    status(code: number) {
      mock.statusCode = code;
      return mock;
    },
    json(data: unknown) {
      mock.body = data;
      return mock;
    },
  };
  return mock;
}

describe('errorHandler', () => {
  it('handles AppError with custom status', () => {
    const res = createMockResponse();
    const err = new AppError('TEST_CODE', 'test message', 422);

    errorHandler(err, {} as Request, res as unknown as Response, {} as NextFunction);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: { code: 'TEST_CODE', message: 'test message' } });
  });

  it('handles ValidationError with 400', () => {
    const res = createMockResponse();
    const err = new ValidationError('invalid input');

    errorHandler(err, {} as Request, res as unknown as Response, {} as NextFunction);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'invalid input' },
    });
  });

  it('handles ZodError with 400', () => {
    const res = createMockResponse();
    const err = new ZodError([]);

    errorHandler(err, {} as Request, res as unknown as Response, {} as NextFunction);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data' },
    });
  });

  it('handles unexpected errors with 500', () => {
    const res = createMockResponse();
    const err = new Error('unexpected');

    errorHandler(err, {} as Request, res as unknown as Response, {} as NextFunction);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });
});
