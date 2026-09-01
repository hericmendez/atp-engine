import type { Game } from '../domain/game/game.js';
import type { GameRepository, GameQuery, PaginatedResult } from '../domain/game/game-repository.js';
import type { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { createGameId } from '../domain/shared/ids.js';
import { NotFoundError } from '../shared/errors/errors.js';
import type { DataOrigin } from './data-origin.js';
import { discoveryGroupToGame } from './discovery-to-game.js';
import type { EnrichmentService } from './enrichment-service.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface CatalogServiceDependencies {
  gameRepository: GameRepository;
  discoveryEngine?: DiscoveryEngine;
  enrichmentService?: EnrichmentService;
}

export interface CatalogResult<T> {
  readonly data: T;
  readonly origin: DataOrigin;
}

export class CatalogService {
  private readonly gameRepository: GameRepository;
  private readonly discoveryEngine: DiscoveryEngine | undefined;
  private readonly enrichmentService: EnrichmentService | undefined;

  constructor(deps: CatalogServiceDependencies) {
    this.gameRepository = deps.gameRepository;
    this.discoveryEngine = deps.discoveryEngine;
    this.enrichmentService = deps.enrichmentService;
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

      const coreTitle = this.extractCoreTitle(searchQuery);
      if (coreTitle !== searchQuery) {
        const coreQuery: GameQuery = {
          search: coreTitle,
          page: options.page,
          limit: options.limit,
          sort: options.sort,
        };
        const coreResult = await this.gameRepository.findMany(coreQuery);
        if (coreResult.items.length > 0) {
          return { data: coreResult, origin: 'database' };
        }
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

    return this.discoverAndPersist(searchQuery, options);
  }

  private extractCoreTitle(query: string): string {
    const PLATFORM_SUFFIXES = [
      'ps5',
      'ps4',
      'ps3',
      'ps2',
      'ps1',
      'playstation 5',
      'playstation 4',
      'playstation 3',
      'playstation 2',
      'playstation',
      'xbox series x',
      'xbox series s',
      'xbox one',
      'xbox 360',
      'xbox',
      'nintendo switch',
      'switch',
      'wii u',
      'wii',
      'gamecube',
      'n64',
      'pc',
      'windows',
      'mac',
      'linux',
      'steam',
      'android',
      'ios',
      'mobile',
      'epic games',
      'gog',
      'origin',
    ];

    let normalized = query.toLowerCase().trim();

    for (const suffix of PLATFORM_SUFFIXES) {
      if (normalized.endsWith(' ' + suffix)) {
        normalized = normalized.slice(0, -(suffix.length + 1)).trim();
        break;
      }
    }

    normalized = normalized
      .replace(/\s+(for|on|version|edition|definitive|goty|complete)\s+.*$/i, '')
      .trim();

    return normalized.length > 0 ? normalized : query;
  }

  async getGameById(id: string): Promise<CatalogResult<Game>> {
    const gameId = createGameId(id);
    const game = await this.gameRepository.findById(gameId);

    if (!game) {
      throw new NotFoundError(`Game with ID ${id} not found`);
    }

    return { data: game, origin: 'database' };
  }

  private async discoverAndPersist(
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

      const persistedGames: Game[] = [];

      for (const group of discoveryResult.groups) {
        try {
          const game = await this.persistDiscoveryGroup(group);
          persistedGames.push(game);
        } catch (error) {
          logger.warn('Failed to persist discovery group', {
            groupId: group.groupId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        data: {
          items: persistedGames,
          total: persistedGames.length,
          page,
          limit,
          totalPages: Math.ceil(persistedGames.length / limit),
        },
        origin: persistedGames.length > 0 ? 'database' : 'scraper',
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

  private async persistDiscoveryGroup(
    group: import('../discovery/discovery-types.js').DiscoveryGroupResult,
  ): Promise<Game> {
    const bestObs = group.observations[0];
    const extId = bestObs
      ? group.observations.find((o) => o.candidate.externalIdentifiers.length > 0)?.candidate
          .externalIdentifiers[0]
      : undefined;

    if (extId) {
      const existing = await this.gameRepository.findByExternalIdentifier({
        source: extId.source,
        externalId: extId.id,
      });

      if (existing && this.enrichmentService) {
        const result = await this.enrichmentService.enrich(existing, group.observations);
        return result.game;
      }

      if (existing) {
        return existing;
      }
    }

    const candidateGame = discoveryGroupToGame(group);

    const newGame: Game = {
      ...candidateGame,
      id: createGameId(
        `atp-${candidateGame.externalIdentifiers[0]?.source ?? 'unknown'}-${candidateGame.externalIdentifiers[0]?.id ?? Date.now()}`,
      ),
    };

    await this.gameRepository.save(newGame);

    if (this.enrichmentService && group.observations.length > 0) {
      const result = await this.enrichmentService.enrich(newGame, group.observations);
      return result.game;
    }

    return newGame;
  }
}
