import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OllamaProvider } from '../../src/ai/ollama-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  type ClassificationCase,
  type IdentityCase,
  type EnrichmentCase,
  runEvaluation,
  generateSummary,
} from './harness.js';

const DATASETS_DIR = join(__dirname, 'datasets');

function loadJSON<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATASETS_DIR, filename), 'utf8'));
}

async function main() {
  const model = process.env.AI_MODEL ?? 'qwen3:8b';
  const url = process.env.OLLAMA_URL ?? 'http://localhost:11434';

  console.log('=== ATP Engine - AI Evaluation ===');
  console.log(`Model: ${model}`);
  console.log(`URL: ${url}`);

  // Load datasets
  const classification = loadJSON<ClassificationCase[]>('classification.json');
  const identity = loadJSON<IdentityCase[]>('identity.json');
  const enrichment = loadJSON<EnrichmentCase[]>('enrichment.json');

  console.log(`\nDatasets loaded:`);
  console.log(`  Classification: ${classification.length} cases`);
  console.log(`  Identity: ${identity.length} cases`);
  console.log(`  Enrichment: ${enrichment.length} cases`);

  // Create provider
  const provider = new OllamaProvider({
    url,
    model,
    timeoutMs: 180000,
  });

  // Health check
  const healthy = await provider.healthCheck();
  if (!healthy) {
    console.error('\nERROR: Ollama is not available. Please start Ollama and try again.');
    process.exit(1);
  }

  // Run evaluation
  const results = await runEvaluation(provider, { classification, identity, enrichment });

  // Generate and print final summary
  const summary = generateSummary(results, { classification, identity, enrichment });

  console.log('\n=== Final Summary ===');
  console.log(`Model: ${model}`);
  console.log(`Timestamp: ${results.timestamp}`);
  console.log('');
  console.log('Classification:');
  console.log(`  Total: ${summary.classification.total}`);
  console.log(`  Correct: ${summary.classification.correct}`);
  console.log(`  Accuracy: ${(summary.classification.accuracy * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence: ${summary.classification.avgConfidence.toFixed(2)}`);
  console.log(`  Avg Latency: ${summary.classification.avgLatencyMs.toFixed(0)}ms`);
  for (const [diff, stats] of Object.entries(summary.classification.byDifficulty)) {
    if (stats.total > 0) {
      console.log(
        `  ${diff}: ${stats.correct}/${stats.total} (${(stats.accuracy * 100).toFixed(1)}%)`,
      );
    }
  }

  console.log('');
  console.log('Identity:');
  console.log(`  Total: ${summary.identity.total}`);
  console.log(`  Correct: ${summary.identity.correct}`);
  console.log(`  Accuracy: ${(summary.identity.accuracy * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence: ${summary.identity.avgConfidence.toFixed(2)}`);
  console.log(`  Avg Latency: ${summary.identity.avgLatencyMs.toFixed(0)}ms`);
  for (const [diff, stats] of Object.entries(summary.identity.byDifficulty)) {
    if (stats.total > 0) {
      console.log(
        `  ${diff}: ${stats.correct}/${stats.total} (${(stats.accuracy * 100).toFixed(1)}%)`,
      );
    }
  }

  console.log('');
  console.log('Enrichment:');
  console.log(`  Total: ${summary.enrichment.total}`);
  console.log(`  Correct: ${summary.enrichment.correct}`);
  console.log(`  Accuracy: ${(summary.enrichment.accuracy * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence: ${summary.enrichment.avgConfidence.toFixed(2)}`);
  console.log(`  Avg Latency: ${summary.enrichment.avgLatencyMs.toFixed(0)}ms`);
  for (const [diff, stats] of Object.entries(summary.enrichment.byDifficulty)) {
    if (stats.total > 0) {
      console.log(
        `  ${diff}: ${stats.correct}/${stats.total} (${(stats.accuracy * 100).toFixed(1)}%)`,
      );
    }
  }

  // Overall
  const totalCorrect =
    summary.classification.correct + summary.identity.correct + summary.enrichment.correct;
  const totalCases =
    summary.classification.total + summary.identity.total + summary.enrichment.total;
  console.log('');
  console.log('Overall:');
  console.log(
    `  Total: ${totalCorrect}/${totalCases} (${((totalCorrect / totalCases) * 100).toFixed(1)}%)`,
  );

  console.log(`\nResults saved to tests/evaluation/results/`);
  console.log('Done!');
}

main().catch((err) => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
