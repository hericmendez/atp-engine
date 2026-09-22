// Must stay first import: loads .env like src/server.ts
import 'dotenv/config';

import { loadConfig } from '../infrastructure/config/config.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infrastructure/persistence/mongodb/connection.js';
import { MongoGameRepository } from '../infrastructure/persistence/mongodb/mongo-game-repository.js';
import { MongoCoverCheckpointRepository } from '../infrastructure/persistence/mongodb/mongo-cover-checkpoint-repository.js';
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

export interface CoverEnrichOptions {
  limit?: number;
  batchSize: number;
  dryRun: boolean;
  resume: boolean;
  restart: boolean;
  delayMs: number;
  requestsPerSecond: number;
}

const DEFAULT_BATCH_SIZE = 50;

export function parseCoverEnrichArgs(argv: string[]): CoverEnrichOptions {
  const get = (f: string) => {
    const i = argv.indexOf(f);
    return i === -1 || i + 1 >= argv.length ? undefined : argv[i + 1];
  };
  const has = (f: string) => argv.includes(f);
  const limitRaw = get('--limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
    throw new Error(`cover:enrich requires --limit <positive> (got ${limitRaw})`);
  const intFlag = (f: string, d: number, min: number, max?: number) => {
    const raw = get(f);
    const v = raw === undefined ? d : Number(raw);
    if (!Number.isInteger(v) || v < min || (max !== undefined && v > max))
      throw new Error(
        `cover:enrich requires ${f} <${min}..${max ?? '∞'}> (got ${raw ?? 'missing'})`,
      );
    return v;
  };
  const resume = has('--resume');
  const restart = has('--restart-checkpoint');
  if (resume && restart)
    throw new Error('cover:enrich --resume and --restart-checkpoint are mutually exclusive');
  return {
    limit,
    batchSize: intFlag('--batch-size', DEFAULT_BATCH_SIZE, 1, 100),
    dryRun: has('--dry-run'),
    resume,
    restart,
    delayMs: intFlag('--delay-ms', 300, 0),
    requestsPerSecond: intFlag('--requests-per-second', 4, 1, 100),
  };
}

async function main(): Promise<void> {
  const opts = parseCoverEnrichArgs(process.argv.slice(2));
  if (opts.limit === undefined && !opts.resume) {
    throw new Error(
      'cover:enrich requires --limit <n> (or --resume to continue previous limit run)',
    );
  }
  const config = loadConfig();
  if (!config.IGDB_CLIENT_ID || !config.IGDB_CLIENT_SECRET)
    throw new Error('cover:enrich requires IGDB_CLIENT_ID/SECRET');

  await connectDatabase();
  const beforeWith = await GameModel.countDocuments({ cover: { $ne: null } });
  const beforeCandidates = await GameModel.countDocuments({
    cover: null,
    externalIdentifiers: { $elemMatch: { source: 'igdb' } },
    domainId: { $not: /^atp-unknown-/ },
  });

  if (opts.dryRun) {
    const docs = await GameModel.find(
      {
        cover: null,
        externalIdentifiers: { $elemMatch: { source: 'igdb' } },
        domainId: { $not: /^atp-unknown-/ },
      },
      { domainId: 1 },
    )
      .sort({ domainId: 1 })
      .limit(opts.limit ?? 10)
      .lean();
    console.log(
      `[dry-run] games with cover=${beforeWith} candidates=${beforeCandidates} selected=${docs.length} (cover:null+igdb, domainId ASC)`,
    );
    console.log(
      `sample: ${docs
        .slice(0, 5)
        .map((d) => (d as { domainId: string }).domainId)
        .join(', ')}`,
    );
    console.log(`checkpoint: not modified (dry-run)`);
    await disconnectDatabase();
    process.exit(0);
    return;
  }

  const registry = new SourceRegistry();
  registry.register(
    new WikipediaAdapter({ source: 'wikipedia', baseUrl: 'https://en.wikipedia.org/w/api.php' }),
  );
  registry.register(
    new SteamAdapter({ source: 'steam', baseUrl: 'https://store.steampowered.com/api' }),
  );
  const rateLimiter = new TokenBucketRateLimiter(opts.requestsPerSecond);
  registry.register(
    new IgdbAdapter({
      source: 'igdb',
      clientId: config.IGDB_CLIENT_ID,
      clientSecret: config.IGDB_CLIENT_SECRET,
      rateLimiter,
    }),
  );
  const coverEngine = new CoverEngine({
    sourceRegistry: registry,
    wikipediaCoverDiscovery: new WikipediaCoverDiscovery(),
  });
  const coverService = new CoverService({ gameRepository: new MongoGameRepository(), coverEngine });
  const jobRepository = new MongoEnrichmentJobRepository();
  const runner = new CoverEnrichmentRunner(new MongoGameRepository(), coverService, jobRepository);
  const checkpoints = new MongoCoverCheckpointRepository();

  // --resume means continue from stored cursor without needing --limit again
  const limit = opts.resume ? undefined : opts.limit;
  const restart = opts.restart || false;

  const start = Date.now();
  const result = await runner.runMass(checkpoints, {
    batchSize: opts.batchSize,
    limit,
    dryRun: false,
    restart,
    delayMs: opts.delayMs,
  });

  const afterWith = await GameModel.countDocuments({ cover: { $ne: null } });
  console.log(`================================`);
  console.log(`COVER ENRICHMENT`);
  console.log(`================================`);
  console.log(`Selected limit: ${opts.limit ?? '(resume, no limit)'}`);
  console.log(`Processed: ${result.processed}`);
  console.log(`Found: ${result.found}`);
  console.log(`Persisted: ${result.persisted}`);
  console.log(`Unchanged: ${result.unchanged}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Batches: ${result.batches}`);
  console.log(
    `Checkpoint: ${result.status} cursor=${result.cursor === '' ? '(start)' : result.cursor}${result.jobId ? ` job=${result.jobId}` : ''}${result.totalEstimate !== undefined && result.totalEstimate !== null ? ` totalEstimate=${result.totalEstimate}` : ''}`,
  );
  console.log(`Provider requests: ${rateLimiter.acquired}`);
  console.log(`Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log(
    `Coverage before: with=${beforeWith} after=${afterWith} delta=${afterWith - beforeWith}`,
  );
  console.log(`================================`);

  await disconnectDatabase();
  process.exit(result.failed > 0 ? 2 : 0);
}

if (process.argv[1]?.endsWith('cover-enrich.ts')) {
  void main().catch((err) => {
    console.error(`cover:enrich FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
