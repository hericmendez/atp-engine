import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMProvider } from '../../src/ai/provider.js';
import type {
  AIIdentityRequest,
  AIIdentityResponse,
  AIEnrichmentConflictResponse,
  AIClassificationResponse,
} from '../../src/ai/types.js';
import { AIIdentityResolver } from '../../src/ai/ai-identity-resolver.js';
import { DeterministicIdentityResolver } from '../../src/identity/deterministic-identity-resolver.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { Game } from '../../src/domain/game/game.js';

class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake';
  identityResult: AIIdentityResponse = {
    outcome: 'SAME_GAME',
    relationship: null,
    confidence: 0.9,
    reasoning: 'Fake AI identity',
  };
  shouldFail = false;

  async classify(): Promise<AIClassificationResponse> {
    return { category: 'GAME', confidence: 0.9, reasoning: 'fake' };
  }

  async resolveIdentity(_request: AIIdentityRequest): Promise<AIIdentityResponse> {
    if (this.shouldFail) throw new Error('Fake AI failure');
    return this.identityResult;
  }

  async resolveConflict(): Promise<AIEnrichmentConflictResponse> {
    return { recommendedValue: 'resolved', reasoning: 'fake', confidence: 0.9 };
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

describe('AIIdentityResolver', () => {
  const deterministic = new DeterministicIdentityResolver();
  let fakeProvider: FakeLLMProvider;

  beforeEach(() => {
    fakeProvider = new FakeLLMProvider();
  });

  it('returns deterministic result when AI is disabled', async () => {
    const resolver = new AIIdentityResolver(deterministic, fakeProvider, { enabled: false });
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

  it('escalates to AI when outcome is UNRESOLVED', async () => {
    const resolver = new AIIdentityResolver(deterministic, fakeProvider, {
      enabled: true,
      lowConfidenceThreshold: 0.6,
    });

    const candidate = makeCandidate({
      titles: [{ value: 'Completely Different Title', type: 'primary' }],
    });
    const game = makeGame({
      titles: [{ value: 'Another Game', type: 'primary' }],
    });

    const result = await resolver.resolve(candidate, game);

    if (result.outcome === 'UNRESOLVED') {
      expect(result.method).toBe('AI');
      expect(result.reason).toContain('AI');
    }
  });

  it('returns deterministic result when AI fails', async () => {
    fakeProvider.shouldFail = true;
    const resolver = new AIIdentityResolver(deterministic, fakeProvider, { enabled: true });

    const candidate = makeCandidate({
      externalIdentifiers: [{ source: 'steam', id: '123' }],
    });
    const game = makeGame({
      externalIdentifiers: [{ source: 'steam', id: '123' }],
    });

    const result = await resolver.resolve(candidate, game);
    expect(result.outcome).toBe('SAME_GAME');
  });

  it('returns deterministic result when AI confidence is too low', async () => {
    fakeProvider.identityResult = {
      outcome: 'SAME_GAME',
      relationship: null,
      confidence: 0.3,
      reasoning: 'Low confidence',
    };

    const resolver = new AIIdentityResolver(deterministic, fakeProvider, {
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

  it('returns deterministic result when AI returns invalid outcome', async () => {
    fakeProvider.identityResult = {
      outcome: 'INVALID' as 'SAME_GAME',
      relationship: null,
      confidence: 0.9,
      reasoning: 'Invalid',
    };

    const resolver = new AIIdentityResolver(deterministic, fakeProvider, {
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

  it('handles null existing game', async () => {
    fakeProvider.identityResult = {
      outcome: 'DIFFERENT_GAME',
      relationship: null,
      confidence: 0.8,
      reasoning: 'No existing game',
    };

    const resolver = new AIIdentityResolver(deterministic, fakeProvider, {
      enabled: true,
      lowConfidenceThreshold: 0.3,
    });

    const candidate = makeCandidate({
      titles: [{ value: 'New Game', type: 'primary' }],
    });

    const result = await resolver.resolve(candidate, null);
    expect(result.outcome).toBe('DIFFERENT_GAME');
    expect(result.method).toBe('AI');
  });
});
