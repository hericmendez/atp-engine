import { describe, it, expect } from 'vitest';
import {
  SourceError,
  createSourceTimeout,
  createSourceNotFound,
  createSourceUnavailable,
  createParseFailure,
} from '../../src/sources/source-errors.js';

describe('SourceError', () => {
  it('stores source, errorType, message, and retryable flag', () => {
    const error = new SourceError('wikipedia', 'timeout', 'Request timed out');
    expect(error.source).toBe('wikipedia');
    expect(error.errorType).toBe('timeout');
    expect(error.message).toBe('Request timed out');
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('SourceError');
  });

  it('accepts optional details', () => {
    const error = new SourceError('steam', 'rate_limited', 'Too many requests', { retryAfter: 60 });
    expect(error.details).toEqual({ retryAfter: 60 });
  });

  it('is an instance of Error', () => {
    const error = new SourceError('wikipedia', 'not_found', 'Not found');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('SourceError retryable classification', () => {
  it('marks timeout as retryable', () => {
    const error = new SourceError('src', 'timeout', 'msg');
    expect(error.retryable).toBe(true);
  });

  it('marks rate_limited as retryable', () => {
    const error = new SourceError('src', 'rate_limited', 'msg');
    expect(error.retryable).toBe(true);
  });

  it('marks network_failure as retryable', () => {
    const error = new SourceError('src', 'network_failure', 'msg');
    expect(error.retryable).toBe(true);
  });

  it('marks source_unavailable as retryable', () => {
    const error = new SourceError('src', 'source_unavailable', 'msg');
    expect(error.retryable).toBe(true);
  });

  it('marks not_found as not retryable', () => {
    const error = new SourceError('src', 'not_found', 'msg');
    expect(error.retryable).toBe(false);
  });

  it('marks invalid_response as not retryable', () => {
    const error = new SourceError('src', 'invalid_response', 'msg');
    expect(error.retryable).toBe(false);
  });

  it('marks parse_failure as not retryable', () => {
    const error = new SourceError('src', 'parse_failure', 'msg');
    expect(error.retryable).toBe(false);
  });

  it('marks authentication_failure as not retryable', () => {
    const error = new SourceError('src', 'authentication_failure', 'msg');
    expect(error.retryable).toBe(false);
  });
});

describe('SourceError factory functions', () => {
  it('createSourceTimeout creates timeout error with timeout details', () => {
    const error = createSourceTimeout('wikipedia', 5000);
    expect(error.source).toBe('wikipedia');
    expect(error.errorType).toBe('timeout');
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('5000');
  });

  it('createSourceNotFound creates not_found error', () => {
    const error = createSourceNotFound('steam', '12345');
    expect(error.source).toBe('steam');
    expect(error.errorType).toBe('not_found');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('12345');
  });

  it('createSourceUnavailable creates source_unavailable error', () => {
    const error = createSourceUnavailable('wikipedia', 'maintenance');
    expect(error.source).toBe('wikipedia');
    expect(error.errorType).toBe('source_unavailable');
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('maintenance');
  });

  it('createSourceUnavailable works without reason', () => {
    const error = createSourceUnavailable('steam');
    expect(error.errorType).toBe('source_unavailable');
    expect(error.message).not.toContain('undefined');
  });

  it('createParseFailure creates parse_failure error', () => {
    const error = createParseFailure('wikipedia', 'Invalid JSON');
    expect(error.source).toBe('wikipedia');
    expect(error.errorType).toBe('parse_failure');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('Invalid JSON');
  });
});
