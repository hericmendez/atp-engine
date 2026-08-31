import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import type { LLMProvider } from '../../src/ai/provider.js';
import type {
  AIClassificationRequest,
  AIIdentityRequest,
  AIEnrichmentConflictRequest,
} from '../../src/ai/types.js';

// ─── Dataset Types ──────────────────────────────────────────────

export interface ClassificationCase {
  id: string;
  title: string;
  description: string;
  sourceHints: string[];
  genreHints: string[];
  groundTruth: string;
  difficulty: string;
  notes: string;
}

export interface IdentityCase {
  id: string;
  candidateTitle: string;
  candidateDevelopers: string[];
  candidatePlatforms: string[];
  existingTitle: string;
  existingDevelopers: string[];
  existingPlatforms: string[];
  groundTruth: string;
  groundTruthRelationship: string | null;
  difficulty: string;
  notes: string;
}

export interface EnrichmentCase {
  id: string;
  fieldType: string;
  valueA: string;
  sourceA: string;
  valueB: string;
  sourceB: string;
  gameTitle: string;
  groundTruth: string;
  difficulty: string;
  notes: string;
}

// ─── Result Types ───────────────────────────────────────────────

export interface ClassificationResult {
  id: string;
  correct: boolean;
  predicted: string;
  expected: string;
  confidence: number;
  latencyMs: number;
  error?: string;
}

export interface IdentityResult {
  id: string;
  correct: boolean;
  predicted: string;
  expected: string;
  confidence: number;
  latencyMs: number;
  error?: string;
}

export interface EnrichmentResult {
  id: string;
  correct: boolean;
  predicted: string;
  expected: string;
  confidence: number;
  latencyMs: number;
  error?: string;
}

export interface EvaluationResults {
  model: string;
  timestamp: string;
  classification: ClassificationResult[];
  identity: IdentityResult[];
  enrichment: EnrichmentResult[];
}

export interface EvaluationSummary {
  classification: {
    total: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
    avgLatencyMs: number;
    byDifficulty: Record<string, { total: number; correct: number; accuracy: number }>;
  };
  identity: {
    total: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
    avgLatencyMs: number;
    byDifficulty: Record<string, { total: number; correct: number; accuracy: number }>;
  };
  enrichment: {
    total: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
    avgLatencyMs: number;
    byDifficulty: Record<string, { total: number; correct: number; accuracy: number }>;
  };
}

// ─── Harness ────────────────────────────────────────────────────

const RESULTS_DIR = join(__dirname, 'results');

function ensureResultsDir() {
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

function loadResultsPath(model: string): string {
  const safeName = model.replace(/[^a-zA-Z0-9]/g, '_');
  return join(RESULTS_DIR, `${safeName}-results.json`);
}

function loadExistingResults(model: string): EvaluationResults | null {
  const path = loadResultsPath(model);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveResults(results: EvaluationResults) {
  ensureResultsDir();
  const path = loadResultsPath(results.model);
  writeFileSync(path, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${path}`);
}

// ─── Classification Evaluation ──────────────────────────────────

export async function evaluateClassification(
  provider: LLMProvider,
  dataset: ClassificationCase[],
  existing?: ClassificationResult[],
): Promise<ClassificationResult[]> {
  const completedIds = new Set(existing?.map((r) => r.id) ?? []);
  const results = [...(existing ?? [])];
  const remaining = dataset.filter((c) => !completedIds.has(c.id));

  console.log(`\nClassification: ${remaining.length} remaining (${completedIds.size} done)`);

  for (const c of remaining) {
    process.stdout.write(`  ${c.id} (${c.title})... `);

    const request: AIClassificationRequest = {
      title: c.title,
      description: c.description,
      sourceHints: c.sourceHints,
      genreHints: c.genreHints,
      deterministicResult: {
        category: 'UNKNOWN',
        confidence: 0,
        reason: 'baseline evaluation',
      },
    };

    const start = Date.now();
    try {
      const response = await provider.classify(request);
      const latencyMs = Date.now() - start;
      const correct = response.category === c.groundTruth;

      results.push({
        id: c.id,
        correct,
        predicted: response.category,
        expected: c.groundTruth,
        confidence: response.confidence,
        latencyMs,
      });

      console.log(
        `${correct ? 'OK' : 'WRONG'} (${response.category} vs ${c.groundTruth}) ${latencyMs}ms`,
      );
    } catch (err) {
      const latencyMs = Date.now() - start;
      results.push({
        id: c.id,
        correct: false,
        predicted: 'ERROR',
        expected: c.groundTruth,
        confidence: 0,
        latencyMs,
        error: String(err),
      });
      console.log(`ERROR: ${err}`);
    }
  }

  return results;
}

// ─── Identity Evaluation ────────────────────────────────────────

export async function evaluateIdentity(
  provider: LLMProvider,
  dataset: IdentityCase[],
  existing?: IdentityResult[],
): Promise<IdentityResult[]> {
  const completedIds = new Set(existing?.map((r) => r.id) ?? []);
  const results = [...(existing ?? [])];
  const remaining = dataset.filter((c) => !completedIds.has(c.id));

  console.log(`\nIdentity: ${remaining.length} remaining (${completedIds.size} done)`);

  for (const c of remaining) {
    process.stdout.write(`  ${c.id} (${c.candidateTitle} vs ${c.existingTitle})... `);

    const request: AIIdentityRequest = {
      candidateTitle: c.candidateTitle,
      candidateDevelopers: c.candidateDevelopers,
      candidatePlatforms: c.candidatePlatforms,
      existingTitle: c.existingTitle,
      existingDevelopers: c.existingDevelopers,
      existingPlatforms: c.existingPlatforms,
      deterministicResult: {
        outcome: 'UNRESOLVED',
        confidence: 0,
        reason: 'baseline evaluation',
      },
    };

    const start = Date.now();
    try {
      const response = await provider.resolveIdentity(request);
      const latencyMs = Date.now() - start;
      const correct = response.outcome === c.groundTruth;

      results.push({
        id: c.id,
        correct,
        predicted: response.outcome,
        expected: c.groundTruth,
        confidence: response.confidence,
        latencyMs,
      });

      console.log(
        `${correct ? 'OK' : 'WRONG'} (${response.outcome} vs ${c.groundTruth}) ${latencyMs}ms`,
      );
    } catch (err) {
      const latencyMs = Date.now() - start;
      results.push({
        id: c.id,
        correct: false,
        predicted: 'ERROR',
        expected: c.groundTruth,
        confidence: 0,
        latencyMs,
        error: String(err),
      });
      console.log(`ERROR: ${err}`);
    }
  }

  return results;
}

// ─── Enrichment Evaluation ──────────────────────────────────────

export async function evaluateEnrichment(
  provider: LLMProvider,
  dataset: EnrichmentCase[],
  existing?: EnrichmentResult[],
): Promise<EnrichmentResult[]> {
  const completedIds = new Set(existing?.map((r) => r.id) ?? []);
  const results = [...(existing ?? [])];
  const remaining = dataset.filter((c) => !completedIds.has(c.id));

  console.log(`\nEnrichment: ${remaining.length} remaining (${completedIds.size} done)`);

  for (const c of remaining) {
    process.stdout.write(`  ${c.id} (${c.fieldType}: ${c.valueA} vs ${c.valueB})... `);

    const request: AIEnrichmentConflictRequest = {
      fieldType: c.fieldType,
      valueA: c.valueA,
      sourceA: c.sourceA,
      valueB: c.valueB,
      sourceB: c.sourceB,
      gameTitle: c.gameTitle,
    };

    const start = Date.now();
    try {
      const response = await provider.resolveConflict(request);
      const latencyMs = Date.now() - start;
      const correct = response.recommendedValue === c.groundTruth;

      results.push({
        id: c.id,
        correct,
        predicted: response.recommendedValue,
        expected: c.groundTruth,
        confidence: response.confidence,
        latencyMs,
      });

      console.log(
        `${correct ? 'OK' : 'WRONG'} ("${response.recommendedValue}" vs "${c.groundTruth}") ${latencyMs}ms`,
      );
    } catch (err) {
      const latencyMs = Date.now() - start;
      results.push({
        id: c.id,
        correct: false,
        predicted: 'ERROR',
        expected: c.groundTruth,
        confidence: 0,
        latencyMs,
        error: String(err),
      });
      console.log(`ERROR: ${err}`);
    }
  }

  return results;
}

// ─── Summary ────────────────────────────────────────────────────

function computeSummary(
  results: ClassificationResult[] | IdentityResult[] | EnrichmentResult[],
  dataset: ClassificationCase[] | IdentityCase[] | EnrichmentCase[],
): {
  total: number;
  correct: number;
  accuracy: number;
  avgConfidence: number;
  avgLatencyMs: number;
  byDifficulty: Record<string, { total: number; correct: number; accuracy: number }>;
} {
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const accuracy = total > 0 ? correct / total : 0;
  const avgConfidence = total > 0 ? results.reduce((s, r) => s + r.confidence, 0) / total : 0;
  const avgLatencyMs = total > 0 ? results.reduce((s, r) => s + r.latencyMs, 0) / total : 0;

  const byDifficulty: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const diff of ['easy', 'medium', 'hard']) {
    const diffCases = dataset.filter((c) => c.difficulty === diff);
    const diffIds = new Set(diffCases.map((c) => c.id));
    const diffResults = results.filter((r) => diffIds.has(r.id));
    const diffCorrect = diffResults.filter((r) => r.correct).length;
    byDifficulty[diff] = {
      total: diffResults.length,
      correct: diffCorrect,
      accuracy: diffResults.length > 0 ? diffCorrect / diffResults.length : 0,
    };
  }

  return { total, correct, accuracy, avgConfidence, avgLatencyMs, byDifficulty };
}

export function generateSummary(
  results: EvaluationResults,
  datasets: {
    classification: ClassificationCase[];
    identity: IdentityCase[];
    enrichment: EnrichmentCase[];
  },
): EvaluationSummary {
  return {
    classification: computeSummary(results.classification, datasets.classification),
    identity: computeSummary(results.identity, datasets.identity),
    enrichment: computeSummary(results.enrichment, datasets.enrichment),
  };
}

// ─── Main Runner ────────────────────────────────────────────────

export async function runEvaluation(
  provider: LLMProvider,
  datasets: {
    classification: ClassificationCase[];
    identity: IdentityCase[];
    enrichment: EnrichmentCase[];
  },
): Promise<EvaluationResults> {
  const existing = loadExistingResults(provider.name);

  const results: EvaluationResults = {
    model: provider.name,
    timestamp: new Date().toISOString(),
    classification: existing?.classification ?? [],
    identity: existing?.identity ?? [],
    enrichment: existing?.enrichment ?? [],
  };

  console.log(`\n=== AI Evaluation: ${provider.name} ===`);
  console.log(`Started at: ${results.timestamp}`);

  // Classification
  results.classification = await evaluateClassification(
    provider,
    datasets.classification,
    results.classification,
  );
  saveResults(results);

  // Identity
  results.identity = await evaluateIdentity(provider, datasets.identity, results.identity);
  saveResults(results);

  // Enrichment
  results.enrichment = await evaluateEnrichment(provider, datasets.enrichment, results.enrichment);
  saveResults(results);

  // Summary
  const summary = generateSummary(results, datasets);

  console.log('\n=== Results Summary ===');
  console.log(
    `Classification: ${summary.classification.correct}/${summary.classification.total} (${(summary.classification.accuracy * 100).toFixed(1)}%) avg ${summary.classification.avgLatencyMs.toFixed(0)}ms`,
  );
  console.log(
    `Identity: ${summary.identity.correct}/${summary.identity.total} (${(summary.identity.accuracy * 100).toFixed(1)}%) avg ${summary.identity.avgLatencyMs.toFixed(0)}ms`,
  );
  console.log(
    `Enrichment: ${summary.enrichment.correct}/${summary.enrichment.total} (${(summary.enrichment.accuracy * 100).toFixed(1)}%) avg ${summary.enrichment.avgLatencyMs.toFixed(0)}ms`,
  );

  // Save summary
  const summaryPath = join(
    RESULTS_DIR,
    `${provider.name.replace(/[^a-zA-Z0-9]/g, '_')}-summary.json`,
  );
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary saved to ${summaryPath}`);

  return results;
}
