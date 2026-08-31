import { describe, it, expect } from 'vitest';
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

// ─── Generic Fake Provider (provider-agnostic) ─────────────────

class GenericFakeProvider implements LLMProvider {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async classify(): Promise<AIClassificationResponse> {
    return { category: 'GAME', confidence: 0.9, reasoning: 'Generic AI' };
  }
  async resolveIdentity(): Promise<AIIdentityResponse> {
    return { outcome: 'SAME_GAME', relationship: null, confidence: 0.9, reasoning: 'Generic AI' };
  }
  async resolveConflict(): Promise<AIEnrichmentConflictResponse> {
    return { recommendedValue: 'resolved', reasoning: 'Generic AI', confidence: 0.9 };
  }
  async healthCheck(): Promise<boolean> {
    return true;
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

function makeConflict(): EnrichmentConflict {
  return {
    fieldType: 'title',
    sourceA: 'steam',
    valueA: 'Title A',
    sourceB: 'wikipedia',
    valueB: 'Title B',
    retainedValue: 'Title A',
    reason: 'Conflict',
  };
}

// ─── Model Independence Tests ──────────────────────────────────

describe('Model Independence', () => {
  it('classifier works with any LLMProvider implementation', async () => {
    const providerA = new GenericFakeProvider('provider-a');
    const providerB = new GenericFakeProvider('provider-b');
    const deterministic = new DeterministicClassifier();

    const classifierA = new AIClassifier(deterministic, providerA, {
      enabled: true,
      provider: 'custom-a',
      model: 'model-a',
    });
    const classifierB = new AIClassifier(deterministic, providerB, {
      enabled: true,
      provider: 'custom-b',
      model: 'model-b',
    });

    const candidate = makeCandidate({
      classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
    });

    const resultA = await classifierA.classify(candidate);
    const resultB = await classifierB.classify(candidate);

    expect(resultA.category).toBe('GAME');
    expect(resultB.category).toBe('GAME');
  });

  it('identity resolver works with any LLMProvider implementation', async () => {
    const provider = new GenericFakeProvider('custom-provider');
    const deterministic = new DeterministicIdentityResolver();

    const resolver = new AIIdentityResolver(deterministic, provider, {
      enabled: true,
      provider: 'custom',
      model: 'custom-model',
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

  it('enrichment works with any LLMProvider implementation', async () => {
    const provider = new GenericFakeProvider('custom-provider');

    const assist = new AIEnrichmentAssist(provider, {
      enabled: true,
      provider: 'custom',
      model: 'custom-model',
    });

    const results = await assist.resolveConflicts([makeConflict()], makeGame());
    expect(results).toHaveLength(1);
    expect(results[0].recommendedValue).toBe('resolved');
  });

  it('no component references specific model names', async () => {
    const provider = new GenericFakeProvider('test-provider');
    const deterministic = new DeterministicClassifier();

    const classifier = new AIClassifier(deterministic, provider, {
      enabled: true,
      provider: 'test',
      model: 'any-model-name',
    });

    const candidate = makeCandidate({
      classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
    });

    const result = await classifier.classify(candidate);
    expect(result.category).toBe('GAME');
    expect(result.reason).not.toMatch(/qwen|ollama|openai|claude|gemini/i);
  });

  it('FakeLLMProvider demonstrates provider interchangeability', async () => {
    class MyCustomProvider implements LLMProvider {
      readonly name = 'my-custom';
      async classify(): Promise<AIClassificationResponse> {
        return { category: 'DLC', confidence: 0.95, reasoning: 'Custom logic' };
      }
      async resolveIdentity(): Promise<AIIdentityResponse> {
        return {
          outcome: 'DIFFERENT_GAME',
          relationship: null,
          confidence: 0.85,
          reasoning: 'Custom',
        };
      }
      async resolveConflict(): Promise<AIEnrichmentConflictResponse> {
        return { recommendedValue: 'custom-value', reasoning: 'Custom', confidence: 0.95 };
      }
      async healthCheck(): Promise<boolean> {
        return true;
      }
    }

    const customProvider = new MyCustomProvider();
    const deterministic = new DeterministicClassifier();
    const deterministicIdentity = new DeterministicIdentityResolver();

    const classifier = new AIClassifier(deterministic, customProvider, { enabled: true });
    const resolver = new AIIdentityResolver(deterministicIdentity, customProvider, {
      enabled: true,
    });
    const enrichment = new AIEnrichmentAssist(customProvider, { enabled: true });

    const candidate = makeCandidate({
      titles: [{ value: 'Completely Unknown', type: 'primary' }],
    });
    const game = makeGame({
      titles: [{ value: 'Another Unknown', type: 'primary' }],
    });

    const classResult = await classifier.classify(candidate);
    const identityResult = await resolver.resolve(candidate, game);
    const enrichResult = await enrichment.resolveConflicts([makeConflict()], makeGame());

    expect(classResult.category).toBe('DLC');
    expect(identityResult.outcome).toBe('DIFFERENT_GAME');
    expect(enrichResult[0].recommendedValue).toBe('custom-value');
  });
});
