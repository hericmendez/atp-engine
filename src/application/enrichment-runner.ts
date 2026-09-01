import type { Game } from '../domain/game/game.js';
import type { GameRepository } from '../domain/game/game-repository.js';
import type { SourceRegistry } from '../sources/source-registry.js';
import type { DiscoverySourceObservation } from '../discovery/discovery-types.js';
import { enrichGame } from '../enrichment/enrichment-engine.js';
import { normalizeCandidate } from '../normalization/normalize.js';
import { DeterministicClassifier } from '../classification/deterministic-classifier.js';
import { gameWithLastEnrichedAt } from '../domain/game/game.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface EnrichmentRunnerDependencies {
  gameRepository: GameRepository;
  sourceRegistry: SourceRegistry;
}

export interface EnrichmentRunnerOptions {
  readonly batchSize: number;
  readonly concurrency: number;
  readonly itemTimeoutMs: number;
  readonly cooldownMs: number;
}

export interface EnrichmentItemResult {
  readonly gameId: string;
  readonly title: string;
  readonly changesCount: number;
  readonly conflictsCount: number;
  readonly completenessBefore: string;
  readonly completenessAfter: string;
  readonly sourcesQueried: readonly string[];
  readonly success: boolean;
  readonly error?: string;
}

export interface EnrichmentRunResult {
  readonly totalCandidates: number;
  readonly processed: number;
  readonly enriched: number;
  readonly skipped: number;
  readonly failed: number;
  readonly durationMs: number;
  readonly items: readonly EnrichmentItemResult[];
}

const DEFAULT_OPTIONS: EnrichmentRunnerOptions = {
  batchSize: 10,
  concurrency: 2,
  itemTimeoutMs: 15_000,
  cooldownMs: 60_000,
};

export class EnrichmentRunner {
  private readonly gameRepository: GameRepository;
  private readonly sourceRegistry: SourceRegistry;
  private readonly options: EnrichmentRunnerOptions;
  private readonly classifier: DeterministicClassifier;

  constructor(deps: EnrichmentRunnerDependencies, options?: Partial<EnrichmentRunnerOptions>) {
    this.gameRepository = deps.gameRepository;
    this.sourceRegistry = deps.sourceRegistry;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.classifier = new DeterministicClassifier();
  }

  async runOnce(): Promise<EnrichmentRunResult> {
    const startTime = Date.now();

    logger.info('EnrichmentRunner: starting run', {
      batchSize: this.options.batchSize,
      concurrency: this.options.concurrency,
    });

    const candidates = await this.selectCandidates();
    const totalCandidates = candidates.length;

    if (totalCandidates === 0) {
      logger.info('EnrichmentRunner: no candidates found', {
        durationMs: Date.now() - startTime,
      });
      return {
        totalCandidates: 0,
        processed: 0,
        enriched: 0,
        skipped: 0,
        failed: 0,
        durationMs: Date.now() - startTime,
        items: [],
      };
    }

    logger.info('EnrichmentRunner: found candidates', {
      totalCandidates,
    });

    const items = await this.processBatch(candidates);
    const enriched = items.filter((i) => i.success && i.changesCount > 0).length;
    const skipped = items.filter((i) => i.success && i.changesCount === 0).length;
    const failed = items.filter((i) => !i.success).length;

    const result: EnrichmentRunResult = {
      totalCandidates,
      processed: items.length,
      enriched,
      skipped,
      failed,
      durationMs: Date.now() - startTime,
      items,
    };

    logger.info('EnrichmentRunner: run completed', {
      totalCandidates,
      processed: items.length,
      enriched,
      skipped,
      failed,
      durationMs: result.durationMs,
    });

    return result;
  }

  private async selectCandidates(): Promise<Game[]> {
    const cooldownDate = new Date(Date.now() - this.options.cooldownMs);

    const result = await this.gameRepository.findMany({
      completeness: 'FOUND_PARTIAL',
      sort: { field: 'updatedAt', direction: 'asc' },
      limit: this.options.batchSize,
    });

    const candidates = result.items.filter(
      (game) =>
        game.externalIdentifiers.length > 0 &&
        (game.lastEnrichedAt === null || game.lastEnrichedAt < cooldownDate),
    );

    return candidates;
  }

  private async processBatch(candidates: Game[]): Promise<EnrichmentItemResult[]> {
    const results: EnrichmentItemResult[] = [];
    const chunks = this.chunk(candidates, this.options.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(chunk.map((game) => this.processItem(game)));

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            gameId: 'unknown',
            title: 'unknown',
            changesCount: 0,
            conflictsCount: 0,
            completenessBefore: 'unknown',
            completenessAfter: 'unknown',
            sourcesQueried: [],
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }

    return results;
  }

  private async processItem(game: Game): Promise<EnrichmentItemResult> {
    const title = game.titles[0]?.value ?? 'Untitled';
    const completenessBefore = game.completeness;
    const sourcesQueried: string[] = [];

    try {
      const observations = await this.fetchObservations(game, sourcesQueried);

      if (observations.length === 0) {
        const enriched = gameWithLastEnrichedAt(game, new Date());
        await this.gameRepository.update(enriched);

        return {
          gameId: game.id,
          title,
          changesCount: 0,
          conflictsCount: 0,
          completenessBefore,
          completenessAfter: completenessBefore,
          sourcesQueried,
          success: true,
        };
      }

      const result = enrichGame(game, observations);

      const enrichedGame = gameWithLastEnrichedAt(result.game, new Date());
      await this.gameRepository.update(enrichedGame);

      return {
        gameId: game.id,
        title,
        changesCount: result.changes.length,
        conflictsCount: result.conflicts.length,
        completenessBefore,
        completenessAfter: result.completeness,
        sourcesQueried,
        success: true,
      };
    } catch (error) {
      logger.error('EnrichmentRunner: failed to process item', {
        gameId: game.id,
        title,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        gameId: game.id,
        title,
        changesCount: 0,
        conflictsCount: 0,
        completenessBefore,
        completenessAfter: completenessBefore,
        sourcesQueried,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchObservations(
    game: Game,
    sourcesQueried: string[],
  ): Promise<readonly DiscoverySourceObservation[]> {
    const observations: DiscoverySourceObservation[] = [];

    for (const extId of game.externalIdentifiers) {
      const adapter = this.sourceRegistry.get(extId.source);
      if (!adapter || !adapter.capabilities.getById) {
        continue;
      }

      sourcesQueried.push(extId.source);

      try {
        const rawCandidate = await Promise.race([
          adapter.getById(extId.id),
          this.timeout(this.options.itemTimeoutMs),
        ]);

        if (!rawCandidate) continue;

        const normalized = normalizeCandidate(rawCandidate, extId.source, extId.id);
        const classification = await this.classifier.classify(normalized);

        observations.push({
          source: extId.source,
          sourceId: extId.id,
          candidate: normalized,
          classification,
          retrievedAt: new Date().toISOString(),
        });
      } catch {
        logger.debug('EnrichmentRunner: source fetch failed', {
          gameId: game.id,
          source: extId.source,
          sourceId: extId.id,
        });
      }
    }

    return observations;
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Source fetch timed out after ${ms}ms`)), ms);
    });
  }

  private chunk<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }
}
