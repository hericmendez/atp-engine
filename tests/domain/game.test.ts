import { describe, it, expect } from 'vitest';
import {
  createGame,
  createGameId,
  createGameTitle,
  createRelease,
  createReleaseId,
  createPlatform,
  createDeveloper,
  createPublisher,
  createGenre,
  createExternalIdentifier,
  gameAddRelease,
  gameAddRelationship,
  gameAddTitle,
  gameAddEvidence,
  gameAddExternalIdentifier,
  gameWithClassification,
  gameWithCompleteness,
  gameFindRelease,
  gameHasRelationship,
  gamePrimaryTitle,
  ClassificationCategory,
  MetadataCompleteness,
  GameRelationshipType,
} from '../../src/domain/index.js';

function createReleaseFixture(
  gameId: ReturnType<typeof createGameId>,
  releaseId: string,
  platformName: string,
) {
  return createRelease({
    id: createReleaseId(releaseId),
    gameId,
    platform: createPlatform(platformName),
  });
}

describe('Game', () => {
  const gameId = createGameId('game-1');
  const primaryTitle = createGameTitle('Resident Evil 4', 'primary');

  it('creates a valid game with primary title', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    expect(game.id).toBe(gameId);
    expect(game.titles).toHaveLength(1);
    expect(game.titles[0].value).toBe('Resident Evil 4');
    expect(game.classification).toBe('UNKNOWN');
    expect(game.completeness).toBe('FOUND_PARTIAL');
    expect(game.releases).toHaveLength(0);
    expect(game.relationships).toHaveLength(0);
  });

  it('throws when created without titles', () => {
    expect(() => createGame({ id: gameId, titles: [] })).toThrow(
      'A game must have at least one title',
    );
  });

  it('creates game with optional metadata', () => {
    const game = createGame({
      id: gameId,
      titles: [primaryTitle],
      developers: [createDeveloper('Capcom')],
      publishers: [createPublisher('Capcom')],
      genres: [createGenre('Survival Horror')],
      classification: ClassificationCategory.GAME,
      completeness: MetadataCompleteness.FOUND_COMPLETE,
    });
    expect(game.developers).toHaveLength(1);
    expect(game.publishers).toHaveLength(1);
    expect(game.genres).toHaveLength(1);
    expect(game.classification).toBe('GAME');
    expect(game.completeness).toBe('FOUND_COMPLETE');
  });

  it('adds a release immutably', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const release = createReleaseFixture(gameId, 'rel-1', 'PlayStation 2');

    const updated = gameAddRelease(game, release);

    expect(game.releases).toHaveLength(0);
    expect(updated.releases).toHaveLength(1);
    expect(updated.releases[0].id).toBe('rel-1');
  });

  it('throws when adding release with wrong gameId', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const release = createReleaseFixture(createGameId('other'), 'rel-1', 'PS2');

    expect(() => gameAddRelease(game, release)).toThrow('Release does not belong to this game');
  });

  it('throws when adding duplicate release', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const release = createReleaseFixture(gameId, 'rel-1', 'PS2');
    const updated = gameAddRelease(game, release);

    expect(() => gameAddRelease(updated, release)).toThrow(
      'Release rel-1 already exists on this game',
    );
  });

  it('adds a relationship immutably', () => {
    const game1 = createGame({
      id: createGameId('g1'),
      titles: [createGameTitle('RE4 Original')],
    });
    const game2 = createGame({
      id: createGameId('g2'),
      titles: [createGameTitle('RE4 Remake')],
    });

    const relationship = {
      sourceGameId: game1.id,
      targetGameId: game2.id,
      type: GameRelationshipType.REMAKE as const,
    };

    const updated = gameAddRelationship(game1, relationship);

    expect(game1.relationships).toHaveLength(0);
    expect(updated.relationships).toHaveLength(1);
    expect(updated.relationships[0].type).toBe('REMAKE');
  });

  it('throws when adding self-relationship', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });

    expect(() =>
      gameAddRelationship(game, {
        sourceGameId: game.id,
        targetGameId: game.id,
        type: GameRelationshipType.PORT,
      }),
    ).toThrow('A game cannot have a relationship with itself');
  });

  it('adds a title immutably', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const altTitle = createGameTitle('RE4', 'abbreviated');

    const updated = gameAddTitle(game, altTitle);

    expect(game.titles).toHaveLength(1);
    expect(updated.titles).toHaveLength(2);
  });

  it('throws when adding duplicate title', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    expect(() => gameAddTitle(game, primaryTitle)).toThrow('Title already exists on this game');
  });

  it('adds external identifier immutably', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const extId = createExternalIdentifier('steamdb', '12345');

    const updated = gameAddExternalIdentifier(game, extId);

    expect(game.externalIdentifiers).toHaveLength(0);
    expect(updated.externalIdentifiers).toHaveLength(1);
  });

  it('deduplicates external identifiers', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const extId = createExternalIdentifier('steamdb', '12345');

    let updated = gameAddExternalIdentifier(game, extId);
    updated = gameAddExternalIdentifier(updated, extId);

    expect(updated.externalIdentifiers).toHaveLength(1);
  });

  it('updates classification immutably', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const updated = gameWithClassification(game, ClassificationCategory.GAME);

    expect(game.classification).toBe('UNKNOWN');
    expect(updated.classification).toBe('GAME');
  });

  it('updates completeness immutably', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const updated = gameWithCompleteness(game, MetadataCompleteness.FOUND_COMPLETE);

    expect(game.completeness).toBe('FOUND_PARTIAL');
    expect(updated.completeness).toBe('FOUND_COMPLETE');
  });

  it('finds release by id', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const release = createReleaseFixture(gameId, 'rel-1', 'PS2');
    const updated = gameAddRelease(game, release);

    expect(gameFindRelease(updated, 'rel-1')).toBeDefined();
    expect(gameFindRelease(updated, 'nonexistent')).toBeUndefined();
  });

  it('checks relationship existence', () => {
    const game1 = createGame({
      id: createGameId('g1'),
      titles: [createGameTitle('Game A')],
    });
    const game2Id = createGameId('g2');

    const withRel = gameAddRelationship(game1, {
      sourceGameId: game1.id,
      targetGameId: game2Id,
      type: GameRelationshipType.REMAKE,
    });

    expect(gameHasRelationship(withRel, game2Id)).toBe(true);
    expect(gameHasRelationship(withRel, game2Id, GameRelationshipType.PORT)).toBe(false);
    expect(gameHasRelationship(withRel, createGameId('g3'))).toBe(false);
  });

  it('returns primary title', () => {
    const game = createGame({
      id: gameId,
      titles: [
        createGameTitle('RE4', 'abbreviated'),
        createGameTitle('Resident Evil 4', 'primary'),
      ],
    });

    expect(gamePrimaryTitle(game)?.value).toBe('Resident Evil 4');
  });

  it('adds evidence immutably', () => {
    const game = createGame({ id: gameId, titles: [primaryTitle] });
    const evidence = {
      source: 'wikipedia',
      externalId: 'wiki-123',
      retrievedAt: new Date(),
      rawTitle: 'Resident Evil 4',
    };

    const updated = gameAddEvidence(game, evidence);

    expect(game.evidence).toHaveLength(0);
    expect(updated.evidence).toHaveLength(1);
  });
});
