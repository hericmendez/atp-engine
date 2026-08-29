import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/sources/source-registry.js';
import { MockAdapter } from './fixtures/mock-adapter.js';
import { SourceError } from '../../src/sources/source-errors.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';

const wikipediaCandidate: RawCandidate = {
  source: 'wikipedia',
  sourceId: '12345',
  title: 'Resident Evil 4',
  platforms: ['PlayStation 2', 'Windows', 'Wii'],
  developers: ['Capcom'],
  publishers: ['Capcom'],
  genres: ['Survival horror'],
  releaseDate: 'October 25, 2005',
  classificationHints: [
    { category: 'GAME', confidence: 0.7, evidence: 'Wikitext contains "video game"' },
  ],
};

const steamCandidate: RawCandidate = {
  source: 'steam',
  sourceId: '254700',
  title: 'Resident Evil 4',
  platforms: ['Windows'],
  developers: ['Capcom'],
  publishers: ['Capcom'],
  genres: ['Action', 'Adventure'],
  releaseDate: 'Oct 25, 2005',
  distributionChannels: ['Steam'],
  launchers: ['Steam Client'],
  externalIdentifiers: [{ source: 'steam', id: '254700' }],
  classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
};

describe('Multi-source orchestration', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  describe('source registry with multiple adapters', () => {
    it('can register and query multiple sources', () => {
      registry.register(
        new MockAdapter({ source: 'wikipedia', searchResults: [wikipediaCandidate] }),
      );
      registry.register(new MockAdapter({ source: 'steam', searchResults: [steamCandidate] }));

      expect(registry.getSources()).toContain('wikipedia');
      expect(registry.getSources()).toContain('steam');
      expect(registry.getAll()).toHaveLength(2);
    });

    it('searches across sources independently', async () => {
      registry.register(
        new MockAdapter({ source: 'wikipedia', searchResults: [wikipediaCandidate] }),
      );
      registry.register(new MockAdapter({ source: 'steam', searchResults: [steamCandidate] }));

      const wikipedia = registry.get('wikipedia')!;
      const steam = registry.get('steam')!;

      const wikiResults = await wikipedia.search('Resident Evil 4');
      const steamResults = await steam.search('Resident Evil 4');

      expect(wikiResults.candidates[0].source).toBe('wikipedia');
      expect(steamResults.candidates[0].source).toBe('steam');
    });

    it('collects candidates from all sources', async () => {
      registry.register(
        new MockAdapter({ source: 'wikipedia', searchResults: [wikipediaCandidate] }),
      );
      registry.register(new MockAdapter({ source: 'steam', searchResults: [steamCandidate] }));

      const allCandidates: RawCandidate[] = [];
      for (const adapter of registry.getAll()) {
        const result = await adapter.search('Resident Evil 4');
        allCandidates.push(...result.candidates);
      }

      expect(allCandidates).toHaveLength(2);
      expect(allCandidates.map((c) => c.source).sort()).toEqual(['steam', 'wikipedia']);
    });
  });

  describe('cross-source evidence', () => {
    it('same game from different sources has different source fields', () => {
      expect(wikipediaCandidate.source).not.toBe(steamCandidate.source);
      expect(wikipediaCandidate.sourceId).not.toBe(steamCandidate.sourceId);
    });

    it('same game shares canonical title across sources', () => {
      expect(wikipediaCandidate.title).toBe(steamCandidate.title);
    });

    it('same game shares developers across sources', () => {
      expect(wikipediaCandidate.developers).toEqual(steamCandidate.developers);
    });

    it('different sources provide complementary data', () => {
      // Wikipedia has more platforms
      expect(wikipediaCandidate.platforms!.length).toBeGreaterThan(
        steamCandidate.platforms!.length,
      );
      // Steam has distribution channels
      expect(steamCandidate.distributionChannels).toBeDefined();
      expect(wikipediaCandidate.distributionChannels).toBeUndefined();
    });

    it('classification hints from multiple sources can be combined', () => {
      const allHints = [
        ...(wikipediaCandidate.classificationHints ?? []),
        ...(steamCandidate.classificationHints ?? []),
      ];
      expect(allHints).toHaveLength(2);
      expect(allHints.every((h) => h.category === 'GAME')).toBe(true);
    });
  });

  describe('error isolation', () => {
    it('one source failing does not affect others', async () => {
      registry.register(
        new MockAdapter({
          source: 'wikipedia',
          searchError: new SourceError('wikipedia', 'timeout', 'Timed out'),
        }),
      );
      registry.register(new MockAdapter({ source: 'steam', searchResults: [steamCandidate] }));

      const wikipedia = registry.get('wikipedia')!;
      const steam = registry.get('steam')!;

      await expect(wikipedia.search('test')).rejects.toThrow(SourceError);
      const steamResult = await steam.search('Resident Evil 4');
      expect(steamResult.candidates).toHaveLength(1);
    });

    it('unregistering a source does not affect others', async () => {
      registry.register(
        new MockAdapter({ source: 'wikipedia', searchResults: [wikipediaCandidate] }),
      );
      registry.register(new MockAdapter({ source: 'steam', searchResults: [steamCandidate] }));

      registry.unregister('wikipedia');

      expect(registry.has('wikipedia')).toBe(false);
      expect(registry.has('steam')).toBe(true);

      const steam = registry.get('steam')!;
      const result = await steam.search('test');
      expect(result.candidates).toHaveLength(1);
    });
  });

  describe('source capabilities', () => {
    it('adapters declare their capabilities', () => {
      const adapter = new MockAdapter({ source: 'mock' });
      expect(adapter.capabilities.search).toBe(true);
      expect(adapter.capabilities.getById).toBe(true);
      expect(adapter.capabilities.searchPagination).toBe('none');
    });

    it('registry can filter by capabilities', () => {
      registry.register(new MockAdapter({ source: 'wikipedia' }));
      registry.register(new MockAdapter({ source: 'steam' }));

      const searchable = registry
        .getAll()
        .filter((a) => a.capabilities.search)
        .map((a) => a.source);

      expect(searchable).toEqual(['wikipedia', 'steam']);
    });
  });
});
