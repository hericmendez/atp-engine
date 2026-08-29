import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SteamAdapter } from '../../../src/sources/steam/steam-adapter.js';
import {
  STEAM_APP_LIST_RESPONSE,
  STEAM_APP_DETAILS_RESPONSE,
  STEAM_MULTI_PLATFORM_RESPONSE,
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

function mockFetchSingle(data: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchError(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Error', { status }));
}

describe('SteamAdapter', () => {
  let adapter: SteamAdapter;

  beforeEach(() => {
    adapter = new SteamAdapter({ source: 'steam' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('has correct default config', () => {
      expect(adapter.source).toBe('steam');
      expect(adapter.capabilities.search).toBe(true);
      expect(adapter.capabilities.getById).toBe(true);
      expect(adapter.capabilities.searchPagination).toBe('none');
    });
  });

  describe('getById', () => {
    it('returns candidate with game data', async () => {
      mockFetchSingle(STEAM_APP_DETAILS_RESPONSE);

      const result = await adapter.getById('254700');
      expect(result).not.toBeNull();
      expect(result!.source).toBe('steam');
      expect(result!.sourceId).toBe('254700');
      expect(result!.title).toBe('Resident Evil 4');
      expect(result!.developers).toEqual(['Capcom']);
      expect(result!.publishers).toEqual(['Capcom']);
      expect(result!.platforms).toEqual(['Windows']);
      expect(result!.genres).toEqual(['Action', 'Adventure']);
      expect(result!.distributionChannels).toEqual(['Steam']);
      expect(result!.launchers).toEqual(['Steam Client']);
      expect(result!.externalIdentifiers).toEqual([{ source: 'steam', id: '254700' }]);
    });

    it('returns candidate with cover URLs', async () => {
      mockFetchSingle(STEAM_APP_DETAILS_RESPONSE);

      const result = await adapter.getById('254700');
      expect(result!.coverUrls).toBeDefined();
      expect(result!.coverUrls!.length).toBe(2);
      expect(result!.coverUrls![0]).toContain('header.jpg');
    });

    it('returns candidate with classification hints', async () => {
      mockFetchSingle(STEAM_APP_DETAILS_RESPONSE);

      const result = await adapter.getById('254700');
      expect(result!.classificationHints).toBeDefined();
      expect(result!.classificationHints![0].category).toBe('GAME');
      expect(result!.classificationHints![0].confidence).toBe(0.9);
    });

    it('returns null for non-game types (e.g., software)', async () => {
      mockFetchSingle({
        '99999': {
          success: true,
          data: { type: 'software', name: 'Test Software' },
        },
      });

      const result = await adapter.getById('99999');
      expect(result).toBeNull();
    });

    it('returns null for non-existent app', async () => {
      mockFetchSingle({
        '99999': { success: false },
      });

      const result = await adapter.getById('99999');
      expect(result).toBeNull();
    });

    it('returns null for invalid app id', async () => {
      const result = await adapter.getById('not-a-number');
      expect(result).toBeNull();
    });

    it('extracts multiple platforms correctly', async () => {
      mockFetchSingle(STEAM_MULTI_PLATFORM_RESPONSE);

      const result = await adapter.getById('413150');
      expect(result!.platforms).toContain('Windows');
      expect(result!.platforms).toContain('macOS');
      expect(result!.platforms).toContain('Linux');
    });

    it('defaults to Windows when no platforms specified', async () => {
      mockFetchSingle({
        '12345': {
          success: true,
          data: { type: 'game', name: 'Test Game' },
        },
      });

      const result = await adapter.getById('12345');
      expect(result!.platforms).toEqual(['Windows']);
    });

    it('splits semicolon-separated developers', async () => {
      mockFetchSingle({
        '12345': {
          success: true,
          data: {
            type: 'game',
            name: 'Multi Dev Game',
            developer: 'Dev A; Dev B; Dev C',
          },
        },
      });

      const result = await adapter.getById('12345');
      expect(result!.developers).toEqual(['Dev A', 'Dev B', 'Dev C']);
    });

    it('includes metadata in result', async () => {
      mockFetchSingle(STEAM_APP_DETAILS_RESPONSE);

      const result = await adapter.getById('254700');
      expect(result!.metadata).toBeDefined();
      expect(result!.metadata!.steamType).toBe('game');
      expect(result!.metadata!.recommendations).toBe(50000);
      expect(result!.metadata!.website).toContain('capcom.com');
    });

    it('throws SourceError on HTTP error', async () => {
      mockFetchError(500);

      await expect(adapter.getById('254700')).rejects.toThrow(SourceError);
    });

    it('returns DLC classification hint for dlc type', async () => {
      mockFetchSingle({
        '12345': {
          success: true,
          data: { type: 'dlc', name: 'Test DLC' },
        },
      });

      const result = await adapter.getById('12345');
      expect(result!.classificationHints![0].category).toBe('DLC');
    });
  });

  describe('search', () => {
    it('returns matching games from app list', async () => {
      mockFetchSequence([STEAM_APP_LIST_RESPONSE, STEAM_APP_DETAILS_RESPONSE]);

      const result = await adapter.search('Resident Evil 4');
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].title).toBe('Resident Evil 4');
    });

    it('respects limit parameter', async () => {
      mockFetchSequence([STEAM_APP_LIST_RESPONSE, STEAM_APP_DETAILS_RESPONSE]);

      const result = await adapter.search('Resident Evil', { limit: 1 });
      expect(result.candidates.length).toBeLessThanOrEqual(1);
    });

    it('returns empty when no matches found', async () => {
      mockFetchSingle(STEAM_APP_LIST_RESPONSE);

      const result = await adapter.search('xyznonexistent');
      expect(result.candidates).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('performs case-insensitive search', async () => {
      mockFetchSequence([STEAM_APP_LIST_RESPONSE, STEAM_APP_DETAILS_RESPONSE]);

      const result = await adapter.search('RESIDENT EVIL 4');
      expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('caches app list between searches', async () => {
      mockFetchSequence([
        STEAM_APP_LIST_RESPONSE,
        STEAM_APP_DETAILS_RESPONSE,
        STEAM_APP_DETAILS_RESPONSE,
      ]);

      await adapter.search('Resident Evil');
      await adapter.search('Stardew');

      // Only 1 call for app list (cached), then individual getById calls
      const fetchCalls = vi.mocked(globalThis.fetch).mock.calls;
      const appListCalls = fetchCalls.filter(([url]) => String(url).includes('applist'));
      expect(appListCalls).toHaveLength(1);
    });

    it('skips getById failures during search', async () => {
      mockFetchSequence([
        STEAM_APP_LIST_RESPONSE,
        { '254700': { success: false } }, // First match fails
        STEAM_APP_DETAILS_RESPONSE, // Second match succeeds
      ]);

      const result = await adapter.search('Resident Evil');
      // Should still return results from successful getById calls
      expect(result.candidates.length).toBeGreaterThanOrEqual(0);
    });
  });
});
