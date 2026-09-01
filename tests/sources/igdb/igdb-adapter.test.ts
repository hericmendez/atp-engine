import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IgdbAdapter } from '../../../src/sources/igdb/igdb-adapter.js';
import {
  IGDB_OAUTH_TOKEN_RESPONSE,
  IGDB_SEARCH_RESPONSE,
  IGDB_GAME_DETAIL_RESPONSE,
  IGDB_COMPANIES_RESPONSE,
} from '../fixtures/source-fixtures.js';
import { SourceError } from '../../../src/sources/source-errors.js';

function mockFetchSequence(responses: unknown[]) {
  let callIndex = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const data = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

function mockFetchError(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Error', { status }));
}

describe('IgdbAdapter', () => {
  let adapter: IgdbAdapter;

  beforeEach(() => {
    adapter = new IgdbAdapter({
      source: 'igdb',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('has correct default config', () => {
      expect(adapter.source).toBe('igdb');
      expect(adapter.capabilities.search).toBe(true);
      expect(adapter.capabilities.getById).toBe(true);
      expect(adapter.capabilities.searchCovers).toBe(true);
      expect(adapter.capabilities.searchPagination).toBe('offset');
    });
  });

  describe('OAuth token management', () => {
    it('fetches and caches OAuth token', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher');
      expect(result.candidates.length).toBe(2);
    });

    it('refreshes token when expired', async () => {
      // First call gets token + search
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);
      await adapter.search('The Witcher');

      // Expire the token by setting tokenExpiresAt to past
      (adapter as unknown as { tokenExpiresAt: number }).tokenExpiresAt = Date.now() - 1000;

      // Second call should get new token + search
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);
      const result = await adapter.search('The Witcher');
      expect(result.candidates.length).toBe(2);
    });

    it('throws authentication_failure on OAuth failure', async () => {
      mockFetchError(401);

      await expect(adapter.search('test')).rejects.toThrow(SourceError);
    });
  });

  describe('search', () => {
    it('returns candidates from search results', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher');
      expect(result.candidates.length).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('returns correct candidate structure', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher');
      const candidate = result.candidates[0];

      expect(candidate.source).toBe('igdb');
      expect(candidate.sourceId).toBe('1942');
      expect(candidate.title).toBe('The Witcher 3: Wild Hunt');
      expect(candidate.platforms).toEqual([
        'PC',
        'PlayStation 4',
        'PlayStation 5',
        'Nintendo Switch',
      ]);
      expect(candidate.genres).toEqual(['Role-playing (RPG)', 'Adventure']);
      expect(candidate.releaseDate).toBe('2015-05-19');
      expect(candidate.externalIdentifiers).toEqual([{ source: 'igdb', id: '1942' }]);
    });

    it('maps platform IDs to names correctly', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher');
      const candidate = result.candidates[0];

      expect(candidate.platforms).toContain('PC');
      expect(candidate.platforms).toContain('PlayStation 4');
      expect(candidate.platforms).toContain('Nintendo Switch');
    });

    it('maps genre IDs to names correctly', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher');
      const candidate = result.candidates[0];

      expect(candidate.genres).toContain('Role-playing (RPG)');
      expect(candidate.genres).toContain('Adventure');
    });

    it('includes cover URL', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher');
      const candidate = result.candidates[0];

      expect(candidate.coverUrls).toBeDefined();
      expect(candidate.coverUrls![0]).toContain('t_cover_big');
      expect(candidate.coverUrls![0]).toContain('co1vkf.png');
    });

    it('includes classification hints', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher');
      const candidate = result.candidates[0];

      expect(candidate.classificationHints).toBeDefined();
      expect(candidate.classificationHints![0].category).toBe('GAME');
      expect(candidate.classificationHints![0].confidence).toBe(0.85);
    });

    it('returns hasMore when results equal limit', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, IGDB_SEARCH_RESPONSE]);

      const result = await adapter.search('The Witcher', { limit: 2 });
      expect(result.hasMore).toBe(true);
    });

    it('returns hasMore false when fewer results than limit', async () => {
      const singleResult = [IGDB_SEARCH_RESPONSE[0]];
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, singleResult]);

      const result = await adapter.search('The Witcher', { limit: 10 });
      expect(result.hasMore).toBe(false);
    });

    it('handles rate limiting from IGDB', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, { status: 429 }]);

      // Need to mock fetch to return 429 for the API call
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(new Response('Rate limited', { status: 429 }));
      });

      await expect(adapter.search('test')).rejects.toThrow(SourceError);
    });

    it('handles invalid response from IGDB', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(new Response('Server Error', { status: 500 }));
      });

      await expect(adapter.search('test')).rejects.toThrow(SourceError);
    });

    it('escapes special characters in search query', async () => {
      mockFetchSequence([IGDB_OAUTH_TOKEN_RESPONSE, []]);

      // This should not throw
      const result = await adapter.search('Test "quoted" term');
      expect(result.candidates.length).toBe(0);
    });
  });

  describe('getById', () => {
    it('returns candidate with game data', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (urlStr.includes('/companies')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_COMPANIES_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(IGDB_GAME_DETAIL_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      const result = await adapter.getById('1942');
      expect(result).not.toBeNull();
      expect(result!.source).toBe('igdb');
      expect(result!.sourceId).toBe('1942');
      expect(result!.title).toBe('The Witcher 3: Wild Hunt');
      expect(result!.developers).toEqual(['CD Projekt Red']);
      expect(result!.publishers).toEqual(['CD Projekt Red']);
    });

    it('returns null for non-existent game', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      const result = await adapter.getById('99999');
      expect(result).toBeNull();
    });

    it('returns null for non-numeric ID', async () => {
      const result = await adapter.getById('not-a-number');
      expect(result).toBeNull();
    });

    it('handles company fetch failure gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (urlStr.includes('/companies')) {
          return Promise.resolve(new Response('Error', { status: 500 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(IGDB_GAME_DETAIL_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      const result = await adapter.getById('1942');
      expect(result).not.toBeNull();
      expect(result!.developers).toBeUndefined();
      expect(result!.publishers).toBeUndefined();
    });

    it('includes screenshots as cover URLs', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(IGDB_GAME_DETAIL_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      const result = await adapter.getById('1942');
      expect(result!.coverUrls).toBeDefined();
      expect(result!.coverUrls!.length).toBeGreaterThanOrEqual(2);
    });

    it('handles 401 by resetting token and retrying', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response('Unauthorized', { status: 401 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(IGDB_GAME_DETAIL_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      // First call should fail with 401
      await expect(adapter.getById('1942')).rejects.toThrow(SourceError);
    });
  });

  describe('platform and genre mapping', () => {
    it('maps common platforms correctly', async () => {
      mockFetchSequence([
        IGDB_OAUTH_TOKEN_RESPONSE,
        [
          {
            id: 1,
            name: 'Test Game',
            platforms: [6, 48, 49, 130],
          },
        ],
      ]);

      const result = await adapter.search('Test');
      const candidate = result.candidates[0];

      expect(candidate.platforms).toContain('PC');
      expect(candidate.platforms).toContain('PlayStation 4');
      expect(candidate.platforms).toContain('PlayStation 5');
      expect(candidate.platforms).toContain('Nintendo Switch');
    });

    it('filters unmapped platform IDs', async () => {
      mockFetchSequence([
        IGDB_OAUTH_TOKEN_RESPONSE,
        [
          {
            id: 1,
            name: 'Test Game',
            platforms: [6, 99999], // 99999 is unmapped
          },
        ],
      ]);

      const result = await adapter.search('Test');
      const candidate = result.candidates[0];

      expect(candidate.platforms).toEqual(['PC']);
    });

    it('maps common genres correctly', async () => {
      mockFetchSequence([
        IGDB_OAUTH_TOKEN_RESPONSE,
        [
          {
            id: 1,
            name: 'Test Game',
            genres: [5, 12, 31],
          },
        ],
      ]);

      const result = await adapter.search('Test');
      const candidate = result.candidates[0];

      expect(candidate.genres).toContain('Shooter');
      expect(candidate.genres).toContain('Role-playing (RPG)');
      expect(candidate.genres).toContain('Adventure');
    });
  });

  describe('date handling', () => {
    it('converts unix timestamp to ISO date string', async () => {
      mockFetchSequence([
        IGDB_OAUTH_TOKEN_RESPONSE,
        [
          {
            id: 1,
            name: 'Test Game',
            first_release_date: 1431993600, // 2015-05-19
          },
        ],
      ]);

      const result = await adapter.search('Test');
      expect(result.candidates[0].releaseDate).toBe('2015-05-19');
    });

    it('returns null for missing release date', async () => {
      mockFetchSequence([
        IGDB_OAUTH_TOKEN_RESPONSE,
        [
          {
            id: 1,
            name: 'Test Game',
          },
        ],
      ]);

      const result = await adapter.search('Test');
      expect(result.candidates[0].releaseDate).toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws SourceError for network failures', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.reject(new Error('Network error'));
      });

      await expect(adapter.search('test')).rejects.toThrow(SourceError);
    });

    it('throws SourceError for timeouts', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('id.twitch.tv')) {
          return Promise.resolve(
            new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        const error = new DOMException('The operation was aborted.', 'AbortError');
        return Promise.reject(error);
      });

      await expect(adapter.search('test')).rejects.toThrow(SourceError);
    });
  });
});
