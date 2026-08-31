import { describe, it, expect } from 'vitest';
import { DeterministicIdentityResolver } from '../../src/identity/deterministic-identity-resolver.js';
import { IdentityOutcome } from '../../src/domain/shared/identity-outcome.js';
import { GameRelationshipType } from '../../src/domain/shared/game-relationship-type.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameId, createReleaseId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createReleaseDate } from '../../src/domain/shared/release-date.js';
import { createRelease } from '../../src/domain/game/release.js';

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
  const base = createGame({
    id: createGameId('game-1'),
    titles: [createGameTitle('Test Game', 'primary')],
  });
  return { ...base, ...overrides };
}

describe('DeterministicIdentityResolver', () => {
  const resolver = new DeterministicIdentityResolver();

  describe('no existing game', () => {
    it('returns UNRESOLVED when no game is provided', async () => {
      const candidate = makeCandidate();
      const result = await resolver.resolve(candidate, null);

      expect(result.outcome).toBe(IdentityOutcome.UNRESOLVED);
      expect(result.relationship).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.method).toBe('NATIVE');
    });
  });

  describe('external ID matching', () => {
    it('returns SAME_GAME when external IDs match exactly', async () => {
      const candidate = makeCandidate({
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });
      const game = makeGame({
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
      expect(result.confidence).toBe(1.0);
      expect(result.signals.some((s) => s.source === 'external-id-match')).toBe(true);
    });

    it('returns DIFFERENT_GAME when external IDs on same source mismatch', async () => {
      const candidate = makeCandidate({
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });
      const game = makeGame({
        externalIdentifiers: [createExternalIdentifier('steam', '99999')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.DIFFERENT_GAME);
      expect(result.signals.some((s) => s.source === 'external-id-mismatch')).toBe(true);
    });

    it('does not create ID mismatch across different sources', async () => {
      const candidate = makeCandidate({
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });
      const game = makeGame({
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'external-id-mismatch')).toBe(false);
    });
  });

  describe('title comparison', () => {
    it('returns SAME_GAME for exact title match', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 4', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 4', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
      expect(result.signals.some((s) => s.source === 'title-exact-match')).toBe(true);
    });

    it('returns SAME_GAME for normalized title match', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'resident evil 4', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 4', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
      expect(result.signals.some((s) => s.source === 'title-normalized-match')).toBe(true);
    });

    it('returns UNRESOLVED for completely different titles', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Mario Kart', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Zelda', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.UNRESOLVED);
      expect(result.signals.some((s) => s.source === 'title-different')).toBe(true);
    });

    it('detects version markers in titles', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 4 Remake', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 4', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'version-marker-detected')).toBe(true);
    });

    it('detects remake markers in titles', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 4 Remake', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 4', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'remake-marker-detected')).toBe(true);
    });
  });

  describe('remake detection', () => {
    it('returns DIFFERENT_GAME for remake with matching developers', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 4 Remake', type: 'primary' }],
        developers: [createOrganization('Capcom')],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        developers: [createOrganization('Capcom')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.DIFFERENT_GAME);
      expect(result.relationship).toBe(GameRelationshipType.REMAKE);
    });

    it('returns DIFFERENT_GAME for different base titles', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Final Fantasy VII Remake', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Final Fantasy VII', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.DIFFERENT_GAME);
    });
  });

  describe('remaster detection', () => {
    it('returns RELATED_GAME for remaster with version marker', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Final Fantasy Tactics: The War of the Lions', type: 'primary' }],
        developers: [createOrganization('Square Enix')],
      });
      const game = makeGame({
        titles: [createGameTitle('Final Fantasy Tactics', 'primary')],
        developers: [createOrganization('Square Enix')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.RELATED_GAME);
      expect(result.relationship).toBe(GameRelationshipType.REMASTER);
    });

    it('returns RELATED_GAME for HD edition', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Shadow of the Colossus HD', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Shadow of the Colossus', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.RELATED_GAME);
      expect(result.relationship).toBe(GameRelationshipType.REMASTER);
    });
  });

  describe('same game - different platforms', () => {
    it('returns SAME_GAME for cross-platform release', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'The Legend of Zelda: Breath of the Wild', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Nintendo Switch', family: 'Nintendo' },
            region: null,
            releaseDate: createReleaseDate(2017),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('The Legend of Zelda: Breath of the Wild', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'Wii U', family: 'Nintendo' },
            releaseDate: createReleaseDate(2017),
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
    });

    it('returns SAME_GAME for PC family (Windows, macOS, Linux)', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Stardew Valley', type: 'primary' }],
        releases: [
          {
            platform: { name: 'macOS', family: 'PC' },
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
        titles: [createGameTitle('Stardew Valley', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'Windows', family: 'PC' },
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
    });
  });

  describe('same game - different distribution channels', () => {
    it('returns SAME_GAME for Steam vs GOG', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Cyberpunk 2077', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'GOG' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('Cyberpunk 2077', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'Windows', family: 'PC' },
            distributionChannels: [{ name: 'Steam' }],
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
    });
  });

  describe('same game - regional releases', () => {
    it('returns SAME_GAME for regional variants', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 3', type: 'primary' }],
        releases: [
          {
            platform: { name: 'PlayStation', family: 'PlayStation' },
            region: { name: 'PAL', code: 'EUR' },
            releaseDate: createReleaseDate(1999),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 3', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'PlayStation', family: 'PlayStation' },
            region: { name: 'NTSC', code: 'USA' },
            releaseDate: createReleaseDate(1999),
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
    });
  });

  describe('same game - mobile and desktop', () => {
    it('returns SAME_GAME for mobile and desktop versions', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Stardew Valley', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Android', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Google Play' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('Stardew Valley', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'Windows', family: 'PC' },
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
    });
  });

  describe('developer and publisher signals', () => {
    it('includes developer match signal', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
        developers: [createOrganization('Capcom')],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
        developers: [createOrganization('Capcom')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'developer-match')).toBe(true);
    });

    it('includes developer mismatch signal', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
        developers: [createOrganization('Studio A')],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
        developers: [createOrganization('Studio B')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'developer-different')).toBe(true);
    });

    it('includes publisher match signal', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
        publishers: [createOrganization('Nintendo')],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
        publishers: [createOrganization('Nintendo')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'publisher-match')).toBe(true);
    });
  });

  describe('release date signals', () => {
    it('includes release date match signal', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: createReleaseDate(2020),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'Windows', family: 'PC' },
            releaseDate: createReleaseDate(2020),
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'release-date-match')).toBe(true);
    });

    it('includes release date mismatch signal', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: createReleaseDate(2020),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'Windows', family: 'PC' },
            releaseDate: createReleaseDate(2010),
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals.some((s) => s.source === 'release-date-different')).toBe(true);
    });
  });

  describe('explainability', () => {
    it('includes reason in result', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('includes signals in result', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.signals).toBeInstanceOf(Array);
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('each signal has required fields', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      for (const signal of result.signals) {
        expect(signal.source).toBeTruthy();
        expect(typeof signal.weight).toBe('number');
        expect(typeof signal.confidence).toBe('number');
        expect(signal.evidence).toBeTruthy();
      }
    });
  });

  describe('edge cases', () => {
    it('handles candidates with no titles', async () => {
      const candidate = makeCandidate({
        titles: [],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBeTruthy();
    });

    it('handles candidates with no releases', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
        releases: [],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBeTruthy();
    });

    it('handles games with no releases', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
        releases: [],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBeTruthy();
    });
  });

  describe('confidence scoring', () => {
    it('returns high confidence for exact external ID match', async () => {
      const candidate = makeCandidate({
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });
      const game = makeGame({
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.confidence).toBe(1.0);
    });

    it('returns confidence less than 1.0 for title-only match', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game A', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Game A', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.confidence).toBeLessThan(1.0);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('complex scenarios', () => {
    it('handles Resident Evil 4 (2005) vs Resident Evil 4 (2023) remake', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 4 Remake', type: 'primary' }],
        developers: [createOrganization('Capcom')],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        developers: [createOrganization('Capcom')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.DIFFERENT_GAME);
      expect(result.relationship).toBe(GameRelationshipType.REMAKE);
    });

    it('handles Final Fantasy Tactics vs The War of the Lions', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Final Fantasy Tactics: The War of the Lions', type: 'primary' }],
        developers: [createOrganization('Square Enix')],
      });
      const game = makeGame({
        titles: [createGameTitle('Final Fantasy Tactics', 'primary')],
        developers: [createOrganization('Square Enix')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.RELATED_GAME);
      expect(result.relationship).toBe(GameRelationshipType.REMASTER);
    });

    it('handles ambiguous cases with UNRESOLVED', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Completely Different Title', type: 'primary' }],
      });
      const game = makeGame({
        titles: [createGameTitle('Another Title', 'primary')],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.UNRESOLVED);
    });

    it('handles Breath of the Wild Wii U vs Switch', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'The Legend of Zelda: Breath of the Wild', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Nintendo Switch', family: 'Nintendo' },
            region: null,
            releaseDate: createReleaseDate(2017),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('The Legend of Zelda: Breath of the Wild', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'Wii U', family: 'Nintendo' },
            releaseDate: createReleaseDate(2017),
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
    });

    it('handles Resident Evil 3 NTSC vs PAL', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 3', type: 'primary' }],
        releases: [
          {
            platform: { name: 'PlayStation', family: 'PlayStation' },
            region: { name: 'PAL', code: 'EUR' },
            releaseDate: createReleaseDate(1999),
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
      });
      const game = makeGame({
        titles: [createGameTitle('Resident Evil 3', 'primary')],
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: { name: 'PlayStation', family: 'PlayStation' },
            region: { name: 'NTSC', code: 'USA' },
            releaseDate: createReleaseDate(1999),
          }),
        ],
      });

      const result = await resolver.resolve(candidate, game);

      expect(result.outcome).toBe(IdentityOutcome.SAME_GAME);
    });
  });
});
