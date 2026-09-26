import type { PlatformCatalogEntry } from '../domain/platform/platform-catalog.js';
import type { IgdbAdapter } from '../sources/igdb/igdb-adapter.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface PlatformEnrichmentResult {
  readonly logo: string | null;
  readonly image: string | null;
  readonly logoSource: 'igdb' | null;
  readonly imageSource: 'wikipedia' | null;
  readonly status: 'FOUND_COMPLETE' | 'FOUND_PARTIAL' | 'NOT_FOUND';
}

export interface PlatformEnrichmentServiceDependencies {
  readonly igdbAdapter?: IgdbAdapter;
  readonly wikipediaFetcher?: (title: string) => Promise<string | null>;
}

const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload';

function normalizePlatformName(name: string): string {
  return name.trim();
}

function isConservativeMatch(platformName: string, resultName: string): boolean {
  const a = platformName.toLowerCase().trim();
  const b = resultName.toLowerCase().trim();
  if (a === b) return true;
  // Allow exact with parenthetical? e.g. "PlayStation 5" vs "PlayStation 5 Digital Edition" -> not conservative
  // Only allow if resultName is exactly platformName or platformName + variant that is clearly not a game
  // For platform, we require exact case-insensitive match
  return false;
}

export class PlatformEnrichmentService {
  private readonly wikipediaFetcher: (title: string) => Promise<string | null>;

  constructor(private readonly deps: PlatformEnrichmentServiceDependencies) {
    this.wikipediaFetcher = deps.wikipediaFetcher ?? this.defaultWikipediaFetcher.bind(this);
  }

  async enrich(platform: PlatformCatalogEntry): Promise<PlatformEnrichmentResult> {
    const hasLogo = !!platform.thumb?.logo;
    const hasImage = !!platform.thumb?.image;
    if (hasLogo && hasImage) {
      return { logo: null, image: null, logoSource: null, imageSource: null, status: 'FOUND_COMPLETE' };
    }

    const name = normalizePlatformName(platform.name);
    if (!name) return { logo: null, image: null, logoSource: null, imageSource: null, status: 'NOT_FOUND' };

    let logo: string | null = null;
    let image: string | null = null;

    // Logo via IGDB if missing
    if (!hasLogo && this.deps.igdbAdapter) {
      try {
        const url = await this.fetchIgdbLogo(name);
        if (url) logo = this.normalizeWikipediaUrl(url) ?? url;
      } catch (err) {
        logger.warn('platform.enrich.igdb.failed', { platform: platform.name, error: String(err) });
      }
    }

    // Image via Wikipedia if missing
    if (!hasImage) {
      try {
        const url = await this.wikipediaFetcher(name);
        if (url) image = this.normalizeWikipediaUrl(url) ?? url;
      } catch (err) {
        logger.warn('platform.enrich.wikipedia.failed', { platform: platform.name, error: String(err) });
      }
    }

    if (!logo && !image) {
      // No new data, check if already had one
      if (hasLogo || hasImage) return { logo: null, image: null, logoSource: null, imageSource: null, status: 'FOUND_PARTIAL' };
      return { logo: null, image: null, logoSource: null, imageSource: null, status: 'NOT_FOUND' };
    }

    if (logo && image) return { logo, image, logoSource: 'igdb', imageSource: 'wikipedia', status: 'FOUND_COMPLETE' };
    if (logo) return { logo, image: null, logoSource: 'igdb', imageSource: null, status: 'FOUND_PARTIAL' };
    return { logo: null, image, logoSource: null, imageSource: 'wikipedia', status: 'FOUND_PARTIAL' };
  }

  private normalizeWikipediaUrl(url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      // Remove utm_* tracking params
      for (const key of [...u.searchParams.keys()]) {
        if (key.startsWith('utm_')) u.searchParams.delete(key);
      }
      // Rebuild without empty search
      const search = u.searchParams.toString();
      return `${u.origin}${u.pathname}${search ? `?${search}` : ''}${u.hash}`;
    } catch {
      return url;
    }
  }

  private async defaultWikipediaFetcher(title: string): Promise<string | null> {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ATP-Engine/0.1.0 (platform-enrichment)' } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }> };
    };
    const pages = data.query?.pages;
    if (!pages) return null;
    for (const page of Object.values(pages)) {
      if (!page.title) continue;
      if (!isConservativeMatch(title, page.title)) continue;
      if (page.thumbnail?.source) return page.thumbnail.source;
    }
    return null;
  }

  private async fetchIgdbLogo(platformName: string): Promise<string | null> {
    const adapter = this.deps.igdbAdapter;
    if (!adapter) return null;
    const anyAdapter = adapter as unknown as { postApi?: (endpoint: string, body: string, token: string) => Promise<unknown>; getAccessToken?: () => Promise<string> };
    if (typeof anyAdapter.postApi !== 'function' || typeof anyAdapter.getAccessToken !== 'function') {
      return null;
    }
    try {
      const token = await anyAdapter.getAccessToken();
      const body = `where name = "${platformName.replace(/"/g, '\\"')}"; fields name,slug,platform_logo; limit 1;`;
      const data = (await anyAdapter.postApi('/platforms', body, token)) as Array<{ id: number; name: string; slug?: string; platform_logo?: number }>;
      if (!data || data.length === 0) return null;
      const candidate = data[0];
      if (!isConservativeMatch(platformName, candidate.name)) return null;
      if (!candidate.platform_logo) return null;
      const logoBody = `where id = ${candidate.platform_logo}; fields image_id;`;
      const logos = (await anyAdapter.postApi('/platform_logos', logoBody, token)) as Array<{ image_id?: string }>;
      const imageId = logos?.[0]?.image_id;
      if (!imageId) return null;
      return `${IGDB_IMAGE_BASE}/t_logo_med/${imageId}.png`;
    } catch {
      return null;
    }
  }
}
