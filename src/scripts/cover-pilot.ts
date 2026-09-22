// Must stay first import: loads .env like src/server.ts
import 'dotenv/config';

import { loadConfig } from '../infrastructure/config/config.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infrastructure/persistence/mongodb/connection.js';
import { MongoGameRepository } from '../infrastructure/persistence/mongodb/mongo-game-repository.js';
import { SourceRegistry } from '../sources/source-registry.js';
import { IgdbAdapter } from '../sources/igdb/igdb-adapter.js';
import { WikipediaAdapter } from '../sources/wikipedia/wikipedia-adapter.js';
import { SteamAdapter } from '../sources/steam/steam-adapter.js';
import { WikipediaCoverDiscovery } from '../sources/wikipedia/cover/wikipedia-cover-discovery.js';
import { CoverEngine } from '../cover/cover-engine.js';
import { CoverService } from '../application/cover-service.js';
import { TokenBucketRateLimiter } from '../infrastructure/rate-limiter.js';
import { GameModel } from '../infrastructure/persistence/mongodb/game-schema.js';

/**
 * Cover pilot — 500 games, cover-only, sequential, rate-limited via IGDB adapter.
 * No checkpoint (explicitly out of scope for this pilot); rerun re-selects remaining cover:null.
 * Selection is Mongo-side: cover:null + igdb extId + not atp-unknown-*, sorted domainId ASC.
 */

export interface CoverPilotOptions {
  limit: number;
  batchSize: number;
  dryRun: boolean;
  delayMs: number;
  requestsPerSecond: number;
}

const DEFAULT_LIMIT = 500;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DELAY_MS = 300;
const DEFAULT_RPS = 4;

export function parseCoverPilotArgs(argv: string[]): CoverPilotOptions {
  const get = (f: string) => {
    const i = argv.indexOf(f);
    return i === -1 || i + 1 >= argv.length ? undefined : argv[i + 1];
  };
  const has = (f: string) => argv.includes(f);
  const limitRaw = get('--limit');
  const limit = limitRaw === undefined ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`cover-pilot requires --limit <positive> (got ${limitRaw ?? 'missing'})`);
  const intFlag = (f: string, d: number, min: number, max?: number) => {
    const raw = get(f);
    const v = raw === undefined ? d : Number(raw);
    if (!Number.isInteger(v) || v < min || (max !== undefined && v > max)) throw new Error(`cover-pilot requires ${f} <${min}..${max ?? '∞'}> (got ${raw ?? 'missing'})`);
    return v;
  };
  return {
    limit,
    batchSize: intFlag('--batch-size', DEFAULT_BATCH_SIZE, 1, 100),
    dryRun: has('--dry-run'),
    delayMs: intFlag('--delay-ms', DEFAULT_DELAY_MS, 0),
    requestsPerSecond: intFlag('--requests-per-second', DEFAULT_RPS, 1, 100),
  };
}

async function selectPilotIds(limit: number): Promise<string[]> {
  const docs = await GameModel.find(
    { cover: null, externalIdentifiers: { $elemMatch: { source: 'igdb' } }, domainId: { $not: /^atp-unknown-/ } },
    { domainId: 1 },
  )
    .sort({ domainId: 1 })
    .limit(limit)
    .lean();
  return docs.map((d) => (d as { domainId: string }).domainId);
}

async function main(): Promise<void> {
  const opts = parseCoverPilotArgs(process.argv.slice(2));
  const config = loadConfig();
  if (!config.IGDB_CLIENT_ID || !config.IGDB_CLIENT_SECRET) throw new Error('cover-pilot requires IGDB_CLIENT_ID/SECRET');

  // Pre-flight: count
  await connectDatabase();
  const beforeWith = await GameModel.countDocuments({ cover: { $ne: null } });
  const beforeWithout = await GameModel.countDocuments({ cover: null });
  const beforeCandidates = await GameModel.countDocuments({
    cover: null,
    externalIdentifiers: { $elemMatch: { source: 'igdb' } },
    domainId: { $not: /^atp-unknown-/ },
  });
  const ids = await selectPilotIds(opts.limit);

  if (opts.dryRun) {
    console.log(`[dry-run] games=${beforeWith + beforeWithout} withCover=${beforeWith} withoutCover=${beforeWithout} candidates=${beforeCandidates} selected=${ids.length} (cover:null + igdb, domainId ASC)`);
    console.log(`sample: ${ids.slice(0, 5).join(', ')}`);
    await disconnectDatabase();
    process.exit(0);
    return;
  }

  // Snapshots for cover-only check (first 5 ids)
  const snapBefore = new Map<string, string>();
  for (const id of ids.slice(0, 5)) {
    const doc = await GameModel.findOne({ domainId: id }).lean();
    if (doc) snapBefore.set(id, JSON.stringify({ domainId: (doc as { domainId: string }).domainId, gameType: (doc as { gameType: string }).gameType, titles: (doc as { titles: { value: string }[] }).titles?.[0]?.value }));
  }

  const registry = new SourceRegistry();
  registry.register(new WikipediaAdapter({ source: 'wikipedia', baseUrl: 'https://en.wikipedia.org/w/api.php' }));
  registry.register(new SteamAdapter({ source: 'steam', baseUrl: 'https://store.steampowered.com/api' }));
  const rateLimiter = new TokenBucketRateLimiter(opts.requestsPerSecond);
  registry.register(
    new IgdbAdapter({
      source: 'igdb',
      clientId: config.IGDB_CLIENT_ID,
      clientSecret: config.IGDB_CLIENT_SECRET,
      rateLimiter,
    }),
  );
  const coverEngine = new CoverEngine({ sourceRegistry: registry, wikipediaCoverDiscovery: new WikipediaCoverDiscovery() });
  const coverService = new CoverService({ gameRepository: new MongoGameRepository(), coverEngine });

  let processed = 0;
  let coversFound = 0;
  let failed = 0;
  const start = Date.now();
  let lastLog = start;

  for (const id of ids) {
    try {
      const res = await coverService.getGameCover(id);
      processed += 1;
      if (res.data.selected) coversFound += 1;
      if (res.data.errors.length > 0) {
        // per-source errors are not game failures — just observed
      }
    } catch (err) {
      failed += 1;
      console.log(`  FAIL ${id} err=${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`);
    }
    if (opts.delayMs > 0) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (Date.now() - lastLog > 30000) {
      console.log(`  progress ${processed}/${ids.length} covers=${coversFound} failed=${failed} rps=${(rateLimiter.acquired / ((Date.now() - start) / 1000)).toFixed(2)}`);
      lastLog = Date.now();
    }
  }

  const durationMs = Date.now() - start;
  const afterWith = await GameModel.countDocuments({ cover: { $ne: null } });

  // Cover-only check for sample
  for (const [id, beforeStr] of snapBefore) {
    const after = await GameModel.findOne({ domainId: id }).lean();
    const afterStr = JSON.stringify({ domainId: (after as { domainId: string }).domainId, gameType: (after as { gameType: string }).gameType, titles: (after as { titles: { value: string }[] }).titles?.[0]?.value });
    const beforeObj = JSON.parse(beforeStr);
    const afterObj = JSON.parse(afterStr);
    if (beforeObj.domainId !== afterObj.domainId || beforeObj.gameType !== afterObj.gameType || beforeObj.titles !== afterObj.titles) {
      console.log(`  COVER-ONLY VIOLATION ${id} before=${beforeStr} after=${afterStr}`);
    }
  }

  console.log(`================================`);
  console.log(`COVER PILOT`);
  console.log(`================================`);
  console.log(`Selected: ${ids.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Covers found: ${coversFound}`);
  console.log(`Covers persisted: ${afterWith - beforeWith}`);
  console.log(`Unchanged: ${processed - coversFound - failed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s Games/s: ${(processed / (durationMs / 1000)).toFixed(2)} Requests/s: ${(rateLimiter.acquired / (durationMs / 1000)).toFixed(2)} Requests/game: ${(rateLimiter.acquired / Math.max(1, processed)).toFixed(2)} limit ${opts.requestsPerSecond}/s`);
  console.log(`Coverage before: with=${beforeWith} without=${beforeWithout} candidates=${beforeCandidates}`);
  console.log(`Coverage after: with=${afterWith} without=${beforeWith + beforeWithout - afterWith}`);
  console.log(`================================`);

  await disconnectDatabase();
  process.exit(failed > 0 ? 2 : 0);
}

if (process.argv[1]?.endsWith('cover-pilot.ts')) {
  void main().catch((err) => {
    console.error(`cover-pilot FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
