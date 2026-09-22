import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../../infrastructure/config/config.js';
import { AppError } from '../../../shared/errors/errors.js';
import { REQUEST_ID_HEADER } from './request-id.js';
import { getAdminSession, getSessionCookieName } from '../../../infrastructure/auth/admin-session.js';

function unauthorized(message: string): AppError {
  return new AppError('UNAUTHORIZED', message, 401);
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function adminAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req as Request & { requestId?: string }).requestId
    ?? (req.headers[REQUEST_ID_HEADER] as string | undefined);

  // 1. Try session cookie first (HttpOnly)
  try {
    const config = getConfig();
    const isSecure = config.NODE_ENV === 'production';
    const cookieName = getSessionCookieName(isSecure);
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    const sessionId = cookies?.[cookieName];
    if (sessionId) {
      const session = getAdminSession(sessionId);
      if (session) {
        // Attach user for downstream if needed
        (req as unknown as { adminUser?: string }).adminUser = session.username;
        void requestId;
        next();
        return;
      }
    }
  } catch {
    // ignore session check errors, fall through to Bearer
  }

  // 2. Fallback to Bearer token (legacy, for CLI/scripts)
  let expectedToken: string | undefined;
  try {
    expectedToken = getConfig().ADMIN_API_TOKEN;
  } catch {
    expectedToken = undefined;
  }

  if (!expectedToken) {
    next(unauthorized('Admin authentication is not configured'));
    return;
  }

  const header = req.headers.authorization;

  if (!header || typeof header !== 'string') {
    next(unauthorized('Missing Authorization header'));
    return;
  }

  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    next(unauthorized('Invalid Authorization format'));
    return;
  }

  const provided = header.slice(prefix.length).trim();

  if (provided.length === 0) {
    next(unauthorized('Missing token'));
    return;
  }

  if (!safeCompare(provided, expectedToken)) {
    next(unauthorized('Invalid token'));
    return;
  }

  void requestId;
  next();
}
