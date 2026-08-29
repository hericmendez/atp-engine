import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { Game } from '../domain/game/game.js';
import type { IdentityResolutionResult } from './identity-resolution-result.js';

export interface IdentityResolver {
  resolve(candidate: NormalizedCandidate, existingGame: Game | null): IdentityResolutionResult;
}
