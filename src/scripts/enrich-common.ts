import { loadConfig } from '../infrastructure/config/config.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/persistence/mongodb/connection.js';
import { MongoGameRepository } from '../infrastructure/persistence/mongodb/mongo-game-repository.js';
import { MongoEnrichmentJobRepository } from '../infrastructure/persistence/mongodb/mongo-enrichment-job-repository.js';
import { SourceRegistry } from '../sources/source-registry.js';
import { IgdbAdapter } from '../sources/igdb/igdb-adapter.js';
import { WikipediaAdapter } from '../sources/wikipedia/wikipedia-adapter.js';
import { SteamAdapter } from '../sources/steam/steam-adapter.js';
import { WikipediaCoverDiscovery } from '../sources/wikipedia/cover/wikipedia-cover-discovery.js';
import { CoverEngine } from '../cover/cover-engine.js';
import { CoverService } from '../application/cover-service.js';
import { CoverEnrichmentRunner } from '../application/cover-enrichment-runner.js';
import { TokenBucketRateLimiter } from '../infrastructure/rate-limiter.js';
import { GameModel } from '../infrastructure/persistence/mongodb/game-schema.js';
import type { EnrichmentJob } from '../domain/enrichment-job/enrichment-job.js';

export const SUPPORTED_TYPES = ['cover', 'description'] as const;
export type SupportedType = (typeof SUPPORTED_TYPES)[number];

export interface EnrichStartArgs {
  type: SupportedType;
  limit?: number;
  batchSize: number;
  delayMs: number;
  requestsPerSecond: number;
  dryRun: boolean;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DELAY_MS = 300;
const DEFAULT_RPS = 4;

function getFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 || i + 1 >= argv.length ? undefined : argv[i + 1];
}
function hasFlag(argv: string[], flag: string): boolean { return argv.includes(flag); }

export function parseEnrichStartArgs(argv: string[]): EnrichStartArgs {
  const typeRaw = getFlag(argv, '--type');
  if (!typeRaw) throw new Error('enrich:start requires --type <cover> (only cover supported in this phase)');
  if (!SUPPORTED_TYPES.includes(typeRaw as SupportedType)) throw new Error(`enrich:start --type must be one of ${SUPPORTED_TYPES.join(',')} (got ${typeRaw})`);
  const type = typeRaw as SupportedType;
  const limitRaw = getFlag(argv, '--limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error(`enrich:start requires --limit <positive> (got ${limitRaw})`);
  const intFlag = (flag: string, def: number, min: number, max?: number): number => {
    const raw = getFlag(argv, flag);
    const v = raw === undefined ? def : Number(raw);
    if (!Number.isInteger(v) || v < min || (max !== undefined && v > max)) throw new Error(`enrich:start requires ${flag} <${min}..${max ?? '∞'}> (got ${raw ?? 'missing'})`);
    return v;
  };
  return {
    type,
    limit,
    batchSize: intFlag('--batch-size', DEFAULT_BATCH_SIZE, 1, 100),
    delayMs: intFlag('--delay-ms', DEFAULT_DELAY_MS, 0),
    requestsPerSecond: intFlag('--requests-per-second', DEFAULT_RPS, 1, 100),
    dryRun: hasFlag(argv, '--dry-run'),
  };
}

export function parseIdArg(argv: string[]): string | undefined {
  const fromFlag = getFlag(argv, '--id');
  if (fromFlag) return fromFlag;
  // also allow bare arg as id
  const bare = argv.find((a) => !a.startsWith('--'));
  return bare;
}

export function formatLeaseRemaining(job: EnrichmentJob): string {
  if (!job.leaseExpiresAt || !job.ownerId) return 'none';
  const remaining = job.leaseExpiresAt.getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  return `${Math.ceil(remaining / 1000)}s`;
}

export function formatJob(job: EnrichmentJob): string {
  const pct = job.totalEstimate ? ((job.processed / job.totalEstimate) * 100).toFixed(1) : 'n/a';
  const lines = [
    `Job ID:          ${job.id}`,
    `Type:            ${job.type}`,
    `Mode:            ${job.mode}`,
    `Status:          ${job.status}`,
    ``,
    `Processed:       ${job.processed}`,
    `Succeeded:       ${job.succeeded}`,
    `Found:           ${job.found}`,
    `Persisted:       ${job.persisted}`,
    `Unchanged:       ${job.unchanged}`,
    `Failed:          ${job.failed}`,
    ``,
    `Total estimate:  ${job.totalEstimate ?? 'n/a'}`,
    `Progress:        ${pct}%`,
    `Cursor:          ${job.cursor || '(start)'}`,
    ``,
    `Owner:           ${job.ownerId ?? 'none'}`,
    `Lease remaining: ${formatLeaseRemaining(job)}`,
    `Last heartbeat:  ${job.lastHeartbeatAt?.toISOString() ?? 'none'}`,
    `Last activity:   ${job.lastActivityAt.toISOString()}`,
    ``,
    `Batch size:      ${job.batchSize}`,
    `Started:         ${job.startedAt?.toISOString() ?? 'n/a'}`,
    `Paused:          ${job.pausedAt?.toISOString() ?? 'n/a'}`,
    `Completed:       ${job.completedAt?.toISOString() ?? 'n/a'}`,
    `Error:           ${job.error ?? 'none'}`,
  ];
  return lines.join('\n');
}

export function formatJobList(jobs: EnrichmentJob[]): string {
  if (jobs.length === 0) return 'No enrichment jobs found.';
  const header = 'ID                            Type   Status     Progress              Updated';
  const rows = jobs.map((j) => {
    const prog = j.totalEstimate ? `${j.processed}/${j.totalEstimate}` : `${j.processed}`;
    const updated = j.updatedAt.toISOString().slice(0, 19).replace('T', ' ');
    return `${j.id.padEnd(28)} ${j.type.padEnd(6)} ${j.status.padEnd(10)} ${prog.padEnd(18)} ${updated}`;
  });
  return ['Latest enrichment jobs:', header, ...rows].join('\n');
}

export async function ensureCoverageInfo(): Promise<{ withCover: number; candidates: number }> {
  const withCover = await GameModel.countDocuments({ cover: { $ne: null } });
  const candidates = await GameModel.countDocuments({
    cover: null,
    externalIdentifiers: { $elemMatch: { source: 'igdb' } },
    domainId: { $not: /^atp-unknown-/ },
  });
  return { withCover, candidates };
}

export function createCoverRunner(rateLimiter: TokenBucketRateLimiter) {
  const registry = new SourceRegistry();
  registry.register(new WikipediaAdapter({ source: 'wikipedia', baseUrl: 'https://en.wikipedia.org/w/api.php' }));
  registry.register(new SteamAdapter({ source: 'steam', baseUrl: 'https://store.steampowered.com/api' }));
  const config = loadConfig();
  if (!config.IGDB_CLIENT_ID || !config.IGDB_CLIENT_SECRET) throw new Error('enrich:start/resume requires IGDB_CLIENT_ID/SECRET');
  registry.register(new IgdbAdapter({ source: 'igdb', clientId: config.IGDB_CLIENT_ID, clientSecret: config.IGDB_CLIENT_SECRET, rateLimiter }));
  const coverEngine = new CoverEngine({ sourceRegistry: registry, wikipediaCoverDiscovery: new WikipediaCoverDiscovery() });
  const coverService = new CoverService({ gameRepository: new MongoGameRepository(), coverEngine });
  const jobRepository = new MongoEnrichmentJobRepository();
  const runner = new CoverEnrichmentRunner(new MongoGameRepository(), coverService, jobRepository);
  return { runner, jobRepository, rateLimiter, registry };
}

export async function connectAndLog(): Promise<void> {
  await connectDatabase();
}

export async function disconnectAndExit(code: number): Promise<never> {
  try { await disconnectDatabase(); } catch { /* ignore */ }
  process.exit(code);
}

export function printUsage(): void {
  console.log([
    'Usage:',
    '  pnpm enrich:start --type cover --limit <n> [--batch-size 50] [--delay-ms 300] [--requests-per-second 4] [--dry-run]',
    '  pnpm enrich:status [--id <jobId>] [--type cover]',
    '  pnpm enrich:pause --id <jobId>',
    '  pnpm enrich:resume --id <jobId> [--limit <n>] [--batch-size <n>]',
    '  pnpm cover:enrich --limit <n> (legacy compatibility)',
  ].join('\n'));
}
