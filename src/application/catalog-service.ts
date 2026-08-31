import type { Game } from '../domain/game/game.js';
import type { GameRepository, GameQuery, PaginatedResult } from '../domain/game/game-repository.js';
import type { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { createGameId } from '../domain/shared/ids.js';
import { NotFoundError } from '../shared/errors/errors.js';
import type { DataOrigin } from './data-origin.js';
import { discoveryGroupsToGames } from './discovery-to-game.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface CatalogServiceDependencies {
  gameRepository: GameRepository;
  discoveryEngine?: DiscoveryEngine;
}

export interface CatalogResult<T> {
  readonly data: T;
  readonly origin: DataOrigin;
}

export class CatalogService {
  private readonly gameRepository: GameRepository;
  private readonly discoveryEngine: DiscoveryEngine | undefined;

  constructor(deps: CatalogServiceDependencies) {
    this.gameRepository = deps.gameRepository;
    this.discoveryEngine = deps.discoveryEngine;
  }

  async listGames(query: GameQuery): Promise<CatalogResult<PaginatedResult<Game>>> {
    try {
      const result = await this.gameRepository.findMany(query);
      return { data: result, origin: 'database' };
    } catch (error) {
      logger.warn('Database unavailable for catalog listing', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async searchGames(
    searchQuery: string,
    options: { page?: number; limit?: number; sort?: GameQuery['sort'] } = {},
  ): Promise<CatalogResult<PaginatedResult<Game>>> {
    const query: GameQuery = {
      search: searchQuery,
      page: options.page,
      limit: options.limit,
      sort: options.sort,
    };

    try {
      const dbResult = await this.gameRepository.findMany(query);

      if (dbResult.items.length > 0) {
        return { data: dbResult, origin: 'database' };
      }

      logger.info('Database search returned empty, falling back to discovery', {
        query: searchQuery,
      });
    } catch (error) {
      logger.warn('Database failure during search, falling back to discovery', {
        query: searchQuery,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.searchViaDiscovery(searchQuery, options);
  }

  async getGameById(id: string): Promise<CatalogResult<Game>> {
    const gameId = createGameId(id);
    const game = await this.gameRepository.findById(gameId);

    if (!game) {
      throw new NotFoundError(`Game with ID ${id} not found`);
    }

    return { data: game, origin: 'database' };
  }

  private async searchViaDiscovery(
    searchQuery: string,
    options: { page?: number; limit?: number; sort?: GameQuery['sort'] },
  ): Promise<CatalogResult<PaginatedResult<Game>>> {
    if (!this.discoveryEngine) {
      logger.warn('No discovery engine available for fallback search', {
        query: searchQuery,
      });
      return {
        data: {
          items: [],
          total: 0,
          page: options.page ?? 1,
          limit: options.limit ?? 20,
          totalPages: 0,
        },
        origin: 'scraper',
      };
    }

    try {
      const page = options.page ?? 1;
      const limit = options.limit ?? 20;
      const offset = (page - 1) * limit;

      const discoveryResult = await this.discoveryEngine.discover({
        query: searchQuery,
        limit,
        offset,
      });

      const games = discoveryGroupsToGames(discoveryResult.groups);

      return {
        data: {
          items: games,
          total: discoveryResult.totalGroups,
          page,
          limit,
          totalPages: Math.ceil(discoveryResult.totalGroups / limit),
        },
        origin: 'scraper',
      };
    } catch (error) {
      logger.error('Discovery fallback also failed', {
        query: searchQuery,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        data: {
          items: [],
          total: 0,
          page: options.page ?? 1,
          limit: options.limit ?? 20,
          totalPages: 0,
        },
        origin: 'scraper',
      };
    }
  }
}
