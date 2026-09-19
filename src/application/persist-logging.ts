import { logger } from '../infrastructure/logger/logger.js';
import type { DiscoveryGroupResult } from '../discovery/discovery-types.js';

/**
 * Shared observability for persistence steps in ingestion pipelines.
 *
 * Write operations have no retry concept in this codebase, so failures
 * are reported (never retried) with enough context to answer: which
 * group, which game, which operation, which error. Secrets and
 * connection strings are stripped from every surfaced message.
 */

const URL_PATTERN = /https?:\/\/\S+/g;
const MONGO_URI_PATTERN = /mongodb(\+\w+)?:\/\/\S+/g;

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(MONGO_URI_PATTERN, 'mongodb://[redacted]')
    .replace(URL_PATTERN, '[url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function safeCause(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause === undefined || cause === null) {
    return null;
  }
  if (cause instanceof Error) {
    return sanitizeErrorMessage(`${cause.name}: ${cause.message}`);
  }
  return sanitizeErrorMessage(String(cause)).slice(0, 200) || null;
}

function mongoErrorCode(error: unknown): number | string | null {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' || typeof code === 'string' ? code : null;
}

export interface PersistFailureContext {
  readonly scope: string;
  readonly operation: string;
  readonly group: DiscoveryGroupResult;
  readonly gameId?: string | null;
  readonly externalId?: string | null;
  readonly error: unknown;
}

export function logPersistFailure(ctx: PersistFailureContext): void {
  logger.warn('catalog.persist.failed', {
    scope: ctx.scope,
    operation: ctx.operation,
    groupId: ctx.group.groupId,
    gameId: ctx.gameId ?? null,
    externalId: ctx.externalId ?? null,
    error: ctx.error instanceof Error ? sanitizeErrorMessage(ctx.error.message) : String(ctx.error),
    cause: safeCause(ctx.error),
    mongoCode: mongoErrorCode(ctx.error),
    // No retry concept exists for write operations: reported, never retried.
    retryable: false,
  });
}
