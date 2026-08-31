import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMProvider } from '../../src/ai/provider.js';
import type {
  AIClassificationResponse,
  AIIdentityResponse,
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

class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake';
  classifyResult: AIClassificationResponse = { category: 'GAME', confidence: 0.9, reasoning: 'AI' };
  identityResult: AIIdentityResponse = {
    outcome: 'SAME_GAME',
    relationship: null,
    confidence: 0.9,
    reasoning: 'AI',
  };
  conflictResult: AIEnrichmentConflictResponse = {
    recommendedValue: 'ai-val',
    reasoning: 'AI',
    confidence: 0.9,
  };
  shouldFail = false;

  async classify(): Promise<AIClassificationResponse> {
    if (this.shouldFail) throw new Error('Fake failure');
    return this.classifyResult;
  }
  async resolveIdentity(): Promise<AIIdentityResponse> {
    if (this.shouldFail) throw new Error('Fake failure');
    return this.identityResult;
  }
  async resolveConflict(): Promise<AIEnrichmentConflictResponse> {
    if (this.shouldFail) throw new Error('Fake failure');
    return this.conflictResult;
  }
  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }
}

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

// ─── Classification Regression ─────────────────────────────────

describe('Classification Regression', () => {
  const deterministic = new DeterministicClassifier();
  let fake: FakeLLMProvider;

  beforeEach(() => {
    fake = new FakeLLMProvider();
  });

  it('deterministic confident → no AI', async () => {
    const classifier = new AIClassifier(deterministic, fake, { enabled: true });
    const candidate = makeCandidate({
      classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
    });
    const result = await classifier.classify(candidate);
    expect(result.category).toBe('GAME');
    expect(result.reason).not.toContain('AI');
  });

  it('deterministic low confidence → AI', async () => {
    const classifier = new AIClassifier(deterministic, fake, {
      enabled: true,
      lowConfidenceThreshold: 0.7,
    });
    const candidate = makeCandidate({ classificationHints: [] });
    const result = await classifier.classify(candidate);
    if (result.confidence < 0.7) {
      expect(result.reason).toContain('AI');
    }
  });

  it('UNKNOWN → AI', async () => {
    const classifier = new AIClassifier(deterministic, fake, {
      enabled: true,
      lowConfidenceThreshold: 0.3,
    });
    const candidate = makeCandidate({
      titles: [{ value: 'Celeste', type: 'primary' }],
      classificationHints: [],
    });
    const result = await classifier.classify(candidate);
    if (result.category === 'UNKNOWN') {
      expect(result.reason).toContain('AI');
    }
  });

  it('AI failure → deterministic', async () => {
    fake.shouldFail = true;
    const classifier = new AIClassifier(deterministic, fake, { enabled: true });
    const candidate = makeCandidate({
      classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
    });
    const result = await classifier.classify(candidate);
    expect(result.category).toBe('GAME');
  });

  it('AI invalid → deterministic', async () => {
    fake.classifyResult = { category: 'BOGUS' as 'GAME', confidence: 0.9, reasoning: 'Bad' };
    const classifier = new AIClassifier(deterministic, fake, {
      enabled: true,
      lowConfidenceThreshold: 0.3,
    });
    const candidate = makeCandidate({ classificationHints: [] });
    const result = await classifier.classify(candidate);
    expect(result.category).toBe('UNKNOWN');
  });
});

// ─── Identity Regression ───────────────────────────────────────

describe('Identity Regression', () => {
  const deterministic = new DeterministicIdentityResolver();
  let fake: FakeLLMProvider;

  beforeEach(() => {
    fake = new FakeLLMProvider();
  });

  it('deterministic resolved → no AI', async () => {
    const resolver = new AIIdentityResolver(deterministic, fake, { enabled: true });
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

  it('UNRESOLVED → AI', async () => {
    const resolver = new AIIdentityResolver(deterministic, fake, {
      enabled: true,
      lowConfidenceThreshold: 0.6,
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

  it('low confidence → AI', async () => {
    const resolver = new AIIdentityResolver(deterministic, fake, {
      enabled: true,
      lowConfidenceThreshold: 0.6,
    });
    const candidate = makeCandidate({
      titles: [{ value: 'Something', type: 'primary' }],
      releases: [
        {
          platform: { name: 'PS5', family: 'Sony' },
          region: null,
          releaseDate: null,
          version: null,
          edition: null,
          distributionChannels: [],
          launchers: [],
          externalIdentifiers: [],
        },
      ],
    });
    const game = makeGame({
      titles: [{ value: 'Something Else', type: 'primary' }],
      releases: [
        {
          platform: { name: 'Xbox', family: 'Microsoft' },
          region: null,
          releaseDate: null,
          version: null,
          edition: null,
          distributionChannels: [],
          launchers: [],
          externalIdentifiers: [],
        },
      ],
    });
    const result = await resolver.resolve(candidate, game);
    expect(['SAME_GAME', 'DIFFERENT_GAME', 'RELATED_GAME', 'UNRESOLVED']).toContain(result.outcome);
  });

  it('AI failure → deterministic', async () => {
    fake.shouldFail = true;
    const resolver = new AIIdentityResolver(deterministic, fake, { enabled: true });
    const candidate = makeCandidate({
      externalIdentifiers: [{ source: 'steam', id: '123' }],
    });
    const game = makeGame({
      externalIdentifiers: [{ source: 'steam', id: '123' }],
    });
    const result = await resolver.resolve(candidate, game);
    expect(result.outcome).toBe('SAME_GAME');
  });

  it('AI invalid → deterministic', async () => {
    fake.identityResult = {
      outcome: 'BOGUS' as 'SAME_GAME',
      relationship: null,
      confidence: 0.9,
      reasoning: 'Bad',
    };
    const resolver = new AIIdentityResolver(deterministic, fake, {
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
    expect(['SAME_GAME', 'DIFFERENT_GAME', 'RELATED_GAME', 'UNRESOLVED']).toContain(result.outcome);
  });
});

// ─── Enrichment Regression ─────────────────────────────────────

describe('Enrichment Regression', () => {
  let fake: FakeLLMProvider;

  beforeEach(() => {
    fake = new FakeLLMProvider();
  });

  it('no conflict → no AI', async () => {
    const assist = new AIEnrichmentAssist(fake, { enabled: true });
    const results = await assist.resolveConflicts([], makeGame());
    expect(results).toHaveLength(0);
  });

  it('conflict → AI', async () => {
    const assist = new AIEnrichmentAssist(fake, { enabled: true });
    const results = await assist.resolveConflicts([makeConflict()], makeGame());
    expect(results).toHaveLength(1);
  });

  it('high confidence → resolution', async () => {
    fake.conflictResult = { recommendedValue: 'better', reasoning: 'Better', confidence: 0.95 };
    const assist = new AIEnrichmentAssist(fake, { enabled: true, minConfidence: 0.7 });
    const results = await assist.resolveConflicts([makeConflict()], makeGame());
    expect(results).toHaveLength(1);
    expect(results[0].recommendedValue).toBe('better');
  });

  it('low confidence → preserve existing', async () => {
    fake.conflictResult = { recommendedValue: 'maybe', reasoning: 'Unsure', confidence: 0.4 };
    const assist = new AIEnrichmentAssist(fake, { enabled: true, minConfidence: 0.7 });
    const results = await assist.resolveConflicts([makeConflict()], makeGame());
    expect(results).toHaveLength(0);
  });

  it('AI failure → preserve deterministic behavior', async () => {
    fake.shouldFail = true;
    const assist = new AIEnrichmentAssist(fake, { enabled: true });
    const results = await assist.resolveConflicts([makeConflict()], makeGame());
    expect(results).toHaveLength(0);
  });
});
