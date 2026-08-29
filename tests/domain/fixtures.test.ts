import { describe, it, expect } from 'vitest';
import {
  createGame,
  createGameId,
  createGameTitle,
  createRelease,
  createReleaseId,
  createPlatform,
  createRegion,
  createDeveloper,
  createPublisher,
  createGenre,
  createExternalIdentifier,
  ClassificationCategory,
  GameRelationshipType,
} from '../../src/domain/index.js';

describe('Domain Fixtures - Core Identity Scenarios', () => {
  describe('Resident Evil 4 (2005) vs Resident Evil 4 (2023)', () => {
    it('represents as two distinct Games with remake relationship', () => {
      const re4Original = createGame({
        id: createGameId('re4-2005'),
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        developers: [createDeveloper('Capcom')],
        publishers: [createPublisher('Capcom')],
        genres: [createGenre('Survival Horror')],
        classification: ClassificationCategory.GAME,
      });

      const re4Remake = createGame({
        id: createGameId('re4-2023'),
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        developers: [createDeveloper('Capcom')],
        publishers: [createPublisher('Capcom')],
        genres: [createGenre('Survival Horror')],
        classification: ClassificationCategory.GAME,
      });

      expect(re4Original.id).not.toBe(re4Remake.id);
      expect(re4Original.id).toBe('re4-2005');
      expect(re4Remake.id).toBe('re4-2023');

      const rel = {
        sourceGameId: re4Original.id,
        targetGameId: re4Remake.id,
        type: GameRelationshipType.REMAKE as const,
      };

      expect(rel.type).toBe('REMAKE');
      expect(rel.sourceGameId).toBe('re4-2005');
      expect(rel.targetGameId).toBe('re4-2023');
    });
  });

  describe('Breath of the Wild - Multi-platform', () => {
    it('represents as one Game with multiple platform releases', () => {
      const botw = createGame({
        id: createGameId('botw'),
        titles: [createGameTitle('The Legend of Zelda: Breath of the Wild', 'primary')],
        developers: [createDeveloper('Nintendo EPD')],
        publishers: [createPublisher('Nintendo')],
        genres: [createGenre('Action-Adventure')],
        classification: ClassificationCategory.GAME,
      });

      const wiiURelease = createRelease({
        id: createReleaseId('botw-wiiu'),
        gameId: botw.id,
        platform: createPlatform('Wii U'),
        releaseDate: { year: 2017, month: 3, day: 3, precision: 'day' as const },
        region: createRegion('Worldwide'),
      });

      const switchRelease = createRelease({
        id: createReleaseId('botw-switch'),
        gameId: botw.id,
        platform: createPlatform('Nintendo Switch'),
        releaseDate: { year: 2017, month: 3, day: 3, precision: 'day' as const },
        region: createRegion('Worldwide'),
      });

      expect(wiiURelease.gameId).toBe(botw.id);
      expect(switchRelease.gameId).toBe(botw.id);
      expect(wiiURelease.platform.name).toBe('Wii U');
      expect(switchRelease.platform.name).toBe('Nintendo Switch');
      expect(wiiURelease.gameId).toBe(switchRelease.gameId);
    });
  });

  describe('Resident Evil 3 - Regional Releases', () => {
    it('represents as one Game with regional releases', () => {
      const re3 = createGame({
        id: createGameId('re3'),
        titles: [createGameTitle('Resident Evil 3', 'primary')],
        developers: [createDeveloper('Capcom')],
        publishers: [createPublisher('Capcom')],
        classification: ClassificationCategory.GAME,
      });

      const ntscRelease = createRelease({
        id: createReleaseId('re3-ntsc'),
        gameId: re3.id,
        platform: createPlatform('PlayStation'),
        region: createRegion('NTSC-USA'),
        releaseDate: { year: 1999, month: 11, day: 11, precision: 'day' as const },
      });

      const palRelease = createRelease({
        id: createReleaseId('re3-pal'),
        gameId: re3.id,
        platform: createPlatform('PlayStation'),
        region: createRegion('PAL-EUR'),
        releaseDate: { year: 1999, month: 9, day: 22, precision: 'day' as const },
      });

      expect(ntscRelease.gameId).toBe(re3.id);
      expect(palRelease.gameId).toBe(re3.id);
      expect(ntscRelease.region?.name).toBe('NTSC-USA');
      expect(palRelease.region?.name).toBe('PAL-EUR');
    });
  });

  describe('Final Fantasy Tactics - Related Versions', () => {
    it('represents three distinct identities without premature merging', () => {
      const fft = createGame({
        id: createGameId('fft'),
        titles: [createGameTitle('Final Fantasy Tactics', 'primary')],
        developers: [createDeveloper('Square')],
        publishers: [createPublisher('Square')],
        classification: ClassificationCategory.GAME,
      });

      const fftWotL = createGame({
        id: createGameId('fft-wotl'),
        titles: [createGameTitle('Final Fantasy Tactics: The War of the Lions', 'primary')],
        developers: [createDeveloper('Square')],
        publishers: [createPublisher('Square')],
        classification: ClassificationCategory.GAME,
      });

      const fftIvalice = createGame({
        id: createGameId('fft-ivalice'),
        titles: [createGameTitle('Final Fantasy Tactics: The Ivalice Chronicles', 'primary')],
        developers: [createDeveloper('Square')],
        publishers: [createPublisher('Square')],
        classification: ClassificationCategory.GAME,
      });

      expect(fft.id).not.toBe(fftWotL.id);
      expect(fft.id).not.toBe(fftIvalice.id);
      expect(fftWotL.id).not.toBe(fftIvalice.id);

      expect(fft.titles[0].value).toBe('Final Fantasy Tactics');
      expect(fftWotL.titles[0].value).toBe('Final Fantasy Tactics: The War of the Lions');
      expect(fftIvalice.titles[0].value).toBe('Final Fantasy Tactics: The Ivalice Chronicles');
    });
  });
});

describe('Domain Invariants', () => {
  it('Game ID is independent of external IDs', () => {
    const game = createGame({
      id: createGameId('internal-id'),
      titles: [createGameTitle('Test Game')],
      externalIdentifiers: [
        createExternalIdentifier('steamdb', '12345'),
        createExternalIdentifier('wikipedia', 'wiki-67890'),
      ],
    });

    expect(game.id).toBe('internal-id');
    expect(game.externalIdentifiers).toHaveLength(2);
    expect(game.id).not.toBe('12345');
    expect(game.id).not.toBe('wiki-67890');
  });

  it('Classification and identity are separate concepts', () => {
    const game = createGame({
      id: createGameId('g1'),
      titles: [createGameTitle('Test')],
      classification: ClassificationCategory.GAME,
    });

    expect(game.classification).toBe('GAME');
    expect(game.id).toBe('g1');
    expect(game.classification).not.toBe(game.id);
  });

  it('Platform differences belong to releases, not Game identity', () => {
    const game = createGame({
      id: createGameId('g1'),
      titles: [createGameTitle('Test')],
    });

    const release = createRelease({
      id: createReleaseId('r1'),
      gameId: game.id,
      platform: createPlatform('Switch'),
    });

    expect(release.platform.name).toBe('Switch');
    expect(game.id).not.toContain('Switch');
  });

  it('Region differences belong to releases, not Game identity', () => {
    const game = createGame({
      id: createGameId('g1'),
      titles: [createGameTitle('Test')],
    });

    const release = createRelease({
      id: createReleaseId('r1'),
      gameId: game.id,
      platform: createPlatform('PS2'),
      region: createRegion('NTSC-USA'),
    });

    expect(release.region?.name).toBe('NTSC-USA');
    expect(game.id).not.toContain('NTSC');
  });

  it('Remakes are not automatically the same Game', () => {
    const original = createGame({
      id: createGameId('original'),
      titles: [createGameTitle('Game V1')],
    });

    const remake = createGame({
      id: createGameId('remake'),
      titles: [createGameTitle('Game V1')],
    });

    expect(original.id).not.toBe(remake.id);
  });

  it('Source records are not canonical Games', () => {
    const sourceEvidence = {
      source: 'wikipedia',
      externalId: 'wiki-123',
      retrievedAt: new Date(),
      rawTitle: 'Some Title',
    };

    const game = createGame({
      id: createGameId('g1'),
      titles: [createGameTitle('Canonical Title')],
    });

    expect(sourceEvidence.source).toBe('wikipedia');
    expect(game.id).toBe('g1');
    expect(sourceEvidence.source).not.toBe(game.id);
  });
});
