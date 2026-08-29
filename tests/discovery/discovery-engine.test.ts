import { describe, it, expect, beforeEach } from 'vitest';
import { DiscoveryEngine } from '../../src/discovery/discovery-engine.js';
import { SourceRegistry } from '../../src/sources/source-registry.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import { DeterministicIdentityResolver } from '../../src/identity/deterministic-identity-resolver.js';
import { MockAdapter } from '../sources/fixtures/mock-adapter.js';
import { SourceError } from '../../src/sources/source-errors.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';

function createGameCandidate(
  overrides: Partial<RawCandidate> & { source: string; sourceId: string; title: string },
): RawCandidate {
  return {
    platforms: ['Windows'],
    developers: ['TestDev'],
    ...overrides,
  };
}

describe('DiscoveryEngine', () => {
  let registry: SourceRegistry;
  let classifier: DeterministicClassifier;
  let identityResolver: DeterministicIdentityResolver;
  let engine: DiscoveryEngine;

  beforeEach(() => {
    registry = new SourceRegistry();
    classifier = new DeterministicClassifier();
    identityResolver = new DeterministicIdentityResolver();
    engine = new DiscoveryEngine(registry, classifier, identityResolver);
  });

  describe('basic discovery', () => {
    it('returns empty results when no sources registered', async () => {
      const result = await engine.discover({ query: 'zelda' });
      expect(result.groups).toEqual([]);
      expect(result.totalGroups).toBe(0);
      expect(result.sourceErrors).toEqual([]);
    });

    it('returns empty results when source returns no candidates', async () => {
      registry.register(new MockAdapter({ source: 'mock', searchResults: [] }));
      const result = await engine.discover({ query: 'zelda' });
      expect(result.groups).toEqual([]);
      expect(result.totalGroups).toBe(0);
    });

    it('returns one group for one candidate', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [createGameCandidate({ source: 'mock', sourceId: '1', title: 'Zelda' })],
        }),
      );
      const result = await engine.discover({ query: 'zelda' });
      expect(result.groups).toHaveLength(1);
      expect(result.totalGroups).toBe(1);
      expect(result.groups[0].observations).toHaveLength(1);
      expect(result.groups[0].observations[0].source).toBe('mock');
    });

    it('normalizes query before passing to source', async () => {
      const adapter = new MockAdapter({
        source: 'mock',
        searchResults: [createGameCandidate({ source: 'mock', sourceId: '1', title: 'Test' })],
      });
      registry.register(adapter);
      await engine.discover({ query: '  Zelda  ' });
      expect(adapter.getLastSearchQuery()).toBe('Zelda');
    });
  });

  describe('multi-source discovery', () => {
    it('queries multiple sources', async () => {
      registry.register(
        new MockAdapter({
          source: 'wikipedia',
          searchResults: [
            createGameCandidate({ source: 'wikipedia', sourceId: 'w1', title: 'Zelda' }),
          ],
        }),
      );
      registry.register(
        new MockAdapter({
          source: 'steam',
          searchResults: [createGameCandidate({ source: 'steam', sourceId: 's1', title: 'Zelda' })],
        }),
      );

      const result = await engine.discover({ query: 'zelda' });
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].observations).toHaveLength(2);
    });

    it('preserves source provenance', async () => {
      registry.register(
        new MockAdapter({
          source: 'wikipedia',
          searchResults: [
            createGameCandidate({ source: 'wikipedia', sourceId: 'w1', title: 'Zelda' }),
          ],
        }),
      );
      registry.register(
        new MockAdapter({
          source: 'steam',
          searchResults: [createGameCandidate({ source: 'steam', sourceId: 's1', title: 'Zelda' })],
        }),
      );

      const result = await engine.discover({ query: 'zelda' });
      const sources = result.groups[0].observations.map((o) => o.source);
      expect(sources).toContain('wikipedia');
      expect(sources).toContain('steam');
    });

    it('returns separate groups for different games', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [
            createGameCandidate({ source: 'mock', sourceId: '1', title: 'Zelda' }),
            createGameCandidate({ source: 'mock', sourceId: '2', title: 'Mario' }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'nintendo' });
      expect(result.groups).toHaveLength(2);
    });
  });

  describe('source failure handling', () => {
    it('continues when one source fails', async () => {
      registry.register(
        new MockAdapter({
          source: 'failing',
          searchError: new SourceError('failing', 'timeout', 'Timed out'),
        }),
      );
      registry.register(
        new MockAdapter({
          source: 'working',
          searchResults: [
            createGameCandidate({ source: 'working', sourceId: '1', title: 'Zelda' }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'zelda' });
      expect(result.groups).toHaveLength(1);
      expect(result.sourceErrors).toHaveLength(1);
      expect(result.sourceErrors[0].source).toBe('failing');
      expect(result.sourceErrors[0].retryable).toBe(true);
    });

    it('returns errors for all failing sources', async () => {
      registry.register(
        new MockAdapter({
          source: 'failing1',
          searchError: new SourceError('failing1', 'timeout', 'Timed out'),
        }),
      );
      registry.register(
        new MockAdapter({
          source: 'failing2',
          searchError: new SourceError('failing2', 'network_failure', 'Network error'),
        }),
      );

      const result = await engine.discover({ query: 'zelda' });
      expect(result.groups).toEqual([]);
      expect(result.sourceErrors).toHaveLength(2);
    });

    it('handles non-SourceError failures', async () => {
      registry.register(
        new MockAdapter({
          source: 'broken',
          searchError: new Error('unexpected error'),
        }),
      );

      const result = await engine.discover({ query: 'zelda' });
      expect(result.sourceErrors).toHaveLength(1);
      expect(result.sourceErrors[0].errorType).toBe('internal_error');
      expect(result.sourceErrors[0].retryable).toBe(false);
    });
  });

  describe('classification integration', () => {
    it('classifies candidates through deterministic classifier', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [
            createGameCandidate({
              source: 'mock',
              sourceId: '1',
              title: 'Test Game',
              classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'test' });
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].mergedClassification.category).toBeDefined();
    });

    it('classifies DLC candidates correctly', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [
            createGameCandidate({
              source: 'mock',
              sourceId: '1',
              title: 'Test DLC Pack',
              classificationHints: [{ category: 'DLC', confidence: 0.8, evidence: 'type: dlc' }],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'test' });
      expect(result.groups[0].mergedClassification.category).toBe('DLC');
    });
  });

  describe('identity resolution', () => {
    it('groups same game from different sources', async () => {
      registry.register(
        new MockAdapter({
          source: 'wikipedia',
          searchResults: [
            createGameCandidate({
              source: 'wikipedia',
              sourceId: 'w1',
              title: 'The Legend of Zelda',
              externalIdentifiers: [{ source: 'wikipedia', id: 'zelda-article' }],
            }),
          ],
        }),
      );
      registry.register(
        new MockAdapter({
          source: 'steam',
          searchResults: [
            createGameCandidate({
              source: 'steam',
              sourceId: 's1',
              title: 'The Legend of Zelda',
              externalIdentifiers: [{ source: 'steam', id: '12345' }],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'zelda' });
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].observations).toHaveLength(2);
    });

    it('keeps different games separate', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [
            createGameCandidate({
              source: 'mock',
              sourceId: '1',
              title: 'Resident Evil 4',
              externalIdentifiers: [{ source: 'mock', id: 're4-2005' }],
            }),
            createGameCandidate({
              source: 'mock',
              sourceId: '2',
              title: 'Resident Evil 4 Remake',
              externalIdentifiers: [{ source: 'mock', id: 're4-2023' }],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'resident evil' });
      expect(result.groups).toHaveLength(2);
    });
  });

  describe('ranking', () => {
    it('ranks groups deterministically', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [
            createGameCandidate({
              source: 'mock',
              sourceId: '1',
              title: 'Zelda',
              externalIdentifiers: [{ source: 'mock', id: 'zelda-1' }],
              classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'type: game' }],
            }),
            createGameCandidate({
              source: 'mock',
              sourceId: '2',
              title: 'Some Random Game',
              externalIdentifiers: [{ source: 'mock', id: 'random-1' }],
              classificationHints: [{ category: 'GAME', confidence: 0.5, evidence: 'type: game' }],
            }),
          ],
        }),
      );

      const result1 = await engine.discover({ query: 'zelda' });
      const result2 = await engine.discover({ query: 'zelda' });
      expect(result1.groups.map((g) => g.groupId)).toEqual(result2.groups.map((g) => g.groupId));
    });

    it('prioritizes exact title matches', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [
            createGameCandidate({
              source: 'mock',
              sourceId: '1',
              title: 'The Legend of Zelda',
              externalIdentifiers: [{ source: 'mock', id: 'zelda-exact' }],
            }),
            createGameCandidate({
              source: 'mock',
              sourceId: '2',
              title: 'Zelda-like Adventure',
              externalIdentifiers: [{ source: 'mock', id: 'zelda-like' }],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'The Legend of Zelda' });
      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].observations[0].candidate.titles[0].value).toBe(
        'The Legend of Zelda',
      );
    });
  });

  describe('pagination', () => {
    it('respects limit parameter', async () => {
      const candidates: RawCandidate[] = Array.from({ length: 5 }, (_, i) =>
        createGameCandidate({
          source: 'mock',
          sourceId: String(i),
          title: `Game ${i}`,
          externalIdentifiers: [{ source: 'mock', id: `game-${i}` }],
        }),
      );

      registry.register(new MockAdapter({ source: 'mock', searchResults: candidates }));

      const result = await engine.discover({ query: 'game', limit: 2 });
      expect(result.groups).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('respects offset parameter', async () => {
      const candidates: RawCandidate[] = Array.from({ length: 5 }, (_, i) =>
        createGameCandidate({
          source: 'mock',
          sourceId: String(i),
          title: `Game ${i}`,
          externalIdentifiers: [{ source: 'mock', id: `game-${i}` }],
        }),
      );

      registry.register(new MockAdapter({ source: 'mock', searchResults: candidates }));

      const result = await engine.discover({ query: 'game', limit: 2, offset: 2 });
      expect(result.groups).toHaveLength(2);
    });

    it('returns hasMore false when all results fit', async () => {
      registry.register(
        new MockAdapter({
          source: 'mock',
          searchResults: [
            createGameCandidate({ source: 'mock', sourceId: '1', title: 'Only Game' }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'game', limit: 10 });
      expect(result.hasMore).toBe(false);
    });

    it('caps limit at MAX_LIMIT', async () => {
      registry.register(new MockAdapter({ source: 'mock', searchResults: [] }));
      const result = await engine.discover({ query: 'test', limit: 200 });
      expect(result.groups).toEqual([]);
    });
  });

  describe('source filtering', () => {
    it('queries only filtered sources', async () => {
      const wikiAdapter = new MockAdapter({
        source: 'wikipedia',
        searchResults: [
          createGameCandidate({ source: 'wikipedia', sourceId: 'w1', title: 'Zelda' }),
        ],
      });
      const steamAdapter = new MockAdapter({
        source: 'steam',
        searchResults: [createGameCandidate({ source: 'steam', sourceId: 's1', title: 'Zelda' })],
      });

      registry.register(wikiAdapter);
      registry.register(steamAdapter);

      await engine.discover({ query: 'zelda', sourceFilter: ['wikipedia'] });
      expect(wikiAdapter.getSearchCallCount()).toBe(1);
      expect(steamAdapter.getSearchCallCount()).toBe(0);
    });
  });

  describe('platform ontology regression', () => {
    it('does not confuse Steam with PC platform', async () => {
      registry.register(
        new MockAdapter({
          source: 'steam',
          searchResults: [
            createGameCandidate({
              source: 'steam',
              sourceId: '1',
              title: 'Test Game',
              platforms: ['Windows'],
              distributionChannels: ['Steam'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'test' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('Windows');
      expect(platform?.type).toBe('computer');
    });

    it('does not confuse Google Play with Android platform', async () => {
      registry.register(
        new MockAdapter({
          source: 'googleplay',
          searchResults: [
            createGameCandidate({
              source: 'googleplay',
              sourceId: '1',
              title: 'Mobile Game',
              platforms: ['Android'],
              distributionChannels: ['Google Play'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'mobile' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('Android');
      expect(platform?.type).toBe('mobile');
    });

    it('does not confuse MAME with platform', async () => {
      registry.register(
        new MockAdapter({
          source: 'mamesource',
          searchResults: [
            createGameCandidate({
              source: 'mamesource',
              sourceId: '1',
              title: 'Street Fighter II',
              platforms: ['CPS1'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'street fighter' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('CPS1');
      expect(platform?.type).toBe('arcade');
    });

    it('does not confuse RetroArch with platform', async () => {
      registry.register(
        new MockAdapter({
          source: 'retroarch',
          searchResults: [
            createGameCandidate({
              source: 'retroarch',
              sourceId: '1',
              title: 'SNES Game',
              platforms: ['Super Nintendo Entertainment System'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'snes' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('Super Nintendo Entertainment System');
      expect(platform?.family).toBe('Nintendo');
      expect(platform?.type).toBe('console');
    });

    it('does not confuse Unity with platform', async () => {
      registry.register(
        new MockAdapter({
          source: 'indiedb',
          searchResults: [
            createGameCandidate({
              source: 'indiedb',
              sourceId: '1',
              title: 'Indie Game',
              platforms: ['Windows'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'indie' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('Windows');
      expect(platform?.type).toBe('computer');
    });

    it('correctly identifies PICO-8 as fantasy-console', async () => {
      registry.register(
        new MockAdapter({
          source: 'lexaloffle',
          searchResults: [
            createGameCandidate({
              source: 'lexaloffle',
              sourceId: '1',
              title: 'Celeste Classic',
              platforms: ['PICO-8'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'celeste' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('PICO-8');
      expect(platform?.type).toBe('fantasy-console');
    });

    it('correctly identifies CPS2 as arcade', async () => {
      registry.register(
        new MockAdapter({
          source: 'mamesource',
          searchResults: [
            createGameCandidate({
              source: 'mamesource',
              sourceId: '1',
              title: 'Marvel vs Capcom',
              platforms: ['CPS2'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'marvel' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('CPS2');
      expect(platform?.type).toBe('arcade');
    });

    it('correctly identifies Commodore 64 as computer', async () => {
      registry.register(
        new MockAdapter({
          source: 'c64db',
          searchResults: [
            createGameCandidate({
              source: 'c64db',
              sourceId: '1',
              title: 'Impossible Mission',
              platforms: ['Commodore 64'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'impossible' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('Commodore 64');
      expect(platform?.type).toBe('computer');
    });

    it('correctly identifies MS-DOS as computer', async () => {
      registry.register(
        new MockAdapter({
          source: 'gog',
          searchResults: [
            createGameCandidate({
              source: 'gog',
              sourceId: '1',
              title: 'DOOM',
              platforms: ['MS-DOS'],
            }),
          ],
        }),
      );

      const result = await engine.discover({ query: 'doom' });
      const observation = result.groups[0].observations[0];
      const platform = observation.candidate.releases[0]?.platform;
      expect(platform?.name).toBe('MS-DOS');
      expect(platform?.type).toBe('computer');
    });
  });

  describe('determinism guarantees', () => {
    it('produces same result regardless of source execution order', async () => {
      const candidatesA: RawCandidate[] = [
        createGameCandidate({ source: 'a', sourceId: '1', title: 'Game A' }),
        createGameCandidate({ source: 'b', sourceId: '2', title: 'Game B' }),
      ];
      const candidatesB: RawCandidate[] = [
        createGameCandidate({ source: 'b', sourceId: '2', title: 'Game B' }),
        createGameCandidate({ source: 'a', sourceId: '1', title: 'Game A' }),
      ];

      const registry1 = new SourceRegistry();
      registry1.register(new MockAdapter({ source: 'a', searchResults: [candidatesA[0]] }));
      registry1.register(new MockAdapter({ source: 'b', searchResults: [candidatesA[1]] }));

      const registry2 = new SourceRegistry();
      registry2.register(new MockAdapter({ source: 'b', searchResults: [candidatesB[0]] }));
      registry2.register(new MockAdapter({ source: 'a', searchResults: [candidatesB[1]] }));

      const engine1 = new DiscoveryEngine(registry1, classifier, identityResolver);
      const engine2 = new DiscoveryEngine(registry2, classifier, identityResolver);

      const result1 = await engine1.discover({ query: 'game' });
      const result2 = await engine2.discover({ query: 'game' });

      expect(result1.groups).toHaveLength(result2.groups.length);
      expect(result1.groups.map((g) => g.groupId)).toEqual(result2.groups.map((g) => g.groupId));
    });
  });
});
