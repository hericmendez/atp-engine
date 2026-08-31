import { describe, it, expect } from 'vitest';
import { parseAIConfig } from '../../src/ai/config.js';
import {
  CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD,
  CLASSIFICATION_AMBIGUITY_THRESHOLD,
  AI_MIN_CONFIDENCE,
  IDENTITY_LOW_CONFIDENCE_THRESHOLD,
  ENRICHMENT_MIN_CONFIDENCE,
  VALID_CLASSIFICATION_CATEGORIES,
  VALID_IDENTITY_OUTCOMES,
  VALID_RELATIONSHIP_TYPES,
} from '../../src/ai/constants.js';
import { CLASSIFICATION_PROMPT_VERSION } from '../../src/ai/prompts/classification.js';
import { IDENTITY_PROMPT_VERSION } from '../../src/ai/prompts/identity.js';
import { ENRICHMENT_PROMPT_VERSION } from '../../src/ai/prompts/enrichment.js';

describe('AI config', () => {
  it('returns defaults when no env vars provided', () => {
    const config = parseAIConfig({});
    expect(config.AI_ENABLED).toBe(false);
    expect(config.AI_PROVIDER).toBe('ollama');
    expect(config.AI_MODEL).toBe('qwen3:8b');
    expect(config.OLLAMA_URL).toBe('http://localhost:11434');
    expect(config.AI_TIMEOUT_MS).toBe(10000);
  });

  it('parses custom values', () => {
    const config = parseAIConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'ollama',
      AI_MODEL: 'llama3:8b',
      OLLAMA_URL: 'http://custom:11434',
      AI_TIMEOUT_MS: '5000',
    });
    expect(config.AI_ENABLED).toBe(true);
    expect(config.AI_MODEL).toBe('llama3:8b');
    expect(config.OLLAMA_URL).toBe('http://custom:11434');
    expect(config.AI_TIMEOUT_MS).toBe(5000);
  });

  it('throws on invalid OLLAMA_URL', () => {
    expect(() => parseAIConfig({ OLLAMA_URL: 'not-a-url' })).toThrow();
  });

  it('throws on invalid AI_TIMEOUT_MS', () => {
    expect(() => parseAIConfig({ AI_TIMEOUT_MS: 'not-a-number' })).toThrow();
  });

  it('throws on invalid AI_PROVIDER', () => {
    expect(() => parseAIConfig({ AI_PROVIDER: 'openai' })).toThrow();
  });

  it('throws on empty AI_MODEL', () => {
    expect(() => parseAIConfig({ AI_MODEL: '' })).toThrow();
  });
});

describe('AI Constants', () => {
  it('classification thresholds are reasonable', () => {
    expect(CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1);
    expect(CLASSIFICATION_AMBIGUITY_THRESHOLD).toBeGreaterThan(0);
    expect(CLASSIFICATION_AMBIGUITY_THRESHOLD).toBeLessThan(1);
    expect(AI_MIN_CONFIDENCE).toBeGreaterThan(0);
    expect(AI_MIN_CONFIDENCE).toBeLessThan(1);
  });

  it('identity thresholds are reasonable', () => {
    expect(IDENTITY_LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(IDENTITY_LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });

  it('enrichment thresholds are reasonable', () => {
    expect(ENRICHMENT_MIN_CONFIDENCE).toBeGreaterThan(0);
    expect(ENRICHMENT_MIN_CONFIDENCE).toBeLessThan(1);
  });

  it('valid classification categories match domain vocabulary', () => {
    expect(VALID_CLASSIFICATION_CATEGORIES).toContain('GAME');
    expect(VALID_CLASSIFICATION_CATEGORIES).toContain('DLC');
    expect(VALID_CLASSIFICATION_CATEGORIES).toContain('EXPANSION');
    expect(VALID_CLASSIFICATION_CATEGORIES).toContain('MOVIE');
    expect(VALID_CLASSIFICATION_CATEGORIES).toContain('TV_SHOW');
    expect(VALID_CLASSIFICATION_CATEGORIES).toContain('ANIME');
    expect(VALID_CLASSIFICATION_CATEGORIES).toContain('UNKNOWN');
    expect(VALID_CLASSIFICATION_CATEGORIES.length).toBe(15);
  });

  it('valid identity outcomes match domain vocabulary', () => {
    expect(VALID_IDENTITY_OUTCOMES).toContain('SAME_GAME');
    expect(VALID_IDENTITY_OUTCOMES).toContain('DIFFERENT_GAME');
    expect(VALID_IDENTITY_OUTCOMES).toContain('RELATED_GAME');
    expect(VALID_IDENTITY_OUTCOMES).toContain('UNRESOLVED');
    expect(VALID_IDENTITY_OUTCOMES.length).toBe(4);
  });

  it('valid relationship types match domain vocabulary', () => {
    expect(VALID_RELATIONSHIP_TYPES).toContain('REMAKE');
    expect(VALID_RELATIONSHIP_TYPES).toContain('REMASTER');
    expect(VALID_RELATIONSHIP_TYPES).toContain('PORT');
    expect(VALID_RELATIONSHIP_TYPES.length).toBe(8);
  });
});

describe('Prompt Versions', () => {
  it('classification prompt has version', () => {
    expect(CLASSIFICATION_PROMPT_VERSION).toMatch(/^classification-v\d+$/);
  });

  it('identity prompt has version', () => {
    expect(IDENTITY_PROMPT_VERSION).toMatch(/^identity-v\d+$/);
  });

  it('enrichment prompt has version', () => {
    expect(ENRICHMENT_PROMPT_VERSION).toMatch(/^enrichment-v\d+$/);
  });
});
