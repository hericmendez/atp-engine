import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATASETS_DIR = join(__dirname, 'datasets');
const RESULTS_DIR = join(__dirname, 'results');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// ─── Types ──────────────────────────────────────────────────────

interface ModelConfig {
  name: string;
  thinkSupported: boolean;
}

interface BenchmarkResult {
  model: string;
  thinkEnabled: boolean;
  operation: string;
  caseId: string;
  correct: boolean;
  predicted: string;
  expected: string;
  latencyMs: number;
  error?: string;
}

interface ModelSummary {
  model: string;
  thinkEnabled: boolean;
  operation: string;
  totalCases: number;
  correct: number;
  accuracy: number;
  errors: number;
  timeouts: number;
  avgLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
}

// ─── Models ─────────────────────────────────────────────────────

const MODELS: ModelConfig[] = [
  { name: 'qwen3:1.7b', thinkSupported: false },
  { name: 'qwen3:4b', thinkSupported: false },
  { name: 'gemma3:4b', thinkSupported: false },
  { name: 'phi4-mini', thinkSupported: false },
  { name: 'qwen3:8b', thinkSupported: true },
];

// ─── Prompts ────────────────────────────────────────────────────

const IDENTITY_SYSTEM = `You are a video game identity resolver. Return JSON: { "outcome": "<OUTCOME>", "relationship": null or TYPE, "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid outcomes: SAME_GAME, DIFFERENT_GAME, RELATED_GAME, UNRESOLVED
Valid relationships: REMAKE, REMASTER, ENHANCED_VERSION, PORT, EXPANSION, REGIONAL_RELEASE, ALTERNATE_TITLE, RELATED_GAME`;

const ENRICHMENT_SYSTEM = `You are a video game metadata expert. Return JSON: { "recommendedValue": "<value>", "reasoning": "<brief>", "confidence": <0.0-1.0> }`;

const CLASSIFICATION_SYSTEM = `You are a video game metadata classifier. Return JSON: { "category": "<CATEGORY>", "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid categories: GAME, DLC, EXPANSION, MOVIE, TV_SHOW, ANIME, SOUNDTRACK, BOOK, HARDWARE, PROMOTIONAL, CHARACTER, FRANCHISE, PERSON, EVENT, UNKNOWN`;

// ─── Helpers ────────────────────────────────────────────────────

function loadJSON<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATASETS_DIR, filename), 'utf8'));
}

async function chat(
  url: string,
  model: string,
  system: string,
  user: string,
  think: boolean,
  timeoutMs: number,
): Promise<{ latencyMs: number; response: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      format: 'json',
      stream: false,
    };
    if (think) body.think = true;

    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { latencyMs: Date.now() - start, response: '', error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return { latencyMs: Date.now() - start, response: data.message?.content ?? '' };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return { latencyMs: Date.now() - start, response: '', error: 'TIMEOUT' };
    }
    return { latencyMs: Date.now() - start, response: '', error: String(err) };
  }
}

function parseResponse(raw: string, op: string): string {
  try {
    const p = JSON.parse(raw);
    if (op === 'identity') return p.outcome ?? 'UNRESOLVED';
    if (op === 'enrichment') return p.recommendedValue ?? '';
    if (op === 'classification') return p.category ?? 'UNKNOWN';
    return '';
  } catch {
    return 'PARSE_ERROR';
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((sorted.length * p) / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function computeSummary(results: BenchmarkResult[]): ModelSummary {
  const valid = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const timeouts = results.filter((r) => r.error === 'TIMEOUT');
  const correct = valid.filter((r) => r.correct).length;
  const latencies = valid.map((r) => r.latencyMs).sort((a, b) => a - b);

  return {
    model: results[0]?.model ?? '',
    thinkEnabled: results[0]?.thinkEnabled ?? false,
    operation: results[0]?.operation ?? '',
    totalCases: results.length,
    correct,
    accuracy: valid.length > 0 ? (correct / valid.length) * 100 : 0,
    errors: errors.length,
    timeouts: timeouts.length,
    avgLatencyMs:
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    medianLatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    maxLatencyMs: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
    minLatencyMs: latencies.length > 0 ? latencies[0] : 0,
  };
}

// ─── Benchmark Runners ──────────────────────────────────────────

async function benchmarkIdentity(
  url: string,
  model: string,
  think: boolean,
  timeoutMs: number,
): Promise<BenchmarkResult[]> {
  const dataset = loadJSON<
    Array<{
      id: string;
      candidateTitle: string;
      candidateDevelopers: string[];
      candidatePlatforms: string[];
      existingTitle: string;
      existingDevelopers: string[];
      existingPlatforms: string[];
      groundTruth: string;
    }>
  >('identity.json');

  const results: BenchmarkResult[] = [];
  for (const c of dataset) {
    const userPrompt = `Candidate: "${c.candidateTitle}"
  Developers: ${c.candidateDevelopers.join(', ') || 'unknown'}
  Platforms: ${c.candidatePlatforms.join(', ') || 'unknown'}
Existing: "${c.existingTitle}"
  Developers: ${c.existingDevelopers.join(', ') || 'unknown'}
  Platforms: ${c.existingPlatforms.join(', ') || 'unknown'}
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`;

    const { latencyMs, response, error } = await chat(
      url,
      model,
      IDENTITY_SYSTEM,
      userPrompt,
      think,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parseResponse(response, 'identity');
    results.push({
      model,
      thinkEnabled: think,
      operation: 'identity',
      caseId: c.id,
      correct: predicted === c.groundTruth,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      error,
    });
  }
  return results;
}

async function benchmarkEnrichment(
  url: string,
  model: string,
  think: boolean,
  timeoutMs: number,
): Promise<BenchmarkResult[]> {
  const dataset = loadJSON<
    Array<{
      id: string;
      fieldType: string;
      valueA: string;
      sourceA: string;
      valueB: string;
      sourceB: string;
      gameTitle: string;
      groundTruth: string;
    }>
  >('enrichment.json');

  const results: BenchmarkResult[] = [];
  for (const c of dataset) {
    const userPrompt = `Field: ${c.fieldType}
Game: "${c.gameTitle}"
Source A (${c.sourceA}): "${c.valueA}"
Source B (${c.sourceB}): "${c.valueB}"
Which value is more likely correct?`;

    const { latencyMs, response, error } = await chat(
      url,
      model,
      ENRICHMENT_SYSTEM,
      userPrompt,
      think,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parseResponse(response, 'enrichment');
    results.push({
      model,
      thinkEnabled: think,
      operation: 'enrichment',
      caseId: c.id,
      correct: predicted === c.groundTruth,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      error,
    });
  }
  return results;
}

async function benchmarkClassification(
  url: string,
  model: string,
  think: boolean,
  timeoutMs: number,
): Promise<BenchmarkResult[]> {
  const dataset = loadJSON<
    Array<{
      id: string;
      title: string;
      description: string;
      sourceHints: string[];
      genreHints: string[];
      groundTruth: string;
    }>
  >('classification.json');

  const results: BenchmarkResult[] = [];
  for (const c of dataset) {
    const userPrompt = `Title: ${c.title}
Description: ${c.description}
Source hints: ${c.sourceHints.join(', ')}
Genre hints: ${c.genreHints.join(', ')}
Deterministic result: UNKNOWN (confidence: 0.30)
Reason: no hints`;

    const { latencyMs, response, error } = await chat(
      url,
      model,
      CLASSIFICATION_SYSTEM,
      userPrompt,
      think,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parseResponse(response, 'classification');
    results.push({
      model,
      thinkEnabled: think,
      operation: 'classification',
      caseId: c.id,
      correct: predicted === c.groundTruth,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      error,
    });
  }
  return results;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const url = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const timeoutMs = 60000;

  console.log('=== Phase 12.2: Local LLM Model Benchmark ===');
  console.log(`URL: ${url}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log(`Models: ${MODELS.map((m) => m.name).join(', ')}`);
  console.log('');

  const allResults: BenchmarkResult[] = [];
  const summaries: ModelSummary[] = [];

  for (const modelConfig of MODELS) {
    const modes = modelConfig.thinkSupported
      ? [
          { think: false, label: 'no-thinking' },
          { think: true, label: 'thinking' },
        ]
      : [{ think: false, label: 'default' }];

    for (const mode of modes) {
      console.log(`\n=== ${modelConfig.name} (${mode.label}) ===`);

      // Identity
      console.log(`  Identity (${45} cases)...`);
      const idResults = await benchmarkIdentity(url, modelConfig.name, mode.think, timeoutMs);
      const idSummary = computeSummary(idResults);
      summaries.push(idSummary);
      allResults.push(...idResults);
      console.log(
        `    ${idSummary.correct}/${idSummary.totalCases} correct (${idSummary.accuracy.toFixed(1)}%), avg ${idSummary.avgLatencyMs.toFixed(0)}ms, P95 ${idSummary.p95LatencyMs.toFixed(0)}ms, ${idSummary.timeouts} timeouts`,
      );

      // Enrichment
      console.log(`  Enrichment (${40} cases)...`);
      const enrResults = await benchmarkEnrichment(url, modelConfig.name, mode.think, timeoutMs);
      const enrSummary = computeSummary(enrResults);
      summaries.push(enrSummary);
      allResults.push(...enrResults);
      console.log(
        `    ${enrSummary.correct}/${enrSummary.totalCases} correct (${enrSummary.accuracy.toFixed(1)}%), avg ${enrSummary.avgLatencyMs.toFixed(0)}ms, P95 ${enrSummary.p95LatencyMs.toFixed(0)}ms, ${enrSummary.timeouts} timeouts`,
      );

      // Classification (sanity check)
      console.log(`  Classification (${50} cases)...`);
      const classResults = await benchmarkClassification(
        url,
        modelConfig.name,
        mode.think,
        timeoutMs,
      );
      const classSummary = computeSummary(classResults);
      summaries.push(classSummary);
      allResults.push(...classResults);
      console.log(
        `    ${classSummary.correct}/${classSummary.totalCases} correct (${classSummary.accuracy.toFixed(1)}%), avg ${classSummary.avgLatencyMs.toFixed(0)}ms`,
      );

      // Save intermediate results
      writeFileSync(
        join(RESULTS_DIR, 'model-benchmark-results.json'),
        JSON.stringify(allResults, null, 2),
      );
      writeFileSync(
        join(RESULTS_DIR, 'model-benchmark-summary.json'),
        JSON.stringify(summaries, null, 2),
      );
    }
  }

  // Final summary table
  console.log('\n\n=== FINAL SUMMARY ===\n');
  console.log('Identity Resolution:');
  console.log('─'.repeat(120));
  console.log(
    `${'Model'.padEnd(20)} ${'Mode'.padEnd(12)} ${'Accuracy'.padEnd(10)} ${'Correct'.padEnd(10)} ${'Avg'.padEnd(10)} ${'Median'.padEnd(10)} ${'P95'.padEnd(10)} ${'P99'.padEnd(10)} ${'Max'.padEnd(10)} ${'Timeouts'.padEnd(10)}`,
  );
  console.log('─'.repeat(120));

  const idSummaries = summaries.filter((s) => s.operation === 'identity');
  for (const s of idSummaries) {
    const mode = s.thinkEnabled ? 'thinking' : 'default';
    const acc = (s.accuracy.toFixed(1) + '%').padEnd(10);
    const corr = `${s.correct}/${s.totalCases}`.padEnd(10);
    const avg = (s.avgLatencyMs.toFixed(0) + 'ms').padEnd(10);
    const med = (s.medianLatencyMs.toFixed(0) + 'ms').padEnd(10);
    const p95 = (s.p95LatencyMs.toFixed(0) + 'ms').padEnd(10);
    const p99 = (s.p99LatencyMs.toFixed(0) + 'ms').padEnd(10);
    const mx = (s.maxLatencyMs.toFixed(0) + 'ms').padEnd(10);
    const to = `${s.timeouts}`.padEnd(10);
    console.log(
      `${s.model.padEnd(20)} ${mode.padEnd(12)} ${acc} ${corr} ${avg} ${med} ${p95} ${p99} ${mx} ${to}`,
    );
  }

  console.log('\nEnrichment:');
  console.log('─'.repeat(120));
  console.log(
    `${'Model'.padEnd(20)} ${'Mode'.padEnd(12)} ${'Accuracy'.padEnd(10)} ${'Correct'.padEnd(10)} ${'Avg'.padEnd(10)} ${'Median'.padEnd(10)} ${'P95'.padEnd(10)} ${'P99'.padEnd(10)} ${'Max'.padEnd(10)} ${'Timeouts'.padEnd(10)}`,
  );
  console.log('─'.repeat(120));

  const enrSummaries = summaries.filter((s) => s.operation === 'enrichment');
  for (const s of enrSummaries) {
    const mode = s.thinkEnabled ? 'thinking' : 'default';
    const acc = (s.accuracy.toFixed(1) + '%').padEnd(10);
    const corr = `${s.correct}/${s.totalCases}`.padEnd(10);
    const avg = (s.avgLatencyMs.toFixed(0) + 'ms').padEnd(10);
    const med = (s.medianLatencyMs.toFixed(0) + 'ms').padEnd(10);
    const p95 = (s.p95LatencyMs.toFixed(0) + 'ms').padEnd(10);
    const p99 = (s.p99LatencyMs.toFixed(0) + 'ms').padEnd(10);
    const mx = (s.maxLatencyMs.toFixed(0) + 'ms').padEnd(10);
    const to = `${s.timeouts}`.padEnd(10);
    console.log(
      `${s.model.padEnd(20)} ${mode.padEnd(12)} ${acc} ${corr} ${avg} ${med} ${p95} ${p99} ${mx} ${to}`,
    );
  }

  console.log('\nClassification (sanity check):');
  console.log('─'.repeat(80));
  const classSummaries = summaries.filter((s) => s.operation === 'classification');
  for (const s of classSummaries) {
    const mode = s.thinkEnabled ? 'thinking' : 'default';
    console.log(
      `${s.model.padEnd(20)} ${mode.padEnd(12)} ${s.accuracy.toFixed(1)}% (${s.correct}/${s.totalCases}) avg ${s.avgLatencyMs.toFixed(0)}ms`,
    );
  }

  // Save final
  writeFileSync(
    join(RESULTS_DIR, 'model-benchmark-results.json'),
    JSON.stringify(allResults, null, 2),
  );
  writeFileSync(
    join(RESULTS_DIR, 'model-benchmark-summary.json'),
    JSON.stringify(summaries, null, 2),
  );
  console.log(`\nResults saved to ${RESULTS_DIR}`);
}

main().catch(console.error);
