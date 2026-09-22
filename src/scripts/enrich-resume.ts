import 'dotenv/config';
import { loadConfig } from '../infrastructure/config/config.js';
import { connectAndLog, disconnectAndExit, parseIdArg, createCoverRunner, ensureCoverageInfo } from './enrich-common.js';
import { TokenBucketRateLimiter } from '../infrastructure/rate-limiter.js';
import { GameModel } from '../infrastructure/persistence/mongodb/game-schema.js';
import { MongoEnrichmentJobRepository } from '../infrastructure/persistence/mongodb/mongo-enrichment-job-repository.js';

function parseResumeArgs(argv: string[]): { id: string; limit?: number; batchSize?: number; delayMs?: number; requestsPerSecond?: number } {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 || i+1 >= argv.length ? undefined : argv[i+1];
  };
  const id = parseIdArg(argv);
  if (!id) throw new Error('enrich:resume requires --id <jobId>');
  const limitRaw = get('--limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error(`--limit <positive> (got ${limitRaw})`);
  const batchRaw = get('--batch-size');
  const batchSize = batchRaw === undefined ? undefined : Number(batchRaw);
  if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)) throw new Error(`--batch-size <1..100> (got ${batchRaw})`);
  const delayRaw = get('--delay-ms');
  const delayMs = delayRaw === undefined ? undefined : Number(delayRaw);
  if (delayMs !== undefined && (!Number.isInteger(delayMs) || delayMs < 0)) throw new Error(`--delay-ms <integer >=0> (got ${delayRaw})`);
  const rpsRaw = get('--requests-per-second');
  const requestsPerSecond = rpsRaw === undefined ? undefined : Number(rpsRaw);
  if (requestsPerSecond !== undefined && (!Number.isInteger(requestsPerSecond) || requestsPerSecond < 1)) throw new Error(`--requests-per-second <integer >=1> (got ${rpsRaw})`);
  return { id, limit, batchSize, delayMs, requestsPerSecond };
}

async function main(): Promise<void> {
  let args: ReturnType<typeof parseResumeArgs>;
  try {
    args = parseResumeArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`enrich:resume ${e instanceof Error ? e.message : String(e)}`);
    console.error('Usage: pnpm enrich:resume --id <jobId> [--limit <n>] [--batch-size <n>]');
    process.exit(2);
    return;
  }

  loadConfig();
  await connectAndLog();
  const repo = new MongoEnrichmentJobRepository();
  const job = await repo.findById(args.id);
  if (!job) {
    console.error(`Job not found: ${args.id}`);
    await disconnectAndExit(1);
    return;
  }
  if (job.status === 'COMPLETED') {
    console.error(`Job ${args.id} is COMPLETED — cannot resume.`);
    console.error(`Create a new job with 'pnpm enrich:start --type ${job.type}' if needed.`);
    await disconnectAndExit(1);
    return;
  }
  if (job.status === 'RUNNING' || job.status === 'PAUSING') {
    // Check if lease is still valid (active)
    if (job.ownerId && job.leaseExpiresAt && job.leaseExpiresAt.getTime() > Date.now()) {
      console.error(`Job ${args.id} is already RUNNING.`);
      console.error(`Owner: ${job.ownerId} Lease expires: ${job.leaseExpiresAt.toISOString()}`);
      console.error(`Wait for completion or pause it first.`);
      await disconnectAndExit(1);
      return;
    }
    // else lease expired or no owner — recoverable, allow resume (will acquire)
    console.log(`Job ${args.id} is RUNNING with expired lease — recoverable, acquiring...`);
  }

  const beforeWith = await GameModel.countDocuments({ cover: { $ne: null } });
  const beforeCandidates = (await ensureCoverageInfo()).candidates;

  const rps = args.requestsPerSecond ?? 4;
  const rateLimiter = new TokenBucketRateLimiter(rps);
  const { runner } = createCoverRunner(rateLimiter);

  // Runner will acquire lease atomically and transition PAUSED/FAILED -> RUNNING
  console.log(`Resuming job ${args.id} type=${job.type} cursor=${job.cursor || '(start)'} processed=${job.processed}`);
  const start = Date.now();
  try {
    const result = await runner.runMass(undefined, {
      batchSize: args.batchSize ?? job.batchSize,
      limit: args.limit,
      jobId: args.id,
      delayMs: args.delayMs ?? 300,
    });
    const afterWith = await GameModel.countDocuments({ cover: { $ne: null } });
    console.log('================================');
    console.log('ENRICHMENT RESUME');
    console.log('================================');
    console.log(`Job ID:          ${result.jobId}`);
    console.log(`Status:          ${result.status}`);
    console.log(`Processed:       ${result.processed}`);
    console.log(`Found:           ${result.found}`);
    console.log(`Persisted:       ${result.persisted}`);
    console.log(`Unchanged:       ${result.unchanged}`);
    console.log(`Failed:          ${result.failed}`);
    console.log(`Batches:         ${result.batches}`);
    console.log(`Cursor:          ${result.cursor || '(start)'}`);
    console.log(`Provider requests: ${rateLimiter.acquired}`);
    console.log(`Duration:        ${((Date.now()-start)/1000).toFixed(1)}s`);
    console.log(`Coverage before: with=${beforeWith} after=${afterWith} delta=${afterWith-beforeWith} candidates=${beforeCandidates}`);
    console.log('================================');
    await disconnectAndExit(result.failed > 0 ? 2 : 0);
  } catch (e) {
    console.error(`Resume failed: ${e instanceof Error ? e.message : String(e)}`);
    await disconnectAndExit(1);
  }
}

if (process.argv[1]?.endsWith('enrich-resume.ts')) {
  void main().catch(async (err)=>{
    console.error(`enrich:resume FAILED: ${err instanceof Error ? err.message : String(err)}`);
    try { const { disconnectDatabase } = await import('../infrastructure/persistence/mongodb/connection.js'); await disconnectDatabase(); } catch {}
    process.exit(1);
  });
}
