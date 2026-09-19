import { describe, it, expect } from 'vitest';
import {
  toDomain,
  toPersistence,
} from '../src/infrastructure/persistence/mongodb/game-mapper.js';
import type { GameDocument } from '../src/infrastructure/persistence/mongodb/game-schema.js';
import {
  createGame,
  createGameId,
  createGameTitle,
} from '../src/domain/index.js';

function minimalDoc(overrides: Record<string, unknown> = {}): GameDocument {
  return {
    domainId: 'atp-igdb-100',
    titles: [{ value: 'Test Game', type: 'primary' }],
    releases: [],
    developers: [],
    publishers: [],
    genres: [],
    externalIdentifiers: [{ source: 'igdb', id: '100' }],
    relationships: [],
    evidence: [],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    cover: null,
    lastEnrichedAt: null,
    gameType: null,
    gameStatus: null,
    ...overrides,
  } as unknown as GameDocument;
}

describe('game type/status persistence round-trip', () => {
  it('persists explicit provider type/status', () => {
    const game = createGame({
      id: createGameId('atp-igdb-100'),
      titles: [createGameTitle('Test Game', 'primary')],
      gameType: 'port',
      gameStatus: 'released',
    });

    const persisted = toPersistence(game);

    expect(persisted).toMatchObject({ gameType: 'port', gameStatus: 'released' });
  });

  it('reads stored type/status back without altering identity', () => {
    const game = toDomain(
      minimalDoc({ gameType: 'remake', gameStatus: 'released' }),
    );

    expect(game.gameType).toBe('remake');
    expect(game.gameStatus).toBe('released');
    expect(game.id).toBe('atp-igdb-100');
    expect(game.externalIdentifiers).toEqual([{ source: 'igdb', id: '100' }]);
  });

  it('maps missing legacy fields to null for backward compatibility', () => {
    const doc = minimalDoc();
    delete (doc as unknown as Record<string, unknown>).gameType;
    delete (doc as unknown as Record<string, unknown>).gameStatus;

    const game = toDomain(doc);

    expect(game.gameType).toBeNull();
    expect(game.gameStatus).toBeNull();
  });
});
