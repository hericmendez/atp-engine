import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WikipediaCoverDiscovery } from '../../../../src/sources/wikipedia/cover/wikipedia-cover-discovery.js';

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

function mockFetchError(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Error', { status }));
}

const WIKIPEDIA_SEARCH_RESPONSE = {
  query: {
    search: [
      {
        pageid: 12345,
        title: 'The Legend of Zelda',
        snippet: 'The Legend of Zelda is a video game...',
        wordcount: 5000,
      },
      {
        pageid: 12346,
        title: 'The Legend of Zelda: Breath of the Wild',
        snippet: 'The Legend of Zelda: Breath of the Wild is a video game...',
        wordcount: 4500,
      },
    ],
    searchinfo: { totalhits: 2 },
  },
};

const WIKIPEDIA_GAME_PAGE_RESPONSE = {
  parse: {
    pageid: 12345,
    title: 'The Legend of Zelda',
    wikitext: {
      '*':
        '{{Infobox video game\n' +
        '| title = The Legend of Zelda\n' +
        '| developer = Nintendo\n' +
        '| publisher = Nintendo\n' +
        '| platform = NES\n' +
        '| genre = Action-adventure\n' +
        '| release date = February 21, 1986\n' +
        '}}\n\n' +
        'The Legend of Zelda is a video game developed by Nintendo.',
    },
    categories: [{ '*': 'Video games' }, { '*': 'Nintendo games' }],
  },
};

const WIKIPEDIA_PERSON_PAGE_RESPONSE = {
  parse: {
    pageid: 99999,
    title: 'Zelda Fitzgerald',
    wikitext: {
      '*':
        '{{Infobox person\n' +
        '| name = Zelda Fitzgerald\n' +
        '| birth_date = July 24, 1900\n' +
        '}}\n\n' +
        'Zelda Fitzgerald was an American socialite.',
    },
    categories: [{ '*': 'American writers' }],
  },
};

const WIKIPEDIA_PAGE_IMAGES_RESPONSE = {
  query: {
    pages: {
      '12345': {
        thumbnail: { source: 'https://example.com/thumb.jpg' },
        original: { source: 'https://example.com/original.jpg' },
      },
    },
  },
};

describe('WikipediaCoverDiscovery', () => {
  let discovery: WikipediaCoverDiscovery;

  beforeEach(() => {
    discovery = new WikipediaCoverDiscovery({
      baseUrl: 'https://en.wikipedia.org/w/api.php',
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverCovers', () => {
    it('returns candidates for valid game queries', async () => {
      mockFetchSequence([
        WIKIPEDIA_SEARCH_RESPONSE,
        { query: { pages: { '12345': { title: 'The Legend of Zelda' } } } },
        WIKIPEDIA_GAME_PAGE_RESPONSE,
        WIKIPEDIA_PAGE_IMAGES_RESPONSE,
      ]);

      const result = await discovery.discoverCovers('The Legend of Zelda');

      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].title).toBe('The Legend of Zelda');
      expect(result.candidates[0].imageUrl).toBeDefined();
      expect(result.candidates[0].validationSignals.isVideoGame).toBe(true);
    });

    it('expands query with video game suffix', async () => {
      const searchMock = mockFetchSequence([
        WIKIPEDIA_SEARCH_RESPONSE,
        { query: { pages: { '12345': { title: 'The Legend of Zelda' } } } },
        WIKIPEDIA_GAME_PAGE_RESPONSE,
        WIKIPEDIA_PAGE_IMAGES_RESPONSE,
      ]);

      await discovery.discoverCovers('The Legend of Zelda');

      const firstCallUrl = searchMock.mock.calls[0][0] as string;
      expect(firstCallUrl).toContain('srsearch=The+Legend+of+Zelda+video+game');
    });

    it('filters out blacklisted titles', async () => {
      const blacklistedResponse = {
        query: {
          search: [
            {
              pageid: 11111,
              title: 'Zelda Soundtrack',
              snippet: 'Zelda Soundtrack album...',
              wordcount: 1000,
            },
          ],
          searchinfo: { totalhits: 1 },
        },
      };

      mockFetch(blacklistedResponse);

      const result = await discovery.discoverCovers('Zelda');

      expect(result.candidates.length).toBe(0);
    });

    it('filters out non-game pages', async () => {
      mockFetchSequence([
        {
          query: {
            search: [
              {
                pageid: 99999,
                title: 'Zelda Fitzgerald',
                snippet: 'Zelda Fitzgerald was an American...',
                wordcount: 3000,
              },
            ],
            searchinfo: { totalhits: 1 },
          },
        },
        { query: { pages: { '99999': { title: 'Zelda Fitzgerald' } } } },
        WIKIPEDIA_PERSON_PAGE_RESPONSE,
      ]);

      const result = await discovery.discoverCovers('Zelda');

      expect(result.candidates.length).toBe(0);
    });

    it('handles Wikipedia API errors gracefully', async () => {
      mockFetchError(500);

      const result = await discovery.discoverCovers('Test Game');

      expect(result.candidates.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('limits number of candidates', async () => {
      const manyResults = {
        query: {
          search: Array.from({ length: 20 }, (_, i) => ({
            pageid: i,
            title: `Game ${i} (video game)`,
            snippet: `Game ${i} is a video game...`,
            wordcount: 1000,
          })),
          searchinfo: { totalhits: 20 },
        },
      };

      mockFetch(manyResults);

      const result = await discovery.discoverCovers('Game');

      expect(result.candidates.length).toBeLessThanOrEqual(5);
    });
  });
});
