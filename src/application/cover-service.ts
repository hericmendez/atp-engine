import type { GameRepository } from '../domain/game/game-repository.js';
import type { CoverEngine, CoverSearchOptions } from '../cover/cover-engine.js';
import type { CoverResult } from '../domain/cover/cover-candidate.js';
import type { GameCover } from '../domain/game/game.js';
import { createGameId } from '../domain/shared/ids.js';
import { gameWithCover } from '../domain/game/game.js';
import { NotFoundError } from '../shared/errors/errors.js';

export interface CoverServiceDependencies {
  gameRepository: GameRepository;
  coverEngine: CoverEngine;
}

export class CoverService {
  constructor(private readonly deps: CoverServiceDependencies) {}

  async searchCovers(query: string, options?: CoverSearchOptions): Promise<CoverResult> {
    return this.deps.coverEngine.searchCovers(query, options);
  }

  async getGameCover(gameId: string): Promise<CoverResult> {
    const id = createGameId(gameId);
    const game = await this.deps.gameRepository.findById(id);

    if (!game) {
      throw new NotFoundError(`Game with ID ${gameId} not found`);
    }

    if (game.cover) {
      return {
        query: game.titles[0]?.value ?? '',
        gameId,
        selected: game.cover,
        candidates: [],
        errors: [],
      };
    }

    const title = game.titles[0]?.value ?? '';
    const result = await this.deps.coverEngine.discoverCovers(gameId, title);

    if (result.selected) {
      const cover: GameCover = {
        url: result.selected.url,
        source: result.selected.source,
        sourceId: result.selected.sourceId,
        width: result.selected.width,
        height: result.selected.height,
        type: result.selected.type,
      };

      const updatedGame = gameWithCover(game, cover);
      await this.deps.gameRepository.update(updatedGame);
    }

    return result;
  }
}
