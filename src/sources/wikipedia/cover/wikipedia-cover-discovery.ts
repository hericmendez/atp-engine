import type {
  WikipediaCoverCandidate,
  WikipediaCoverDiscoveryResult,
  WikipediaCoverDiscoveryError,
  WikipediaSearchPage,
  WikipediaPageParse,
  WikipediaPageImage,
} from './wikipedia-cover-types.js';
import {
  extractQueryTokens,
  hasTokenOverlap,
  isBlacklistedByTitle,
  validateWikipediaPage,
  isGamePageValid,
  extractInfoboxImage,
  buildWikipediaImageUrl,
  computeRelevanceScore,
} from './wikipedia-cover-validation.js';
import { computeEntityMatch, isEntityMatchValid } from './wikipedia-entity-match.js';
import { LruCache } from '../../../infrastructure/lru-cache.js';
import { SourceError } from '../../source-errors.js';

const MAX_CANDIDATES = 5;
const MAX_PAGES_TO_FETCH = 10;
const MIN_RELEVANCE_SCORE = 0.3;

interface WikipediaSearchResponse {
  query?: {
    search?: WikipediaSearchPage[];
    searchinfo?: { totalhits: number };
  };
}

interface WikipediaParseResponse {
  parse?: WikipediaPageParse;
  error?: { code: string; info: string };
}

interface WikipediaPageImagesResponse {
  query?: {
    pages?: Record<string, WikipediaPageImage>;
  };
}

export class WikipediaCoverDiscovery {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly pageCache: LruCache<string, WikipediaPageParse>;
  private readonly imageCache: LruCache<string, string>;

  constructor(config?: { baseUrl?: string; userAgent?: string; timeoutMs?: number }) {
    this.baseUrl = config?.baseUrl ?? 'https://en.wikipedia.org/w/api.php';
    this.userAgent = config?.userAgent ?? 'ATP-Engine/1.0 (cover-discovery)';
    this.timeoutMs = config?.timeoutMs ?? 5000;
    this.pageCache = new LruCache({ maxSize: 200, ttlMs: 10 * 60 * 1000 });
    this.imageCache = new LruCache({ maxSize: 500, ttlMs: 5 * 60 * 1000 });
  }

  async discoverCovers(query: string): Promise<WikipediaCoverDiscoveryResult> {
    const errors: WikipediaCoverDiscoveryError[] = [];
    const candidates: WikipediaCoverCandidate[] = [];

    const expandedQuery = `${query} video game`;
    const queryTokens = extractQueryTokens(query);

    let searchPages: WikipediaSearchPage[];
    try {
      searchPages = await this.searchWikipedia(expandedQuery);
    } catch (error) {
      errors.push({
        source: 'wikipedia',
        errorType: 'search_failure',
        message: error instanceof Error ? error.message : String(error),
        retryable: error instanceof SourceError ? error.retryable : false,
      });
      return { candidates: [], errors };
    }

    const filteredPages = searchPages
      .filter((page) => !isBlacklistedByTitle(page.title))
      .filter((page) => hasTokenOverlap(page.title, queryTokens))
      .slice(0, MAX_PAGES_TO_FETCH);

    for (const page of filteredPages) {
      if (candidates.length >= MAX_CANDIDATES) break;

      try {
        const pageData = await this.fetchAndValidatePage(page.pageid);
        if (!pageData) continue;

        const validation = validateWikipediaPage(pageData.page);
        if (!isGamePageValid(validation)) continue;

        const entityMatch = computeEntityMatch(pageData.page.title, query, queryTokens);
        if (!isEntityMatchValid(entityMatch)) continue;

        const imageUrl = await this.extractValidatedImage(pageData.page);
        if (!imageUrl) continue;

        const relevanceScore = computeRelevanceScore(pageData.page.title, query, queryTokens);

        if (relevanceScore < MIN_RELEVANCE_SCORE) continue;

        candidates.push({
          pageId: page.pageid,
          title: pageData.page.title,
          imageUrl,
          imageWidth: null,
          imageHeight: null,
          relevanceScore,
          validationSignals: validation,
        });
      } catch {
        continue;
      }
    }

    candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return { candidates, errors };
  }

  private async searchWikipedia(query: string): Promise<WikipediaSearchPage[]> {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '15',
      format: 'json',
      origin: '*',
    });

    const url = `${this.baseUrl}?${params.toString()}`;
    const response = await this.fetchJson<WikipediaSearchResponse>(url);

    return response.query?.search ?? [];
  }

  private async fetchAndValidatePage(
    pageId: number,
  ): Promise<{ page: WikipediaPageParse; imageUrl: string | null } | null> {
    const cacheKey = `page:${pageId}`;
    const cached = this.pageCache.get(cacheKey);
    if (cached) {
      const imageUrl = extractInfoboxImage(cached.wikitext?.['*'] ?? '');
      return { page: cached, imageUrl: imageUrl ? buildWikipediaImageUrl(imageUrl) : null };
    }

    const titleParams = new URLSearchParams({
      action: 'query',
      pageids: String(pageId),
      prop: 'info',
      inprop: 'url',
      format: 'json',
      origin: '*',
    });

    const titleUrl = `${this.baseUrl}?${titleParams.toString()}`;
    const titleResponse = await this.fetchJson<{
      query?: { pages?: Record<string, { title?: string }> };
    }>(titleUrl);

    const page = Object.values(titleResponse.query?.pages ?? {})[0];
    const title = page?.title;

    if (!title) return null;

    const parseParams = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'wikitext|categories',
      format: 'json',
      origin: '*',
    });

    const parseUrl = `${this.baseUrl}?${parseParams.toString()}`;
    const parseResponse = await this.fetchJson<WikipediaParseResponse>(parseUrl);

    if (parseResponse.error || !parseResponse.parse) return null;

    this.pageCache.set(cacheKey, parseResponse.parse);

    const imageUrl = extractInfoboxImage(parseResponse.parse.wikitext?.['*'] ?? '');
    return {
      page: parseResponse.parse,
      imageUrl: imageUrl ? buildWikipediaImageUrl(imageUrl) : null,
    };
  }

  private async extractValidatedImage(page: WikipediaPageParse): Promise<string | null> {
    const wikitext = page.wikitext?.['*'] ?? '';
    const infoboxImage = extractInfoboxImage(wikitext);

    if (infoboxImage) {
      return buildWikipediaImageUrl(infoboxImage);
    }

    const images = await this.fetchPageImages(page.title);
    if (images.length > 0) {
      return images[0];
    }

    return null;
  }

  private async fetchPageImages(title: string): Promise<string[]> {
    const cacheKey = `images:${title}`;
    const cached = this.imageCache.get(cacheKey);
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
      if (!pages) return [];

      const urls: string[] = [];
      for (const page of Object.values(pages)) {
        if (page.thumbnail?.source) {
          urls.push(page.thumbnail.source);
        }
        if (page.original?.source && page.original.source !== page.thumbnail?.source) {
          urls.push(page.original.source);
        }
      }

      this.imageCache.set(cacheKey, JSON.stringify(urls));
      return urls;
    } catch {
      return [];
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new SourceError('wikipedia', 'invalid_response', `HTTP ${response.status}: ${url}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SourceError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SourceError(
          'wikipedia',
          'timeout',
          `Request timed out after ${this.timeoutMs}ms`,
        );
      }

      throw new SourceError(
        'wikipedia',
        'network_failure',
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
