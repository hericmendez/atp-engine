import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMProvider } from '../../src/ai/provider.js';
import type {
  AIEnrichmentConflictRequest,
  AIEnrichmentConflictResponse,
  AIClassificationResponse,
  AIIdentityResponse,
} from '../../src/ai/types.js';
import { AIEnrichmentAssist } from '../../src/ai/ai-enrichment.js';
import type { EnrichmentConflict } from '../../src/enrichment/enrichment-types.js';
import type { Game } from '../../src/domain/game/game.js';

class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake';
  conflictResult: AIEnrichmentConflictResponse = {
    recommendedValue: 'ai-resolved-value',
    reasoning: 'AI resolved the conflict',
    confidence: 0.9,
  };
  shouldFail = false;

  async classify(): Promise<AIClassificationResponse> {
    return { category: 'GAME', confidence: 0.9, reasoning: 'fake' };
  }

  async resolveIdentity(): Promise<AIIdentityResponse> {
    return { outcome: 'SAME_GAME', relationship: null, confidence: 0.9, reasoning: 'fake' };
  }

  async resolveConflict(
    _request: AIEnrichmentConflictRequest,
  ): Promise<AIEnrichmentConflictResponse> {
    if (this.shouldFail) throw new Error('Fake AI failure');
    return this.conflictResult;
  }

  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1' as Game['id'],
    titles: [{ value: 'Test Game', type: 'primary' }],
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
    valueA: 'Title from Steam',
    sourceB: 'wikipedia',
    valueB: 'Title from Wikipedia',
    retainedValue: 'Title from Steam',
    reason: 'Both sources provide different titles',
    ...overrides,
  };
}

describe('AIEnrichmentAssist', () => {
  let fakeProvider: FakeLLMProvider;

  beforeEach(() => {
    fakeProvider = new FakeLLMProvider();
  });

  it('returns empty when AI is disabled', async () => {
    const assist = new AIEnrichmentAssist(fakeProvider, { enabled: false });
    const game = makeGame();
    const conflicts = [makeConflict()];

    const results = await assist.resolveConflicts(conflicts, game);
    expect(results).toHaveLength(0);
  });

  it('returns empty when no conflicts', async () => {
    const assist = new AIEnrichmentAssist(fakeProvider, { enabled: true });
    const game = makeGame();

    const results = await assist.resolveConflicts([], game);
    expect(results).toHaveLength(0);
  });

  it('resolves conflicts when AI confidence is high enough', async () => {
    const assist = new AIEnrichmentAssist(fakeProvider, {
      enabled: true,
      minConfidence: 0.7,
    });
    const game = makeGame();
    const conflicts = [makeConflict()];

    const results = await assist.resolveConflicts(conflicts, game);
    expect(results).toHaveLength(1);
    expect(results[0].recommendedValue).toBe('ai-resolved-value');
    expect(results[0].confidence).toBe(0.9);
    expect(results[0].reasoning).toContain('AI');
  });

  it('skips resolutions when AI confidence is too low', async () => {
    fakeProvider.conflictResult = {
      recommendedValue: 'low-confidence',
      reasoning: 'Not sure',
      confidence: 0.5,
    };

    const assist = new AIEnrichmentAssist(fakeProvider, {
      enabled: true,
      minConfidence: 0.7,
    });
    const game = makeGame();
    const conflicts = [makeConflict()];

    const results = await assist.resolveConflicts(conflicts, game);
    expect(results).toHaveLength(0);
  });

  it('handles AI failure gracefully', async () => {
    fakeProvider.shouldFail = true;
    const assist = new AIEnrichmentAssist(fakeProvider, { enabled: true });
    const game = makeGame();
    const conflicts = [makeConflict()];

    const results = await assist.resolveConflicts(conflicts, game);
    expect(results).toHaveLength(0);
  });

  it('resolves multiple conflicts independently', async () => {
    const assist = new AIEnrichmentAssist(fakeProvider, { enabled: true });
    const game = makeGame();
    const conflicts = [
      makeConflict({ fieldType: 'title', valueA: 'Title A', valueB: 'Title B' }),
      makeConflict({ fieldType: 'developer', valueA: 'Dev A', valueB: 'Dev B' }),
      makeConflict({ fieldType: 'genre', valueA: 'RPG', valueB: 'Action' }),
    ];

    const results = await assist.resolveConflicts(conflicts, game);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.recommendedValue).toBe('ai-resolved-value');
      expect(r.confidence).toBe(0.9);
    }
  });

  it('uses game primary title in request', async () => {
    let capturedTitle = '';
    const originalResolveConflict = fakeProvider.resolveConflict.bind(fakeProvider);
    fakeProvider.resolveConflict = async (req) => {
      capturedTitle = req.gameTitle;
      return originalResolveConflict(req);
    };

    const assist = new AIEnrichmentAssist(fakeProvider, { enabled: true });
    const game = makeGame({
      titles: [
        { value: 'Primary Title', type: 'primary' },
        { value: 'Alternate Title', type: 'alternate' },
      ],
    });
    const conflicts = [makeConflict()];

    await assist.resolveConflicts(conflicts, game);
    expect(capturedTitle).toBe('Primary Title');
  });

  it('uses first title if no primary', async () => {
    let capturedTitle = '';
    const originalResolveConflict = fakeProvider.resolveConflict.bind(fakeProvider);
    fakeProvider.resolveConflict = async (req) => {
      capturedTitle = req.gameTitle;
      return originalResolveConflict(req);
    };

    const assist = new AIEnrichmentAssist(fakeProvider, { enabled: true });
    const game = makeGame({
      titles: [{ value: 'First Title', type: 'alternate' }],
    });
    const conflicts = [makeConflict()];

    await assist.resolveConflicts(conflicts, game);
    expect(capturedTitle).toBe('First Title');
  });

  it('uses default minConfidence of 0.7', async () => {
    fakeProvider.conflictResult = {
      recommendedValue: 'value',
      reasoning: 'reason',
      confidence: 0.69,
    };

    const assist = new AIEnrichmentAssist(fakeProvider, { enabled: true });
    const game = makeGame();
    const conflicts = [makeConflict()];

    const results = await assist.resolveConflicts(conflicts, game);
    expect(results).toHaveLength(0);
  });
});
