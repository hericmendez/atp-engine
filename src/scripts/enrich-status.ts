import 'dotenv/config';
import { loadConfig } from '../infrastructure/config/config.js';
import { connectAndLog, disconnectAndExit, formatJob, formatJobList, parseIdArg } from './enrich-common.js';
import { MongoEnrichmentJobRepository } from '../infrastructure/persistence/mongodb/mongo-enrichment-job-repository.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const id = parseIdArg(argv);
  const typeFlagIndex = argv.indexOf('--type');
  const typeFilter = typeFlagIndex !== -1 ? argv[typeFlagIndex+1] : undefined;

  loadConfig();
  await connectAndLog();
  const repo = new MongoEnrichmentJobRepository();

  if (id) {
    const job = await repo.findById(id);
    if (!job) {
      console.error(`Job not found: ${id}`);
      await disconnectAndExit(1);
      return;
    }
    console.log(formatJob(job));
    await disconnectAndExit(0);
    return;
  }

  // No id: show recent jobs
  const jobs = typeFilter
    ? await repo.findRecentByType(typeFilter as import('../domain/enrichment-job/enrichment-job.js').EnrichmentJobType, 10)
    : await repo.findRecent(10);

  console.log(formatJobList(jobs));
  if (jobs.length > 0) {
    console.log('\nUse: pnpm enrich:status --id <jobId> for details');
  }
  await disconnectAndExit(0);
}

if (process.argv[1]?.endsWith('enrich-status.ts')) {
  void main().catch(async (err)=>{
    console.error(`enrich:status FAILED: ${err instanceof Error ? err.message : String(err)}`);
    try { const { disconnectDatabase } = await import('../infrastructure/persistence/mongodb/connection.js'); await disconnectDatabase(); } catch {}
    process.exit(1);
  });
}
