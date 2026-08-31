import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATASETS_DIR = join(__dirname, 'datasets');
const RESULTS_DIR = join(__dirname, 'results');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

interface EvalResult {
  id: string;
  operation: string;
  correct: boolean;
  predicted: string;
  expected: string;
  latencyMs: number;
  error?: string;
}

const CLASSIFICATION_SYSTEM = `You are a video game metadata classifier. Return JSON: { "category": "<CATEGORY>", "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid categories: GAME, DLC, EXPANSION, MOVIE, TV_SHOW, ANIME, SOUNDTRACK, BOOK, HARDWARE, PROMOTIONAL, CHARACTER, FRANCHISE, PERSON, EVENT, UNKNOWN`;

const IDENTITY_SYSTEM = `You are a video game identity resolver. Return JSON: { "outcome": "<OUTCOME>", "relationship": null or TYPE, "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid outcomes: SAME_GAME, DIFFERENT_GAME, RELATED_GAME, UNRESOLVED
Valid relationships: REMAKE, REMASTER, ENHANCED_VERSION, PORT, EXPANSION, REGIONAL_RELEASE, ALTERNATE_TITLE, RELATED_GAME`;

const ENRICHMENT_SYSTEM = `You are a video game metadata expert. Return JSON: { "recommendedValue": "<value>", "reasoning": "<brief>", "confidence": <0.0-1.0> }`;

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
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        format: 'json',
        stream: false,
        think,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      await res.text().catch(() => '');
      return { latencyMs: Date.now() - start, response: '', error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { latencyMs: Date.now() - start, response: data.message?.content ?? '' };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return { latencyMs: Date.now() - start, response: '', error: 'TIMEOUT' };
    }
    return { latencyMs: Date.now() - start, response: '', error: String(err) };
  }
}

function parse(raw: string, op: string): string {
  try {
    const p = JSON.parse(raw);
    if (op === 'classification') return p.category ?? 'UNKNOWN';
    if (op === 'identity') return p.outcome ?? 'UNRESOLVED';
    if (op === 'enrichment') return p.recommendedValue ?? '';
    return '';
  } catch {
    return 'PARSE_ERROR';
  }
}

async function main() {
  const url = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.AI_MODEL ?? 'qwen3:8b';
  const timeoutMs = 60000;

  console.log(`=== Full Evaluation with think: false ===`);
  console.log(`Model: ${model}, Timeout: ${timeoutMs}ms\n`);

  const classification = JSON.parse(
    readFileSync(join(DATASETS_DIR, 'classification.json'), 'utf8'),
  );
  const identity = JSON.parse(readFileSync(join(DATASETS_DIR, 'identity.json'), 'utf8'));
  const enrichment = JSON.parse(readFileSync(join(DATASETS_DIR, 'enrichment.json'), 'utf8'));

  const results: EvalResult[] = [];

  // Classification
  console.log(`--- Classification (${classification.length} cases) ---`);
  for (const c of classification) {
    process.stdout.write(`  ${c.id}... `);
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
      false,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parse(response, 'classification');
    const correct = predicted === c.groundTruth;

    results.push({
      id: c.id,
      operation: 'classification',
      correct,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      error,
    });
    console.log(
      `${correct ? 'OK' : 'WRONG'} ${latencyMs}ms ${predicted}${error ? ' ERR:' + error : ''}`,
    );
  }

  // Identity
  console.log(`\n--- Identity (${identity.length} cases) ---`);
  for (const c of identity) {
    process.stdout.write(`  ${c.id}... `);
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
      false,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parse(response, 'identity');
    const correct = predicted === c.groundTruth;

    results.push({
      id: c.id,
      operation: 'identity',
      correct,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      error,
    });
    console.log(
      `${correct ? 'OK' : 'WRONG'} ${latencyMs}ms ${predicted}${error ? ' ERR:' + error : ''}`,
    );
  }

  // Enrichment
  console.log(`\n--- Enrichment (${enrichment.length} cases) ---`);
  for (const c of enrichment) {
    process.stdout.write(`  ${c.id}... `);
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
      false,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parse(response, 'enrichment');
    const correct = predicted === c.groundTruth;

    results.push({
      id: c.id,
      operation: 'enrichment',
      correct,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      error,
    });
    console.log(
      `${correct ? 'OK' : 'WRONG'} ${latencyMs}ms "${predicted}"${error ? ' ERR:' + error : ''}`,
    );
  }

  // Summary
  console.log('\n=== Summary ===');
  for (const op of ['classification', 'identity', 'enrichment']) {
    const opResults = results.filter((r) => r.operation === op);
    const valid = opResults.filter((r) => !r.error);
    const errors = opResults.filter((r) => r.error);
    const correct = valid.filter((r) => r.correct).length;
    const latencies = valid.map((r) => r.latencyMs).sort((a, b) => a - b);

    console.log(`${op}: ${correct}/${valid.length} correct (${errors.length} errors)`);
    if (latencies.length > 0) {
      console.log(
        `  Avg: ${(latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000).toFixed(1)}s, Median: ${(latencies[Math.floor(latencies.length / 2)] / 1000).toFixed(1)}s, P95: ${(latencies[Math.floor(latencies.length * 0.95)] / 1000).toFixed(1)}s`,
      );
    }
  }

  const totalValid = results.filter((r) => !r.error);
  const totalCorrect = totalValid.filter((r) => r.correct).length;
  console.log(
    `\nOverall: ${totalCorrect}/${totalValid.length} correct (${results.filter((r) => r.error).length} errors)`,
  );

  const resultsPath = join(RESULTS_DIR, 'eval-think-false.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${resultsPath}`);
}

main().catch(console.error);
