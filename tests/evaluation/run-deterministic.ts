import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ClassificationCase, type IdentityCase, type EnrichmentCase } from './harness.js';
import {
  deterministicClassify,
  deterministicResolveIdentity,
  deterministicResolveConflict,
} from './deterministic-baseline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATASETS_DIR = join(__dirname, 'datasets');
const RESULTS_DIR = join(__dirname, 'results');

function loadJSON<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATASETS_DIR, filename), 'utf8'));
}

interface DeterministicResult {
  id: string;
  correct: boolean;
  predicted: string;
  expected: string;
}

function evaluateDeterministic() {
  console.log('=== Deterministic Baseline Evaluation ===\n');

  // Classification
  const classificationData = loadJSON<ClassificationCase[]>('classification.json');
  console.log(`Classification: ${classificationData.length} cases`);

  const classificationResults: DeterministicResult[] = classificationData.map((c) => {
    const predicted = deterministicClassify(c);
    return {
      id: c.id,
      correct: predicted === c.groundTruth,
      predicted,
      expected: c.groundTruth,
    };
  });

  const classCorrect = classificationResults.filter((r) => r.correct).length;
  console.log(
    `  Correct: ${classCorrect}/${classificationResults.length} (${((classCorrect / classificationResults.length) * 100).toFixed(1)}%)`,
  );

  // Show wrong predictions
  const classWrong = classificationResults.filter((r) => !r.correct);
  if (classWrong.length > 0) {
    console.log('  Wrong predictions:');
    for (const r of classWrong) {
      console.log(`    ${r.id}: ${r.predicted} vs ${r.expected}`);
    }
  }

  // Identity
  const identityData = loadJSON<IdentityCase[]>('identity.json');
  console.log(`\nIdentity: ${identityData.length} cases`);

  const identityResults: DeterministicResult[] = identityData.map((c) => {
    const predicted = deterministicResolveIdentity(c);
    return {
      id: c.id,
      correct: predicted === c.groundTruth,
      predicted,
      expected: c.groundTruth,
    };
  });

  const idCorrect = identityResults.filter((r) => r.correct).length;
  console.log(
    `  Correct: ${idCorrect}/${identityResults.length} (${((idCorrect / identityResults.length) * 100).toFixed(1)}%)`,
  );

  const idWrong = identityResults.filter((r) => !r.correct);
  if (idWrong.length > 0) {
    console.log('  Wrong predictions:');
    for (const r of idWrong) {
      console.log(`    ${r.id}: ${r.predicted} vs ${r.expected}`);
    }
  }

  // Enrichment
  const enrichmentData = loadJSON<EnrichmentCase[]>('enrichment.json');
  console.log(`\nEnrichment: ${enrichmentData.length} cases`);

  const enrichmentResults: DeterministicResult[] = enrichmentData.map((c) => {
    const predicted = deterministicResolveConflict(c);
    return {
      id: c.id,
      correct: predicted === c.groundTruth,
      predicted,
      expected: c.groundTruth,
    };
  });

  const enrCorrect = enrichmentResults.filter((r) => r.correct).length;
  console.log(
    `  Correct: ${enrCorrect}/${enrichmentResults.length} (${((enrCorrect / enrichmentResults.length) * 100).toFixed(1)}%)`,
  );

  const enrWrong = enrichmentResults.filter((r) => !r.correct);
  if (enrWrong.length > 0) {
    console.log('  Wrong predictions:');
    for (const r of enrWrong) {
      console.log(`    ${r.id}: "${r.predicted}" vs "${r.expected}"`);
    }
  }

  // Summary
  const totalCorrect = classCorrect + idCorrect + enrCorrect;
  const totalCases =
    classificationResults.length + identityResults.length + enrichmentResults.length;
  console.log(`\n=== Summary ===`);
  console.log(
    `Total: ${totalCorrect}/${totalCases} (${((totalCorrect / totalCases) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Classification: ${classCorrect}/${classificationResults.length} (${((classCorrect / classificationResults.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Identity: ${idCorrect}/${identityResults.length} (${((idCorrect / identityResults.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Enrichment: ${enrCorrect}/${enrichmentResults.length} (${((enrCorrect / enrichmentResults.length) * 100).toFixed(1)}%)`,
  );

  // Save results
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const results = {
    timestamp: new Date().toISOString(),
    classification: classificationResults,
    identity: identityResults,
    enrichment: enrichmentResults,
    summary: {
      classification: { total: classificationResults.length, correct: classCorrect },
      identity: { total: identityResults.length, correct: idCorrect },
      enrichment: { total: enrichmentResults.length, correct: enrCorrect },
      overall: { total: totalCases, correct: totalCorrect },
    },
  };

  const resultsPath = join(RESULTS_DIR, 'deterministic-baseline.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);
}

evaluateDeterministic();
