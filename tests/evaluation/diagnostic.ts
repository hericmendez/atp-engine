import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface OllamaResponse {
  message?: { content?: string };
  error?: string;
}

async function measureRequest(
  url: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<{
  totalMs: number;
  httpMs: number;
  data: OllamaResponse;
  rawResponse: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const httpStart = Date.now();
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
    }),
    signal: controller.signal,
  });
  const httpMs = Date.now() - httpStart;

  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const rawResponse = data.message?.content ?? '';
  const totalMs = httpMs;

  return { totalMs, httpMs, data, rawResponse };
}

async function diagnostic() {
  const url = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.AI_MODEL ?? 'qwen3:8b';
  const timeoutMs = 180000;

  console.log(`=== Qwen3:8B Diagnostic ===`);
  console.log(`Model: ${model}`);
  console.log(`URL: ${url}`);
  console.log('');

  // Test 1: Simple classification
  console.log('--- Test 1: Simple Classification (Zelda BOTW) ---');
  const classPrompt = `Title: The Legend of Zelda: Breath of the Wild
Description: An action-adventure game for Nintendo Switch
Source hints: GAME
Genre hints: Adventure, Action
Deterministic result: UNKNOWN (confidence: 0.30)
Reason: no hints`;

  const classSystem = `You are a video game metadata classifier. Return JSON: { "category": "<CATEGORY>", "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid categories: GAME, DLC, EXPANSION, MOVIE, TV_SHOW, ANIME, SOUNDTRACK, BOOK, HARDWARE, PROMOTIONAL, CHARACTER, FRANCHISE, PERSON, EVENT, UNKNOWN`;

  try {
    const result = await measureRequest(url, model, classSystem, classPrompt, timeoutMs);
    console.log(`  Total: ${result.totalMs}ms`);
    console.log(`  Response length: ${result.rawResponse.length} chars`);
    console.log(`  Response preview: ${result.rawResponse.slice(0, 200)}...`);

    // Check for thinking tags
    const hasThinking =
      result.rawResponse.includes('<think>') || result.rawResponse.includes('</think>');
    console.log(`  Has thinking: ${hasThinking}`);
    if (hasThinking) {
      const thinkMatch = result.rawResponse.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        console.log(`  Thinking length: ${thinkMatch[1].length} chars`);
        console.log(`  Thinking preview: ${thinkMatch[1].slice(0, 100)}...`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err}`);
  }

  // Test 2: Identity resolution (the one that times out)
  console.log('\n--- Test 2: Identity Resolution (CoD: Modern Warfare) ---');
  const idPrompt = `Candidate: "CoD: Modern Warfare"
  Developers: Infinity Ward
  Platforms: PC, PlayStation 5, Xbox Series X
Existing: "Call of Duty 4: Modern Warfare"
  Developers: Infinity Ward
  Platforms: PC, PlayStation 3, Xbox 360
Deterministic result: UNRESOLVED (confidence: 0.30)
Reason: test`;

  const idSystem = `You are a video game identity resolver. Return JSON: { "outcome": "<OUTCOME>", "relationship": null or TYPE, "confidence": <0.0-1.0>, "reasoning": "<brief>" }
Valid outcomes: SAME_GAME, DIFFERENT_GAME, RELATED_GAME, UNRESOLVED
Valid relationships: REMAKE, REMASTER, ENHANCED_VERSION, PORT, EXPANSION, REGIONAL_RELEASE, ALTERNATE_TITLE, RELATED_GAME`;

  try {
    const result = await measureRequest(url, model, idSystem, idPrompt, timeoutMs);
    console.log(`  Total: ${result.totalMs}ms`);
    console.log(`  Response length: ${result.rawResponse.length} chars`);
    console.log(`  Response preview: ${result.rawResponse.slice(0, 200)}...`);

    const hasThinking =
      result.rawResponse.includes('<think>') || result.rawResponse.includes('</think>');
    console.log(`  Has thinking: ${hasThinking}`);
    if (hasThinking) {
      const thinkMatch = result.rawResponse.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        console.log(`  Thinking length: ${thinkMatch[1].length} chars`);
        console.log(`  Thinking preview: ${thinkMatch[1].slice(0, 200)}...`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err}`);
  }

  // Test 3: Try with thinking disabled (Ollama 0.32+ supports this)
  console.log('\n--- Test 3: Identity with thinking disabled ---');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const httpStart = Date.now();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: idSystem },
          { role: 'user', content: idPrompt },
        ],
        format: 'json',
        stream: false,
        think: false,
      }),
      signal: controller.signal,
    });
    const httpMs = Date.now() - httpStart;
    clearTimeout(timeout);

    const data = await res.json();
    const rawResponse = data.message?.content ?? '';
    console.log(`  Total: ${httpMs}ms`);
    console.log(`  Response length: ${rawResponse.length} chars`);
    console.log(`  Response preview: ${rawResponse.slice(0, 200)}...`);
    console.log(`  Has thinking: ${rawResponse.includes('<think>')}`);
  } catch (err) {
    console.log(`  ERROR: ${err}`);
  }

  // Test 4: Enrichment conflict
  console.log('\n--- Test 4: Enrichment Conflict (Rockstar) ---');
  const enrPrompt = `Field: developer
Game: "Grand Theft Auto V"
Source A (steam): "Rockstar Games"
Source B (wikipedia): "Rockstar North"
Which value is more likely correct?`;

  const enrSystem = `You are a video game metadata expert. Return JSON: { "recommendedValue": "<value>", "reasoning": "<brief>", "confidence": <0.0-1.0> }`;

  try {
    const result = await measureRequest(url, model, enrSystem, enrPrompt, timeoutMs);
    console.log(`  Total: ${result.totalMs}ms`);
    console.log(`  Response length: ${result.rawResponse.length} chars`);
    console.log(`  Response preview: ${result.rawResponse.slice(0, 200)}...`);

    const hasThinking =
      result.rawResponse.includes('<think>') || result.rawResponse.includes('</think>');
    console.log(`  Has thinking: ${hasThinking}`);
    if (hasThinking) {
      const thinkMatch = result.rawResponse.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        console.log(`  Thinking length: ${thinkMatch[1].length} chars`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err}`);
  }

  // Test 5: Check if thinking: false actually works
  console.log('\n--- Test 5: Classification with think: false ---');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const httpStart = Date.now();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: classSystem },
          { role: 'user', content: classPrompt },
        ],
        format: 'json',
        stream: false,
        think: false,
      }),
      signal: controller.signal,
    });
    const httpMs = Date.now() - httpStart;
    clearTimeout(timeout);

    const data = await res.json();
    const rawResponse = data.message?.content ?? '';
    console.log(`  Total: ${httpMs}ms`);
    console.log(`  Response length: ${rawResponse.length} chars`);
    console.log(`  Response: ${rawResponse}`);
  } catch (err) {
    console.log(`  ERROR: ${err}`);
  }

  console.log('\n=== Diagnostic Complete ===');
}

diagnostic().catch(console.error);
