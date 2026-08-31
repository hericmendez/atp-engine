import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { requestIdMiddleware } from '../../src/interfaces/http/middleware/request-id.js';
import { requestTimeoutMiddleware } from '../../src/interfaces/http/middleware/request-timeout.js';
import { rateLimiterMiddleware } from '../../src/interfaces/http/middleware/rate-limiter.js';
import { getRequestId } from '../../src/infrastructure/request-context.js';

function createMockRequest(overrides?: Partial<Request>): Request {
  return {
    requestId: '',
    headers: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/test',
    ...overrides,
  } as Request;
}

function createMockResponse(): Response {
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    on: vi.fn(),
  } as unknown as Response;
  return res;
}

describe('requestIdMiddleware', () => {
  it('should set requestId from header if provided', () => {
    const req = createMockRequest({ headers: { 'x-request-id': 'test-id' } });
    const res = createMockResponse();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('test-id');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'test-id');
    expect(next).toHaveBeenCalled();
  });

  it('should generate UUID if not provided', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toMatch(/^[0-9a-f-]+$/);
    expect(res.setHeader).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should reject oversized header and generate new ID', () => {
    const oversized = 'a'.repeat(200);
    const req = createMockRequest({ headers: { 'x-request-id': oversized } });
    const res = createMockResponse();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).not.toBe(oversized);
    expect(req.requestId).toMatch(/^[0-9a-f-]+$/);
  });

  it('should make requestId available via AsyncLocalStorage', () => {
    const req = createMockRequest({ headers: { 'x-request-id': 'ctx-test' } });
    const res = createMockResponse();
    let capturedRequestId: string | undefined;

    requestIdMiddleware(req, res, () => {
      capturedRequestId = getRequestId();
    });

    expect(capturedRequestId).toBe('ctx-test');
  });

  it('different requests get different IDs', () => {
    const req1 = createMockRequest();
    const req2 = createMockRequest();
    const res = createMockResponse();

    requestIdMiddleware(req1, res, () => {});
    requestIdMiddleware(req2, res, () => {});

    expect(req1.requestId).not.toBe(req2.requestId);
  });
});

describe('requestTimeoutMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should call next immediately', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    const middleware = requestTimeoutMiddleware({ timeoutMs: 1000 });
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should set timeout response on timeout', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    const middleware = requestTimeoutMiddleware({ timeoutMs: 1000 });
    middleware(req, res, next);

    vi.advanceTimersByTime(1001);

    expect(res.status).toHaveBeenCalledWith(408);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'REQUEST_TIMEOUT',
        message: 'Request timeout',
      },
    });
  });
});

describe('rateLimiterMiddleware', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests under limit', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    const middleware = rateLimiterMiddleware({ windowMs: 60000, maxRequests: 5 });
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
  });

  it('should reject requests over limit', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    const middleware = rateLimiterMiddleware({ windowMs: 60000, maxRequests: 2 });

    middleware(req, res, next);
    middleware(req, res, next);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
      },
    });
  });

  it('should lazily remove expired entries on next request', () => {
    vi.useFakeTimers();

    const res = createMockResponse();
    const next = vi.fn();

    const middleware = rateLimiterMiddleware({ windowMs: 1000, maxRequests: 2 });

    const req1 = createMockRequest({ ip: '10.0.0.1' });
    middleware(req1, res, next);
    middleware(req1, res, next);

    vi.advanceTimersByTime(1001);

    const req2 = createMockRequest({ ip: '10.0.0.1' });
    middleware(req2, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).not.toHaveBeenCalledWith(429);

    vi.useRealTimers();
  });

  it('should reset window after expiry', () => {
    vi.useFakeTimers();

    const res = createMockResponse();
    const next = vi.fn();

    const middleware = rateLimiterMiddleware({ windowMs: 500, maxRequests: 1 });

    const req = createMockRequest({ ip: '10.0.0.2' });
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);

    vi.advanceTimersByTime(501);

    const reqAfter = createMockRequest({ ip: '10.0.0.2' });
    middleware(reqAfter, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should keep clients independent after expiry', () => {
    vi.useFakeTimers();

    const res = createMockResponse();
    const next = vi.fn();

    const middleware = rateLimiterMiddleware({ windowMs: 1000, maxRequests: 1 });

    const reqA = createMockRequest({ ip: '10.0.0.3' });
    middleware(reqA, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);

    const reqB = createMockRequest({ ip: '10.0.0.4' });
    middleware(reqB, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    middleware(reqA, res, next);
    expect(next).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
