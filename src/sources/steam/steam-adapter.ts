import { BaseAdapter, type BaseAdapterConfig } from '../base-adapter.js';
import type { SearchOptions, SearchResult } from '../source-adapter.js';
import type { RawCandidate } from '../raw-candidate.js';
import { logger } from '../../infrastructure/logger/logger.js';

interface SteamAppListResponse {
  applist: {
    apps: Array<{
      appid: number;
      name: string;
    }>;
  };
}

interface SteamAppDetailsResponse {
  [appId: string]: {
    success: boolean;
    data?: {
      type: string;
      name: string;
      developer?: string;
      publisher?: string;
      release_date?: {
        coming_soon: boolean;
        date: string;
      };
      platforms?: {
        windows: boolean;
        mac: boolean;
        linux: boolean;
      };
      categories?: Array<{ id: number; description: string }>;
      genres?: Array<{ id: string; description: string }>;
      short_description?: string;
      header_image?: string;
      capsule_image?: string;
      website?: string;
      recommendations?: { total: number };
    };
  };
}

export type SteamAdapterConfig = BaseAdapterConfig;

const STEAM_SEARCH_CONCURRENCY = 5;

async function parallelMap<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export class SteamAdapter extends BaseAdapter {
  private appListCache: Map<number, string> | null = null;
  private appListCacheExpiry: number | null = null;
  private appListNegativeUntil: number | null = null;
  private appListFetchPromise: Promise<Map<number, string>> | null = null;

  private static readonly APP_LIST_TTL_MS = 60 * 60 * 1000; // 1h successful
  private static readonly APP_LIST_NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1h failure

  constructor(config: SteamAdapterConfig) {
    super(
      {
        ...config,
        baseUrl: config.baseUrl ?? 'https://store.steampowered.com/api',
      },
      {
        search: true,
        getById: true,
        searchCovers: true,
        searchPagination: 'none',
      },
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const limit = options?.limit ?? 10;

    const appList = await this.getAppList();
    const queryLower = query.toLowerCase();

    const matches: Array<{ appid: number; name: string }> = [];
    for (const [appid, name] of appList) {
      if (name.toLowerCase().includes(queryLower)) {
        matches.push({ appid, name });
        if (matches.length >= limit * 2) {
          break;
        }
      }
    }

    const candidates = await parallelMap(
      matches.slice(0, limit),
      (match) => this.getById(String(match.appid)),
      STEAM_SEARCH_CONCURRENCY,
    );

    return {
      candidates: candidates.filter((c): c is RawCandidate => c !== null),
      hasMore: matches.length > limit,
    };
  }

  async getById(id: string): Promise<RawCandidate | null> {
    const appId = parseInt(id, 10);
    if (isNaN(appId)) {
      return null;
    }

    const url = `${this.baseUrl}/appdetails?appids=${appId}`;
    const response = await this.fetchJson<SteamAppDetailsResponse>(url);

    const appData = response[String(appId)];
    if (!appData?.success || !appData.data) {
      return null;
    }

    const data = appData.data;

    if (data.type !== 'game' && data.type !== 'dlc') {
      return null;
    }

    return {
      source: this.source,
      sourceId: String(appId),
      title: data.name,
      platforms: this.extractPlatforms(data.platforms),
      developers: data.developer ? data.developer.split(';').map((d) => d.trim()) : [],
      publishers: data.publisher ? data.publisher.split(';').map((p) => p.trim()) : [],
      genres: data.genres?.map((g) => g.description) ?? [],
      releaseDate: data.release_date?.date ?? null,
      description: data.short_description,
      distributionChannels: ['Steam'],
      launchers: ['Steam Client'],
      externalIdentifiers: [{ source: 'steam', id: String(appId) }],
      coverUrls: [data.header_image, data.capsule_image].filter(Boolean) as string[],
      classificationHints: [
        {
          category: data.type === 'game' ? 'GAME' : 'DLC',
          confidence: 0.9,
          evidence: `Steam type: ${data.type}`,
        },
      ],
      metadata: {
        steamType: data.type,
        categories: data.categories?.map((c) => c.description) ?? [],
        recommendations: data.recommendations?.total,
        website: data.website,
      },
    };
  }

  /** For tests: clear in-memory applist cache. */
  clearAppListCache(): void {
    this.appListCache = null;
    this.appListCacheExpiry = null;
    this.appListNegativeUntil = null;
    this.appListFetchPromise = null;
  }

  private async getAppList(): Promise<Map<number, string>> {
    const now = Date.now();

    // Successful cache hit
    if (this.appListCache && this.appListCacheExpiry && now < this.appListCacheExpiry) {
      return this.appListCache;
    }
    // Legacy non-TTL cache (backwards compat with existing tests that mock)
    if (this.appListCache && this.appListCacheExpiry === null && this.appListNegativeUntil === null) {
      return this.appListCache;
    }
    // Negative cache: recent failure, return empty without network
    if (this.appListNegativeUntil && now < this.appListNegativeUntil) {
      return this.appListCache ?? new Map();
    }
    // Deduplicate concurrent fetches
    if (this.appListFetchPromise) {
      return this.appListFetchPromise;
    }

    const url = 'https://store.steampowered.com/api/applist';
    this.appListFetchPromise = (async () => {
      try {
        const response = await this.fetchJson<SteamAppListResponse>(url);
        // Steam now returns 403 with {"success":false} for this endpoint; treat missing applist as failure
        if (!response?.applist?.apps || !Array.isArray(response.applist.apps)) {
          throw new Error('Steam applist: missing applist.apps in response');
        }
        const map = new Map<number, string>();
        for (const app of response.applist.apps) {
          map.set(app.appid, app.name);
        }
        this.appListCache = map;
        this.appListCacheExpiry = Date.now() + SteamAdapter.APP_LIST_TTL_MS;
        this.appListNegativeUntil = null;
        return map;
      } catch (error) {
        // Controlled failure: cache empty for NEGATIVE_TTL, do not retry per-game
        // This prevents 1 request per game when endpoint is blocked (403) and saves ~200ms/game
        logger.warn('steam.applist.unavailable', {
          error: error instanceof Error ? error.message : String(error),
          ttlMs: SteamAdapter.APP_LIST_NEGATIVE_TTL_MS,
        });
        this.appListCache = new Map();
        this.appListCacheExpiry = Date.now() + SteamAdapter.APP_LIST_NEGATIVE_TTL_MS;
        this.appListNegativeUntil = Date.now() + SteamAdapter.APP_LIST_NEGATIVE_TTL_MS;
        return this.appListCache;
      } finally {
        this.appListFetchPromise = null;
      }
    })();

    return this.appListFetchPromise;
  }

  private extractPlatforms(platforms?: {
    windows?: boolean;
    mac?: boolean;
    linux?: boolean;
  }): string[] {
    if (!platforms) {
      return ['Windows'];
    }

    const result: string[] = [];
    if (platforms.windows) result.push('Windows');
    if (platforms.mac) result.push('macOS');
    if (platforms.linux) result.push('Linux');

    return result.length > 0 ? result : ['Windows'];
  }
}
