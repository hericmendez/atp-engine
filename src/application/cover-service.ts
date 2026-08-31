import type { GameRepository } from '../domain/game/game-repository.js';
import type { CoverEngine, CoverSearchOptions } from '../cover/cover-engine.js';
import type { CoverResult } from '../domain/cover/cover-candidate.js';
import { DEFAULT_COVER_SEARCH_TYPE, DEFAULT_COVER_LIMIT } from '../cover/cover-engine.js';
import type { GameCover } from '../domain/game/game.js';
import { createGameId } from '../domain/shared/ids.js';
import { gameWithCover } from '../domain/game/game.js';
import { NotFoundError } from '../shared/errors/errors.js';
import type { DataOrigin } from './data-origin.js';

export interface CoverServiceDependencies {
  gameRepository: GameRepository;
  coverEngine: CoverEngine;
}

export interface CoverServiceResult {
  readonly data: CoverResult;
  readonly origin: DataOrigin;
}

export class CoverService {
  constructor(private readonly deps: CoverServiceDependencies) {}

  async searchCovers(query: string, options?: CoverSearchOptions): Promise<CoverServiceResult> {
    const data = await this.deps.coverEngine.searchCovers(query, options);
    return { data, origin: 'scraper' };
  }

  async getGameCover(gameId: string): Promise<CoverServiceResult> {
    const id = createGameId(gameId);
    const game = await this.deps.gameRepository.findById(id);

    if (!game) {
      throw new NotFoundError(`Game with ID ${gameId} not found`);
    }

    if (game.cover) {
      return {
        data: {
          query: game.titles[0]?.value ?? '',
          gameId,
          type: DEFAULT_COVER_SEARCH_TYPE,
          limit: DEFAULT_COVER_LIMIT,
          selected: game.cover,
          candidates: [],
          errors: [],
        },
        origin: 'database',
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

    return { data: result, origin: 'scraper' };
  }
}
