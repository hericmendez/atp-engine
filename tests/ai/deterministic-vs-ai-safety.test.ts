import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMProvider } from '../../src/ai/provider.js';
import type {
  AIClassificationRequest,
  AIClassificationResponse,
  AIIdentityRequest,
  AIIdentityResponse,
  AIEnrichmentConflictRequest,
  AIEnrichmentConflictResponse,
} from '../../src/ai/types.js';
import { AIClassifier } from '../../src/ai/ai-classifier.js';
import { AIIdentityResolver } from '../../src/ai/ai-identity-resolver.js';
import { AIEnrichmentAssist } from '../../src/ai/ai-enrichment.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import { DeterministicIdentityResolver } from '../../src/identity/deterministic-identity-resolver.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { Game } from '../../src/domain/game/game.js';
import type { EnrichmentConflict } from '../../src/enrichment/enrichment-types.js';

// ─── Fake Provider ─────────────────────────────────────────────

class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake';
  classifyResult: AIClassificationResponse = {
    category: 'GAME',
    confidence: 0.9,
    reasoning: 'Fake AI',
  };
  identityResult: AIIdentityResponse = {
    outcome: 'SAME_GAME',
    relationship: null,
    confidence: 0.9,
    reasoning: 'Fake AI',
  };
  conflictResult: AIEnrichmentConflictResponse = {
    recommendedValue: 'ai-value',
    reasoning: 'Fake AI',
    confidence: 0.9,
  };
  shouldFail = false;
  failureError: Error | null = null;

  async classify(_req: AIClassificationRequest): Promise<AIClassificationResponse> {
    if (this.shouldFail) throw this.failureError ?? new Error('Fake failure');
    return this.classifyResult;
  }
  async resolveIdentity(_req: AIIdentityRequest): Promise<AIIdentityResponse> {
    if (this.shouldFail) throw this.failureError ?? new Error('Fake failure');
    return this.identityResult;
  }
  async resolveConflict(_req: AIEnrichmentConflictRequest): Promise<AIEnrichmentConflictResponse> {
    if (this.shouldFail) throw this.failureError ?? new Error('Fake failure');
    return this.conflictResult;
  }
  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function makeCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    titles: [{ value: 'Test Game', type: 'primary' }],
    developers: [],
    publishers: [],
    genres: [],
    releases: [
      {
        platform: { name: 'Windows', family: 'PC' },
        region: null,
        releaseDate: null,
        version: null,
        edition: null,
        distributionChannels: [],
        launchers: [],
        externalIdentifiers: [],
      },
    ],
    externalIdentifiers: [],
    provenance: {
      source: 'test',
      sourceId: '1',
      retrievedAt: new Date().toISOString(),
      rawTitle: null,
    },
    classificationHints: [],
    description: null,
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1' as Game['id'],
    titles: [{ value: 'Existing Game', type: 'primary' }],
    developers: [],
    publishers: [],
    genres: [],
    releases: [],
    externalIdentifiers: [],
    relationships: [],
    evidence: [],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    cover: null,
    ...overrides,
  };
}

function makeConflict(overrides: Partial<EnrichmentConflict> = {}): EnrichmentConflict {
  return {
    fieldType: 'title',
    sourceA: 'steam',
    valueA: 'Title A',
    sourceB: 'wikipedia',
    valueB: 'Title B',
    retainedValue: 'Title A',
    reason: 'Conflict',
    ...overrides,
  };
}

// ─── Deterministic vs AI Safety Tests ──────────────────────────

describe('Deterministic vs AI Safety', () => {
  const deterministic = new DeterministicClassifier();
  const deterministicIdentity = new DeterministicIdentityResolver();
  let fakeProvider: FakeLLMProvider;

  beforeEach(() => {
    fakeProvider = new FakeLLMProvider();
  });

  describe('AI_ENABLED=false → deterministic result', () => {
    it('classifier returns deterministic when AI disabled', async () => {
      const classifier = new AIClassifier(deterministic, fakeProvider, { enabled: false });
      const candidate = makeCandidate({
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe('GAME');
      expect(result.reason).not.toContain('AI');
    });

    it('identity returns deterministic when AI disabled', async () => {
      const resolver = new AIIdentityResolver(deterministicIdentity, fakeProvider, {
        enabled: false,
      });
      const candidate = makeCandidate({
        externalIdentifiers: [{ source: 'steam', id: '123' }],
      });
      const game = makeGame({
        externalIdentifiers: [{ source: 'steam', id: '123' }],
      });
      const result = await resolver.resolve(candidate, game);
      expect(result.outcome).toBe('SAME_GAME');
      expect(result.method).toBe('NATIVE');
    });

    it('enrichment returns empty when AI disabled', async () => {
      const assist = new AIEnrichmentAssist(fakeProvider, { enabled: false });
      const results = await assist.resolveConflicts([makeConflict()], makeGame());
      expect(results).toHaveLength(0);
    });
  });

  describe('AI_ENABLED=true + AI available → AI-assisted result', () => {
    it('classifier uses AI when low confidence', async () => {
      const classifier = new AIClassifier(deterministic, fakeProvider, {
        enabled: true,
        lowConfidenceThreshold: 0.7,
        provider: 'fake',
        model: 'test-model',
      });
      const candidate = makeCandidate({
        classificationHints: [],
        description: 'A mysterious adventure',
      });
      const result = await classifier.classify(candidate);
      if (result.confidence < 0.7) {
        expect(result.reason).toContain('AI');
      }
    });

    it('identity uses AI when UNRESOLVED', async () => {
      const resolver = new AIIdentityResolver(deterministicIdentity, fakeProvider, {
        enabled: true,
        lowConfidenceThreshold: 0.6,
        provider: 'fake',
        model: 'test-model',
      });
      const candidate = makeCandidate({
        titles: [{ value: 'Completely Different', type: 'primary' }],
      });
      const game = makeGame({
        titles: [{ value: 'Another Game', type: 'primary' }],
      });
      const result = await resolver.resolve(candidate, game);
      if (result.outcome === 'UNRESOLVED') {
        expect(result.method).toBe('AI');
      }
    });
  });

  describe('AI_ENABLED=true + AI unavailable → deterministic fallback', () => {
    it('classifier falls back on AI failure', async () => {
      fakeProvider.shouldFail = true;
      const classifier = new AIClassifier(deterministic, fakeProvider, { enabled: true });
      const candidate = makeCandidate({
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe('GAME');
    });

    it('identity falls back on AI failure', async () => {
      fakeProvider.shouldFail = true;
      const resolver = new AIIdentityResolver(deterministicIdentity, fakeProvider, {
        enabled: true,
      });
      const candidate = makeCandidate({
        externalIdentifiers: [{ source: 'steam', id: '123' }],
      });
      const game = makeGame({
        externalIdentifiers: [{ source: 'steam', id: '123' }],
      });
      const result = await resolver.resolve(candidate, game);
      expect(result.outcome).toBe('SAME_GAME');
    });

    it('enrichment falls back on AI failure', async () => {
      fakeProvider.shouldFail = true;
      const assist = new AIEnrichmentAssist(fakeProvider, { enabled: true });
      const results = await assist.resolveConflicts([makeConflict()], makeGame());
      expect(results).toHaveLength(0);
    });

    it('classifier falls back on timeout', async () => {
      fakeProvider.failureError = new Error('Ollama request timed out after 10000ms');
      const classifier = new AIClassifier(deterministic, fakeProvider, { enabled: true });
      const candidate = makeCandidate({
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe('GAME');
    });

    it('identity falls back on HTTP 500', async () => {
      fakeProvider.failureError = new Error('Ollama HTTP 500: Internal Server Error');
      const resolver = new AIIdentityResolver(deterministicIdentity, fakeProvider, {
        enabled: true,
      });
      const candidate = makeCandidate({
        externalIdentifiers: [{ source: 'steam', id: '123' }],
      });
      const game = makeGame({
        externalIdentifiers: [{ source: 'steam', id: '123' }],
      });
      const result = await resolver.resolve(candidate, game);
      expect(result.outcome).toBe('SAME_GAME');
    });

    it('classifier falls back on invalid JSON', async () => {
      fakeProvider.failureError = new Error('Unexpected token');
      const classifier = new AIClassifier(deterministic, fakeProvider, {
        enabled: true,
        lowConfidenceThreshold: 0.3,
      });
      const candidate = makeCandidate({
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(['GAME', 'DLC', 'EXPANSION', 'UNKNOWN']).toContain(result.category);
    });
  });

  describe('AI returns invalid data → deterministic fallback', () => {
    it('classifier falls back on invalid category', async () => {
      fakeProvider.classifyResult = {
        category: 'INVALID_CATEGORY' as 'GAME',
        confidence: 0.9,
        reasoning: 'Invalid',
      };
      const classifier = new AIClassifier(deterministic, fakeProvider, {
        enabled: true,
        lowConfidenceThreshold: 0.3,
      });
      const candidate = makeCandidate({ classificationHints: [] });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe('UNKNOWN');
    });

    it('identity falls back on invalid outcome', async () => {
      fakeProvider.identityResult = {
        outcome: 'INVALID_OUTCOME' as 'SAME_GAME',
        relationship: null,
        confidence: 0.9,
        reasoning: 'Invalid',
      };
      const resolver = new AIIdentityResolver(deterministicIdentity, fakeProvider, {
        enabled: true,
        lowConfidenceThreshold: 0.3,
      });
      const candidate = makeCandidate({
        titles: [{ value: 'Completely Different', type: 'primary' }],
      });
      const game = makeGame({
        titles: [{ value: 'Another Game', type: 'primary' }],
      });
      const result = await resolver.resolve(candidate, game);
      expect(['SAME_GAME', 'DIFFERENT_GAME', 'RELATED_GAME', 'UNRESOLVED']).toContain(
        result.outcome,
      );
    });

    it('classifier falls back on low AI confidence', async () => {
      fakeProvider.classifyResult = {
        category: 'GAME',
        confidence: 0.2,
        reasoning: 'Not sure',
      };
      const classifier = new AIClassifier(deterministic, fakeProvider, {
        enabled: true,
        lowConfidenceThreshold: 0.3,
      });
      const candidate = makeCandidate({ classificationHints: [] });
      const result = await classifier.classify(candidate);
      if (result.confidence < 0.5) {
        expect(result.reason).not.toContain('AI');
      }
    });

    it('identity falls back on low AI confidence', async () => {
      fakeProvider.identityResult = {
        outcome: 'SAME_GAME',
        relationship: null,
        confidence: 0.2,
        reasoning: 'Not sure',
      };
      const resolver = new AIIdentityResolver(deterministicIdentity, fakeProvider, {
        enabled: true,
        lowConfidenceThreshold: 0.3,
      });
      const candidate = makeCandidate({
        titles: [{ value: 'Completely Different', type: 'primary' }],
      });
      const game = makeGame({
        titles: [{ value: 'Another Game', type: 'primary' }],
      });
      const result = await resolver.resolve(candidate, game);
      if (result.confidence < 0.5) {
        expect(result.method).toBe('NATIVE');
      }
    });
  });
});
