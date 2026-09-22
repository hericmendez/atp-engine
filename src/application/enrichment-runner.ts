import type { Game } from '../domain/game/game.js';
import type { GameRepository } from '../domain/game/game-repository.js';
import type { SourceRegistry } from '../sources/source-registry.js';
import type { DiscoverySourceObservation } from '../discovery/discovery-types.js';
import { enrichGame } from '../enrichment/enrichment-engine.js';
import { normalizeCandidate } from '../normalization/normalize.js';
import { DeterministicClassifier } from '../classification/deterministic-classifier.js';
import { gameWithLastEnrichedAt } from '../domain/game/game.js';
import { createGameId } from '../domain/shared/ids.js';
import { logger } from '../infrastructure/logger/logger.js';
import {
  ENRICHMENT_CHECKPOINT_KEY,
  type EnrichmentCheckpointStatus,
} from './enrichment-checkpoint-types.js';
import type { EnrichmentCheckpointRepository } from './enrichment-checkpoint-repository.js';

export interface MassRunResult {
  readonly status: Extract<EnrichmentCheckpointStatus, 'COMPLETED' | 'RUNNING'>;
  readonly processed: number;
  readonly enriched: number;
  readonly skipped: number;
  readonly failed: number;
  readonly batches: number;
  readonly cursor: string;
  readonly dryRun: boolean;
  readonly durationMs: number;
}

export interface EnrichmentRunnerDependencies {
  gameRepository: GameRepository;
  sourceRegistry: SourceRegistry;
}

export interface EnrichmentRunnerOptions {
  readonly batchSize: number;
  readonly concurrency: number;
  readonly itemTimeoutMs: number;
  readonly cooldownMs: number;
  /**
   * Explicit canonical IDs to enrich (CLI --ids). Bypasses the
   * completeness filter for deterministic MVP control, but never the
   * identity guards: missing games are skipped, games without external
   * identifiers are skipped, and atp-unknown-* are always excluded.
   */
  readonly ids?: readonly string[];
  /**
   * Compute-only mode (CLI --dry-run): runs selection, provider fetch,
   * and enrichGame accounting without any repository writes.
   */
  readonly dryRun?: boolean;
  /**
   * Company-need selection (CLI --needs-companies): developers.length
   * === 0 OR publishers.length === 0, resolved Mongo-side with the
   * IGDB-identity and atp-unknown guards baked into the query. An
   * additional strategy alongside --ids and the default completeness
   * filter — never a replacement.
   */
  readonly needsCompanies?: boolean;
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

    const items = await this.processBatch(candidates, this.options.dryRun ?? false);
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

  /**
   * Bounded needs-companies sweep with a persistent cursor checkpoint.
   *
   * Each batch re-queries the live need-set (`domainId > cursor`, ASC)
   * and persists the checkpoint only after the whole batch is
   * attempted — a crash reprocesses at most one batch, and items are
   * idempotent. Per-item failures are counted and passed over (never
   * abort the sweep); they stay needy and reprocessable via --ids.
   * A scope that exhausts its selection persists COMPLETED; hitting
   * `limit` persists RUNNING. Dry runs advance an in-memory cursor
   * only: zero game writes, zero checkpoint writes.
   */
  async runNeedsCompaniesMass(
    checkpoints: EnrichmentCheckpointRepository | undefined,
    options: {
      batchSize: number;
      limit?: number;
      dryRun?: boolean;
      restart?: boolean;
      delayMs?: number;
    },
  ): Promise<MassRunResult> {
    const startTime = Date.now();
    const dryRun = options.dryRun ?? false;
    const delayMs = options.delayMs ?? 0;
    const limit = options.limit;
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
      throw new Error(
        `runNeedsCompaniesMass: batchSize must be a positive integer (got ${options.batchSize})`,
      );
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error(`runNeedsCompaniesMass: limit must be a positive integer (got ${limit})`);
    }

    const stored = checkpoints ? await checkpoints.load(ENRICHMENT_CHECKPOINT_KEY) : undefined;
    if (stored && stored.status === 'COMPLETED' && !options.restart) {
      logger.info('enrichment.checkpoint.already_completed', { key: stored.key });
      return {
        status: 'COMPLETED',
        processed: 0,
        enriched: 0,
        skipped: 0,
        failed: 0,
        batches: 0,
        cursor: stored.cursor,
        dryRun,
        durationMs: Date.now() - startTime,
      };
    }

    let cursor = options.restart ? '' : (stored?.cursor ?? '');
    let processed = 0;
    let enriched = 0;
    let skipped = 0;
    let failed = 0;
    let batches = 0;
    let exhausted = false;

    const persist = async (
      status: 'RUNNING' | 'COMPLETED' | 'FAILED',
      error?: string,
    ): Promise<void> => {
      if (!checkpoints || dryRun) return;
      await checkpoints.save({
        key: ENRICHMENT_CHECKPOINT_KEY,
        mode: 'needs-companies',
        cursor,
        status,
        processed,
        enriched,
        failed,
        error,
      });
    };

    try {
      for (;;) {
        if (limit !== undefined && processed >= limit) break;
        const fetchSize =
          limit === undefined ? options.batchSize : Math.min(options.batchSize, limit - processed);
        const page = await this.gameRepository.findMany({
          needsCompanies: true,
          afterDomainId: cursor === '' ? undefined : cursor,
          sort: { field: 'domainId', direction: 'asc' },
          limit: fetchSize,
        });
        if (page.items.length === 0) {
          exhausted = true;
          break;
        }

        const items = await this.processBatch([...page.items], dryRun);
        processed += items.length;
        enriched += items.filter((i) => i.success && i.changesCount > 0).length;
        skipped += items.filter((i) => i.success && i.changesCount === 0).length;
        failed += items.filter((i) => !i.success).length;
        // Whole batch attempted (successes and isolated failures alike):
        // only now may the cursor advance past it.
        cursor = page.items[page.items.length - 1].id;
        batches += 1;
        await persist('RUNNING');
        logger.info('enrichment.checkpoint.advanced', { cursor, processed });

        if (delayMs > 0) {
          const more = limit === undefined || processed < limit;
          if (more) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    } catch (error) {
      // A page that fails pins the checkpoint at the last fully
      // attempted batch and rethrows — no silent advance, no retry.
      try {
        await persist(
          'FAILED',
          error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        );
      } catch (persistError) {
        logger.warn('enrichment.checkpoint.persist_failed', {
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
      }
      throw error;
    }

    // Exhausted selection => COMPLETED. A limit stop stays RUNNING
    // (resumable) even if the boundary coincides with exhaustion — the
    // next invocation confirms COMPLETED with zero batches. Never claim
    // COMPLETED prematurely.
    const status = exhausted ? 'COMPLETED' : 'RUNNING';
    await persist(status);
    return {
      status,
      processed,
      enriched,
      skipped,
      failed,
      batches,
      cursor,
      dryRun,
      durationMs: Date.now() - startTime,
    };
  }

  private async selectCandidates(): Promise<Game[]> {
    if (this.options.ids !== undefined) {
      return this.selectExplicitCandidates(this.options.ids);
    }
    const cooldownDate = new Date(Date.now() - this.options.cooldownMs);

    const result = await this.gameRepository.findMany({
      completeness: this.options.needsCompanies === true ? undefined : 'FOUND_PARTIAL',
      needsCompanies: this.options.needsCompanies,
      sort: { field: 'updatedAt', direction: 'asc' },
      limit: this.options.batchSize,
    });

    const candidates = result.items.filter(
      (game) =>
        game.externalIdentifiers.length > 0 &&
        !game.id.startsWith('atp-unknown-') &&
        (game.lastEnrichedAt === null || game.lastEnrichedAt < cooldownDate),
    );

    return candidates;
  }

  private async selectExplicitCandidates(ids: readonly string[]): Promise<Game[]> {
    const candidates: Game[] = [];
    for (const id of ids.slice(0, this.options.batchSize)) {
      const game = await this.gameRepository.findById(createGameId(id));
      if (!game) {
        logger.info('EnrichmentRunner: explicit id not found, skipping', { id });
        continue;
      }
      if (game.externalIdentifiers.length === 0 || game.id.startsWith('atp-unknown-')) {
        logger.info('EnrichmentRunner: explicit id has no stable identity, skipping', {
          id,
        });
        continue;
      }
      candidates.push(game);
    }
    return candidates;
  }

  private async processBatch(candidates: Game[], dryRun: boolean): Promise<EnrichmentItemResult[]> {
    const results: EnrichmentItemResult[] = [];
    const chunks = this.chunk(candidates, this.options.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map((game) => this.processItem(game, dryRun)),
      );

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

  private async processItem(game: Game, dryRun: boolean): Promise<EnrichmentItemResult> {
    const title = game.titles[0]?.value ?? 'Untitled';
    const completenessBefore = game.completeness;
    const sourcesQueried: string[] = [];

    try {
      const observations = await this.fetchObservations(game, sourcesQueried);

      if (observations.length === 0) {
        const enriched = gameWithLastEnrichedAt(game, new Date());
        if (!dryRun) {
          await this.gameRepository.update(enriched);
        }

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
      if (!dryRun) {
        await this.gameRepository.update(enrichedGame);
      }

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
