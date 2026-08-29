import type { IdentityOutcome } from '../domain/shared/identity-outcome.js';
import type { GameRelationshipType } from '../domain/shared/game-relationship-type.js';
import type { IdentitySignal } from './identity-signal.js';

export type ResolutionMethod = 'NATIVE' | 'AI' | 'HYBRID';

export interface IdentityResolutionResult {
  readonly outcome: IdentityOutcome;
  readonly relationship: GameRelationshipType | null;
  readonly confidence: number;
  readonly signals: readonly IdentitySignal[];
  readonly reason: string;
  readonly method: ResolutionMethod;
}
