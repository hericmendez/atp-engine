// Must stay first import: loads .env like src/server.ts
import 'dotenv/config';
import { loadConfig } from '../infrastructure/config/config.js';
import { parseEnrichStartArgs, createCoverRunner, ensureCoverageInfo, connectAndLog, disconnectAndExit } from './enrich-common.js';
import { TokenBucketRateLimiter } from '../infrastructure/rate-limiter.js';
import { GameModel } from '../infrastructure/persistence/mongodb/game-schema.js';

async function main(): Promise<void> {
  let args: ReturnType<typeof parseEnrichStartArgs>;
  try {
    args = parseEnrichStartArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`enrich:start ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
    return;
  }

  // Bootstrap config before any infrastructure that depends on it (Mongo, IGDB, etc.)
  loadConfig();

  await connectAndLog();
  const { withCover, candidates } = await ensureCoverageInfo();

  if (args.dryRun) {
    const docs = await GameModel.find(
      { cover: null, externalIdentifiers: { $elemMatch: { source: 'igdb' } }, domainId: { $not: /^atp-unknown-/ } },
      { domainId: 1 },
    ).sort({ domainId: 1 }).limit(args.limit ?? 10).lean();
    console.log(`[dry-run] type=${args.type} withCover=${withCover} candidates=${candidates} selected=${docs.length} (cover:null+igdb, domainId ASC)`);
    console.log(`sample: ${docs.slice(0,5).map(d=>(d as {domainId:string}).domainId).join(', ')}`);
    console.log('dry-run: no job created, no writes');
    await disconnectAndExit(0);
    return;
  }

  // Prevent duplicate active jobs for cover
  const { runner, jobRepository, rateLimiter } = createCoverRunner(new TokenBucketRateLimiter(args.requestsPerSecond));

  // Check for active/recoverable job
  const latest = await jobRepository.findLatestByType(args.type);
  if (latest && ['RUNNING','PAUSING','PAUSED','PENDING','FAILED'].includes(latest.status)) {
    // RUNNING expired is still recoverable via resume, but we treat as active
    // For FAILED we allow resume via same jobId, not new start
    console.error(`Active job already exists for type=${args.type}:`);
    console.error(`  ID: ${latest.id} Status: ${latest.status} Owner: ${latest.ownerId ?? 'none'} Updated: ${latest.updatedAt.toISOString()}`);
    console.error(`Use 'pnpm enrich:resume --id ${latest.id}' or 'pnpm enrich:status --id ${latest.id}'`);
    console.error(`If you want a fresh job, complete or manually handle the existing one.`);
    await disconnectAndExit(1);
    return;
  }

  const beforeWith = withCover;
  console.log(`[cover] job starting type=${args.type} limit=${args.limit ?? 'none'} batchSize=${args.batchSize} candidates=${candidates} withCover=${withCover}`);
  const start = Date.now();
  const result = await runner.runMass(undefined, {
    batchSize: args.batchSize,
    limit: args.limit,
    dryRun: false,
    delayMs: args.delayMs,
  });

  const afterWith = await GameModel.countDocuments({ cover: { $ne: null } });
  console.log('================================');
  console.log('ENRICHMENT START');
  console.log('================================');
  console.log(`Job ID:          ${result.jobId}`);
  console.log(`Type:            ${args.type}`);
  console.log(`Status:          ${result.status}`);
  console.log(`Processed:       ${result.processed}`);
  console.log(`Found:           ${result.found}`);
  console.log(`Persisted:       ${result.persisted}`);
  console.log(`Unchanged:       ${result.unchanged}`);
  console.log(`Failed:          ${result.failed}`);
  console.log(`Batches:         ${result.batches}`);
  console.log(`Cursor:          ${result.cursor || '(start)'}`);
  console.log(`Total estimate:  ${result.totalEstimate ?? 'n/a'}`);
  console.log(`Provider requests: ${rateLimiter.acquired}`);
  console.log(`Duration:        ${((Date.now()-start)/1000).toFixed(1)}s`);
  console.log(`Coverage before: with=${beforeWith} after=${afterWith} delta=${afterWith-beforeWith}`);
  console.log('================================');
  console.log(`Status detail: pnpm enrich:status --id ${result.jobId}`);

  await disconnectAndExit(result.failed > 0 ? 2 : 0);
}

if (process.argv[1]?.endsWith('enrich-start.ts')) {
  void main().catch(async (err)=>{
    console.error(`enrich:start FAILED: ${err instanceof Error ? err.message : String(err)}`);
    try { const { disconnectDatabase } = await import('../infrastructure/persistence/mongodb/connection.js'); await disconnectDatabase(); } catch {}
    process.exit(1);
  });
}
