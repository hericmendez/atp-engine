import { randomUUID } from 'node:crypto';

export interface AdminSession {
  readonly sessionId: string;
  readonly username: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h
const sessions = new Map<string, AdminSession>();

export function createAdminSession(username: string, ttlMs = SESSION_TTL_MS): AdminSession {
  const sessionId = randomUUID();
  const now = new Date();
  const session: AdminSession = {
    sessionId,
    username,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  };
  sessions.set(sessionId, session);
  return session;
}

export function getAdminSession(sessionId: string): AdminSession | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (s.expiresAt.getTime() <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  // sliding expiration: extend on access
  s.expiresAt.setTime(Date.now() + SESSION_TTL_MS);
  return s;
}

export function deleteAdminSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function clearAllSessions(): void {
  sessions.clear();
}

export function getSessionCookieName(isSecure: boolean): string {
  return isSecure ? '__Host-atp_admin' : 'atp_admin';
}

export function getSessionTtlMs(): number {
  return SESSION_TTL_MS;
}
