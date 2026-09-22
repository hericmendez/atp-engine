import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { getConfig } from '../../../infrastructure/config/config.js';
import { createAdminSession, getAdminSession, deleteAdminSession, getSessionCookieName, getSessionTtlMs } from '../../../infrastructure/auth/admin-session.js';
import { verifyAdminPassword } from '../../../infrastructure/auth/admin-password.js';
import { logger } from '../../../infrastructure/logger/logger.js';

const LoginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Simple in-memory rate limiting for login: 5/min per IP
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_MAX = 5;
const LOGIN_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  if (entry.count >= LOGIN_MAX) return true;
  entry.count++;
  return false;
}

function safeCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function verifyPassword(provided: string): Promise<boolean> {
  const config = getConfig();
  const stored = config.ADMIN_PASSWORD_HASH;
  if (!stored) return false;
  return verifyAdminPassword(provided, stored);
}

export function adminAuthRoutes(): Router {
  const router = Router();

  // POST /admin/login
  router.post('/admin/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = (req.ip || req.headers['x-forwarded-for'] as string || 'unknown').toString();
      if (isRateLimited(ip)) {
        logger.warn('admin.login.rate_limited', { ip, requestId: (req as unknown as { requestId?: string }).requestId });
        res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts', requestId: (req as unknown as { requestId?: string }).requestId } });
        return;
      }

      const body = LoginBodySchema.parse(req.body);
      const config = getConfig();

      const usernameOk = safeCompare(body.username, config.ADMIN_USERNAME);
      const passwordOk = await verifyPassword(body.password);

      if (!usernameOk || !passwordOk) {
        logger.warn('admin.login.failure', { username: body.username, ip, requestId: (req as unknown as { requestId?: string }).requestId });
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials', requestId: (req as unknown as { requestId?: string }).requestId } });
        return;
      }

      // success — reset rate limit for IP
      loginAttempts.delete(ip);

      const session = createAdminSession(body.username);
      const isSecure = config.NODE_ENV === 'production';
      const cookieName = getSessionCookieName(isSecure);

      res.cookie(cookieName, session.sessionId, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: getSessionTtlMs(),
      });

      logger.info('admin.login.success', { username: body.username, ip, requestId: (req as unknown as { requestId?: string }).requestId });

      res.json({ data: { authenticated: true, username: body.username } });
    } catch (error) {
      next(error);
    }
  });

  // POST /admin/logout
  router.post('/admin/logout', (req: Request, res: Response) => {
    const config = getConfig();
    const isSecure = config.NODE_ENV === 'production';
    const cookieName = getSessionCookieName(isSecure);
    const sessionId = (req.cookies as Record<string, string> | undefined)?.[cookieName];

    if (sessionId) {
      deleteAdminSession(sessionId);
    }

    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
    });

    logger.info('admin.logout', { requestId: (req as unknown as { requestId?: string }).requestId });

    res.json({ data: { authenticated: false } });
  });

  // GET /admin/session
  router.get('/admin/session', (req: Request, res: Response) => {
    const config = getConfig();
    const isSecure = config.NODE_ENV === 'production';
    const cookieName = getSessionCookieName(isSecure);
    const sessionId = (req.cookies as Record<string, string> | undefined)?.[cookieName];

    if (!sessionId) {
      res.json({ data: { authenticated: false } });
      return;
    }

    const session = getAdminSession(sessionId);
    if (!session) {
      res.json({ data: { authenticated: false } });
      return;
    }

    res.json({ data: { authenticated: true, username: session.username } });
  });

  return router;
}

export function clearLoginRateLimit(): void {
  loginAttempts.clear();
}
