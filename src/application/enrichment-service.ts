import type { Game } from '../domain/game/game.js';
import type { GameRepository } from '../domain/game/game-repository.js';
import type { DiscoverySourceObservation } from '../discovery/discovery-types.js';
import type { EnrichmentResult } from '../enrichment/enrichment-types.js';
import { enrichGame } from '../enrichment/enrichment-engine.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface EnrichmentServiceDependencies {
  gameRepository: GameRepository;
}

export class EnrichmentService {
  /**
   * Repository retained in the dependency contract for API stability
   * (all callers construct with one). Writes moved to callers: enrich()
   * is pure compute, the caller owns persisting the final state exactly
   * once.
   */
  constructor(_deps: EnrichmentServiceDependencies) {}

  /**
   * Pure merge: computes the enriched game without persisting anything.
   * Callers MUST persist the returned game themselves when
   * `changes.length > 0` (or fold further mutations first and persist
   * once). Never partially writes.
   */
  async enrich(
    game: Game,
    observations: readonly DiscoverySourceObservation[],
  ): Promise<EnrichmentResult> {
    const result = enrichGame(game, observations);

    logger.debug('EnrichmentService: enrichment computed (not persisted here)', {
      gameId: game.id,
      changeCount: result.changes.length,
      conflictCount: result.conflicts.length,
      completeness: result.completeness,
    });

    return result;
  }
}
