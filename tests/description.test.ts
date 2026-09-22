import { describe, it, expect } from 'vitest';
import { createGame, createGameId, createGameTitle } from '../src/domain/index.js';
import { discoveryGroupToGame } from '../src/application/discovery-to-game.js';
import { enrichGame, selectDescriptionByPriority } from '../src/enrichment/enrichment-engine.js';
import { toGameResponse } from '../src/interfaces/http/types/api.js';
import type { DiscoveryGroupResult } from '../src/discovery/discovery-types.js';
import type { DiscoverySourceObservation } from '../src/discovery/discovery-types.js';
import type { NormalizedCandidate } from '../src/normalization/normalized-candidate.js';

function makeCandidate(description: string | null): NormalizedCandidate {
  return {
    titles: [{ value: 'Test Game', type: 'primary' }],
    developers: [],
    publishers: [],
    genres: [],
    releases: [],
    externalIdentifiers: [],
    gameType: 'main_game',
    gameStatus: 'released',
    parentGameId: null,
    versionParentId: null,
    provenance: {
      source: 'igdb',
      sourceId: '1',
      retrievedAt: new Date().toISOString(),
      rawTitle: 'Test Game',
    },
    classificationHints: [],
    description,
    coverUrls: [],
  };
}

function makeObservation(source: string, description: string | null): DiscoverySourceObservation {
  return {
    source,
    sourceId: `${source}-1`,
    candidate: makeCandidate(description),
    classification: { category: 'GAME', confidence: 0.9, signals: [], reason: 'test' },
    retrievedAt: new Date().toISOString(),
  };
}

function makeGroup(observations: DiscoverySourceObservation[]): DiscoveryGroupResult {
  return {
    groupId: 'group-1',
    observations,
    mergedClassification: { category: 'GAME', confidence: 0.9, signals: [], reason: 'test' },
    identityResolution: {
      outcome: 'SAME_GAME',
      relationship: null,
      confidence: 1,
      signals: [],
      reason: 'test',
      method: 'NATIVE',
    },
    rankingScore: 1,
    rankingBreakdown: {
      identityConfidence: 1,
      classificationConfidence: 0.9,
      sourceCount: observations.length,
      metadataCompleteness: 1,
      titleRelevance: 1,
    },
  };
}

describe('Game.description', () => {
  it('defaults to null', () => {
    const game = createGame({
      id: createGameId('game-1'),
      titles: [createGameTitle('Test Game', 'primary')],
    });
    expect(game.description).toBeNull();
  });

  it('stores an explicit description', () => {
    const game = createGame({
      id: createGameId('game-1'),
      titles: [createGameTitle('Test Game', 'primary')],
      description: 'A great game.',
    });
    expect(game.description).toBe('A great game.');
  });
});

describe('discoveryGroupToGame description', () => {
  it('carries a present description into the game', () => {
    const game = discoveryGroupToGame(makeGroup([makeObservation('igdb', 'IGDB text.')]));
    expect(game.description).toBe('IGDB text.');
  });

  it('uses null when absent', () => {
    const game = discoveryGroupToGame(makeGroup([makeObservation('igdb', null)]));
    expect(game.description).toBeNull();
  });
});

describe('selectDescriptionByPriority', () => {
  it('prefers IGDB over Steam over Wikipedia regardless of order', () => {
    const observations = [
      makeObservation('wikipedia', 'Wiki text.'),
      makeObservation('steam', 'Steam text.'),
      makeObservation('igdb', 'IGDB text.'),
    ];
    expect(selectDescriptionByPriority(observations)).toEqual({
      description: 'IGDB text.',
      source: 'igdb',
    });
    expect(
      selectDescriptionByPriority([makeObservation('wikipedia', 'Wiki text.')]),
    ).toEqual({ description: 'Wiki text.', source: 'wikipedia' });
    expect(selectDescriptionByPriority([makeObservation('steam', null)])).toBeNull();
    expect(selectDescriptionByPriority([])).toBeNull();
  });
});

describe('enrichGame description', () => {
  function baseGame() {
    return createGame({
      id: createGameId('game-1'),
      titles: [createGameTitle('Test Game', 'primary')],
    });
  }

  it('fills a missing description and records the change', () => {
    const result = enrichGame(baseGame(), [makeObservation('igdb', 'IGDB text.')]);
    expect(result.game.description).toBe('IGDB text.');
    expect(
      result.changes.some((c) => c.fieldType === 'description' && c.changeType === 'added'),
    ).toBe(true);
  });

  it('preserves an existing description against a different candidate', () => {
    const game = createGame({
      id: createGameId('game-1'),
      titles: [createGameTitle('Test Game', 'primary')],
      description: 'Original text.',
    });
    const result = enrichGame(game, [makeObservation('steam', 'Steam text.')]);
    expect(result.game.description).toBe('Original text.');
    expect(result.changes.some((c) => c.fieldType === 'description')).toBe(false);
  });
});

describe('toGameResponse description', () => {
  it('exposes present and null descriptions', () => {
    const withText = createGame({
      id: createGameId('game-1'),
      titles: [createGameTitle('Test Game', 'primary')],
      description: 'Some text.',
    });
    expect(toGameResponse(withText).description).toBe('Some text.');

    const withoutText = createGame({
      id: createGameId('game-2'),
      titles: [createGameTitle('Other Game', 'primary')],
    });
    expect(toGameResponse(withoutText).description).toBeNull();
  });
});
