import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { requestIdMiddleware } from '../../src/interfaces/http/middleware/request-id.js';
import { requestTimeoutMiddleware } from '../../src/interfaces/http/middleware/request-timeout.js';
import { rateLimiterMiddleware } from '../../src/interfaces/http/middleware/rate-limiter.js';

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

  it('should generate requestId if not provided', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toMatch(/^[0-9a-f-]+$/);
    expect(res.setHeader).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
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
});
