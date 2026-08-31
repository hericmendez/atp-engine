import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoGameRepository } from '../../src/infrastructure/persistence/mongodb/mongo-game-repository.js';
import { GameModel } from '../../src/infrastructure/persistence/mongodb/game-schema.js';
import {
  createGame,
  createGameId,
  createGameTitle,
  createRelease,
  createReleaseId,
  createPlatform,
  createRegion,
  createReleaseDate,
  createExternalIdentifier,
  createSourceEvidence,
  createDeveloper,
  createPublisher,
  createGenre,
  gameAddRelease,
  gameAddExternalIdentifier,
  gameAddEvidence,
  gameAddRelationship,
  gameWithClassification,
  ClassificationCategory,
  GameRelationshipType,
} from '../../src/domain/index.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/atp-engine-test';

describe('MongoGameRepository', () => {
  let repository: MongoGameRepository;

  beforeAll(async () => {
    await mongoose.connect(MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await GameModel.ensureIndexes();
    repository = new MongoGameRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await GameModel.deleteMany({});
  });

  describe('save and findById', () => {
    it('saves and retrieves a game', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        developers: [createDeveloper('Capcom')],
        publishers: [createPublisher('Capcom')],
        genres: [createGenre('Survival Horror')],
        classification: ClassificationCategory.GAME,
      });

      await repository.save(game);
      const retrieved = await repository.findById(game.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(game.id);
      expect(retrieved!.titles).toHaveLength(1);
      expect(retrieved!.titles[0].value).toBe('Resident Evil 4');
      expect(retrieved!.developers).toHaveLength(1);
      expect(retrieved!.developers[0].name).toBe('Capcom');
      expect(retrieved!.classification).toBe('GAME');
    });

    it('returns null for non-existent game', async () => {
      const result = await repository.findById(createGameId('non-existent'));
      expect(result).toBeNull();
    });

    it('throws ValidationError when saving game with duplicate domainId', async () => {
      const game1 = createGame({
        id: createGameId('game-dup'),
        titles: [createGameTitle('Game Dup')],
        classification: ClassificationCategory.GAME,
      });

      await repository.save(game1);

      const game2 = createGame({
        id: createGameId('game-dup'),
        titles: [createGameTitle('Game Dup 2')],
        classification: ClassificationCategory.GAME,
      });

      await expect(repository.save(game2)).rejects.toThrow('already exists');
    });

    it('save relies on atomic unique constraint, not existsById check', async () => {
      const game = createGame({
        id: createGameId('game-atomic'),
        titles: [createGameTitle('Atomic Game')],
        classification: ClassificationCategory.GAME,
      });

      await repository.save(game);

      const duplicate = createGame({
        id: createGameId('game-atomic'),
        titles: [createGameTitle('Atomic Game Duplicate')],
        classification: ClassificationCategory.GAME,
      });

      await expect(repository.save(duplicate)).rejects.toThrow();
    });
  });

  describe('timestamps', () => {
    it('Mongoose manages createdAt and updatedAt independently of domain', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Test Game')],
      });

      await repository.save(game);
      const retrieved = await repository.findById(game.id);

      expect(retrieved).not.toBeNull();

      const doc = await GameModel.findOne({ domainId: game.id }).lean();
      expect(doc).not.toBeNull();
      expect(doc!.createdAt).toBeInstanceOf(Date);
      expect(doc!.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('external identifiers', () => {
    it('finds game by external identifier', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Resident Evil 4')],
      });

      const gameWithExtId = gameAddExternalIdentifier(
        game,
        createExternalIdentifier('wikipedia', 'wiki-123'),
      );

      await repository.save(gameWithExtId);

      const found = await repository.findByExternalIdentifier({
        source: 'wikipedia',
        externalId: 'wiki-123',
      });

      expect(found).not.toBeNull();
      expect(found!.id).toBe(game.id);
    });

    it('checks existence by external identifier', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Test Game')],
      });

      const gameWithExtId = gameAddExternalIdentifier(
        game,
        createExternalIdentifier('steamdb', '456'),
      );

      await repository.save(gameWithExtId);

      const exists = await repository.existsByExternalIdentifier({
        source: 'steamdb',
        externalId: '456',
      });

      expect(exists).toBe(true);

      const notExists = await repository.existsByExternalIdentifier({
        source: 'steamdb',
        externalId: '789',
      });

      expect(notExists).toBe(false);
    });

    it('prevents duplicate external identifiers at database level', async () => {
      const game1 = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Game 1')],
      });

      const game1WithExtId = gameAddExternalIdentifier(
        game1,
        createExternalIdentifier('wikipedia', 'shared-id'),
      );

      await repository.save(game1WithExtId);

      const game2 = createGame({
        id: createGameId('game-2'),
        titles: [createGameTitle('Game 2')],
      });

      const game2WithExtId = gameAddExternalIdentifier(
        game2,
        createExternalIdentifier('wikipedia', 'shared-id'),
      );

      await expect(repository.save(game2WithExtId)).rejects.toThrow();
    });

    it('allows different external identifiers on different games (Case A)', async () => {
      const game1 = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Game 1')],
      });
      const game1WithExt = gameAddExternalIdentifier(
        game1,
        createExternalIdentifier('wikipedia', '123'),
      );
      await repository.save(game1WithExt);

      const game2 = createGame({
        id: createGameId('game-2'),
        titles: [createGameTitle('Game 2')],
      });
      const game2WithExt = gameAddExternalIdentifier(
        game2,
        createExternalIdentifier('wikipedia', '456'),
      );
      await repository.save(game2WithExt);

      const found1 = await repository.findByExternalIdentifier({
        source: 'wikipedia',
        externalId: '123',
      });
      const found2 = await repository.findByExternalIdentifier({
        source: 'wikipedia',
        externalId: '456',
      });
      expect(found1!.id).toBe('game-1');
      expect(found2!.id).toBe('game-2');
    });

    it('allows same external ID from different sources (Case C)', async () => {
      const game1 = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Game 1')],
      });
      const game1WithExt = gameAddExternalIdentifier(
        game1,
        createExternalIdentifier('wikipedia', '123'),
      );
      await repository.save(game1WithExt);

      const game2 = createGame({
        id: createGameId('game-2'),
        titles: [createGameTitle('Game 2')],
      });
      const game2WithExt = gameAddExternalIdentifier(
        game2,
        createExternalIdentifier('steamdb', '123'),
      );
      await repository.save(game2WithExt);

      const found1 = await repository.findByExternalIdentifier({
        source: 'wikipedia',
        externalId: '123',
      });
      const found2 = await repository.findByExternalIdentifier({
        source: 'steamdb',
        externalId: '123',
      });
      expect(found1!.id).toBe('game-1');
      expect(found2!.id).toBe('game-2');
    });

    it('allows multiple games without external identifiers (Case D)', async () => {
      const game1 = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Game 1')],
      });
      await repository.save(game1);

      const game2 = createGame({
        id: createGameId('game-2'),
        titles: [createGameTitle('Game 2')],
      });
      await repository.save(game2);

      const game3 = createGame({
        id: createGameId('game-3'),
        titles: [createGameTitle('Game 3')],
      });
      await repository.save(game3);

      expect(await repository.existsById(createGameId('game-1'))).toBe(true);
      expect(await repository.existsById(createGameId('game-2'))).toBe(true);
      expect(await repository.existsById(createGameId('game-3'))).toBe(true);
    });

    it('allows one game with multiple external identifiers (Case E)', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Game 1')],
      });
      const withWiki = gameAddExternalIdentifier(
        game,
        createExternalIdentifier('wikipedia', '123'),
      );
      const withBoth = gameAddExternalIdentifier(
        withWiki,
        createExternalIdentifier('steamdb', '456'),
      );
      await repository.save(withBoth);

      const found = await repository.findById(createGameId('game-1'));
      expect(found).not.toBeNull();
      expect(found!.externalIdentifiers).toHaveLength(2);

      const byWiki = await repository.findByExternalIdentifier({
        source: 'wikipedia',
        externalId: '123',
      });
      const bySteam = await repository.findByExternalIdentifier({
        source: 'steamdb',
        externalId: '456',
      });
      expect(byWiki!.id).toBe('game-1');
      expect(bySteam!.id).toBe('game-1');
    });
  });

  describe('releases', () => {
    it('persists game with multiple releases', async () => {
      const game = createGame({
        id: createGameId('botw'),
        titles: [createGameTitle('The Legend of Zelda: Breath of the Wild', 'primary')],
        developers: [createDeveloper('Nintendo EPD')],
        publishers: [createPublisher('Nintendo')],
        classification: ClassificationCategory.GAME,
      });

      const wiiURelease = createRelease({
        id: createReleaseId('botw-wiiu'),
        gameId: game.id,
        platform: createPlatform('Wii U'),
        region: createRegion('Worldwide'),
        releaseDate: createReleaseDate(2017, 3, 3),
      });

      const switchRelease = createRelease({
        id: createReleaseId('botw-switch'),
        gameId: game.id,
        platform: createPlatform('Nintendo Switch'),
        region: createRegion('Worldwide'),
        releaseDate: createReleaseDate(2017, 3, 3),
      });

      const gameWithReleases = gameAddRelease(game, wiiURelease);
      const gameWithBothReleases = gameAddRelease(gameWithReleases, switchRelease);

      await repository.save(gameWithBothReleases);
      const retrieved = await repository.findById(game.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.releases).toHaveLength(2);
      expect(retrieved!.releases[0].platform.name).toBe('Wii U');
      expect(retrieved!.releases[1].platform.name).toBe('Nintendo Switch');
    });

    it('persists regional releases', async () => {
      const game = createGame({
        id: createGameId('re3'),
        titles: [createGameTitle('Resident Evil 3', 'primary')],
        classification: ClassificationCategory.GAME,
      });

      const ntscRelease = createRelease({
        id: createReleaseId('re3-ntsc'),
        gameId: game.id,
        platform: createPlatform('PlayStation'),
        region: createRegion('NTSC-USA'),
        releaseDate: createReleaseDate(1999, 11, 11),
      });

      const palRelease = createRelease({
        id: createReleaseId('re3-pal'),
        gameId: game.id,
        platform: createPlatform('PlayStation'),
        region: createRegion('PAL-EUR'),
        releaseDate: createReleaseDate(1999, 9, 22),
      });

      const gameWithNtsc = gameAddRelease(game, ntscRelease);
      const gameWithBoth = gameAddRelease(gameWithNtsc, palRelease);

      await repository.save(gameWithBoth);
      const retrieved = await repository.findById(game.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.releases).toHaveLength(2);
      expect(retrieved!.releases[0].region?.name).toBe('NTSC-USA');
      expect(retrieved!.releases[1].region?.name).toBe('PAL-EUR');
    });
  });

  describe('relationships', () => {
    it('persists game relationships', async () => {
      const re4Original = createGame({
        id: createGameId('re4-2005'),
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        classification: ClassificationCategory.GAME,
      });

      const re4Remake = createGame({
        id: createGameId('re4-2023'),
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        classification: ClassificationCategory.GAME,
      });

      await repository.save(re4Original);
      await repository.save(re4Remake);

      const gameWithRelationship = gameAddRelationship(re4Original, {
        sourceGameId: re4Original.id,
        targetGameId: re4Remake.id,
        type: GameRelationshipType.REMAKE,
      });

      await repository.update(gameWithRelationship);
      const retrieved = await repository.findById(re4Original.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.relationships).toHaveLength(1);
      expect(retrieved!.relationships[0].type).toBe('REMAKE');
      expect(retrieved!.relationships[0].targetGameId).toBe('re4-2023');
    });
  });

  describe('provenance', () => {
    it('persists source evidence', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Test Game')],
      });

      const evidence = createSourceEvidence('wikipedia', 'wiki-123', 'Test Game Title');
      const gameWithEvidence = gameAddEvidence(game, evidence);

      await repository.save(gameWithEvidence);
      const retrieved = await repository.findById(game.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.evidence).toHaveLength(1);
      expect(retrieved!.evidence[0].source).toBe('wikipedia');
      expect(retrieved!.evidence[0].externalId).toBe('wiki-123');
      expect(retrieved!.evidence[0].rawTitle).toBe('Test Game Title');
      expect(retrieved!.evidence[0].retrievedAt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    it('updates game classification', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Test Game')],
        classification: ClassificationCategory.UNKNOWN,
      });

      await repository.save(game);

      const updatedGame = gameWithClassification(game, ClassificationCategory.GAME);
      await repository.update(updatedGame);

      const retrieved = await repository.findById(game.id);
      expect(retrieved!.classification).toBe('GAME');
    });
  });

  describe('delete', () => {
    it('deletes a game', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Test Game')],
      });

      await repository.save(game);
      await repository.deleteById(game.id);

      const retrieved = await repository.findById(game.id);
      expect(retrieved).toBeNull();
    });

    it('throws when deleting non-existent game', async () => {
      await expect(repository.deleteById(createGameId('non-existent'))).rejects.toThrow();
    });
  });

  describe('existsById', () => {
    it('checks game existence', async () => {
      const game = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Test Game')],
      });

      expect(await repository.existsById(game.id)).toBe(false);

      await repository.save(game);

      expect(await repository.existsById(game.id)).toBe(true);
    });
  });

  describe('regex-safe search filtering', () => {
    it('treats regex metacharacters as literal text in search', async () => {
      const game = createGame({
        id: createGameId('game-regex'),
        titles: [createGameTitle('Resident Evil 4')],
        developers: [createDeveloper('Capcom')],
        publishers: [createPublisher('Capcom')],
        classification: ClassificationCategory.GAME,
      });

      await repository.save(game);

      const result = await repository.findMany({ search: '(a+)+$' });
      expect(result.items).toHaveLength(0);

      const result2 = await repository.findMany({ search: 'Resident Evil' });
      expect(result2.items).toHaveLength(1);
      expect(result2.items[0].id).toBe('game-regex');
    });

    it('treats regex metacharacters as literal text in title filter', async () => {
      const game = createGame({
        id: createGameId('game-regex-title'),
        titles: [createGameTitle('Game.Series.Test')],
        classification: ClassificationCategory.GAME,
      });

      await repository.save(game);

      const result = await repository.findMany({ title: 'Game.Series.Test' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('game-regex-title');

      const result2 = await repository.findMany({ title: 'GameXSeriesXTest' });
      expect(result2.items).toHaveLength(0);
    });

    it('search is case-insensitive with escaped input', async () => {
      const game = createGame({
        id: createGameId('game-case'),
        titles: [createGameTitle('Zelda')],
        classification: ClassificationCategory.GAME,
      });

      await repository.save(game);

      const result = await repository.findMany({ search: 'zelda' });
      expect(result.items).toHaveLength(1);
    });
  });
});
