import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  SourceError,
  PersistenceError,
  AIError,
} from '../src/shared/errors/errors.js';

describe('errors', () => {
  it('AppError has correct defaults', () => {
    const err = new AppError('TEST_CODE', 'test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('AppError');
  });

  it('ValidationError has 400 status', () => {
    const err = new ValidationError('invalid input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ValidationError');
  });

  it('NotFoundError has 404 status', () => {
    const err = new NotFoundError();
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Resource not found');
  });

  it('SourceError includes source name', () => {
    const err = new SourceError('wikipedia', 'timeout');
    expect(err.code).toBe('SOURCE_ERROR');
    expect(err.message).toContain('wikipedia');
    expect(err.message).toContain('timeout');
    expect(err.statusCode).toBe(502);
  });

  it('PersistenceError has 500 status', () => {
    const err = new PersistenceError('write failed');
    expect(err.code).toBe('PERSISTENCE_ERROR');
    expect(err.statusCode).toBe(500);
  });

  it('AIError has 502 status', () => {
    const err = new AIError('provider unavailable');
    expect(err.code).toBe('AI_ERROR');
    expect(err.statusCode).toBe(502);
  });
});
