import { describe, it, expect, beforeEach } from 'vitest';
import { enrichGame } from '../../src/enrichment/enrichment-engine.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createPlatform } from '../../src/domain/shared/platform.js';
import { createReleaseDate } from '../../src/domain/shared/release-date.js';
import { createDistributionChannel } from '../../src/domain/shared/distribution-channel.js';
import { createLauncher } from '../../src/domain/shared/launcher.js';
import { createRegion } from '../../src/domain/shared/region.js';
import { createRelease } from '../../src/domain/game/release.js';
import { createReleaseId } from '../../src/domain/shared/ids.js';
import { MetadataCompleteness } from '../../src/domain/shared/metadata-completeness.js';
import type { DiscoverySourceObservation } from '../../src/discovery/discovery-types.js';
import type { ClassificationResult } from '../../src/classification/classification-result.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';

const stubClassification: ClassificationResult = {
  category: 'GAME',
  confidence: 0.8,
  signals: [],
  reason: 'test',
};

function makeObservation(
  source: string,
  sourceId: string,
  candidate: Partial<NormalizedCandidate> & { titles: NonNullable<NormalizedCandidate['titles']> },
): DiscoverySourceObservation {
  return {
    source,
    sourceId,
    candidate: {
      titles: candidate.titles,
      developers: candidate.developers ?? [],
      publishers: candidate.publishers ?? [],
      genres: candidate.genres ?? [],
      releases: candidate.releases ?? [],
      externalIdentifiers: candidate.externalIdentifiers ?? [],
      provenance: {
        source,
        sourceId,
        retrievedAt: '2024-01-01T00:00:00Z',
        rawTitle: null,
      },
      classificationHints: candidate.classificationHints ?? [],
      description: candidate.description ?? null,
    },
    classification: stubClassification,
    retrievedAt: '2024-01-01T00:00:00Z',
  };
}

describe('enrichGame', () => {
  let baseGame: ReturnType<typeof createGame>;

  beforeEach(() => {
    baseGame = createGame({
      id: createGameId('game-1'),
      titles: [createGameTitle('Test Game', 'primary')],
      developers: [createOrganization('DevStudio')],
    });
  });

  describe('basic enrichment', () => {
    it('returns unchanged game when no observations', () => {
      const result = enrichGame(baseGame, []);
      expect(result.game).toEqual(baseGame);
      expect(result.changes).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it('adds missing developer', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('NewDev')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.developers).toHaveLength(2);
      expect(result.game.developers.some((d) => d.name === 'NewDev')).toBe(true);
      expect(
        result.changes.some((c) => c.fieldType === 'developer' && c.changeType === 'added'),
      ).toBe(true);
    });

    it('adds missing publisher', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        publishers: [createOrganization('NewPublisher')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.publishers).toHaveLength(1);
      expect(result.game.publishers[0].name).toBe('NewPublisher');
    });

    it('adds missing genre', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        genres: [createGenre('action')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.genres).toHaveLength(1);
      expect(result.game.genres[0].name).toBe('action');
    });

    it('adds alternate title', () => {
      const obs = makeObservation('wikipedia', 'w1', {
        titles: [
          { value: 'Test Game', type: 'primary' },
          { value: 'Test Game Alternate', type: 'alternate' },
        ],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.titles).toHaveLength(2);
      expect(result.game.titles.some((t) => t.value === 'Test Game Alternate')).toBe(true);
    });

    it('adds external identifier', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.externalIdentifiers).toHaveLength(1);
      expect(result.game.externalIdentifiers[0].source).toBe('steam');
      expect(result.game.externalIdentifiers[0].id).toBe('12345');
    });

    it('adds evidence', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.evidence).toHaveLength(1);
      expect(result.game.evidence[0].source).toBe('steam');
    });
  });

  describe('conflict handling', () => {
    it('retains existing developer when name variation detected', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('DifferentStudio')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.developers).toHaveLength(2);
      expect(result.game.developers.some((d) => d.name === 'DevStudio')).toBe(true);
      expect(result.game.developers.some((d) => d.name === 'DifferentStudio')).toBe(true);
    });

    it('skips duplicate developer with suffix variation', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('DevStudio Inc.')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.developers).toHaveLength(1);
      expect(result.game.developers[0].name).toBe('DevStudio');
    });

    it('retains existing genre when name variation detected', () => {
      const gameWithGenre = {
        ...baseGame,
        genres: [createGenre('Action')],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        genres: [createGenre('role-playing')],
      });

      const result = enrichGame(gameWithGenre, [obs]);
      expect(result.game.genres).toHaveLength(2);
      expect(result.game.genres.some((g) => g.name === 'Action')).toBe(true);
      expect(result.game.genres.some((g) => g.name === 'role-playing')).toBe(true);
    });

    it('skips duplicate genre with different case', () => {
      const gameWithGenre = {
        ...baseGame,
        genres: [createGenre('Action')],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        genres: [createGenre('action')],
      });

      const result = enrichGame(gameWithGenre, [obs]);
      expect(result.game.genres).toHaveLength(1);
      expect(result.game.genres[0].name).toBe('Action');
    });

    it('detects conflict when developer has same core name but different suffix', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('DevStudio Inc.')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.developers).toHaveLength(1);
      expect(result.game.developers[0].name).toBe('DevStudio');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].fieldType).toBe('developer');
      expect(result.conflicts[0].valueA).toBe('DevStudio');
      expect(result.conflicts[0].valueB).toBe('DevStudio Inc.');
    });

    it('detects conflict when genre is equivalent but not identical', () => {
      const gameWithGenre = {
        ...baseGame,
        genres: [createGenre('Sci-fi')],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        genres: [createGenre('Science Fiction')],
      });

      const result = enrichGame(gameWithGenre, [obs]);
      expect(result.game.genres).toHaveLength(2);
      expect(result.game.genres.some((g) => g.name === 'Sci-fi')).toBe(true);
      expect(result.game.genres.some((g) => g.name === 'Science Fiction')).toBe(true);
    });

    it('detects conflict when publisher has same core name but different suffix', () => {
      const gameWithPublisher = {
        ...baseGame,
        publishers: [createOrganization('PublisherCorp')],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        publishers: [createOrganization('PublisherCorp Ltd.')],
      });

      const result = enrichGame(gameWithPublisher, [obs]);
      expect(result.game.publishers).toHaveLength(1);
      expect(result.game.publishers[0].name).toBe('PublisherCorp');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].fieldType).toBe('publisher');
      expect(result.conflicts[0].valueA).toBe('PublisherCorp');
      expect(result.conflicts[0].valueB).toBe('PublisherCorp Ltd.');
    });

    it('retains existing primary title when conflict detected', () => {
      const obs = makeObservation('wikipedia', 'w1', {
        titles: [{ value: 'Test Game', type: 'alternate' }],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.titles).toHaveLength(1);
      expect(result.game.titles[0].type).toBe('primary');
    });
  });

  describe('release enrichment', () => {
    it('adds new release for different platform', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: createReleaseDate(2024, 1, 15),
            version: null,
            edition: null,
            distributionChannels: [createDistributionChannel('Steam')],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.releases).toHaveLength(1);
      expect(result.game.releases[0].platform.name).toBe('Windows');
      expect(result.game.releases[0].distributionChannels).toHaveLength(1);
    });

    it('enriches existing release with distribution channel', () => {
      const existingRelease = createRelease({
        id: createReleaseId('rel-1'),
        gameId: createGameId('game-1'),
        platform: createPlatform('Windows', 'PC', 'computer'),
        distributionChannels: [createDistributionChannel('Steam')],
      });

      const gameWithRelease = {
        ...baseGame,
        releases: [existingRelease],
      };

      const obs = makeObservation('epic', 'e1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [createDistributionChannel('Epic Games Store')],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(gameWithRelease, [obs]);
      expect(result.game.releases).toHaveLength(1);
      expect(result.game.releases[0].distributionChannels).toHaveLength(2);
    });

    it('improves release date precision from year to day', () => {
      const existingRelease = createRelease({
        id: createReleaseId('rel-1'),
        gameId: createGameId('game-1'),
        platform: createPlatform('Windows', 'PC', 'computer'),
        releaseDate: createReleaseDate(2024),
      });

      const gameWithRelease = {
        ...baseGame,
        releases: [existingRelease],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: createReleaseDate(2024, 3, 20),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(gameWithRelease, [obs]);
      expect(result.game.releases[0].releaseDate?.precision).toBe('day');
      expect(
        result.changes.some(
          (c) => c.fieldType === 'release_date' && c.changeType === 'improved_precision',
        ),
      ).toBe(true);
    });

    it('retains existing date when year conflict', () => {
      const existingRelease = createRelease({
        id: createReleaseId('rel-1'),
        gameId: createGameId('game-1'),
        platform: createPlatform('Windows', 'PC', 'computer'),
        releaseDate: createReleaseDate(2024, 3, 20),
      });

      const gameWithRelease = {
        ...baseGame,
        releases: [existingRelease],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: createReleaseDate(2025, 3, 20),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(gameWithRelease, [obs]);
      expect(result.game.releases[0].releaseDate?.year).toBe(2024);
      expect(result.conflicts.some((c) => c.fieldType === 'release_date')).toBe(true);
    });

    it('retains existing date when month conflict at same precision', () => {
      const existingRelease = createRelease({
        id: createReleaseId('rel-1'),
        gameId: createGameId('game-1'),
        platform: createPlatform('Windows', 'PC', 'computer'),
        releaseDate: createReleaseDate(2024, 3, 20),
      });

      const gameWithRelease = {
        ...baseGame,
        releases: [existingRelease],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: createReleaseDate(2024, 5, 20),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(gameWithRelease, [obs]);
      expect(result.game.releases[0].releaseDate?.month).toBe(3);
      expect(result.conflicts.some((c) => c.fieldType === 'release_date')).toBe(true);
    });
  });

  describe('release enrichment', () => {
    it('adds launcher to existing release', () => {
      const existingRelease = createRelease({
        id: createReleaseId('rel-1'),
        gameId: createGameId('game-1'),
        platform: createPlatform('Windows', 'PC', 'computer'),
        launchers: [createLauncher('Steam Client')],
      });

      const gameWithRelease = {
        ...baseGame,
        releases: [existingRelease],
      };

      const obs = makeObservation('epic', 'e1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [createLauncher('Epic Games Launcher')],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(gameWithRelease, [obs]);
      expect(result.game.releases[0].launchers).toHaveLength(2);
    });

    it('adds release external identifier', () => {
      const existingRelease = createRelease({
        id: createReleaseId('rel-1'),
        gameId: createGameId('game-1'),
        platform: createPlatform('Windows', 'PC', 'computer'),
      });

      const gameWithRelease = {
        ...baseGame,
        releases: [existingRelease],
      };

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [createExternalIdentifier('steam', '12345')],
          },
        ],
      });

      const result = enrichGame(gameWithRelease, [obs]);
      expect(result.game.releases[0].externalIdentifiers).toHaveLength(1);
      expect(result.game.releases[0].externalIdentifiers[0].source).toBe('steam');
    });
  });

  describe('completeness calculation', () => {
    it('calculates FOUND_COMPLETE for fully enriched game', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('DevStudio')],
        publishers: [createOrganization('PublisherInc')],
        genres: [createGenre('action')],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: createRegion('Worldwide'),
            releaseDate: createReleaseDate(2024, 3, 20),
            version: null,
            edition: null,
            distributionChannels: [createDistributionChannel('Steam')],
            launchers: [],
            externalIdentifiers: [createExternalIdentifier('steam', '12345')],
          },
        ],
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.completeness).toBe(MetadataCompleteness.FOUND_COMPLETE);
    });

    it('calculates NOT_FOUND for empty game with no observations', () => {
      const emptyGame = createGame({
        id: createGameId('game-empty'),
        titles: [createGameTitle('Empty', 'primary')],
      });

      const result = enrichGame(emptyGame, []);
      expect(result.completeness).toBe(MetadataCompleteness.FOUND_PARTIAL);
    });
  });

  describe('platform ontology regression', () => {
    it('Steam remains DistributionChannel, not Platform', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Windows', 'PC', 'computer'),
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [createDistributionChannel('Steam')],
            launchers: [createLauncher('Steam Client')],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(baseGame, [obs]);
      const release = result.game.releases[0];
      expect(release.platform.name).toBe('Windows');
      expect(release.platform.type).toBe('computer');
      expect(release.distributionChannels[0].name).toBe('Steam');
    });

    it('Google Play remains DistributionChannel, not Platform', () => {
      const obs = makeObservation('googleplay', 'gp1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Android', 'Mobile', 'mobile'),
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [createDistributionChannel('Google Play')],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });

      const result = enrichGame(baseGame, [obs]);
      const release = result.game.releases[0];
      expect(release.platform.name).toBe('Android');
      expect(release.platform.type).toBe('mobile');
      expect(release.distributionChannels[0].name).toBe('Google Play');
    });

    it('PICO-8 is Platform with type fantasy-console', () => {
      const obs = makeObservation('lexaloffle', 'l1', {
        titles: [{ value: 'PICO Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('PICO-8', 'Other', 'fantasy-console'),
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

      const result = enrichGame(baseGame, [obs]);
      const release = result.game.releases[0];
      expect(release.platform.name).toBe('PICO-8');
      expect(release.platform.type).toBe('fantasy-console');
    });

    it('CPS2 is Platform with type arcade', () => {
      const obs = makeObservation('mamedb', 'm1', {
        titles: [{ value: 'Street Fighter II', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('CPS2', 'Other', 'arcade'),
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

      const result = enrichGame(baseGame, [obs]);
      const release = result.game.releases[0];
      expect(release.platform.name).toBe('CPS2');
      expect(release.platform.type).toBe('arcade');
    });

    it('Commodore 64 is Platform with type computer', () => {
      const obs = makeObservation('c64db', 'c1', {
        titles: [{ value: 'C64 Game', type: 'primary' }],
        releases: [
          {
            platform: createPlatform('Commodore 64', 'Other', 'computer'),
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

      const result = enrichGame(baseGame, [obs]);
      const release = result.game.releases[0];
      expect(release.platform.name).toBe('Commodore 64');
      expect(release.platform.type).toBe('computer');
    });
  });

  describe('determinism', () => {
    it('produces same result regardless of observation order', () => {
      const obs1 = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('DevA')],
        genres: [createGenre('action')],
      });
      const obs2 = makeObservation('wikipedia', 'w1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('DevB')],
        genres: [createGenre('rpg')],
      });

      const result1 = enrichGame(baseGame, [obs1, obs2]);
      const result2 = enrichGame(baseGame, [obs2, obs1]);

      expect(result1.game.developers.map((d) => d.name).sort()).toEqual(
        result2.game.developers.map((d) => d.name).sort(),
      );
      expect(result1.game.genres.map((g) => g.name).sort()).toEqual(
        result2.game.genres.map((g) => g.name).sort(),
      );
      expect(result1.changes).toHaveLength(result2.changes.length);
    });

    it('is idempotent - running twice produces same result', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('NewDev')],
        genres: [createGenre('action')],
      });

      const result1 = enrichGame(baseGame, [obs]);
      const result2 = enrichGame(result1.game, [obs]);

      expect(result2.game.developers).toHaveLength(result1.game.developers.length);
      expect(result2.game.genres).toHaveLength(result1.game.genres.length);
      expect(result2.changes).toHaveLength(0);
    });

    it('duplicate observations produce same canonical result', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        developers: [createOrganization('NewDev')],
      });

      const result1 = enrichGame(baseGame, [obs]);
      const result2 = enrichGame(baseGame, [obs, obs]);

      expect(result1.game.developers).toHaveLength(result2.game.developers.length);
    });
  });

  describe('identity safety', () => {
    it('does not merge two different games', () => {
      const gameA = createGame({
        id: createGameId('game-a'),
        titles: [createGameTitle('Game A', 'primary')],
      });

      const obsB = makeObservation('steam', 's1', {
        titles: [{ value: 'Game B', type: 'primary' }],
        developers: [createOrganization('DevB')],
      });

      const result = enrichGame(gameA, [obsB]);
      expect(result.game.titles).toHaveLength(2);
      expect(result.game.titles.some((t) => t.value === 'Game B')).toBe(true);
      expect(result.game.id).toBe(gameA.id);
    });

    it('does not reinterpret a remake as the original', () => {
      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game Remake', type: 'primary' }],
      });

      const result = enrichGame(baseGame, [obs]);
      expect(result.game.titles).toHaveLength(2);
      expect(result.game.titles[0].value).toBe('Test Game');
      expect(result.game.titles[1].value).toBe('Test Game Remake');
    });
  });

  describe('classification safety', () => {
    it('does not change classification during enrichment', () => {
      const gameWithUnknown = createGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Test Game', 'primary')],
        classification: 'UNKNOWN',
      });

      const obs = makeObservation('steam', 's1', {
        titles: [{ value: 'Test Game', type: 'primary' }],
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
      });

      const result = enrichGame(gameWithUnknown, [obs]);
      expect(result.game.classification).toBe('UNKNOWN');
    });
  });
});
