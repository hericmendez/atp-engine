import { BaseAdapter, type BaseAdapterConfig } from '../base-adapter.js';
import type { SearchOptions, SearchResult } from '../source-adapter.js';
import type { RawCandidate } from '../raw-candidate.js';

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

export class SteamAdapter extends BaseAdapter {
  private appListCache: Map<number, string> | null = null;

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

    const candidates: RawCandidate[] = [];
    for (const match of matches.slice(0, limit)) {
      const candidate = await this.getById(String(match.appid));
      if (candidate) {
        candidates.push(candidate);
      }
    }

    return {
      candidates,
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

  private async getAppList(): Promise<Map<number, string>> {
    if (this.appListCache) {
      return this.appListCache;
    }

    try {
      const url = 'https://store.steampowered.com/api/applist';
      const response = await this.fetchJson<SteamAppListResponse>(url);

      this.appListCache = new Map();
      for (const app of response.applist.apps) {
        this.appListCache.set(app.appid, app.name);
      }

      return this.appListCache;
    } catch {
      this.appListCache = new Map();
      return this.appListCache;
    }
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
