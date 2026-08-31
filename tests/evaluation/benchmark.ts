import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESULTS_DIR = join(__dirname, 'results');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

interface BenchmarkCase {
  id: string;
  operation: 'classification' | 'identity' | 'enrichment';
  systemPrompt: string;
  userPrompt: string;
  groundTruth: string;
  difficulty: string;
}

interface BenchmarkResult {
  id: string;
  operation: string;
  thinkEnabled: boolean;
  correct: boolean;
  predicted: string;
  expected: string;
  latencyMs: number;
  responseLength: number;
  error?: string;
}

const CLASSIFICATION_SYSTEM = `You are a video game metadata classifier. Return JSON: { "category": "<CATEGORY>", "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid categories: GAME, DLC, EXPANSION, MOVIE, TV_SHOW, ANIME, SOUNDTRACK, BOOK, HARDWARE, PROMOTIONAL, CHARACTER, FRANCHISE, PERSON, EVENT, UNKNOWN`;

const IDENTITY_SYSTEM = `You are a video game identity resolver. Return JSON: { "outcome": "<OUTCOME>", "relationship": null or TYPE, "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid outcomes: SAME_GAME, DIFFERENT_GAME, RELATED_GAME, UNRESOLVED
Valid relationships: REMAKE, REMASTER, ENHANCED_VERSION, PORT, EXPANSION, REGIONAL_RELEASE, ALTERNATE_TITLE, RELATED_GAME`;

const ENRICHMENT_SYSTEM = `You are a video game metadata expert. Return JSON: { "recommendedValue": "<value>", "reasoning": "<brief>", "confidence": <0.0-1.0> }`;

function buildBenchmarkCases(): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  // Classification cases
  cases.push({
    id: 'class-easy',
    operation: 'classification',
    systemPrompt: CLASSIFICATION_SYSTEM,
    userPrompt: `Title: The Legend of Zelda: Breath of the Wild
Description: An action-adventure game for Nintendo Switch
Source hints: GAME
Genre hints: Adventure, Action
Deterministic result: UNKNOWN (confidence: 0.30)
Reason: no hints`,
    groundTruth: 'GAME',
    difficulty: 'easy',
  });

  cases.push({
    id: 'class-dlc',
    operation: 'classification',
    systemPrompt: CLASSIFICATION_SYSTEM,
    userPrompt: `Title: Pokemon Sword and Shield Expansion Pass
Description: Downloadable content for Pokemon Sword and Shield
Source hints: DLC
Genre hints: RPG, Adventure
Deterministic result: DLC (confidence: 0.90)
Reason: source hint`,
    groundTruth: 'DLC',
    difficulty: 'easy',
  });

  cases.push({
    id: 'class-ambiguous',
    operation: 'classification',
    systemPrompt: CLASSIFICATION_SYSTEM,
    userPrompt: `Title: Persona 5 Royal
Description: Enhanced version of Persona 5 JRPG
Source hints: GAME
Genre hints: RPG, JRPG
Deterministic result: UNKNOWN (confidence: 0.30)
Reason: ambiguous`,
    groundTruth: 'GAME',
    difficulty: 'medium',
  });

  cases.push({
    id: 'class-regression-25',
    operation: 'classification',
    systemPrompt: CLASSIFICATION_SYSTEM,
    userPrompt: `Title: Horizon Forbidden West: Burning Shores
Description: Story expansion for Horizon Forbidden West
Source hints: DLC
Genre hints: Action, Adventure
Deterministic result: DLC (confidence: 0.90)
Reason: source hint`,
    groundTruth: 'DLC',
    difficulty: 'hard',
  });

  cases.push({
    id: 'class-regression-35',
    operation: 'classification',
    systemPrompt: CLASSIFICATION_SYSTEM,
    userPrompt: `Title: Persona 5 Royal
Description: Enhanced version of Persona 5 JRPG
Source hints: GAME
Genre hints: RPG, JRPG
Deterministic result: UNKNOWN (confidence: 0.30)
Reason: ambiguous`,
    groundTruth: 'GAME',
    difficulty: 'hard',
  });

  // Identity cases
  cases.push({
    id: 'id-alias',
    operation: 'identity',
    systemPrompt: IDENTITY_SYSTEM,
    userPrompt: `Candidate: "GTA V"
  Developers: Rockstar North
  Platforms: PC, PlayStation 5, Xbox Series X
Existing: "Grand Theft Auto V"
  Developers: Rockstar North
  Platforms: PC, PlayStation 5, Xbox Series X
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`,
    groundTruth: 'SAME_GAME',
    difficulty: 'easy',
  });

  cases.push({
    id: 'id-abbreviation',
    operation: 'identity',
    systemPrompt: IDENTITY_SYSTEM,
    userPrompt: `Candidate: "FFX"
  Developers: Square
  Platforms: PlayStation 2
Existing: "Final Fantasy X"
  Developers: Square
  Platforms: PlayStation 2
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`,
    groundTruth: 'SAME_GAME',
    difficulty: 'easy',
  });

  cases.push({
    id: 'id-remake',
    operation: 'identity',
    systemPrompt: IDENTITY_SYSTEM,
    userPrompt: `Candidate: "Resident Evil 4"
  Developers: Capcom
  Platforms: PlayStation 2
Existing: "Resident Evil 4 Remake"
  Developers: Capcom
  Platforms: PlayStation 5, PC
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`,
    groundTruth: 'RELATED_GAME',
    difficulty: 'medium',
  });

  cases.push({
    id: 'id-enhanced',
    operation: 'identity',
    systemPrompt: IDENTITY_SYSTEM,
    userPrompt: `Candidate: "Persona 5"
  Developers: Atlus
  Platforms: PlayStation 3, PlayStation 4
Existing: "Persona 5 Royal"
  Developers: Atlus
  Platforms: PlayStation 4, PlayStation 5, PC
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`,
    groundTruth: 'RELATED_GAME',
    difficulty: 'hard',
  });

  cases.push({
    id: 'id-different',
    operation: 'identity',
    systemPrompt: IDENTITY_SYSTEM,
    userPrompt: `Candidate: "Dark Souls 3"
  Developers: FromSoftware
  Platforms: PC, PlayStation 4, Xbox One
Existing: "Dark Souls: Remastered"
  Developers: FromSoftware, QLOC
  Platforms: PC, PlayStation 4, Xbox One, Nintendo Switch
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`,
    groundTruth: 'DIFFERENT_GAME',
    difficulty: 'medium',
  });

  cases.push({
    id: 'id-timeout-1',
    operation: 'identity',
    systemPrompt: IDENTITY_SYSTEM,
    userPrompt: `Candidate: "CoD: Modern Warfare"
  Developers: Infinity Ward
  Platforms: PC, PlayStation 5, Xbox Series X
Existing: "Call of Duty 4: Modern Warfare"
  Developers: Infinity Ward
  Platforms: PC, PlayStation 3, Xbox 360
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`,
    groundTruth: 'SAME_GAME',
    difficulty: 'hard',
  });

  cases.push({
    id: 'id-timeout-2',
    operation: 'identity',
    systemPrompt: IDENTITY_SYSTEM,
    userPrompt: `Candidate: "Metal Gear Solid"
  Developers: Konami
  Platforms: PlayStation
Existing: "Metal Gear Solid: The Twin Snakes"
  Developers: Konami, Silicon Knights
  Platforms: GameCube
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`,
    groundTruth: 'RELATED_GAME',
    difficulty: 'hard',
  });

  // Enrichment cases
  cases.push({
    id: 'enr-developer',
    operation: 'enrichment',
    systemPrompt: ENRICHMENT_SYSTEM,
    userPrompt: `Field: developer
Game: "Grand Theft Auto V"
Source A (steam): "Rockstar Games"
Source B (wikipedia): "Rockstar North"
Which value is more likely correct?`,
    groundTruth: 'Rockstar North',
    difficulty: 'easy',
  });

  cases.push({
    id: 'enr-platform',
    operation: 'enrichment',
    systemPrompt: ENRICHMENT_SYSTEM,
    userPrompt: `Field: platform
Game: "Final Fantasy XVI"
Source A (playstation_store): "PlayStation 5"
Source B (wikipedia): "PS5"
Which value is more likely correct?`,
    groundTruth: 'PlayStation 5',
    difficulty: 'easy',
  });

  cases.push({
    id: 'enr-date',
    operation: 'enrichment',
    systemPrompt: ENRICHMENT_SYSTEM,
    userPrompt: `Field: release_date
Game: "Elden Ring"
Source A (steam): "2022-02-25"
Source B (wikipedia): "February 25, 2022"
Which value is more likely correct?`,
    groundTruth: '2022-02-25',
    difficulty: 'easy',
  });

  cases.push({
    id: 'enr-genre',
    operation: 'enrichment',
    systemPrompt: ENRICHMENT_SYSTEM,
    userPrompt: `Field: genre
Game: "Hollow Knight"
Source A (steam): "Metroidvania"
Source B (wikipedia): "Action-adventure platformer"
Which value is more likely correct?`,
    groundTruth: 'Metroidvania',
    difficulty: 'medium',
  });

  cases.push({
    id: 'enr-developer-specific',
    operation: 'enrichment',
    systemPrompt: ENRICHMENT_SYSTEM,
    userPrompt: `Field: developer
Game: "Elden Ring"
Source A (steam): "FromSoftware"
Source B (wikipedia): "From Software"
Which value is more likely correct?`,
    groundTruth: 'FromSoftware',
    difficulty: 'medium',
  });

  return cases;
}

async function measureRequest(
  url: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  thinkEnabled: boolean,
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: 'json',
        stream: false,
        think: thinkEnabled,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown');
      return { latencyMs: Date.now() - start, response: '', error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();
    const response = data.message?.content ?? '';
    return { latencyMs: Date.now() - start, response };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === 'AbortError') {
      return { latencyMs, response: '', error: 'TIMEOUT' };
    }
    return { latencyMs, response: '', error: String(err) };
  }
}

function parseResponse(raw: string, operation: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (operation === 'classification') return parsed.category ?? 'UNKNOWN';
    if (operation === 'identity') return parsed.outcome ?? 'UNRESOLVED';
    if (operation === 'enrichment') return parsed.recommendedValue ?? '';
    return '';
  } catch {
    return 'PARSE_ERROR';
  }
}

async function runBenchmark() {
  const url = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.AI_MODEL ?? 'qwen3:8b';
  const timeoutMs = 60000;

  console.log(`=== Qwen3:8B Benchmark ===`);
  console.log(`Model: ${model}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log('');

  const cases = buildBenchmarkCases();
  const results: BenchmarkResult[] = [];

  // Run with thinking enabled (default)
  console.log('--- Thinking Enabled (default) ---');
  for (const c of cases) {
    process.stdout.write(`  ${c.id} (${c.operation})... `);
    const { latencyMs, response, error } = await measureRequest(
      url,
      model,
      c.systemPrompt,
      c.userPrompt,
      true,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parseResponse(response, c.operation);
    const correct = predicted === c.groundTruth;

    results.push({
      id: c.id,
      operation: c.operation,
      thinkEnabled: true,
      correct,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      responseLength: response.length,
      error,
    });

    console.log(
      `${correct ? 'OK' : 'WRONG'} ${latencyMs}ms (predicted: ${predicted}, truth: ${c.groundTruth})${error ? ' ERROR: ' + error : ''}`,
    );
  }

  // Run with thinking disabled
  console.log('\n--- Thinking Disabled (think: false) ---');
  for (const c of cases) {
    process.stdout.write(`  ${c.id} (${c.operation})... `);
    const { latencyMs, response, error } = await measureRequest(
      url,
      model,
      c.systemPrompt,
      c.userPrompt,
      false,
      timeoutMs,
    );
    const predicted = error ? 'ERROR' : parseResponse(response, c.operation);
    const correct = predicted === c.groundTruth;

    results.push({
      id: c.id,
      operation: c.operation,
      thinkEnabled: false,
      correct,
      predicted,
      expected: c.groundTruth,
      latencyMs,
      responseLength: response.length,
      error,
    });

    console.log(
      `${correct ? 'OK' : 'WRONG'} ${latencyMs}ms (predicted: ${predicted}, truth: ${c.groundTruth})${error ? ' ERROR: ' + error : ''}`,
    );
  }

  // Summary
  console.log('\n=== Summary ===');
  const thinkEnabled = results.filter((r) => r.thinkEnabled);
  const thinkDisabled = results.filter((r) => !r.thinkEnabled);

  for (const group of [
    { label: 'Thinking Enabled', data: thinkEnabled },
    { label: 'Thinking Disabled', data: thinkDisabled },
  ]) {
    console.log(`\n${group.label}:`);
    const valid = group.data.filter((r) => !r.error);
    const errors = group.data.filter((r) => r.error);
    const correct = valid.filter((r) => r.correct).length;
    const latencies = valid.map((r) => r.latencyMs);

    console.log(`  Total: ${group.data.length} (${errors.length} errors)`);
    console.log(
      `  Correct: ${correct}/${valid.length} (${((correct / valid.length) * 100).toFixed(1)}%)`,
    );
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      console.log(
        `  Latency avg: ${(latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000).toFixed(1)}s`,
      );
      console.log(
        `  Latency median: ${(latencies[Math.floor(latencies.length / 2)] / 1000).toFixed(1)}s`,
      );
      console.log(
        `  Latency p95: ${(latencies[Math.floor(latencies.length * 0.95)] / 1000).toFixed(1)}s`,
      );
      console.log(`  Latency min: ${(latencies[0] / 1000).toFixed(1)}s`);
      console.log(`  Latency max: ${(latencies[latencies.length - 1] / 1000).toFixed(1)}s`);
    }

    // By operation
    for (const op of ['classification', 'identity', 'enrichment']) {
      const opData = valid.filter((r) => r.operation === op);
      const opCorrect = opData.filter((r) => r.correct).length;
      const opLatencies = opData.map((r) => r.latencyMs).sort((a, b) => a - b);
      if (opData.length > 0) {
        console.log(
          `  ${op}: ${opCorrect}/${opData.length} correct, avg ${(opLatencies.reduce((a, b) => a + b, 0) / opLatencies.length / 1000).toFixed(1)}s`,
        );
      }
    }
  }

  // Speedup calculation
  console.log('\n--- Speedup from disabling thinking ---');
  for (const op of ['classification', 'identity', 'enrichment']) {
    const enabled = thinkEnabled.filter((r) => r.operation === op && !r.error);
    const disabled = thinkDisabled.filter((r) => r.operation === op && !r.error);
    if (enabled.length > 0 && disabled.length > 0) {
      const avgEnabled = enabled.reduce((a, r) => a + r.latencyMs, 0) / enabled.length;
      const avgDisabled = disabled.reduce((a, r) => a + r.latencyMs, 0) / disabled.length;
      console.log(`  ${op}: ${(avgEnabled / avgDisabled).toFixed(1)}x faster`);
    }
  }

  // Save results
  const resultsPath = join(RESULTS_DIR, 'benchmark-results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsPath}`);
}

runBenchmark().catch(console.error);
