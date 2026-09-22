import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IgdbAdapter } from '../../../src/sources/igdb/igdb-adapter.js';
import { normalizeCandidate } from '../../../src/normalization/normalize.js';
import { enrichGame, mergeCandidateReleases } from '../../../src/enrichment/enrichment-engine.js';
import { createGame, createGameId, createGameTitle } from '../../../src/domain/index.js';
import { createOrganization } from '../../../src/domain/shared/organization.js';
import { createPlatform } from '../../../src/domain/shared/platform.js';
import { createExternalIdentifier } from '../../../src/domain/shared/external-identifier.js';
import type { NormalizedCandidate } from '../../../src/normalization/normalized-candidate.js';
import type { DiscoverySourceObservation } from '../../../src/discovery/discovery-types.js';
import type { ClassificationResult } from '../../../src/classification/classification-result.js';
import { IGDB_OAUTH_TOKEN_RESPONSE } from '../fixtures/source-fixtures.js';

function mockIgdbGames(games: unknown[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('id.twitch.tv')) {
      return new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    void init;
    return new Response(JSON.stringify(games), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const gameClassification: ClassificationResult = {
  category: 'GAME',
  confidence: 0.8,
  signals: [],
  reason: 'test',
};

function makeObservation(
  candidate: Partial<NormalizedCandidate> & { titles: NonNullable<NormalizedCandidate['titles']> },
): DiscoverySourceObservation {
  return {
    source: 'igdb',
    sourceId: '4',
    candidate: {
      titles: candidate.titles,
      developers: candidate.developers ?? [],
      publishers: candidate.publishers ?? [],
      genres: candidate.genres ?? [],
      releases: candidate.releases ?? [],
      externalIdentifiers: candidate.externalIdentifiers ?? [],
      gameType: candidate.gameType ?? null,
      gameStatus: candidate.gameStatus ?? null,
      parentGameId: candidate.parentGameId ?? null,
      versionParentId: candidate.versionParentId ?? null,
      provenance: {
        source: 'igdb',
        sourceId: '4',
        retrievedAt: '2024-01-01T00:00:00Z',
        rawTitle: null,
      },
      classificationHints: candidate.classificationHints ?? [],
      description: candidate.description ?? null,
      coverUrls: [],
    },
    classification: gameClassification,
    retrievedAt: '2024-01-01T00:00:00Z',
  };
}

function makeGame() {
  return createGame({
    id: createGameId('atp-igdb-4'),
    titles: [createGameTitle('Thief', 'primary')],
    developers: [createOrganization('Eidos')],
    classification: 'GAME',
  });
}

describe('IGDB platform identity preservation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('realistic fixture: numeric platforms keep their ids next to names', async () => {
    mockIgdbGames([
      {
        id: 4,
        name: 'Thief',
        platforms: [9, 48, 6, 14, 12, 49],
      },
    ]);
    const adapter = new IgdbAdapter({ source: 'igdb', clientId: 'id', clientSecret: 'secret' });

    const result = await adapter.search('Thief');

    expect(result.candidates).toHaveLength(1);
    const platforms = result.candidates[0].platforms ?? [];
    expect(platforms).toHaveLength(6);
    expect(platforms).toContainEqual({ name: 'PlayStation 4', source: 'igdb', sourceId: 48 });
    for (const entry of platforms) {
      expect(typeof entry).toBe('object');
      if (typeof entry === 'object') {
        expect(entry.source).toBe('igdb');
        expect(typeof entry.sourceId).toBe('number');
      }
    }
  });

  it('case 1 — PS4/48 normalizes to { source: igdb, id: 48 }', () => {
    const candidate = normalizeCandidate(
      {
        title: 'Thief',
        platforms: [{ name: 'PlayStation 4', source: 'igdb', sourceId: 48 }],
      },
      'igdb',
      '4',
    );

    expect(candidate.releases).toHaveLength(1);
    expect(candidate.releases[0].platform.name).toBe('PlayStation 4');
    expect(candidate.releases[0].externalIdentifiers).toEqual([{ source: 'igdb', id: '48' }]);
  });

  it('case 2 — multiple platforms keep distinct paired identities', () => {
    const candidate = normalizeCandidate(
      {
        title: 'Thief',
        platforms: [
          { name: 'PlayStation 4', source: 'igdb', sourceId: 48 },
          { name: 'PC', source: 'igdb', sourceId: 6 },
          { name: 'Xbox One', source: 'igdb', sourceId: 49 },
        ],
      },
      'igdb',
      '4',
    );

    const byPlatform = new Map(
      candidate.releases.map((r) => [r.platform.name, r.externalIdentifiers]),
    );
    expect(byPlatform.get('PlayStation 4')).toEqual([{ source: 'igdb', id: '48' }]);
    expect(byPlatform.get('PC')).toEqual([{ source: 'igdb', id: '6' }]);
    expect(byPlatform.get('Xbox One')).toEqual([{ source: 'igdb', id: '49' }]);
  });

  it('case 3 — platforms without identity produce no identifier', () => {
    const candidate = normalizeCandidate(
      {
        title: 'Thief',
        platforms: [
          'PlayStation 4',
          { name: 'PC' },
          { name: 'Xbox One', source: 'igdb', sourceId: '' },
          { name: 'Mac', source: '', sourceId: 14 },
        ],
      },
      'igdb',
      '4',
    );

    expect(candidate.releases).toHaveLength(4);
    for (const release of candidate.releases) {
      expect(release.externalIdentifiers).toEqual([]);
    }
  });

  it('case 4 — re-ingesting the same id never duplicates', () => {
    const game = makeGame();
    const observation = makeObservation({
      titles: [{ value: 'Thief', type: 'primary' }],
      releases: [
        {
          domainId: 'r1',
          platform: createPlatform('PlayStation 4'),
          region: null,
          releaseDate: null,
          version: null,
          edition: null,
          distributionChannels: [],
          launchers: [],
          externalIdentifiers: [createExternalIdentifier('igdb', '48')],
          evidence: [],
        },
      ],
    });

    const first = enrichGame(game, [observation]);
    const second = enrichGame(first.game, [observation]);
    const release = second.game.releases.find((r) => r.platform.name === 'PlayStation 4');
    expect(release?.externalIdentifiers).toEqual([{ source: 'igdb', id: '48' }]);
  });

  it('case 5 — enrichment merges identifiers additively', () => {
    const game = makeGame();
    const observation = makeObservation({
      titles: [{ value: 'Thief', type: 'primary' }],
      releases: [
        {
          domainId: 'r1',
          platform: createPlatform('PlayStation 4'),
          region: null,
          releaseDate: null,
          version: null,
          edition: null,
          distributionChannels: [],
          launchers: [],
          externalIdentifiers: [createExternalIdentifier('steam', 'steam-9')],
          evidence: [],
        },
      ],
    });

    const first = enrichGame(game, [observation]);
    const again = enrichGame(first.game, [
      makeObservation({
        titles: [{ value: 'Thief', type: 'primary' }],
        releases: [
          {
            domainId: 'r1',
            platform: createPlatform('PlayStation 4'),
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [createExternalIdentifier('igdb', '48')],
            evidence: [],
          },
        ],
      }),
    ]);
    const release = again.game.releases.find((r) => r.platform.name === 'PlayStation 4');
    expect(release?.externalIdentifiers).toEqual([
      { source: 'steam', id: 'steam-9' },
      { source: 'igdb', id: '48' },
    ]);
  });

  it('case 6 — port-fold preserves identifiers', () => {
    const parent = makeGame();
    const observation = makeObservation({
      titles: [{ value: 'Thief', type: 'primary' }],
      releases: [
        {
          domainId: 'r-port',
          platform: createPlatform('PlayStation 4'),
          region: null,
          releaseDate: null,
          version: null,
          edition: null,
          distributionChannels: [],
          launchers: [],
          externalIdentifiers: [createExternalIdentifier('igdb', '48')],
          evidence: [],
        },
      ],
    });

    const { game: merged, addedReleases } = mergeCandidateReleases(parent, [observation]);

    expect(addedReleases).toBe(1);
    expect(merged.releases[0].externalIdentifiers).toEqual([{ source: 'igdb', id: '48' }]);
  });

  it('case 7 — non-IGDB string platforms gain no identifiers', () => {
    const candidate = normalizeCandidate(
      {
        title: 'Some Game',
        platforms: ['PC', 'Browser'],
      },
      'wikipedia',
      '123',
    );

    for (const release of candidate.releases) {
      expect(release.externalIdentifiers).toEqual([]);
    }
    expect(candidate.releases.map((r) => r.platform.name)).toEqual(['PC', 'Browser']);
  });

  it('case 8 — identifiers do not alter the release domainId', () => {
    const withoutId = normalizeCandidate({ title: 'Thief', platforms: ['PlayStation 4'] }, 'igdb', '4');
    const withId = normalizeCandidate(
      { title: 'Thief', platforms: [{ name: 'PlayStation 4', source: 'igdb', sourceId: 48 }] },
      'igdb',
      '4',
    );

    const game = makeGame();
    const first = enrichGame(game, [makeObservation({ titles: [{ value: 'Thief', type: 'primary' }], releases: withoutId.releases })]);
    const second = enrichGame(game, [makeObservation({ titles: [{ value: 'Thief', type: 'primary' }], releases: withId.releases })]);

    const ids = (g: typeof game) => g.releases.map((r) => r.id).sort();
    expect(ids(first.game)).toEqual(ids(second.game));
    expect(ids(second.game)[0]).toContain('PlayStation 4');
  });
});
