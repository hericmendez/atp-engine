import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WikipediaAdapter } from '../../../src/sources/wikipedia/wikipedia-adapter.js';
import {
  WIKIPEDIA_SEARCH_RESPONSE,
  WIKIPEDIA_PAGE_RESPONSE,
  WIKIPEDIA_NON_GAME_RESPONSE,
} from '../fixtures/source-fixtures.js';
import { SourceError } from '../../../src/sources/source-errors.js';

function mockFetch(data: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchSequence(responses: unknown[]) {
  const mock = vi.spyOn(globalThis, 'fetch');
  for (const data of responses) {
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  return mock;
}

function titleLookupResponse(title: string) {
  return {
    query: {
      pages: {
        '12345': { title },
      },
    },
  };
}

function mockFetchError(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Error', { status }));
}

describe('WikipediaAdapter', () => {
  let adapter: WikipediaAdapter;

  beforeEach(() => {
    adapter = new WikipediaAdapter({
      source: 'wikipedia',
      baseUrl: 'https://en.wikipedia.org/w/api.php',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('has correct default config', () => {
      expect(adapter.source).toBe('wikipedia');
      expect(adapter.capabilities.search).toBe(true);
      expect(adapter.capabilities.getById).toBe(true);
      expect(adapter.capabilities.searchPagination).toBe('offset');
    });

    it('accepts custom namespace', () => {
      const custom = new WikipediaAdapter({ source: 'wiki', namespace: 1 });
      expect(custom).toBeDefined();
    });
  });

  describe('search', () => {
    it('returns candidates from Wikipedia search results', async () => {
      mockFetch(WIKIPEDIA_SEARCH_RESPONSE);

      const result = await adapter.search('Resident Evil 4');
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].source).toBe('wikipedia');
      expect(result.candidates[0].sourceId).toBe('12345');
      expect(result.candidates[0].title).toBe('Resident Evil 4');
      expect(result.hasMore).toBe(false);
      expect(result.totalEstimate).toBe(2);
    });

    it('strips HTML from snippets', async () => {
      mockFetch(WIKIPEDIA_SEARCH_RESPONSE);

      const result = await adapter.search('Resident Evil 4');
      expect(result.candidates[0].description).not.toContain('<span');
      expect(result.candidates[0].description).toContain('survival horror');
    });

    it('returns empty result when no matches', async () => {
      mockFetch({ query: { search: [], searchinfo: { totalhits: 0 } } });

      const result = await adapter.search('nonexistent game xyz');
      expect(result.candidates).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty result when query has no search key', async () => {
      mockFetch({ query: {} });

      const result = await adapter.search('test');
      expect(result.candidates).toEqual([]);
    });

    it('calculates hasMore based on offset and limit', async () => {
      mockFetch({
        query: {
          search: [{ pageid: 1, title: 'A', snippet: '', wordcount: 10 }],
          searchinfo: { totalhits: 20 },
        },
      });

      const result = await adapter.search('test', { limit: 10, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('sets hasMore false when offset + limit >= totalHits', async () => {
      mockFetch({
        query: {
          search: [{ pageid: 1, title: 'A', snippet: '', wordcount: 10 }],
          searchinfo: { totalhits: 5 },
        },
      });

      const result = await adapter.search('test', { limit: 10, offset: 0 });
      expect(result.hasMore).toBe(false);
    });

    it('sends correct URL parameters', async () => {
      mockFetch(WIKIPEDIA_SEARCH_RESPONSE);

      await adapter.search('test query', { limit: 5, offset: 10 });

      const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(url).toContain('srsearch=test+query');
      expect(url).toContain('srlimit=5');
      expect(url).toContain('sroffset=10');
      expect(url).toContain('action=query');
      expect(url).toContain('list=search');
    });

    it('throws SourceError on HTTP error', async () => {
      mockFetchError(500);

      await expect(adapter.search('test')).rejects.toThrow(SourceError);
    });
  });

  describe('getById', () => {
    it('returns parsed candidate from wikitext', async () => {
      mockFetchSequence([
        titleLookupResponse('Resident Evil 4'),
        WIKIPEDIA_PAGE_RESPONSE,
        { query: { pages: {} } },
      ]);

      const result = await adapter.getById('12345');
      expect(result).not.toBeNull();
      expect(result!.source).toBe('wikipedia');
      expect(result!.sourceId).toBe('12345');
      expect(result!.title).toBe('Resident Evil 4');
      expect(result!.developers).toContain('Capcom Production Studio 4');
      expect(result!.publishers).toContain('Capcom');
      expect(result!.platforms).toContain('PlayStation 2');
      expect(result!.platforms).toContain('Windows');
      expect(result!.genres).toContain('Survival horror');
      expect(result!.releaseDate).toContain('October 25');
    });

    it('extracts classification hints for video games', async () => {
      mockFetchSequence([
        titleLookupResponse('Resident Evil 4'),
        WIKIPEDIA_PAGE_RESPONSE,
        { query: { pages: {} } },
      ]);

      const result = await adapter.getById('12345');
      expect(result!.classificationHints).toBeDefined();
      expect(result!.classificationHints!.length).toBeGreaterThan(0);
      expect(result!.classificationHints![0].category).toBe('GAME');
      expect(result!.classificationHints![0].confidence).toBe(0.7);
    });

    it('returns null for missing pages', async () => {
      mockFetch({ query: { pages: {} } });

      const result = await adapter.getById('99999');
      expect(result).toBeNull();
    });

    it('throws SourceError on Wikipedia API error', async () => {
      mockFetchSequence([
        titleLookupResponse('test'),
        { error: { code: 'internal_api_error', info: 'Some error' } },
      ]);

      await expect(adapter.getById('12345')).rejects.toThrow(SourceError);
    });

    it('returns null when parse response has no parse field', async () => {
      mockFetchSequence([titleLookupResponse('test'), {}]);

      const result = await adapter.getById('12345');
      expect(result).toBeNull();
    });

    it('handles non-game content without error', async () => {
      mockFetchSequence([
        titleLookupResponse('Resident Evil (film)'),
        WIKIPEDIA_NON_GAME_RESPONSE,
        { query: { pages: {} } },
      ]);

      const result = await adapter.getById('99999');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Resident Evil (film)');
      expect(result!.platforms).toEqual([]);
      expect(result!.developers).toEqual([]);
    });

    it('cleans wikitext markup from extracted fields', async () => {
      mockFetchSequence([
        titleLookupResponse('Test'),
        {
          parse: {
            pageid: 1,
            title: 'Test',
            wikitext: {
              '*':
                '{{Infobox game\n' +
                '| title = Custom Title\n' +
                '| developer = Bold Dev\n' +
                '| platform = PS4, Xbox One\n' +
                '}}',
            },
            categories: [],
          },
        },
        { query: { pages: {} } },
      ]);

      const result = await adapter.getById('1');
      expect(result).not.toBeNull();
      expect(result!.alternateTitles).toContain('Custom Title');
      expect(result!.developers).toContain('Bold Dev');
      expect(result!.platforms).toContain('PS4');
      expect(result!.platforms).toContain('Xbox One');
    });

    it('sends correct parse parameters', async () => {
      mockFetchSequence([
        titleLookupResponse('Resident Evil 4'),
        WIKIPEDIA_PAGE_RESPONSE,
        { query: { pages: {} } },
      ]);

      await adapter.getById('12345');

      const calls = vi.mocked(globalThis.fetch).mock.calls;
      expect(calls[0][0]).toContain('action=query');
      expect(calls[0][0]).toContain('pageids=12345');
      expect(calls[1][0]).toContain('action=parse');
      expect(calls[1][0]).toContain('page=Resident+Evil+4');
      expect(calls[1][0]).toContain('prop=wikitext%7Ccategories');
    });

    it('extracts platforms from Unbulleted list template', async () => {
      mockFetchSequence([
        titleLookupResponse('Test Game'),
        {
          parse: {
            pageid: 50000,
            title: 'Test Game',
            wikitext: {
              '*':
                '{{Infobox video game\n' +
                '| title = Test Game\n' +
                '| platforms = {{Unbulleted list|[[PlayStation 4]]|[[PlayStation 5]]|[[Windows]]|[[Xbox One]]}}\n' +
                '| developer = [[Test Dev]]\n' +
                '| publisher = [[Test Pub]]\n' +
                '| genre = [[Action role-playing]]\n' +
                '}}',
            },
            categories: [{ '*': 'Video games' }],
          },
        },
        { query: { pages: {} } },
      ]);

      const result = await adapter.getById('50000');
      expect(result).not.toBeNull();
      expect(result!.platforms).toContain('PlayStation 4');
      expect(result!.platforms).toContain('PlayStation 5');
      expect(result!.platforms).toContain('Windows');
      expect(result!.platforms).toContain('Xbox One');
      expect(result!.platforms).toHaveLength(4);
    });

    it('extracts platforms from collapsible list template', async () => {
      mockFetchSequence([
        titleLookupResponse('Retro Game'),
        {
          parse: {
            pageid: 50001,
            title: 'Retro Game',
            wikitext: {
              '*':
                '{{Infobox video game\n' +
                '| title = Retro Game\n' +
                '| platforms = {{collapsible list|title={{nobold|[[MS-DOS]]}}|[[Windows]]|[[Mac OS]]}}\n' +
                '| developer = [[Retro Dev]]\n' +
                '}}',
            },
            categories: [{ '*': 'Video games' }],
          },
        },
        { query: { pages: {} } },
      ]);

      const result = await adapter.getById('50001');
      expect(result).not.toBeNull();
      expect(result!.platforms).toContain('MS-DOS');
      expect(result!.platforms).toContain('Windows');
      expect(result!.platforms).toContain('Mac OS');
    });

    it('extracts publishers from templates with nested references', async () => {
      mockFetchSequence([
        titleLookupResponse('Published Game'),
        {
          parse: {
            pageid: 50002,
            title: 'Published Game',
            wikitext: {
              '*':
                '{{Infobox video game\n' +
                '| title = Published Game\n' +
                '| publisher = [[Bandai Namco Entertainment]]{{Video game release|JP|FromSoftware}}\n' +
                '| developer = [[FromSoftware]]\n' +
                '}}',
            },
            categories: [],
          },
        },
        { query: { pages: {} } },
      ]);

      const result = await adapter.getById('50002');
      expect(result).not.toBeNull();
      expect(result!.publishers).toContain('Bandai Namco Entertainment');
      expect(result!.developers).toContain('FromSoftware');
    });
  });
});
