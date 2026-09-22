// Must stay the first import: loads .env into process.env for the
// CLI exactly like src/server.ts does for the HTTP entrypoint.
import 'dotenv/config';

import { loadConfig } from '../infrastructure/config/config.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infrastructure/persistence/mongodb/connection.js';
import { MongoGameRepository } from '../infrastructure/persistence/mongodb/mongo-game-repository.js';
import { EnrichmentRunner } from '../application/enrichment-runner.js';
import type { EnrichmentRunResult } from '../application/enrichment-runner.js';
import { SourceRegistry } from '../sources/source-registry.js';
import { IgdbAdapter } from '../sources/igdb/igdb-adapter.js';
import { TokenBucketRateLimiter } from '../infrastructure/rate-limiter.js';
import { MongoEnrichmentCheckpointRepository } from '../infrastructure/persistence/mongodb/mongo-enrichment-checkpoint-repository.js';

/**
 * Limited IGDB enrichment CLI (MVP validation only).
 *
 * Thin composition over EnrichmentRunner — no merge/persist logic here.
 * Refuses unbounded runs: exactly one of --limit / --ids is required,
 * so mass enrichment can never happen by accident. --dry-run evaluates
 * a single batch with zero repository writes (documented: it cannot
 * loop, because dry runs never advance lastEnrichedAt).
 *
 *   pnpm enrich:igdb -- --ids atp-igdb-1942,atp-igdb-114865 --dry-run
 *   pnpm enrich:igdb -- --limit 10
 *   pnpm enrich:igdb -- --limit 100 --batch-size 25
 */

export interface EnrichCliOptions {
  limit?: number;
  ids?: string[];
  needsCompanies: boolean;
  restartCheckpoint: boolean;
  batchSize: number;
  concurrency: number;
  cooldownMs: number;
  delayMs: number;
  requestsPerSecond: number;
  dryRun: boolean;
}

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_DELAY_MS = 2_000;
/**
 * IGDB allows 4 requests/second per app token (external platform
 * constraint, not invented here). Every getById fans out to up to 3
 * calls (game + involved + companies), so the default keeps a full
 * batch safely under the ceiling even at concurrency 2.
 */
const DEFAULT_REQUESTS_PER_SECOND = 4;

export function parseEnrichArgs(argv: string[]): EnrichCliOptions {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1 || index + 1 >= argv.length) return undefined;
    return argv[index + 1];
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const limitRaw = get('--limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`enrich:igdb requires --limit <positive integer> (got ${limitRaw})`);
  }

  const idsRaw = get('--ids');
  const ids =
    idsRaw === undefined
      ? undefined
      : idsRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
  if (ids !== undefined && ids.length === 0) {
    throw new Error('enrich:igdb requires --ids <comma-separated canonical ids, non-empty>');
  }

  if (limit === undefined && ids === undefined) {
    throw new Error(
      'enrich:igdb refuses unbounded runs: pass --limit <n> or --ids <a,b,c> (mass enrichment is not authorized)',
    );
  }
  const restartCheckpoint = has('--restart-checkpoint');
  if (restartCheckpoint && ids !== undefined) {
    throw new Error(
      'enrich:igdb --restart-checkpoint applies only to --needs-companies sweeps (manual --ids runs never touch the checkpoint)',
    );
  }
  if (restartCheckpoint && !has('--needs-companies')) {
    throw new Error('enrich:igdb --restart-checkpoint requires --needs-companies');
  }

  const intFlag = (flag: string, def: number, min: number, max?: number): number => {
    const raw = get(flag);
    const value = raw === undefined ? def : Number(raw);
    if (!Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
      throw new Error(
        `enrich:igdb requires ${flag} <integer${max !== undefined ? ` ${min}..${max}` : ` >= ${min}`}> (got ${raw ?? 'missing'})`,
      );
    }
    return value;
  };

  return {
    limit,
    ids,
    needsCompanies: has('--needs-companies'),
    batchSize: intFlag('--batch-size', DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE),
    concurrency: intFlag('--concurrency', DEFAULT_CONCURRENCY, 1, 8),
    cooldownMs: intFlag('--cooldown-ms', DEFAULT_COOLDOWN_MS, 0),
    delayMs: intFlag('--delay-ms', DEFAULT_DELAY_MS, 0),
    requestsPerSecond: intFlag('--requests-per-second', DEFAULT_REQUESTS_PER_SECOND, 1, 100),
    dryRun: has('--dry-run'),
    restartCheckpoint,
  };
}

export interface EnrichDependencies {
  runner: Pick<EnrichmentRunner, 'runOnce'>;
  readGame: (id: string) => Promise<{
    developers: string[];
    publishers: string[];
    cover: string | null;
    description: string | null;
  } | null>;
}

export interface BeforeAfter {
  id: string;
  title: string;
  before: { developers: number; publishers: number; cover: boolean };
  after: { developers: number; publishers: number; cover: boolean };
  changes: number;
  sources: string[];
  success: boolean;
}

export async function runEnrichLoop(
  makeRunner: (batchIds: string[] | undefined, batchSize: number) => EnrichDependencies,
  options: EnrichCliOptions,
  onBatch?: (result: EnrichmentRunResult) => void,
): Promise<{ processed: number; enriched: number; skipped: number; failed: number }> {
  let processed = 0;
  let enriched = 0;
  let skipped = 0;
  let failed = 0;
  const remainingIds = options.ids !== undefined ? [...options.ids] : undefined;
  for (;;) {
    const remaining = options.limit === undefined ? undefined : options.limit - processed;
    if (remaining !== undefined && remaining <= 0) break;
    const batchIds =
      remainingIds !== undefined ? remainingIds.splice(0, options.batchSize) : undefined;
    if (batchIds !== undefined && batchIds.length === 0) break;
    const batchSize =
      remaining === undefined ? options.batchSize : Math.min(options.batchSize, remaining);

    const deps = makeRunner(batchIds, batchSize);
    const result = await deps.runner.runOnce();
    onBatch?.(result);
    processed += result.processed;
    enriched += result.enriched;
    skipped += result.skipped;
    failed += result.failed;

    // Dry runs never advance lastEnrichedAt: exactly one batch, by design.
    if (options.dryRun) break;
    if (result.processed === 0) break;
    if (remainingIds !== undefined && remainingIds.length === 0) break;
    if (options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }

  return { processed, enriched, skipped, failed };
}

export function formatEnrichSummary(
  totals: { processed: number; enriched: number; skipped: number; failed: number },
  options: EnrichCliOptions,
  durationMs: number,
  telemetry?: { providerRequests: number; rateLimitRps: number },
): string {
  const status = totals.failed > 0 ? 'PARTIAL' : 'SUCCESS';
  const requests = telemetry?.providerRequests ?? 0;
  const lines = [
    '================================',
    `IGDB ENRICHMENT${options.dryRun ? ' — DRY RUN' : ''}`,
    '================================',
    '',
    `Mode:            ${options.ids !== undefined ? `--ids (${options.ids.length} ids)` : options.needsCompanies ? `--needs-companies --limit ${options.limit}` : `--limit ${options.limit}`}`,
    `Processed:       ${totals.processed}`,
    `Enriched:        ${totals.enriched}`,
    `Unchanged:       ${totals.skipped}`,
    `Failed:          ${totals.failed}`,
    '',
    `Provider requests: ${requests}`,
    `Requests/game:     ${totals.processed > 0 ? (requests / totals.processed).toFixed(2) : '0.00'}`,
    '',
    `Duration:        ${(durationMs / 1000).toFixed(1)}s`,
    `Rate:            ${durationMs > 0 ? ((totals.processed / durationMs) * 1000).toFixed(1) : '0.0'} items/s`,
  ];
  if (telemetry) {
    lines.push(
      `Requests/s:      ${(durationMs > 0 ? (requests / durationMs) * 1000 : 0).toFixed(2)} (limit ${telemetry.rateLimitRps}/s)`,
    );
  }
  lines.push('', `Status:          ${status}`, '================================');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseEnrichArgs(process.argv.slice(2));
  const startTime = Date.now();
  const config = loadConfig();
  if (!config.IGDB_CLIENT_ID || !config.IGDB_CLIENT_SECRET) {
    throw new Error(
      'enrich:igdb requires IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in the environment',
    );
  }

  await connectDatabase();
  let exitCode = 0;
  try {
    const gameRepository = new MongoGameRepository();
    const registry = new SourceRegistry();
    const rateLimiter = new TokenBucketRateLimiter(options.requestsPerSecond);
    const adapter = new IgdbAdapter({
      source: 'igdb',
      clientId: config.IGDB_CLIENT_ID,
      clientSecret: config.IGDB_CLIENT_SECRET,
      rateLimiter,
    });
    registry.register(adapter);

    const snapshot = async (id: string) => {
      const game = await gameRepository.findById(id as never);
      if (!game) return null;
      return {
        developers: game.developers.map((d) => d.name),
        publishers: game.publishers.map((p) => p.name),
        cover: game.cover ? JSON.stringify(game.cover).slice(0, 120) : null,
        description: game.description,
      };
    };

    // Before/after snapshots only in --ids mode (deterministic sample).
    const before = new Map<string, NonNullable<Awaited<ReturnType<typeof snapshot>>>>();
    if (options.ids !== undefined && !options.dryRun) {
      for (const id of options.ids) {
        const snap = await snapshot(id);
        if (snap) before.set(id, snap);
      }
    }

    // Checkpointed mass sweep (needs-companies without explicit ids).
    // Manual --ids runs and plain --limit runs keep the legacy loop and
    // never touch the checkpoint row.
    if (options.needsCompanies && options.ids === undefined) {
      const runner = new EnrichmentRunner(
        { gameRepository, sourceRegistry: registry },
        {
          batchSize: options.batchSize,
          concurrency: options.concurrency,
          itemTimeoutMs: 15_000,
          cooldownMs: options.cooldownMs,
          dryRun: options.dryRun,
        },
      );
      const checkpoints = new MongoEnrichmentCheckpointRepository();
      const mass = await runner.runNeedsCompaniesMass(checkpoints, {
        batchSize: options.batchSize,
        limit: options.limit,
        dryRun: options.dryRun,
        restart: options.restartCheckpoint,
        delayMs: options.delayMs,
      });
      console.log(
        [
          '================================',
          `IGDB ENRICHMENT MASS${options.dryRun ? ' — DRY RUN' : ''}`,
          '================================',
          '',
          `Mode:            --needs-companies${options.limit !== undefined ? ` --limit ${options.limit}` : ''}`,
          `Processed:       ${mass.processed}`,
          `Enriched:        ${mass.enriched}`,
          `Unchanged:       ${mass.skipped}`,
          `Failed:          ${mass.failed}`,
          `Batches:         ${mass.batches}`,
          '',
          `Checkpoint:      ${mass.status} cursor=${mass.cursor === '' ? '(start)' : mass.cursor}`,
          `Provider requests: ${rateLimiter.acquired}`,
          '',
          `Duration:        ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          '',
          `Status:          ${mass.failed > 0 ? 'PARTIAL' : mass.status}`,
          '================================',
        ].join('\n'),
      );
      exitCode = mass.failed > 0 ? 2 : 0;
    } else {
      const totals = await runEnrichLoop(
        (batchIds, batchSize) => ({
          runner: new EnrichmentRunner(
            { gameRepository, sourceRegistry: registry },
            {
              batchSize,
              concurrency: options.concurrency,
              itemTimeoutMs: 15_000,
              cooldownMs: options.cooldownMs,
              ids: batchIds,
              needsCompanies: batchIds === undefined ? options.needsCompanies : undefined,
              dryRun: options.dryRun,
            },
          ),
          readGame: snapshot,
        }),
        options,
        (result) => {
          for (const item of result.items) {
            console.log(
              `  ${item.success ? 'ok' : 'FAIL'} ${item.gameId} changes=${item.changesCount} sources=[${item.sourcesQueried.join(',')}]${item.error ? ` err=${item.error.slice(0, 120)}` : ''}`,
            );
          }
        },
      );

      if (before.size > 0) {
        console.log('--- before/after (ids mode) ---');
        for (const [id, b] of before) {
          const a = await snapshot(id);
          console.log(
            `  ${id} devs ${b.developers.length}->${a?.developers.length ?? '?'} ` +
              `pubs ${b.publishers.length}->${a?.publishers.length ?? '?'} ` +
              `cover ${b.cover ? 'Y' : 'N'}->${a?.cover ? 'Y' : 'N'} ` +
              `descLen ${(b.description ?? '').length}->${(a?.description ?? '').length}`,
          );
        }
      }

      console.log(
        formatEnrichSummary(totals, options, Date.now() - startTime, {
          providerRequests: rateLimiter.acquired,
          rateLimitRps: options.requestsPerSecond,
        }),
      );
      exitCode = totals.failed > 0 ? 2 : 0;
    }
  } finally {
    await disconnectDatabase();
  }
  process.exit(exitCode);
}

// Only auto-run as a CLI entrypoint, never on import (tests import the
// pure helpers above).
if (process.argv[1]?.endsWith('enrich-igdb.ts')) {
  void main().catch((error) => {
    console.error(`enrich:igdb FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
