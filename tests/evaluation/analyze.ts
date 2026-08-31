import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClassificationCase, IdentityCase, EnrichmentCase } from './harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESULTS_DIR = join(__dirname, 'results');
const DATASETS_DIR = join(__dirname, 'datasets');

interface DetResult {
  id: string;
  correct: boolean;
  predicted: string;
  expected: string;
}

interface DetResults {
  classification: DetResult[];
  identity: DetResult[];
  enrichment: DetResult[];
}

interface AiResult {
  id: string;
  correct: boolean;
  predicted: string;
  expected: string;
  confidence: number;
  latencyMs: number;
  error?: string;
}

interface AiResults {
  classification: AiResult[];
  identity: AiResult[];
}

function loadJSON<T>(filename: string): T {
  return JSON.parse(readFileSync(join(RESULTS_DIR, filename), 'utf8'));
}

function loadDataset<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATASETS_DIR, filename), 'utf8'));
}

interface AnalysisResult {
  category: string;
  id: string;
  groundTruth: string;
  deterministic: string;
  ai: string;
  detCorrect: boolean;
  aiCorrect: boolean;
  outcome: 'AI_WINS' | 'DETERMINISTIC_WINS' | 'BOTH_CORRECT' | 'BOTH_WRONG';
}

function analyze() {
  console.log('=== Phase 12: AI Evaluation Analysis ===\n');

  // Load datasets
  const classificationData = loadDataset<ClassificationCase[]>('classification.json');
  const identityData = loadDataset<IdentityCase[]>('identity.json');
  const enrichmentData = loadDataset<EnrichmentCase[]>('enrichment.json');

  // Load deterministic baseline
  const detResults = loadJSON<DetResults>('deterministic-baseline.json');

  // Load AI results
  const aiResults = loadJSON<AiResults & { classification: AiResult[]; identity: AiResult[] }>(
    'ollama-results.json',
  );
  const aiEnrichment = loadJSON<AiResult[]>('enrichment-results.json');

  // === Classification Analysis ===
  console.log('--- Classification ---');
  const classAnalysis: AnalysisResult[] = classificationData.map((c) => {
    const detResult = detResults.classification.find((r) => r.id === c.id);
    const aiResult = aiResults.classification.find((r) => r.id === c.id);

    const detPred = detResult?.predicted ?? 'UNKNOWN';
    const aiPred = aiResult?.predicted ?? 'ERROR';
    const detCorrect = detPred === c.groundTruth;
    const aiCorrect = aiPred === c.groundTruth;

    let outcome: AnalysisResult['outcome'];
    if (detCorrect && aiCorrect) outcome = 'BOTH_CORRECT';
    else if (!detCorrect && !aiCorrect) outcome = 'BOTH_WRONG';
    else if (aiCorrect) outcome = 'AI_WINS';
    else outcome = 'DETERMINISTIC_WINS';

    return {
      category: 'classification',
      id: c.id,
      groundTruth: c.groundTruth,
      deterministic: detPred,
      ai: aiPred,
      detCorrect,
      aiCorrect,
      outcome,
    };
  });

  const classSummary = {
    bothCorrect: classAnalysis.filter((r) => r.outcome === 'BOTH_CORRECT').length,
    aiWins: classAnalysis.filter((r) => r.outcome === 'AI_WINS').length,
    detWins: classAnalysis.filter((r) => r.outcome === 'DETERMINISTIC_WINS').length,
    bothWrong: classAnalysis.filter((r) => r.outcome === 'BOTH_WRONG').length,
  };

  console.log(`  Both correct: ${classSummary.bothCorrect}/${classAnalysis.length}`);
  console.log(`  AI wins: ${classSummary.aiWins}/${classAnalysis.length}`);
  console.log(`  Deterministic wins: ${classSummary.detWins}/${classAnalysis.length}`);
  console.log(`  Both wrong: ${classSummary.bothWrong}/${classAnalysis.length}`);

  // Show AI losses
  const classAiLosses = classAnalysis.filter((r) => r.outcome === 'DETERMINISTIC_WINS');
  if (classAiLosses.length > 0) {
    console.log('  AI regressions:');
    for (const r of classAiLosses) {
      console.log(`    ${r.id}: AI=${r.ai}, Det=${r.deterministic}, Truth=${r.groundTruth}`);
    }
  }

  // === Identity Analysis ===
  console.log('\n--- Identity ---');
  const idAnalysis: AnalysisResult[] = identityData.map((c) => {
    const detResult = detResults.identity.find((r) => r.id === c.id);
    const aiResult = aiResults.identity.find((r) => r.id === c.id);

    const detPred = detResult?.predicted ?? 'UNRESOLVED';
    const aiPred = aiResult?.predicted ?? 'ERROR';
    const detCorrect = detPred === c.groundTruth;
    const aiCorrect = aiPred === c.groundTruth;

    let outcome: AnalysisResult['outcome'];
    if (detCorrect && aiCorrect) outcome = 'BOTH_CORRECT';
    else if (!detCorrect && !aiCorrect) outcome = 'BOTH_WRONG';
    else if (aiCorrect) outcome = 'AI_WINS';
    else outcome = 'DETERMINISTIC_WINS';

    return {
      category: 'identity',
      id: c.id,
      groundTruth: c.groundTruth,
      deterministic: detPred,
      ai: aiPred,
      detCorrect,
      aiCorrect,
      outcome,
    };
  });

  const idSummary = {
    bothCorrect: idAnalysis.filter((r) => r.outcome === 'BOTH_CORRECT').length,
    aiWins: idAnalysis.filter((r) => r.outcome === 'AI_WINS').length,
    detWins: idAnalysis.filter((r) => r.outcome === 'DETERMINISTIC_WINS').length,
    bothWrong: idAnalysis.filter((r) => r.outcome === 'BOTH_WRONG').length,
  };

  console.log(`  Both correct: ${idSummary.bothCorrect}/${idAnalysis.length}`);
  console.log(`  AI wins: ${idSummary.aiWins}/${idAnalysis.length}`);
  console.log(`  Deterministic wins: ${idSummary.detWins}/${idAnalysis.length}`);
  console.log(`  Both wrong: ${idSummary.bothWrong}/${idAnalysis.length}`);

  // Show AI losses
  const idAiLosses = idAnalysis.filter((r) => r.outcome === 'DETERMINISTIC_WINS');
  if (idAiLosses.length > 0) {
    console.log('  AI regressions:');
    for (const r of idAiLosses) {
      console.log(`    ${r.id}: AI=${r.ai}, Det=${r.deterministic}, Truth=${r.groundTruth}`);
    }
  }

  // === Enrichment Analysis ===
  console.log('\n--- Enrichment ---');
  const enrAnalysis: AnalysisResult[] = enrichmentData.map((c) => {
    const detResult = detResults.enrichment.find((r) => r.id === c.id);
    const aiResult = aiEnrichment.find((r) => r.id === c.id);

    const detPred = detResult?.predicted ?? 'ERROR';
    const aiPred = aiResult?.predicted ?? 'ERROR';
    const detCorrect = detPred === c.groundTruth;
    const aiCorrect = aiPred === c.groundTruth;

    let outcome: AnalysisResult['outcome'];
    if (detCorrect && aiCorrect) outcome = 'BOTH_CORRECT';
    else if (!detCorrect && !aiCorrect) outcome = 'BOTH_WRONG';
    else if (aiCorrect) outcome = 'AI_WINS';
    else outcome = 'DETERMINISTIC_WINS';

    return {
      category: 'enrichment',
      id: c.id,
      groundTruth: c.groundTruth,
      deterministic: detPred,
      ai: aiPred,
      detCorrect,
      aiCorrect,
      outcome,
    };
  });

  const enrSummary = {
    bothCorrect: enrAnalysis.filter((r) => r.outcome === 'BOTH_CORRECT').length,
    aiWins: enrAnalysis.filter((r) => r.outcome === 'AI_WINS').length,
    detWins: enrAnalysis.filter((r) => r.outcome === 'DETERMINISTIC_WINS').length,
    bothWrong: enrAnalysis.filter((r) => r.outcome === 'BOTH_WRONG').length,
  };

  console.log(`  Both correct: ${enrSummary.bothCorrect}/${enrAnalysis.length}`);
  console.log(`  AI wins: ${enrSummary.aiWins}/${enrAnalysis.length}`);
  console.log(`  Deterministic wins: ${enrSummary.detWins}/${enrAnalysis.length}`);
  console.log(`  Both wrong: ${enrSummary.bothWrong}/${enrAnalysis.length}`);

  // Show AI losses
  const enrAiLosses = enrAnalysis.filter((r) => r.outcome === 'DETERMINISTIC_WINS');
  if (enrAiLosses.length > 0) {
    console.log('  AI regressions:');
    for (const r of enrAiLosses) {
      console.log(`    ${r.id}: AI="${r.ai}", Det="${r.deterministic}", Truth="${r.groundTruth}"`);
    }
  }

  // === Overall Summary ===
  const allAnalysis = [...classAnalysis, ...idAnalysis, ...enrAnalysis];
  const overall = {
    bothCorrect: allAnalysis.filter((r) => r.outcome === 'BOTH_CORRECT').length,
    aiWins: allAnalysis.filter((r) => r.outcome === 'AI_WINS').length,
    detWins: allAnalysis.filter((r) => r.outcome === 'DETERMINISTIC_WINS').length,
    bothWrong: allAnalysis.filter((r) => r.outcome === 'BOTH_WRONG').length,
  };

  console.log('\n=== Overall Summary ===');
  console.log(`Total cases: ${allAnalysis.length}`);
  console.log(
    `Both correct: ${overall.bothCorrect} (${((overall.bothCorrect / allAnalysis.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `AI wins: ${overall.aiWins} (${((overall.aiWins / allAnalysis.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Deterministic wins: ${overall.detWins} (${((overall.detWins / allAnalysis.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Both wrong: ${overall.bothWrong} (${((overall.bothWrong / allAnalysis.length) * 100).toFixed(1)}%)`,
  );

  // Latency
  const aiLatencies = [
    ...aiResults.classification.map((r) => r.latencyMs),
    ...aiResults.identity.map((r) => r.latencyMs),
    ...aiEnrichment.map((r) => r.latencyMs),
  ].filter((l) => l > 0);

  console.log(`\nAI Latency:`);
  console.log(
    `  Avg: ${(aiLatencies.reduce((a, b) => a + b, 0) / aiLatencies.length / 1000).toFixed(1)}s`,
  );
  console.log(`  Min: ${(Math.min(...aiLatencies) / 1000).toFixed(1)}s`);
  console.log(`  Max: ${(Math.max(...aiLatencies) / 1000).toFixed(1)}s`);

  // Errors
  const aiErrors = [
    ...aiResults.classification
      .filter((r) => r.error)
      .map((r) => ({ ...r, category: 'classification' })),
    ...aiResults.identity.filter((r) => r.error).map((r) => ({ ...r, category: 'identity' })),
    ...aiEnrichment.filter((r) => r.error).map((r) => ({ ...r, category: 'enrichment' })),
  ];

  console.log(`\nAI Errors: ${aiErrors.length}`);
  for (const e of aiErrors) {
    console.log(`  ${e.category}/${e.id}: ${e.error}`);
  }

  // Save full analysis
  const analysis = {
    timestamp: new Date().toISOString(),
    model: 'qwen3:8b',
    classification: { summary: classSummary, details: classAnalysis },
    identity: { summary: idSummary, details: idAnalysis },
    enrichment: { summary: enrSummary, details: enrAnalysis },
    overall,
    latency: {
      avg: aiLatencies.reduce((a, b) => a + b, 0) / aiLatencies.length,
      min: Math.min(...aiLatencies),
      max: Math.max(...aiLatencies),
    },
    errors: aiErrors,
  };

  const analysisPath = join(RESULTS_DIR, 'full-analysis.json');
  writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  console.log(`\nFull analysis saved to ${analysisPath}`);
}

analyze();
