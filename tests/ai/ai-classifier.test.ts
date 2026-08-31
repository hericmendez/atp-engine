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
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import { ClassificationCategory } from '../../src/domain/shared/classification-category.js';

// ─── Fake Provider ─────────────────────────────────────────────

class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake';
  classifyResult: AIClassificationResponse = {
    category: 'GAME',
    confidence: 0.9,
    reasoning: 'Fake AI classification',
  };
  shouldFail = false;

  async classify(_request: AIClassificationRequest): Promise<AIClassificationResponse> {
    if (this.shouldFail) throw new Error('Fake AI failure');
    return this.classifyResult;
  }

  async resolveIdentity(_request: AIIdentityRequest): Promise<AIIdentityResponse> {
    if (this.shouldFail) throw new Error('Fake AI failure');
    return {
      outcome: 'SAME_GAME',
      relationship: null,
      confidence: 0.9,
      reasoning: 'Fake AI identity',
    };
  }

  async resolveConflict(
    _request: AIEnrichmentConflictRequest,
  ): Promise<AIEnrichmentConflictResponse> {
    if (this.shouldFail) throw new Error('Fake AI failure');
    return {
      recommendedValue: 'resolved',
      reasoning: 'Fake AI conflict resolution',
      confidence: 0.9,
    };
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

// ─── AIClassifier Tests ───────────────────────────────────────

describe('AIClassifier', () => {
  const deterministic = new DeterministicClassifier();
  let fakeProvider: FakeLLMProvider;

  beforeEach(() => {
    fakeProvider = new FakeLLMProvider();
  });

  it('returns deterministic result when AI is disabled', async () => {
    const classifier = new AIClassifier(deterministic, fakeProvider, { enabled: false });
    const candidate = makeCandidate({
      classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
    });

    const result = await classifier.classify(candidate);
    expect(result.category).toBe(ClassificationCategory.GAME);
    expect(result.reason).not.toContain('AI');
  });

  it('escalates to AI when deterministic confidence is low', async () => {
    const classifier = new AIClassifier(deterministic, fakeProvider, {
      enabled: true,
      lowConfidenceThreshold: 0.7,
    });

    const candidate = makeCandidate({
      classificationHints: [],
      description: 'A mysterious adventure game with puzzles',
    });

    const result = await classifier.classify(candidate);

    if (result.confidence < 0.7) {
      expect(result.reason).toContain('AI');
    }
  });

  it('returns deterministic result when AI fails', async () => {
    fakeProvider.shouldFail = true;
    const classifier = new AIClassifier(deterministic, fakeProvider, { enabled: true });

    const candidate = makeCandidate({
      classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
    });

    const result = await classifier.classify(candidate);
    expect(result.category).toBe(ClassificationCategory.GAME);
  });

  it('escalates to AI when category is UNKNOWN', async () => {
    const classifier = new AIClassifier(deterministic, fakeProvider, {
      enabled: true,
      lowConfidenceThreshold: 0.3,
    });

    const candidate = makeCandidate({
      titles: [{ value: 'Celeste', type: 'primary' }],
      classificationHints: [],
      description: null,
    });

    const result = await classifier.classify(candidate);

    if (result.category === 'UNKNOWN') {
      expect(result.reason).toContain('AI');
    }
  });

  it('returns deterministic result when AI confidence is too low', async () => {
    fakeProvider.classifyResult = {
      category: 'GAME',
      confidence: 0.3,
      reasoning: 'Low confidence AI',
    };

    const classifier = new AIClassifier(deterministic, fakeProvider, {
      enabled: true,
      lowConfidenceThreshold: 0.3,
    });

    const candidate = makeCandidate({
      classificationHints: [],
    });

    const result = await classifier.classify(candidate);

    if (result.confidence < 0.5) {
      expect(result.reason).not.toContain('AI');
    }
  });

  it('returns deterministic result when AI returns invalid category', async () => {
    fakeProvider.classifyResult = {
      category: 'INVALID' as ClassificationCategory,
      confidence: 0.9,
      reasoning: 'Invalid category from AI',
    };

    const classifier = new AIClassifier(deterministic, fakeProvider, {
      enabled: true,
      lowConfidenceThreshold: 0.3,
    });

    const candidate = makeCandidate({
      classificationHints: [],
    });

    const result = await classifier.classify(candidate);
    expect(result.category).toBe('UNKNOWN');
  });
});

// ─── FakeLLMProvider Unit Tests ────────────────────────────────

describe('FakeLLMProvider', () => {
  it('returns configured classification result', async () => {
    const provider = new FakeLLMProvider();
    const result = await provider.classify({
      title: 'Test',
      description: null,
      sourceHints: [],
      genreHints: [],
      deterministicResult: { category: 'UNKNOWN', confidence: 0.3, reason: 'test' },
    });
    expect(result.category).toBe('GAME');
    expect(result.confidence).toBe(0.9);
  });

  it('throws when shouldFail is true', async () => {
    const provider = new FakeLLMProvider();
    provider.shouldFail = true;
    await expect(
      provider.classify({
        title: 'Test',
        description: null,
        sourceHints: [],
        genreHints: [],
        deterministicResult: { category: 'UNKNOWN', confidence: 0.3, reason: 'test' },
      }),
    ).rejects.toThrow('Fake AI failure');
  });

  it('healthCheck returns true when not failing', async () => {
    const provider = new FakeLLMProvider();
    expect(await provider.healthCheck()).toBe(true);
  });

  it('healthCheck returns false when failing', async () => {
    const provider = new FakeLLMProvider();
    provider.shouldFail = true;
    expect(await provider.healthCheck()).toBe(false);
  });

  it('returns configured identity result', async () => {
    const provider = new FakeLLMProvider();
    const result = await provider.resolveIdentity({
      candidateTitle: 'GTA V',
      candidateDevelopers: [],
      candidatePlatforms: [],
      existingTitle: 'Grand Theft Auto V',
      existingDevelopers: [],
      existingPlatforms: [],
      deterministicResult: { outcome: 'UNRESOLVED', confidence: 0.3, reason: 'test' },
    });
    expect(result.outcome).toBe('SAME_GAME');
    expect(result.confidence).toBe(0.9);
  });

  it('returns configured conflict result', async () => {
    const provider = new FakeLLMProvider();
    const result = await provider.resolveConflict({
      fieldType: 'title',
      valueA: 'Test A',
      sourceA: 'steam',
      valueB: 'Test B',
      sourceB: 'wikipedia',
      gameTitle: 'Test Game',
    });
    expect(result.recommendedValue).toBe('resolved');
    expect(result.confidence).toBe(0.9);
  });
});
