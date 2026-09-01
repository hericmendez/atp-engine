import type { Game } from '../domain/game/game.js';
import type { GameRepository } from '../domain/game/game-repository.js';
import type { PlatformCatalogRepository } from '../domain/platform/platform-catalog-repository.js';
import type { DiscoveryEngine } from '../discovery/discovery-engine.js';
import type { DiscoveryGroupResult } from '../discovery/discovery-types.js';
import type { EnrichmentService } from './enrichment-service.js';
import type { CatalogSyncHistoryRepository } from './catalog-sync-history-repository.js';
import type {
  SyncRequest,
  SyncResult,
  PlatformSyncResult,
  ResolvedPlatform,
  SyncTotals,
} from './catalog-sync-types.js';
import type { SyncTrigger } from './catalog-sync-history-types.js';
import { createGameId } from '../domain/shared/ids.js';
import { discoveryGroupToGame } from './discovery-to-game.js';
import { logger } from '../infrastructure/logger/logger.js';

const MAX_SYNC_LIMIT = 100;

export interface CatalogSyncServiceDependencies {
  gameRepository: GameRepository;
  platformCatalogRepository: PlatformCatalogRepository;
  discoveryEngine: DiscoveryEngine;
  enrichmentService: EnrichmentService;
  historyRepository?: CatalogSyncHistoryRepository;
}

export class CatalogSyncService {
  private readonly gameRepository: GameRepository;
  private readonly platformCatalogRepository: PlatformCatalogRepository;
  private readonly discoveryEngine: DiscoveryEngine;
  private readonly enrichmentService: EnrichmentService;
  private readonly historyRepository?: CatalogSyncHistoryRepository;

  constructor(deps: CatalogSyncServiceDependencies) {
    this.gameRepository = deps.gameRepository;
    this.platformCatalogRepository = deps.platformCatalogRepository;
    this.discoveryEngine = deps.discoveryEngine;
    this.enrichmentService = deps.enrichmentService;
    this.historyRepository = deps.historyRepository;
  }

  async sync(request: SyncRequest): Promise<SyncResult> {
    const startTime = Date.now();
    const trigger: SyncTrigger = request.trigger ?? 'manual';
    const dryRun = request.dryRun ?? false;

    logger.info('catalog.sync.started', {
      platformCount: request.platforms?.length ?? 0,
      activeOnly: request.activeOnly,
      from: request.from,
      to: request.to,
      dryRun,
      trigger,
    });

    const requestedPlatformIds = [...(request.platforms ?? [])];

    let historyId: string | undefined;
    if (this.historyRepository) {
      try {
        historyId = await this.historyRepository.create({
          startedAt: new Date(startTime),
          completedAt: null,
          trigger,
          status: 'running',
          dryRun,
          from: request.from,
          to: request.to,
          requestedPlatformIds,
          resolvedPlatformNames: [],
          totals: {
            candidatesFound: 0,
            newGames: 0,
            existingGames: 0,
            updatedGames: 0,
            rejected: 0,
            errors: 0,
          },
          platformResults: [],
          error: null,
          durationMs: null,
        });
      } catch (error) {
        logger.error('catalog.sync.history.create_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const result = await this.executeSync(request, startTime, historyId);

      if (historyId && this.historyRepository) {
        try {
          await this.historyRepository.update(historyId, {
            completedAt: new Date(),
            status: result.status,
            totals: result.totals,
            platformResults: result.platforms.map((p) => ({
              platformId: p.platformId,
              platformName: p.platformName,
              candidatesFound: p.candidatesFound,
              newGames: p.newGames,
              existingGames: p.existingGames,
              updatedGames: p.updatedGames,
              rejected: p.rejected,
              errors: p.errors,
              status: p.status,
              error: p.error,
            })),
            durationMs: result.durationMs,
            resolvedPlatformNames: result.platforms.map((p) => p.platformName),
            error:
              result.status === 'failed'
                ? (result.platforms.find((p) => p.error)?.error ?? 'All platforms failed')
                : null,
          });
        } catch (error) {
          logger.error('catalog.sync.history.update_failed', {
            historyId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { ...result, historyId };
    } catch (error) {
      if (historyId && this.historyRepository) {
        const durationMs = Date.now() - startTime;
        try {
          await this.historyRepository.update(historyId, {
            completedAt: new Date(),
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            durationMs,
          });
        } catch (updateError) {
          logger.error('catalog.sync.history.update_failed', {
            historyId,
            error: updateError instanceof Error ? updateError.message : String(updateError),
          });
        }
      }

      throw error;
    }
  }

  private async executeSync(
    request: SyncRequest,
    startTime: number,
    _historyId?: string,
  ): Promise<SyncResult> {
    const platforms = await this.resolvePlatforms(request);

    if (platforms.length === 0) {
      return {
        status: 'completed',
        platforms: [],
        totals: this.emptyTotals(),
        dryRun: request.dryRun ?? false,
        durationMs: Date.now() - startTime,
      };
    }

    const platformResults: PlatformSyncResult[] = [];

    for (const platform of platforms) {
      try {
        const result = await this.syncPlatform(platform, request.dryRun ?? false);
        platformResults.push(result);
      } catch (error) {
        logger.error('catalog.sync.platform.failed', {
          platformId: platform.entry.id,
          platformName: platform.entry.name,
          error: error instanceof Error ? error.message : String(error),
        });

        platformResults.push({
          platformId: platform.entry.id,
          platformName: platform.entry.name,
          candidatesFound: 0,
          newGames: 0,
          existingGames: 0,
          updatedGames: 0,
          rejected: 0,
          errors: 1,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totals = this.aggregateTotals(platformResults);
    const allFailed = platformResults.every((r) => r.status === 'failed');
    const someFailed = platformResults.some((r) => r.status === 'failed');
    const status = allFailed ? 'failed' : someFailed ? 'partial' : 'completed';

    const durationMs = Date.now() - startTime;

    logger.info('catalog.sync.completed', {
      status,
      platformCount: platforms.length,
      totalCandidates: totals.candidatesFound,
      totalNew: totals.newGames,
      totalUpdated: totals.updatedGames,
      totalRejected: totals.rejected,
      totalErrors: totals.errors,
      dryRun: request.dryRun ?? false,
      durationMs,
    });

    return {
      status,
      platforms: platformResults,
      totals,
      dryRun: request.dryRun ?? false,
      durationMs,
    };
  }

  private async resolvePlatforms(request: SyncRequest): Promise<ResolvedPlatform[]> {
    const dateRange = this.parseDateRange(request.from, request.to);

    if (request.platforms && request.platforms.length > 0) {
      const platforms: ResolvedPlatform[] = [];
      const seen = new Set<string>();

      for (const platformId of request.platforms) {
        if (seen.has(platformId)) continue;
        seen.add(platformId);

        const entry = await this.platformCatalogRepository.findById(platformId);
        if (entry) {
          platforms.push({
            entry,
            queryYear: dateRange.fromYear,
          });
        } else {
          logger.warn('catalog.sync.platform.not_found', { platformId });
        }
      }

      return platforms;
    }

    if (request.activeOnly) {
      const result = await this.platformCatalogRepository.findMany({
        status: 'active',
        limit: 500,
      });

      return result.items.map((entry) => ({
        entry,
        queryYear: dateRange.fromYear,
      }));
    }

    return [];
  }

  private parseDateRange(
    from: string,
    to: string,
  ): {
    fromYear: number | null;
    toYear: number | null;
  } {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return { fromYear: null, toYear: null };
    }

    if (fromDate > toDate) {
      return { fromYear: null, toYear: null };
    }

    return {
      fromYear: fromDate.getUTCFullYear(),
      toYear: toDate.getUTCFullYear(),
    };
  }

  private async syncPlatform(
    platform: ResolvedPlatform,
    dryRun: boolean,
  ): Promise<PlatformSyncResult> {
    const startTime = Date.now();

    logger.info('catalog.sync.platform.started', {
      platformId: platform.entry.id,
      platformName: platform.entry.name,
    });

    const query = this.buildSyncQuery(platform);

    const discoveryResult = await this.discoveryEngine.discover({
      query,
      limit: MAX_SYNC_LIMIT,
    });

    const platformFiltered = this.filterByPlatform(discoveryResult.groups, platform.entry.name);

    let newGames = 0;
    let existingGames = 0;
    let updatedGames = 0;
    let rejected = 0;
    let errors = 0;

    for (const group of platformFiltered) {
      try {
        const result = await this.processGroup(group, dryRun);

        switch (result) {
          case 'new':
            newGames++;
            break;
          case 'existing':
            existingGames++;
            break;
          case 'updated':
            updatedGames++;
            break;
          case 'rejected':
            rejected++;
            break;
        }
      } catch (error) {
        logger.warn('catalog.sync.group.failed', {
          groupId: group.groupId,
          error: error instanceof Error ? error.message : String(error),
        });
        errors++;
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info('catalog.sync.platform.completed', {
      platformId: platform.entry.id,
      platformName: platform.entry.name,
      candidatesFound: platformFiltered.length,
      newGames,
      existingGames,
      updatedGames,
      rejected,
      errors,
      durationMs,
    });

    return {
      platformId: platform.entry.id,
      platformName: platform.entry.name,
      candidatesFound: platformFiltered.length,
      newGames,
      existingGames,
      updatedGames,
      rejected,
      errors,
      status: 'completed',
    };
  }

  private buildSyncQuery(platform: ResolvedPlatform): string {
    const parts: string[] = [platform.entry.name, 'games'];

    if (platform.queryYear) {
      parts.push(String(platform.queryYear));
    }

    return parts.join(' ');
  }

  private filterByPlatform(
    groups: readonly DiscoveryGroupResult[],
    platformName: string,
  ): readonly DiscoveryGroupResult[] {
    const normalizedPlatform = platformName.toLowerCase();

    return groups.filter((group) => {
      const hasPlatformMatch = group.observations.some((obs) => {
        const candidate = obs.candidate;

        for (const release of candidate.releases) {
          if (release.platform.name.toLowerCase().includes(normalizedPlatform)) {
            return true;
          }
        }

        const candidatePlatforms = candidate.titles.map((t) => t.value.toLowerCase());
        if (candidatePlatforms.some((t) => t.includes(normalizedPlatform))) {
          return true;
        }

        const description = candidate.description?.toLowerCase() ?? '';
        if (description.includes(normalizedPlatform)) {
          return true;
        }

        return false;
      });

      return hasPlatformMatch;
    });
  }

  private async processGroup(
    group: DiscoveryGroupResult,
    dryRun: boolean,
  ): Promise<'new' | 'existing' | 'updated' | 'rejected'> {
    const classification = group.mergedClassification.category;

    if (classification !== 'GAME') {
      return 'rejected';
    }

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
        if (dryRun) {
          return 'existing';
        }

        if (this.enrichmentService) {
          const result = await this.enrichmentService.enrich(existing, group.observations);
          const hasChanges = result.changes.length > 0;
          return hasChanges ? 'updated' : 'existing';
        }

        return 'existing';
      }
    }

    if (dryRun) {
      return 'new';
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
      await this.enrichmentService.enrich(newGame, group.observations);
    }

    return 'new';
  }

  private aggregateTotals(results: readonly PlatformSyncResult[]): SyncTotals {
    return results.reduce(
      (acc, r) => ({
        candidatesFound: acc.candidatesFound + r.candidatesFound,
        newGames: acc.newGames + r.newGames,
        existingGames: acc.existingGames + r.existingGames,
        updatedGames: acc.updatedGames + r.updatedGames,
        rejected: acc.rejected + r.rejected,
        errors: acc.errors + r.errors,
      }),
      this.emptyTotals(),
    );
  }

  private emptyTotals(): SyncTotals {
    return {
      candidatesFound: 0,
      newGames: 0,
      existingGames: 0,
      updatedGames: 0,
      rejected: 0,
      errors: 0,
    };
  }
}
