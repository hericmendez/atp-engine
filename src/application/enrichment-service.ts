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
  private readonly gameRepository: GameRepository;

  constructor(deps: EnrichmentServiceDependencies) {
    this.gameRepository = deps.gameRepository;
  }

  async enrich(
    game: Game,
    observations: readonly DiscoverySourceObservation[],
  ): Promise<EnrichmentResult> {
    const result = enrichGame(game, observations);

    if (result.changes.length > 0) {
      await this.gameRepository.update(result.game);
      logger.info('EnrichmentService: enriched game persisted', {
        gameId: game.id,
        changeCount: result.changes.length,
        conflictCount: result.conflicts.length,
        completeness: result.completeness,
      });
    }

    return result;
  }
}
