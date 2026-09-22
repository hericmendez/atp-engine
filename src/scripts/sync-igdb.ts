// Must stay the first import: loads .env into process.env for the
// CLI exactly like src/server.ts does for the HTTP entrypoint.
import 'dotenv/config';

import { loadConfig } from '../infrastructure/config/config.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infrastructure/persistence/mongodb/connection.js';
import { MongoGameRepository } from '../infrastructure/persistence/mongodb/mongo-game-repository.js';
import { MongoPlatformCatalogRepository } from '../infrastructure/persistence/mongodb/mongo-platform-catalog-repository.js';
import { MongoQuarantineRepository } from '../infrastructure/persistence/mongodb/mongo-quarantine-repository.js';
import { MongoCatalogSyncStateRepository } from '../infrastructure/persistence/mongodb/mongo-catalog-sync-state-repository.js';
import { QuarantineService } from '../application/quarantine-service.js';
import { EnrichmentService } from '../application/enrichment-service.js';
import { CatalogSyncService } from '../application/catalog-sync-service.js';
import type { ResumableEnumerationResult } from '../application/catalog-sync-types.js';
import { DeterministicClassifier } from '../classification/deterministic-classifier.js';
import { DeterministicIdentityResolver } from '../identity/deterministic-identity-resolver.js';
import { DiscoveryEngine } from '../discovery/discovery-engine.js';
import { SourceRegistry } from '../sources/source-registry.js';
import { IgdbAdapter } from '../sources/igdb/igdb-adapter.js';
import {
  IGDB_PLATFORM_ALLOWLIST,
  allowlistedPlatformsInSyncOrder,
  findAllowlistedPlatform,
  isAllowedPlatformId,
} from '../sync/igdb-platform-allowlist.js';

/**
 * Bulk IGDB catalog sync CLI.
 *
 * Thin composition over CatalogSyncService — no normalization/
 * eligibility/identity/dedup/persist logic lives here. Single-process,
 * sequential pages; the checkpoint row (source, 'platform', platformId)
 * makes every scope resumable. `--all` derives its position from the
 * stored per-platform checkpoints: COMPLETED scopes are skipped, the
 * first incomplete scope resumes, and a FAILED scope aborts the run
 * (never auto-advanced).
 *
 *   pnpm sync:igdb -- --platform-id 6 --dry-run
 *   pnpm sync:igdb -- --platform Windows --page-size 100 --limit 10
 *   pnpm sync:igdb -- --all --dry-run
 *   pnpm sync:igdb -- --validate-platforms
 *
 * `--limit` caps raw IGDB items enumerated per scope (not canonical
 * games persisted). `--offset` is the starting offset for scopes with
 * no checkpoint row; a stored checkpoint always wins on resume.
 */

export type SyncMode = 'single' | 'all' | 'validate';

export interface SyncCliOptions {
  mode: SyncMode;
  platformId?: number;
  curatedName?: string;
  pageSize: number;
  limit?: number;
  initialOffset?: number;
  dryRun: boolean;
  delayMs: number;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DELAY_MS = 300;
const MAX_PAGE_SIZE = 500;

export function parseSyncArgs(argv: string[]): SyncCliOptions {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1 || index + 1 >= argv.length) return undefined;
    return argv[index + 1];
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const wantsAll = has('--all');
  const wantsValidate = has('--validate-platforms');
  const platformRaw = get('--platform-id');
  const platformName = get('--platform');
  const modes = [
    wantsAll,
    wantsValidate,
    platformRaw !== undefined,
    platformName !== undefined,
  ].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error(
      'sync:igdb requires exactly one of --platform-id <id>, --platform <curated-name>, --all, --validate-platforms',
    );
  }

  const pageSizeRaw = get('--page-size');
  const pageSize = pageSizeRaw === undefined ? DEFAULT_PAGE_SIZE : Number(pageSizeRaw);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(
      `sync:igdb requires --page-size <1..${MAX_PAGE_SIZE}> (got ${pageSizeRaw ?? 'missing'})`,
    );
  }

  const limitRaw = get('--limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`sync:igdb requires --limit <positive integer> (got ${limitRaw})`);
  }

  const offsetRaw = get('--offset');
  const initialOffset = offsetRaw === undefined ? undefined : Number(offsetRaw);
  if (initialOffset !== undefined && (!Number.isInteger(initialOffset) || initialOffset < 0)) {
    throw new Error(`sync:igdb requires --offset <non-negative integer> (got ${offsetRaw})`);
  }
  if (wantsValidate && (offsetRaw !== undefined || limitRaw !== undefined)) {
    throw new Error('sync:igdb --validate-platforms takes no --offset/--limit (read-only sweep)');
  }

  const delayRaw = get('--delay-ms');
  const delayMs = delayRaw === undefined ? DEFAULT_DELAY_MS : Number(delayRaw);
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error(`sync:igdb requires --delay-ms <non-negative integer> (got ${delayRaw})`);
  }

  if (wantsValidate) {
    return { mode: 'validate', pageSize, dryRun: true, delayMs };
  }
  if (wantsAll) {
    return { mode: 'all', pageSize, limit, initialOffset, dryRun: has('--dry-run'), delayMs };
  }
  if (platformRaw !== undefined) {
    const platformId = Number(platformRaw);
    if (!Number.isInteger(platformId) || platformId < 1) {
      throw new Error(
        `sync:igdb requires --platform-id <positive IGDB platform id> (got ${platformRaw})`,
      );
    }
    return {
      mode: 'single',
      platformId,
      pageSize,
      limit,
      initialOffset,
      dryRun: has('--dry-run'),
      delayMs,
    };
  }
  return {
    mode: 'single',
    curatedName: platformName as string,
    pageSize,
    limit,
    initialOffset,
    dryRun: has('--dry-run'),
    delayMs,
  };
}

/**
 * Resolve the requested scope to an IGDB platform ID, enforcing the
 * allowlist. Anything without a verified ID fails closed.
 */
export function resolveScopePlatform(options: SyncCliOptions): { igdbId: number; label: string } {
  if (options.platformId !== undefined) {
    if (!isAllowedPlatformId(options.platformId)) {
      throw new Error(
        `PLATFORM_NOT_ALLOWED: IGDB platform ${options.platformId} is not in the curated sync allowlist`,
      );
    }
    const entry = IGDB_PLATFORM_ALLOWLIST.find((p) => p.igdbId === options.platformId);
    return { igdbId: options.platformId, label: entry?.curatedName ?? String(options.platformId) };
  }
  const entry = findAllowlistedPlatform(options.curatedName ?? '');
  if (!entry) {
    throw new Error(
      `PLATFORM_NOT_ALLOWED: "${options.curatedName}" is not a curated sync platform`,
    );
  }
  if (entry.igdbId === null) {
    throw new Error(
      `PLATFORM_NOT_ALLOWED: curated platform "${entry.curatedName}" has status ${entry.status} (no verified IGDB ID)`,
    );
  }
  return { igdbId: entry.igdbId, label: entry.curatedName };
}

export interface SyncGraph {
  service: CatalogSyncService;
  source: IgdbAdapter;
  states: MongoCatalogSyncStateRepository;
}

export function buildSyncGraph(clientId: string, clientSecret: string): SyncGraph {
  const gameRepository = new MongoGameRepository();
  const source = new IgdbAdapter({ source: 'igdb', clientId, clientSecret });
  const service = new CatalogSyncService({
    gameRepository,
    platformCatalogRepository: new MongoPlatformCatalogRepository(),
    discoveryEngine: new DiscoveryEngine(
      new SourceRegistry(),
      new DeterministicClassifier(),
      new DeterministicIdentityResolver(),
    ),
    enrichmentService: new EnrichmentService({ gameRepository }),
    quarantineService: new QuarantineService({
      quarantineRepository: new MongoQuarantineRepository(),
    }),
    classifier: new DeterministicClassifier(),
  });
  return { service, source, states: new MongoCatalogSyncStateRepository() };
}

export function requireIgdbCredentials(): { clientId: string; clientSecret: string } {
  const config = loadConfig();
  if (!config.IGDB_CLIENT_ID || !config.IGDB_CLIENT_SECRET) {
    throw new Error('sync:igdb requires IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in the environment');
  }
  return { clientId: config.IGDB_CLIENT_ID, clientSecret: config.IGDB_CLIENT_SECRET };
}

export function formatSyncReport(
  result: ResumableEnumerationResult,
  options: { dryRun: boolean },
): string {
  const status =
    result.errorCount > 0 ? 'PARTIAL' : result.status === 'COMPLETED' ? 'SUCCESS' : result.status;
  const lines = [
    '================================',
    `IGDB CATALOG SYNC${options.dryRun ? ' — DRY RUN' : ''}`,
    '================================',
    '',
    `Platform (IGDB): ${result.platformId}`,
    `Page size:       ${result.pageSize}`,
    `Total in scope:  ${result.totalCount ?? 'unknown'}`,
    `Pages:           ${result.pages}`,
    `Next offset:     ${result.nextOffset}`,
    '',
    `Processed:       ${result.processed}`,
    `Accepted:        ${result.accepted}`,
    `  Created:       ${result.newGames}`,
    `  Updated:       ${result.updatedGames}`,
    `  Unchanged:     ${result.existingGames}`,
    `Quarantined:     ${result.quarantined}`,
    `Errors:          ${result.errorCount}`,
    '',
    `Dry run:         ${result.dryRun}`,
    `Duration:        ${(result.durationMs / 1000).toFixed(1)}s`,
    '',
    `Status:          ${status}`,
    '================================',
  ];
  return lines.join('\n');
}

export interface PlatformValidationRow {
  curatedName: string;
  curatedCount: number;
  igdbId: number | null;
  igdbName: string | null;
  status: string;
  igdbCount: number | null;
  enumerateOk: boolean;
  error: string | null;
}

export async function validateAllowlist(source: IgdbAdapter): Promise<PlatformValidationRow[]> {
  const rows: PlatformValidationRow[] = [];
  for (const entry of IGDB_PLATFORM_ALLOWLIST) {
    if (entry.igdbId === null) {
      rows.push({
        curatedName: entry.curatedName,
        curatedCount: entry.curatedCount,
        igdbId: null,
        igdbName: null,
        status: entry.status,
        igdbCount: null,
        enumerateOk: false,
        error: entry.note ?? 'no verified IGDB ID',
      });
      continue;
    }
    try {
      const info = await source.getPlatformInfo(entry.igdbId);
      if (!info) {
        rows.push({
          curatedName: entry.curatedName,
          curatedCount: entry.curatedCount,
          igdbId: entry.igdbId,
          igdbName: entry.igdbName,
          status: 'ERROR',
          igdbCount: null,
          enumerateOk: false,
          error: `IGDB platform ${entry.igdbId} no longer resolves`,
        });
        continue;
      }
      const count = await source.countByPlatform(entry.igdbId);
      const probe = await source.enumerateByPlatform(entry.igdbId, { limit: 1, offset: 0 });
      rows.push({
        curatedName: entry.curatedName,
        curatedCount: entry.curatedCount,
        igdbId: entry.igdbId,
        igdbName: info.name,
        status: info.name === entry.igdbName ? entry.status : 'NAME_MISMATCH',
        igdbCount: count,
        enumerateOk: probe.items.length >= 0,
        error:
          info.name === entry.igdbName
            ? null
            : `live name "${info.name}" != recorded "${entry.igdbName}"`,
      });
    } catch (error) {
      rows.push({
        curatedName: entry.curatedName,
        curatedCount: entry.curatedCount,
        igdbId: entry.igdbId,
        igdbName: entry.igdbName,
        status: 'ERROR',
        igdbCount: null,
        enumerateOk: false,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`.slice(0, 160)
            : String(error).slice(0, 160),
      });
    }
  }
  return rows;
}

export function formatValidationReport(rows: PlatformValidationRow[]): string {
  const withId = rows.filter((r) => r.igdbId !== null);
  const resolved = withId.filter((r) => r.status === 'RESOLVED' || r.status === 'AMBIGUOUS').length;
  const missing = rows.filter((r) => r.status === 'MISSING').length;
  const ambiguousNoId = rows.filter((r) => r.status === 'AMBIGUOUS' && r.igdbId === null).length;
  const errors = rows.filter((r) => r.status === 'ERROR').length;
  const mismatches = rows.filter((r) => r.status === 'NAME_MISMATCH');
  const blocked = errors > 0 || resolved === 0;
  const lines = [
    '================================',
    'IGDB PLATFORM VALIDATION',
    '================================',
    '',
    `Configured: ${rows.length}`,
    `Resolved:   ${resolved}`,
    `Missing:    ${missing + ambiguousNoId}`,
    `Ambiguous:  ${rows.filter((r) => r.status === 'AMBIGUOUS').length}`,
    `Errors:     ${errors}`,
    '',
    'Name mismatches:',
    ...(mismatches.length === 0
      ? ['  (none)']
      : mismatches.map((r) => `  ${r.curatedName} [${r.igdbId}]: ${r.error}`)),
    '',
    'Counts (curated -> IGDB live, top deltas):',
    ...withId
      .filter((r) => r.igdbCount !== null)
      .map((r) => ({ row: r, delta: Math.abs((r.igdbCount as number) - r.curatedCount) }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 10)
      .map(({ row: r }) => `  ${r.curatedName} [${r.igdbId}]: ${r.curatedCount} -> ${r.igdbCount}`),
    '',
    `Status:     ${blocked ? 'BLOCKED' : 'READY'}`,
    '================================',
  ];
  return lines.join('\n');
}

export interface AllScopeResult {
  label: string;
  igdbId: number;
  skipped: boolean;
  result?: ResumableEnumerationResult;
}

export function formatAllReport(
  scopes: AllScopeResult[],
  options: { dryRun: boolean; limit?: number },
): string {
  const header =
    'PLATFORM | IGDB ID | ENUMERATED | ACCEPTED | CREATED | UPDATED | UNCHANGED | QUARANTINED | ERRORS | DURATION';
  const lines = [
    '================================',
    `IGDB CATALOG SYNC -- ALL${options.dryRun ? ' (DRY RUN)' : ''}${options.limit !== undefined ? ` (limit ${options.limit}/scope)` : ''}`,
    '================================',
    '',
    header,
  ];
  let tEnum = 0;
  let tAcc = 0;
  let tNew = 0;
  let tUpd = 0;
  let tUnc = 0;
  let tQuar = 0;
  let tErr = 0;
  for (const scope of scopes) {
    if (scope.skipped || !scope.result) {
      lines.push(`${scope.label} | ${scope.igdbId} | SKIPPED (checkpoint COMPLETED)`);
      continue;
    }
    const r = scope.result;
    tEnum += r.processed;
    tAcc += r.accepted;
    tNew += r.newGames;
    tUpd += r.updatedGames;
    tUnc += r.existingGames;
    tQuar += r.quarantined;
    tErr += r.errorCount;
    lines.push(
      `${scope.label} | ${r.platformId} | ${r.processed} | ${r.accepted} | ${r.newGames} | ${r.updatedGames} | ${r.existingGames} | ${r.quarantined} | ${r.errorCount} | ${(r.durationMs / 1000).toFixed(1)}s`,
    );
  }
  lines.push(
    '',
    `TOTAL ENUMERATED: ${tEnum}`,
    `TOTAL ACCEPTED:   ${tAcc}`,
    `TOTAL CREATED:    ${tNew}`,
    `TOTAL UPDATED:    ${tUpd}`,
    `TOTAL UNCHANGED:  ${tUnc}`,
    `TOTAL QUARANTINED:${tQuar}`,
    `TOTAL ERRORS:     ${tErr}`,
    '================================',
  );
  return lines.join('\n');
}

async function runSingle(
  graph: SyncGraph,
  igdbId: number,
  options: SyncCliOptions,
): Promise<{ exitCode: number }> {
  const result = await graph.service.ingestEnumerationResumable(
    graph.source,
    igdbId,
    {
      pageSize: options.pageSize,
      dryRun: options.dryRun,
      limit: options.limit,
      delayMs: options.delayMs,
      initialOffset: options.initialOffset,
    },
    graph.states,
  );
   
  console.log(formatSyncReport(result, options));
  return { exitCode: result.errorCount > 0 ? 2 : 0 };
}

async function runAll(graph: SyncGraph, options: SyncCliOptions): Promise<{ exitCode: number }> {
  const scopes: AllScopeResult[] = [];
  let failed = false;
  for (const entry of allowlistedPlatformsInSyncOrder()) {
    const igdbId = entry.igdbId as number;
    const existing = await graph.states.findByScope('igdb', 'platform', String(igdbId));
    if (existing && existing.status === 'COMPLETED') {
      scopes.push({ label: entry.curatedName, igdbId, skipped: true });
      continue;
    }
    try {
      const result = await graph.service.ingestEnumerationResumable(
        graph.source,
        igdbId,
        {
          pageSize: options.pageSize,
          dryRun: options.dryRun,
          limit: options.limit,
          delayMs: options.delayMs,
          initialOffset: options.initialOffset,
        },
        graph.states,
      );
      scopes.push({ label: entry.curatedName, igdbId, skipped: false, result });
      if (result.errorCount > 0) {
        failed = true;
      }
    } catch (error) {
      // A FAILED scope aborts the run: never auto-advance past it.
       
      console.log(formatAllReport(scopes, options));
      throw error;
    }
  }
   
  console.log(formatAllReport(scopes, options));
  return { exitCode: failed ? 2 : 0 };
}

async function main(): Promise<void> {
  const options = parseSyncArgs(process.argv.slice(2));
  const { clientId, clientSecret } = requireIgdbCredentials();

  if (options.mode === 'validate') {
    // Read-only sweep: no database connection is even opened.
    const source = new IgdbAdapter({ source: 'igdb', clientId, clientSecret });
    const rows = await validateAllowlist(source);
     
    console.log(formatValidationReport(rows));
    const blocked = rows.some((r) => r.status === 'ERROR') || !rows.some((r) => r.igdbId !== null);
    process.exit(blocked ? 1 : 0);
    return;
  }

  await connectDatabase();
  let exitCode = 0;
  try {
    const graph = buildSyncGraph(clientId, clientSecret);
    if (options.mode === 'all') {
      exitCode = (await runAll(graph, options)).exitCode;
    } else {
      const { igdbId } = resolveScopePlatform(options);
      exitCode = (await runSingle(graph, igdbId, options)).exitCode;
    }
  } finally {
    await disconnectDatabase();
  }
  process.exit(exitCode);
}

// Only auto-run as a CLI entrypoint, never on import (tests import the
// pure helpers above).
if (process.argv[1]?.endsWith('sync-igdb.ts')) {
  void main().catch((error) => {
     
    console.error(`sync:igdb FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
