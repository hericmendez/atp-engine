import { logger } from '../infrastructure/logger/logger.js';

export type AIOperation = 'classification' | 'identity_resolution' | 'enrichment_conflict';

export type AIFallbackReason =
  | 'ai_disabled'
  | 'ai_failure'
  | 'ai_timeout'
  | 'ai_low_confidence'
  | 'ai_invalid_response'
  | 'ai_unavailable';

export interface AIOperationEvent {
  readonly event: 'ai.operation';
  readonly operation: AIOperation;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly fallback: boolean;
  readonly fallbackReason?: AIFallbackReason;
  readonly confidence?: number;
  readonly escalationReason?: string;
}

export function logAIOperation(event: AIOperationEvent): void {
  try {
    logger.info('ai.operation', event as unknown as Record<string, unknown>);
  } catch {
    // Observability must never break the pipeline
  }
}

export function startAITimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
