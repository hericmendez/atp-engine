import type { Game } from '../domain/game/game.js';
import type { GameRepository, GameQuery, PaginatedResult } from '../domain/game/game-repository.js';
import { createGameId } from '../domain/shared/ids.js';
import { NotFoundError } from '../shared/errors/errors.js';

export interface CatalogServiceDependencies {
  gameRepository: GameRepository;
}

export class CatalogService {
  constructor(private readonly deps: CatalogServiceDependencies) {}

  async listGames(query: GameQuery): Promise<PaginatedResult<Game>> {
    return this.deps.gameRepository.findMany(query);
  }

  async searchGames(
    searchQuery: string,
    options: { page?: number; limit?: number; sort?: GameQuery['sort'] } = {},
  ): Promise<PaginatedResult<Game>> {
    const query: GameQuery = {
      search: searchQuery,
      page: options.page,
      limit: options.limit,
      sort: options.sort,
    };

    return this.deps.gameRepository.findMany(query);
  }

  async getGameById(id: string): Promise<Game> {
    const gameId = createGameId(id);
    const game = await this.deps.gameRepository.findById(gameId);

    if (!game) {
      throw new NotFoundError(`Game with ID ${id} not found`);
    }

    return game;
  }
}
