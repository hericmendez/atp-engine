import { describe, it, expect } from 'vitest';
import { CoverEngine } from '../../src/cover/cover-engine.js';
import { CoverSearchType } from '../../src/domain/cover/cover-candidate.js';
import { SourceRegistry } from '../../src/sources/source-registry.js';
import type {
  SourceAdapter,
  SearchOptions,
  SearchResult,
} from '../../src/sources/source-adapter.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import type { SourceCapabilities } from '../../src/sources/source-adapter.js';
import { SourceError } from '../../src/sources/source-errors.js';

class CoverTestAdapter implements SourceAdapter {
  readonly source: string;
  readonly capabilities: SourceCapabilities;
  private readonly results: RawCandidate[];
  private readonly shouldFail: boolean;
  private lastSearchQuery = '';

  constructor(config: {
    source: string;
    results?: RawCandidate[];
    fail?: boolean;
    searchCovers?: boolean;
  }) {
    this.source = config.source;
    this.results = config.results ?? [];
    this.shouldFail = config.fail ?? false;
    this.capabilities = {
      search: true,
      getById: true,
      searchCovers: config.searchCovers ?? true,
      searchPagination: 'none',
    };
  }

  async search(query: string, _options?: SearchOptions): Promise<SearchResult> {
    this.lastSearchQuery = query;
    if (this.shouldFail) {
      throw new SourceError(this.source, 'source_unavailable', `${this.source} adapter failure`);
    }
    return { candidates: this.results, hasMore: false };
  }

  async getById(_id: string): Promise<RawCandidate | null> {
    return null;
  }

  getLastSearchQuery(): string {
    return this.lastSearchQuery;
  }
}

function makeCoverCandidate(
  url: string,
  source: string,
  sourceId: string,
  title?: string,
): RawCandidate {
  return {
    source,
    sourceId,
    title: title ?? 'Test Game',
    coverUrls: [url],
  };
}

function createEngineWithAdapters(adapters: SourceAdapter[]): CoverEngine {
  const registry = new SourceRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  return new CoverEngine({ sourceRegistry: registry });
}

describe('CoverEngine', () => {
  describe('searchCovers (query-based)', () => {
    it('returns null selected when no sources have covers', async () => {
      const adapter = new CoverTestAdapter({ source: 'wikipedia', results: [] });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Doom Eternal');

      expect(result.query).toBe('Doom Eternal');
      expect(result.gameId).toBeNull();
      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(0);
    });

    it('returns selected cover from single source', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.query).toBe('Test Game');
      expect(result.gameId).toBeNull();
      expect(result.selected).not.toBeNull();
      expect(result.selected?.url).toBe('https://example.com/cover.jpg');
      expect(result.selected?.source).toBe('wikipedia');
    });

    it('trims whitespace from query', async () => {
      const adapter = new CoverTestAdapter({ source: 'wikipedia', results: [] });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('  Doom Eternal  ');

      expect(result.query).toBe('Doom Eternal');
    });

    it('forwards query to all cover sources', async () => {
      const adapter1 = new CoverTestAdapter({ source: 'wikipedia', results: [] });
      const adapter2 = new CoverTestAdapter({ source: 'steam', results: [] });
      const engine = createEngineWithAdapters([adapter1, adapter2]);

      await engine.searchCovers('Doom Eternal');

      expect(adapter1.getLastSearchQuery()).toBe('Doom Eternal');
      expect(adapter2.getLastSearchQuery()).toBe('Doom Eternal');
    });

    it('collects candidates from multiple sources', async () => {
      const adapter1 = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/wiki.jpg', 'wikipedia', 'wp-1')],
      });
      const adapter2 = new CoverTestAdapter({
        source: 'steam',
        results: [makeCoverCandidate('https://example.com/steam.jpg', 'steam', 'st-1')],
      });
      const engine = createEngineWithAdapters([adapter1, adapter2]);

      const result = await engine.searchCovers('Doom Eternal', { limit: 5 });

      expect(result.candidates).toHaveLength(2);
    });

    it('filters sources without searchCovers capability', async () => {
      const noCoverAdapter = new CoverTestAdapter({
        source: 'mobygames',
        searchCovers: false,
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'mobygames', 'mg-1')],
      });
      const engine = createEngineWithAdapters([noCoverAdapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.selected).toBeNull();
      expect(result.errors).toHaveLength(0);
    });

    it('deduplicates candidates across sources', async () => {
      const adapter1 = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const adapter2 = new CoverTestAdapter({
        source: 'steam',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'steam', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter1, adapter2]);

      const result = await engine.searchCovers('Test Game');

      expect(result.candidates).toHaveLength(1);
    });

    it('respects sourceFilter option', async () => {
      const adapter1 = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/wiki.jpg', 'wikipedia', 'wp-1')],
      });
      const adapter2 = new CoverTestAdapter({
        source: 'steam',
        results: [makeCoverCandidate('https://example.com/steam.jpg', 'steam', 'st-1')],
      });
      const engine = createEngineWithAdapters([adapter1, adapter2]);

      const result = await engine.searchCovers('Test Game', { sourceFilter: ['wikipedia'] });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].candidate.source).toBe('wikipedia');
    });

    it('returns correct CoverResult structure', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('gameId');
      expect(result).toHaveProperty('selected');
      expect(result).toHaveProperty('candidates');
      expect(result).toHaveProperty('errors');
      expect(result.query).toBe('Test Game');
      expect(result.gameId).toBeNull();

      if (result.selected) {
        expect(result.selected).toHaveProperty('url');
        expect(result.selected).toHaveProperty('source');
        expect(result.selected).toHaveProperty('sourceId');
        expect(result.selected).toHaveProperty('width');
        expect(result.selected).toHaveProperty('height');
        expect(result.selected).toHaveProperty('type');
      }
    });

    it('candidates have ranking with relevanceScore', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].ranking).toHaveProperty('relevanceScore');
      expect(result.candidates[0].ranking).toHaveProperty('totalScore');
    });
  });

  describe('discoverCovers (game-based)', () => {
    it('sets gameId on result', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.discoverCovers('game-1', 'Test Game');

      expect(result.gameId).toBe('game-1');
      expect(result.query).toBe('Test Game');
      expect(result.selected).not.toBeNull();
    });

    it('delegates to searchCovers infrastructure', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.discoverCovers('game-1', 'Test Game');

      expect(result.gameId).toBe('game-1');
      expect(adapter.getLastSearchQuery()).toBe('Test Game');
    });

    it('respects sourceFilter in discoverCovers', async () => {
      const adapter1 = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/wiki.jpg', 'wikipedia', 'wp-1')],
      });
      const adapter2 = new CoverTestAdapter({
        source: 'steam',
        results: [makeCoverCandidate('https://example.com/steam.jpg', 'steam', 'st-1')],
      });
      const engine = createEngineWithAdapters([adapter1, adapter2]);

      const result = await engine.discoverCovers('game-1', 'Test Game', ['wikipedia']);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].candidate.source).toBe('wikipedia');
    });
  });

  describe('failure isolation', () => {
    it('handles source failure gracefully', async () => {
      const goodAdapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const badAdapter = new CoverTestAdapter({ source: 'steam', fail: true });
      const engine = createEngineWithAdapters([goodAdapter, badAdapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.selected).not.toBeNull();
      expect(result.selected?.url).toBe('https://example.com/cover.jpg');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].source).toBe('steam');
    });

    it('collects errors from all failed sources', async () => {
      const badAdapter1 = new CoverTestAdapter({ source: 'wikipedia', fail: true });
      const badAdapter2 = new CoverTestAdapter({ source: 'steam', fail: true });
      const engine = createEngineWithAdapters([badAdapter1, badAdapter2]);

      const result = await engine.searchCovers('Test Game');

      expect(result.selected).toBeNull();
      expect(result.errors).toHaveLength(2);
    });

    it('source without searchCovers does not generate error', async () => {
      const noCoverAdapter = new CoverTestAdapter({
        source: 'mobygames',
        searchCovers: false,
      });
      const engine = createEngineWithAdapters([noCoverAdapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('searchCovers type filtering', () => {
    it('defaults to type=cover and limit=1', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.type).toBe(CoverSearchType.COVER);
      expect(result.limit).toBe(1);
    });

    it('type=cover excludes logo candidates', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/logo.svg', 'wikipedia', 'wp-logo'),
          makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-cover'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', {
        type: CoverSearchType.COVER,
        limit: 5,
      });

      const types = result.candidates.map((c) => c.candidate.type);
      expect(types).not.toContain('logo');
    });

    it('type=logo returns only logo candidates', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/logo.svg', 'wikipedia', 'wp-logo'),
          makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-cover'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', {
        type: CoverSearchType.LOGO,
        limit: 5,
      });

      expect(result.candidates.length).toBeGreaterThan(0);
      for (const c of result.candidates) {
        expect(c.candidate.type).toBe('logo');
      }
    });

    it('type=all returns all candidates including logos', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/logo.svg', 'wikipedia', 'wp-logo'),
          makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-cover'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', {
        type: CoverSearchType.ALL,
        limit: 5,
      });

      const types = result.candidates.map((c) => c.candidate.type);
      expect(types).toContain('logo');
      expect(types).toContain('unknown');
    });

    it('type=cover with only logo candidates returns empty', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/logo.svg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { type: CoverSearchType.COVER });

      expect(result.candidates).toHaveLength(0);
      expect(result.selected).toBeNull();
    });

    it('filtering happens before ranking and selection', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/logo.svg', 'wikipedia', 'wp-logo', 'Test Game'),
          makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-cover', 'Test Game'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const coverResult = await engine.searchCovers('Test Game', {
        type: CoverSearchType.COVER,
        limit: 5,
      });
      const logoResult = await engine.searchCovers('Test Game', {
        type: CoverSearchType.LOGO,
        limit: 5,
      });

      expect(coverResult.candidates.length).toBeGreaterThan(0);
      expect(coverResult.candidates[0].candidate.type).not.toBe('logo');

      expect(logoResult.candidates.length).toBeGreaterThan(0);
      expect(logoResult.candidates[0].candidate.type).toBe('logo');
    });

    it('type parameter is passed through to result', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { type: CoverSearchType.LOGO });

      expect(result.type).toBe(CoverSearchType.LOGO);
    });
  });

  describe('searchCovers limit', () => {
    it('limit=1 returns at most one candidate', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/cover1.jpg', 'wikipedia', 'wp-1'),
          makeCoverCandidate('https://example.com/cover2.jpg', 'wikipedia', 'wp-2'),
          makeCoverCandidate('https://example.com/cover3.jpg', 'wikipedia', 'wp-3'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { limit: 1 });

      expect(result.candidates).toHaveLength(1);
      expect(result.limit).toBe(1);
    });

    it('limit=3 returns at most three candidates', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/cover1.jpg', 'wikipedia', 'wp-1'),
          makeCoverCandidate('https://example.com/cover2.jpg', 'wikipedia', 'wp-2'),
          makeCoverCandidate('https://example.com/cover3.jpg', 'wikipedia', 'wp-3'),
          makeCoverCandidate('https://example.com/cover4.jpg', 'wikipedia', 'wp-4'),
          makeCoverCandidate('https://example.com/cover5.jpg', 'wikipedia', 'wp-5'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { limit: 3 });

      expect(result.candidates).toHaveLength(3);
      expect(result.limit).toBe(3);
    });

    it('limit=9 returns at most nine candidates', async () => {
      const candidates = Array.from({ length: 12 }, (_, i) =>
        makeCoverCandidate(`https://example.com/cover${i}.jpg`, 'wikipedia', `wp-${i}`),
      );
      const adapter = new CoverTestAdapter({ source: 'wikipedia', results: candidates });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { limit: 9 });

      expect(result.candidates).toHaveLength(9);
      expect(result.limit).toBe(9);
    });

    it('limit is applied AFTER ranking', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/cover1.jpg', 'wikipedia', 'wp-1', 'Test Game'),
          makeCoverCandidate('https://example.com/cover2.jpg', 'wikipedia', 'wp-2', 'Test Game'),
          makeCoverCandidate('https://example.com/cover3.jpg', 'wikipedia', 'wp-3', 'Test Game'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { limit: 2 });

      expect(result.candidates).toHaveLength(2);
      const scores = result.candidates.map((c) => c.ranking.totalScore);
      expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    });

    it('selected equals the first ranked candidate', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/cover1.jpg', 'wikipedia', 'wp-1', 'Test Game'),
          makeCoverCandidate('https://example.com/cover2.jpg', 'wikipedia', 'wp-2', 'Test Game'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { limit: 2 });

      if (result.selected && result.candidates.length > 0) {
        expect(result.selected.url).toBe(result.candidates[0].candidate.url);
      }
    });

    it('fewer candidates than limit returns all available', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover1.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', { limit: 5 });

      expect(result.candidates).toHaveLength(1);
    });

    it('limit with type filtering returns intersection', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [
          makeCoverCandidate('https://example.com/logo.svg', 'wikipedia', 'wp-logo'),
          makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-cover'),
        ],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', {
        type: CoverSearchType.COVER,
        limit: 1,
      });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].candidate.type).not.toBe('logo');
    });
  });

  describe('searchCovers result structure', () => {
    it('includes type and limit in result', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game', {
        type: CoverSearchType.LOGO,
        limit: 3,
      });

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('limit');
      expect(result.type).toBe(CoverSearchType.LOGO);
      expect(result.limit).toBe(3);
    });

    it('gameId remains null for query-based search', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.gameId).toBeNull();
    });
  });

  describe('discoverCovers', () => {
    it('sets gameId on result', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.discoverCovers('game-1', 'Test Game');

      expect(result.gameId).toBe('game-1');
      expect(result.query).toBe('Test Game');
      expect(result.type).toBe(CoverSearchType.COVER);
      expect(result.limit).toBe(1);
    });

    it('delegates to searchCovers infrastructure', async () => {
      const adapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const engine = createEngineWithAdapters([adapter]);

      const result = await engine.discoverCovers('game-1', 'Test Game');

      expect(result.gameId).toBe('game-1');
      expect(adapter.getLastSearchQuery()).toBe('Test Game');
    });

    it('respects sourceFilter in discoverCovers', async () => {
      const adapter1 = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/wiki.jpg', 'wikipedia', 'wp-1')],
      });
      const adapter2 = new CoverTestAdapter({
        source: 'steam',
        results: [makeCoverCandidate('https://example.com/steam.jpg', 'steam', 'st-1')],
      });
      const engine = createEngineWithAdapters([adapter1, adapter2]);

      const result = await engine.discoverCovers('game-1', 'Test Game', ['wikipedia']);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].candidate.source).toBe('wikipedia');
    });
  });

  describe('failure isolation', () => {
    it('handles source failure gracefully', async () => {
      const goodAdapter = new CoverTestAdapter({
        source: 'wikipedia',
        results: [makeCoverCandidate('https://example.com/cover.jpg', 'wikipedia', 'wp-1')],
      });
      const badAdapter = new CoverTestAdapter({ source: 'steam', fail: true });
      const engine = createEngineWithAdapters([goodAdapter, badAdapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.selected).not.toBeNull();
      expect(result.selected?.url).toBe('https://example.com/cover.jpg');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].source).toBe('steam');
    });

    it('collects errors from all failed sources', async () => {
      const badAdapter1 = new CoverTestAdapter({ source: 'wikipedia', fail: true });
      const badAdapter2 = new CoverTestAdapter({ source: 'steam', fail: true });
      const engine = createEngineWithAdapters([badAdapter1, badAdapter2]);

      const result = await engine.searchCovers('Test Game');

      expect(result.selected).toBeNull();
      expect(result.errors).toHaveLength(2);
    });

    it('source without searchCovers does not generate error', async () => {
      const noCoverAdapter = new CoverTestAdapter({
        source: 'mobygames',
        searchCovers: false,
      });
      const engine = createEngineWithAdapters([noCoverAdapter]);

      const result = await engine.searchCovers('Test Game');

      expect(result.errors).toHaveLength(0);
    });
  });
});
