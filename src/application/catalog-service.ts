import type { Game } from '../domain/game/game.js';
import type { GameRepository, GameQuery, PaginatedResult } from '../domain/game/game-repository.js';
import type { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { createGameId } from '../domain/shared/ids.js';
import { NotFoundError } from '../shared/errors/errors.js';
import type { DataOrigin } from './data-origin.js';
import { discoveryGroupToGame } from './discovery-to-game.js';
import { selectPersistObservation } from './discovery-to-game.js';
import type { DiscoverySourceError } from '../discovery/discovery-types.js';
import { sanitizeDiscoveryErrors } from '../discovery/discovery-errors.js';
import type { EnrichmentService } from './enrichment-service.js';
import {
  catalogEligibility,
  logEligibilityDecision,
  hasStableIdentity,
  hasDurableCatalogIdentity,
  stableIdentityExtId,
  missingStableIdentityDecision,
  reclassificationConflictDecision,
  unresolvedRelationshipTargetDecision,
} from '../eligibility/catalog-eligibility.js';
import { checkReclassification } from '../eligibility/reclassification-guard.js';
import {
  findOriginalEdgeRequest,
  withOriginalEdge,
} from './relationships.js';
import type { QuarantineService } from './quarantine-service.js';
import { logPersistFailure } from './persist-logging.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface CatalogServiceDependencies {
  gameRepository: GameRepository;
  discoveryEngine?: DiscoveryEngine;
  enrichmentService?: EnrichmentService;
  quarantineService?: QuarantineService;
}

export interface CatalogResult<T> {
  readonly data: T;
  readonly origin: DataOrigin;
  /**
   * Discovery/provider failures, present only when the discovery path
   * actually ran (discover=true on a miss). Absent otherwise so the
   * default database-first contract stays byte-identical.
   */
  readonly errors?: readonly DiscoverySourceError[];
}

export class CatalogService {
  private readonly gameRepository: GameRepository;
  private readonly discoveryEngine: DiscoveryEngine | undefined;
  private readonly enrichmentService: EnrichmentService | undefined;
  private readonly quarantineService: QuarantineService | undefined;

  constructor(deps: CatalogServiceDependencies) {
    this.gameRepository = deps.gameRepository;
    this.discoveryEngine = deps.discoveryEngine;
    this.enrichmentService = deps.enrichmentService;
    this.quarantineService = deps.quarantineService;
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
    options: { page?: number; limit?: number; sort?: GameQuery['sort']; discover?: boolean } = {},
  ): Promise<CatalogResult<PaginatedResult<Game>>> {
    const query: GameQuery = {
      search: searchQuery,
      page: options.page,
      limit: options.limit,
      sort: options.sort,
    };

    // Catalog foundation invariant: normal reads never silently create
    // canonical records. Live discovery runs only behind the explicit
    // `discover` opt-in (e.g. `GET /games/search?discover=true`).
    const allowDiscovery = options.discover === true;

    try {
      const dbResult = await this.gameRepository.findMany(query);

      // Legacy fallback identities (atp-unknown-*) predate the
      // stable-identity ban and carry no durable metadata. They stay in
      // the database (no destructive cleanup here) but must never reach
      // the public search surface. Pagination totals still reflect the
      // repository match; only selectable items are returned.
      const items = dbResult.items.filter(hasDurableCatalogIdentity);
      if (items.length > 0) {
        return { data: { ...dbResult, items }, origin: 'database' };
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
        const coreItems = coreResult.items.filter(hasDurableCatalogIdentity);
        if (coreItems.length > 0) {
          return { data: { ...coreResult, items: coreItems }, origin: 'database' };
        }
      }

      if (!allowDiscovery) {
        logger.info('Database search returned empty, discovery not requested', {
          query: searchQuery,
        });
        return {
          data: this.emptyResult(options.page, options.limit),
          origin: 'database',
        };
      }

      logger.info('Database search returned empty, falling back to discovery', {
        query: searchQuery,
      });
    } catch (error) {
      if (!allowDiscovery) {
        logger.warn('Database failure during search, discovery not requested', {
          query: searchQuery,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          data: this.emptyResult(options.page, options.limit),
          origin: 'database',
        };
      }
      logger.warn('Database failure during search, falling back to discovery', {
        query: searchQuery,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.discoverAndPersist(searchQuery, options);
  }

  private emptyResult(page?: number, limit?: number): PaginatedResult<Game> {
    const resolvedLimit = limit ?? 20;
    return {
      items: [],
      total: 0,
      page: page ?? 1,
      limit: resolvedLimit,
      totalPages: 0,
    };
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

      // Provider failures are sanitized (no upstream URLs) and preserved
      // for the response; they stay orthogonal to origin/results.
      const errors = sanitizeDiscoveryErrors(discoveryResult.sourceErrors);

      const persistedGames: Game[] = [];

      for (const group of discoveryResult.groups) {
        try {
          const game = await this.persistDiscoveryGroup(group);
          if (game !== null) {
            persistedGames.push(game);
          }
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
        errors,
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
  ): Promise<Game | null> {
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

      if (existing) {
        // Reclassification guard (same rule as bulk sync): same canonical
        // identity + differing classification quarantines instead of
        // mutating the stored record — never a duplicate Game.
        const incomingCandidate = selectPersistObservation(group)?.candidate;
        const verdict = checkReclassification(
          { gameType: existing.gameType, gameStatus: existing.gameStatus },
          {
            gameType: incomingCandidate?.gameType ?? null,
            gameStatus: incomingCandidate?.gameStatus ?? null,
          },
        );

        if (verdict.kind === 'conflict') {
          const detail =
            `stored gameType=${verdict.storedType ?? 'null'} ` +
            `gameStatus=${verdict.storedStatus ?? 'null'} vs incoming ` +
            `gameType=${verdict.incomingType ?? 'null'} ` +
            `gameStatus=${verdict.incomingStatus ?? 'null'} ` +
            `(changed: ${verdict.changedFields.join(',')})`;
          logger.debug('eligibility.reclassification.conflict', {
            groupId: group.groupId,
            existingId: existing.id,
          });
          await this.quarantineService?.recordRejection(
            group,
            reclassificationConflictDecision(group, detail),
          );
          return null;
        }

        let current = existing;
        const updateSources: string[] = [];
        if (this.enrichmentService) {
          const result = await this.enrichmentService.enrich(existing, group.observations);
          current = result.game;
          if (result.changes.length > 0) {
            updateSources.push('enrichment');
          }
        }
        const edge = await this.resolveOriginalEdge(current, group);
        current = edge.game;
        if (edge.attached) {
          updateSources.push('relationship');
        }
        if (updateSources.length > 0) {
          await this.persistGame('update-existing', group, current);
          logger.debug('catalog.game.updated', {
            groupId: group.groupId,
            gameId: current.id,
            sources: updateSources,
          });
        }
        return current;
      }
    }

    // ── Catalog Eligibility gate ───────────────────────────────
    const decision = catalogEligibility(group);
    logEligibilityDecision(group.groupId, decision);

    if (!decision.eligible) {
      logger.debug('eligibility.skipping_persistence', {
        groupId: group.groupId,
        status: decision.status,
        reason: decision.reason,
      });
      await this.quarantineService?.recordRejection(group, decision);
      return null;
    }

    const candidateGame = discoveryGroupToGame(group);

    // Stable-identity ban (same rule as bulk sync): never mint a canonical
    // Game without a source-provided identifier on the persisted candidate.
    // No atp-unknown/Date.now fallback.
    if (!hasStableIdentity(group)) {
      logger.debug('eligibility.identity.banned', { groupId: group.groupId });
      await this.quarantineService?.recordRejection(group, missingStableIdentityDecision(group));
      return null;
    }

    // Guaranteed present by the ban above (same persisted candidate).
    const idSeed = stableIdentityExtId(group) ?? candidateGame.externalIdentifiers[0];

    let newGame: Game = {
      ...candidateGame,
      id: createGameId(`atp-${idSeed.source}-${idSeed.id}`),
    };

    // A remake/remaster is its own canonical Game; when its original is
    // immediately resolvable the edge folds into the single save below.
    // An unresolvable original quarantines the edge only — the game
    // itself is valid canonical data (no second-pass in single-shot
    // ingestion, and targets are never invented).
    const edgeRequest = findOriginalEdgeRequest(group);
    if (edgeRequest) {
      const target = await this.gameRepository.findByExternalIdentifier({
        source: edgeRequest.observation.source,
        externalId: edgeRequest.ref.externalId,
      });

      if (!target) {
        const detail =
          `no canonical game with ${edgeRequest.observation.source}:${edgeRequest.ref.externalId} ` +
          `(via ${edgeRequest.ref.field}) for ${edgeRequest.kind} edge from ${newGame.id}; ` +
          `target will not be invented`;
        logger.debug('eligibility.relationship.unresolved', {
          groupId: group.groupId,
          kind: edgeRequest.kind,
        });
        await this.quarantineService?.recordRejection(
          group,
          unresolvedRelationshipTargetDecision(group, detail),
        );
      } else if (target.id !== newGame.id) {
        newGame = withOriginalEdge(newGame, target.id, edgeRequest.kind).game;
      }
    }

    // Enrich in memory before the single save so the persisted
    // document already carries every mutation (no stale rewrites, and
    // the returned game always matches the database).
    if (this.enrichmentService && group.observations.length > 0) {
      const result = await this.enrichmentService.enrich(newGame, group.observations);
      newGame = result.game;
    }

    await this.persistGame('save-new', group, newGame, `${idSeed.source}:${idSeed.id}`);

    return newGame;
  }

  /**
   * Pure original-edge resolution for the single-ingest path (no
   * persistence): find the deterministic original and attach
   * idempotently. A missing original quarantines the edge only (the game
   * itself stands). Callers persist the returned game themselves.
   */
  private async resolveOriginalEdge(
    game: Game,
    group: import('../discovery/discovery-types.js').DiscoveryGroupResult,
  ): Promise<{ game: Game; attached: boolean }> {
    const request = findOriginalEdgeRequest(group);
    if (!request) {
      return { game, attached: false };
    }

    const target = await this.gameRepository.findByExternalIdentifier({
      source: request.observation.source,
      externalId: request.ref.externalId,
    });

    if (!target) {
      const detail =
        `no canonical game with ${request.observation.source}:${request.ref.externalId} ` +
        `(via ${request.ref.field}) for ${request.kind} edge from ${game.id}; ` +
        `target will not be invented`;
      logger.debug('eligibility.relationship.unresolved', {
        groupId: group.groupId,
        kind: request.kind,
      });
      await this.quarantineService?.recordRejection(
        group,
        unresolvedRelationshipTargetDecision(group, detail),
      );
      return { game, attached: false };
    }

    if (target.id === game.id) {
      return { game, attached: false };
    }

    const { game: withEdge, added } = withOriginalEdge(game, target.id, request.kind);
    return { game: withEdge, attached: added };
  }

  private async persistGame(
    operation: 'save-new' | 'update-existing',
    group: import('../discovery/discovery-types.js').DiscoveryGroupResult,
    game: Game,
    externalId?: string,
  ): Promise<void> {
    try {
      if (operation === 'save-new') {
        await this.gameRepository.save(game);
      } else {
        await this.gameRepository.update(game);
      }
    } catch (error) {
      logPersistFailure({
        scope: 'catalog',
        operation,
        group,
        gameId: game.id,
        externalId,
        error,
      });
      throw error;
    }
  }
}
