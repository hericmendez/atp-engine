import { BaseAdapter, type BaseAdapterConfig } from '../base-adapter.js';
import type { SearchOptions, SearchResult } from '../source-adapter.js';
import type { RawCandidate } from '../raw-candidate.js';
import { SourceError } from '../source-errors.js';
import { LruCache } from '../../infrastructure/lru-cache.js';

interface WikipediaSearchResult {
  pageid: number;
  title: string;
  snippet: string;
  wordcount: number;
}

interface WikipediaSearchResponse {
  query?: {
    search?: WikipediaSearchResult[];
    searchinfo?: { totalhits: number };
  };
}

interface WikipediaPageResponse {
  parse?: {
    pageid: number;
    title: string;
    wikitext?: { '*': string };
    categories?: { '*': string }[];
  };
  error?: { code: string; info: string };
}

interface WikipediaPageImagesResponse {
  query?: {
    pages?: Record<
      string,
      {
        thumbnail?: { source: string };
        original?: { source: string };
      }
    >;
  };
}

export interface WikipediaAdapterConfig extends BaseAdapterConfig {
  readonly namespace?: number;
}

export class WikipediaAdapter extends BaseAdapter {
  private readonly namespace: number;
  private readonly pageImageCache: LruCache<string, string>;

  constructor(config: WikipediaAdapterConfig) {
    super(
      {
        ...config,
        baseUrl: config.baseUrl ?? 'https://en.wikipedia.org/w/api.php',
      },
      {
        search: true,
        getById: true,
        searchCovers: true,
        searchPagination: 'offset',
      },
    );
    this.namespace = config.namespace ?? 0;
    this.pageImageCache = new LruCache({ maxSize: 500, ttlMs: 5 * 60 * 1000 });
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(limit),
      sroffset: String(offset),
      format: 'json',
      origin: '*',
    });

    if (this.namespace !== 0) {
      params.set('srnamespace', String(this.namespace));
    }

    const url = `${this.baseUrl}?${params.toString()}`;
    const response = await this.fetchJson<WikipediaSearchResponse>(url);

    if (!response.query?.search) {
      return { candidates: [], hasMore: false };
    }

    const searchResults = response.query.search;
    const pageIds = searchResults.map((r) => String(r.pageid));
    const coverUrlsByPageId = await this.fetchPageImagesByPageIds(pageIds);

    const candidates = searchResults.map((result) =>
      this.searchResultToCandidate(result, coverUrlsByPageId.get(String(result.pageid)) ?? []),
    );

    const totalHits = response.query.searchinfo?.totalhits ?? 0;
    const hasMore = offset + limit < totalHits;

    return {
      candidates,
      totalEstimate: totalHits,
      hasMore,
    };
  }

  async getById(id: string): Promise<RawCandidate | null> {
    const params = new URLSearchParams({
      action: 'parse',
      page: id,
      prop: 'wikitext|categories',
      format: 'json',
      origin: '*',
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const response = await this.fetchJson<WikipediaPageResponse>(url);

      if (response.error) {
        if (response.error.code === 'missingtitle') {
          return null;
        }
        throw new SourceError(
          this.source,
          'parse_failure',
          `Wikipedia error: ${response.error.info}`,
        );
      }

      if (!response.parse) {
        return null;
      }

      const candidate = this.parseResponseToCandidate(response.parse);
      const coverUrls = await this.fetchPageImages(response.parse.title);
      return { ...candidate, coverUrls };
    } catch (error) {
      if (error instanceof SourceError) {
        throw error;
      }
      throw error;
    }
  }

  private searchResultToCandidate(
    result: WikipediaSearchResult,
    coverUrls: string[],
  ): RawCandidate {
    const description = this.stripHtml(result.snippet);
    const classificationHints = this.extractClassificationFromText(description);

    return {
      source: this.source,
      sourceId: String(result.pageid),
      title: result.title,
      description,
      coverUrls,
      classificationHints,
      metadata: {
        wordcount: result.wordcount,
      },
    };
  }

  private extractClassificationFromText(
    text: string,
  ): { readonly category: string; readonly confidence: number; readonly evidence: string }[] {
    const hints: { category: string; confidence: number; evidence: string }[] = [];
    const lower = text.toLowerCase();

    if (
      lower.includes('video game') ||
      lower.includes('action-adventure') ||
      lower.includes('role-playing game') ||
      lower.includes('platform game') ||
      lower.includes('first-person shooter') ||
      lower.includes('battle royale')
    ) {
      hints.push({
        category: 'GAME',
        confidence: 0.7,
        evidence: 'Snippet contains game genre term',
      });
    }
    if (lower.includes('film') || lower.includes('movie') || lower.includes('cinema')) {
      hints.push({ category: 'FILM', confidence: 0.6, evidence: 'Snippet contains film term' });
    }
    if (lower.includes('television') || lower.includes('tv series') || lower.includes('tv show')) {
      hints.push({
        category: 'TV_SERIES',
        confidence: 0.6,
        evidence: 'Snippet contains television term',
      });
    }
    if (lower.includes('album') || lower.includes('soundtrack') || lower.includes('song')) {
      hints.push({
        category: 'SOUNDTRACK',
        confidence: 0.5,
        evidence: 'Snippet contains music term',
      });
    }
    if (lower.includes('book') || lower.includes('novel') || lower.includes('manga')) {
      hints.push({ category: 'BOOK', confidence: 0.5, evidence: 'Snippet contains book term' });
    }

    return hints;
  }

  private parseResponseToCandidate(parse: WikipediaPageResponse['parse']): RawCandidate {
    const wikitext = parse?.wikitext?.['*'] ?? '';
    const extracted = this.extractFromWikitext(wikitext);

    return {
      source: this.source,
      sourceId: String(parse?.pageid ?? ''),
      title: parse?.title,
      alternateTitles: extracted.alternateTitles,
      platforms: extracted.platforms,
      developers: extracted.developers,
      publishers: extracted.publishers,
      genres: extracted.genres,
      releaseDate: extracted.releaseDate,
      description: extracted.description,
      classificationHints: extracted.classificationHints,
      externalIdentifiers: [],
      metadata: {
        categories: parse?.categories?.map((c) => c['*']) ?? [],
      },
    };
  }

  private extractFromWikitext(wikitext: string): {
    alternateTitles: string[];
    platforms: string[];
    developers: string[];
    publishers: string[];
    genres: string[];
    releaseDate: string | null;
    description: string;
    classificationHints: { category: string; confidence: number; evidence: string }[];
  } {
    const alternateTitles: string[] = [];
    const platforms: string[] = [];
    const developers: string[] = [];
    const publishers: string[] = [];
    const genres: string[] = [];
    let releaseDate: string | null = null;
    let description = '';
    const classificationHints: { category: string; confidence: number; evidence: string }[] = [];

    const titleMatch = wikitext.match(/\{\{[Ii]nfobox[^|]*\|[^}]*title\s*=\s*([^\n|}]+)/);
    if (titleMatch?.[1]) {
      const altTitle = this.cleanWikitext(titleMatch[1]);
      if (altTitle && altTitle.length > 0) {
        alternateTitles.push(altTitle);
      }
    }

    const platformMatch = wikitext.match(/platform[s]?\s*=\s*([^\n|}]+)/i);
    if (platformMatch?.[1]) {
      const platformStr = this.cleanWikitext(platformMatch[1]);
      if (platformStr) {
        platforms.push(
          ...platformStr
            .split(/[,;]+/)
            .map((p) => p.trim())
            .filter(Boolean),
        );
      }
    }

    const developerMatch = wikitext.match(/developer[s]?\s*=\s*([^\n|}]+)/i);
    if (developerMatch?.[1]) {
      const devStr = this.cleanWikitext(developerMatch[1]);
      if (devStr) {
        developers.push(
          ...devStr
            .split(/[,;]+/)
            .map((d) => d.trim())
            .filter(Boolean),
        );
      }
    }

    const publisherMatch = wikitext.match(/publisher[s]?\s*=\s*([^\n|}]+)/i);
    if (publisherMatch?.[1]) {
      const pubStr = this.cleanWikitext(publisherMatch[1]);
      if (pubStr) {
        publishers.push(
          ...pubStr
            .split(/[,;]+/)
            .map((p) => p.trim())
            .filter(Boolean),
        );
      }
    }

    const genreMatch = wikitext.match(/genre[s]?\s*=\s*([^\n|}]+)/i);
    if (genreMatch?.[1]) {
      const genreStr = this.cleanWikitext(genreMatch[1]);
      if (genreStr) {
        genres.push(
          ...genreStr
            .split(/[,;]+/)
            .map((g) => g.trim())
            .filter(Boolean),
        );
      }
    }

    const dateMatch = wikitext.match(/release\s*date\s*=\s*([^\n|}]+)/i);
    if (dateMatch?.[1]) {
      releaseDate = this.cleanWikitext(dateMatch[1]) || null;
    }

    const descMatch = wikitext.match(/description\s*=\s*([^\n|}]+)/i);
    if (descMatch?.[1]) {
      description = this.cleanWikitext(descMatch[1]);
    }

    if (wikitext.includes('video game') || wikitext.includes('Video game')) {
      classificationHints.push({
        category: 'GAME',
        confidence: 0.7,
        evidence: 'Wikitext contains "video game"',
      });
    }

    return {
      alternateTitles,
      platforms,
      developers,
      publishers,
      genres,
      releaseDate,
      description,
      classificationHints,
    };
  }

  private cleanWikitext(text: string): string {
    let cleaned = text.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');
    cleaned = cleaned.replace(/\{\{[^}]*\}\}/g, '');
    cleaned = cleaned.replace(/'''?/g, '');
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  private stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  private async fetchPageImagesByPageIds(pageIds: string[]): Promise<Map<string, string[]>> {
    if (pageIds.length === 0) {
      return new Map();
    }

    const cacheKey = [...pageIds].sort().join('|');
    const cached = this.pageImageCache.get(cacheKey);
    if (cached !== undefined) {
      const result = new Map<string, string[]>();
      const entries = JSON.parse(cached) as Array<[string, string[]]>;
      for (const [id, urls] of entries) {
        result.set(id, urls);
      }
      return result;
    }

    try {
      const params = new URLSearchParams({
        action: 'query',
        pageids: pageIds.join('|'),
        prop: 'pageimages',
        pithumbsize: '600',
        format: 'json',
        origin: '*',
      });

      const url = `${this.baseUrl}?${params.toString()}`;
      const response = await this.fetchJson<WikipediaPageImagesResponse>(url);

      const pages = response.query?.pages;
      if (!pages) {
        return new Map();
      }

      const result = new Map<string, string[]>();
      for (const [pageId, page] of Object.entries(pages)) {
        const urls: string[] = [];
        if (page.thumbnail?.source) {
          urls.push(page.thumbnail.source);
        }
        if (page.original?.source && page.original.source !== page.thumbnail?.source) {
          urls.push(page.original.source);
        }
        if (urls.length > 0) {
          result.set(pageId, urls);
        }
      }

      const serialized = JSON.stringify([...result.entries()]);
      this.pageImageCache.set(cacheKey, serialized);

      return result;
    } catch {
      return new Map();
    }
  }

  private async fetchPageImages(title: string): Promise<string[]> {
    const cached = this.pageImageCache.get(`title:${title}`);
    if (cached !== undefined) {
      return JSON.parse(cached) as string[];
    }

    try {
      const params = new URLSearchParams({
        action: 'query',
        titles: title,
        prop: 'pageimages',
        pithumbsize: '600',
        format: 'json',
        origin: '*',
      });

      const url = `${this.baseUrl}?${params.toString()}`;
      const response = await this.fetchJson<WikipediaPageImagesResponse>(url);

      const pages = response.query?.pages;
      if (!pages) {
        return [];
      }

      const urls: string[] = [];
      for (const page of Object.values(pages)) {
        if (page.thumbnail?.source) {
          urls.push(page.thumbnail.source);
        }
        if (page.original?.source && page.original.source !== page.thumbnail?.source) {
          urls.push(page.original.source);
        }
      }

      this.pageImageCache.set(`title:${title}`, JSON.stringify(urls));

      return urls;
    } catch {
      return [];
    }
  }
}
