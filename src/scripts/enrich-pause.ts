import 'dotenv/config';
import { loadConfig } from '../infrastructure/config/config.js';
import { connectAndLog, disconnectAndExit, parseIdArg } from './enrich-common.js';
import { MongoEnrichmentJobRepository } from '../infrastructure/persistence/mongodb/mongo-enrichment-job-repository.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const id = parseIdArg(argv);
  if (!id) {
    console.error('enrich:pause requires --id <jobId>');
    console.error('Usage: pnpm enrich:pause --id <jobId>');
    process.exit(2);
    return;
  }
  loadConfig();
  await connectAndLog();
  const repo = new MongoEnrichmentJobRepository();
  const job = await repo.findById(id);
  if (!job) {
    console.error(`Job not found: ${id}`);
    await disconnectAndExit(1);
    return;
  }
  if (job.status === 'PAUSED') {
    console.log(`Job ${id} already PAUSED.`);
    console.log(`Status: ${job.status}`);
    await disconnectAndExit(0);
    return;
  }
  if (job.status === 'COMPLETED') {
    console.error(`Job ${id} is COMPLETED — cannot pause.`);
    await disconnectAndExit(1);
    return;
  }
  if (job.status === 'FAILED') {
    console.error(`Job ${id} is FAILED — cannot pause (use resume to retry).`);
    await disconnectAndExit(1);
    return;
  }
  const res = await repo.requestPause(id);
  if (!res.requested) {
    console.error(`Failed to request pause for job ${id} (status: ${res.job?.status ?? 'unknown'})`);
    await disconnectAndExit(1);
    return;
  }
  console.log(`Pause requested.`);
  console.log(`Job: ${id}`);
  console.log(`Status: ${res.job?.status}`);
  console.log(`Current batch will finish, then job will become PAUSED.`);
  console.log(`Check status: pnpm enrich:status --id ${id}`);
  await disconnectAndExit(0);
}

if (process.argv[1]?.endsWith('enrich-pause.ts')) {
  void main().catch(async (err)=>{
    console.error(`enrich:pause FAILED: ${err instanceof Error ? err.message : String(err)}`);
    try { const { disconnectDatabase } = await import('../infrastructure/persistence/mongodb/connection.js'); await disconnectDatabase(); } catch {}
    process.exit(1);
  });
}
