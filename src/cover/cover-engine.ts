import type { SourceRegistry } from '../sources/source-registry.js';
import type { SourceAdapter } from '../sources/source-adapter.js';
import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type {
  CoverCandidate,
  CoverCandidateInput,
  CoverResult,
  CoverSourceError,
} from '../domain/cover/cover-candidate.js';
import { CoverType, CoverSearchType } from '../domain/cover/cover-candidate.js';
import { normalizeCandidate, type RawCandidateInput } from '../normalization/normalize.js';
import { filterValidCandidates, deduplicateCandidates } from './cover-validate.js';
import { rankCandidates, filterByType } from './cover-rank.js';
import { SourceError } from '../sources/source-errors.js';
import { assetEligibility, logAssetEligibilityDecision } from '../eligibility/asset-eligibility.js';
import { WikipediaCoverDiscovery } from '../sources/wikipedia/cover/wikipedia-cover-discovery.js';
import type { WikipediaCoverCandidate } from '../sources/wikipedia/cover/wikipedia-cover-types.js';

export interface CoverEngineDependencies {
  readonly sourceRegistry: SourceRegistry;
  readonly wikipediaCoverDiscovery?: WikipediaCoverDiscovery;
}

export interface CoverSearchOptions {
  readonly type?: CoverSearchType;
  readonly limit?: number;
  readonly sourceFilter?: readonly string[];
}

function inferCoverType(url: string): CoverType {
  const lower = url.toLowerCase();
  if (lower.includes('header') || lower.includes('capsule')) return CoverType.FRONT_COVER;
  if (lower.includes('screenshot')) return CoverType.SCREENSHOT;
  if (lower.includes('poster') || lower.includes('keyart')) return CoverType.KEY_ART;
  if (lower.endsWith('.svg')) return CoverType.LOGO;
  if (lower.includes('/logo') || lower.includes('_logo') || lower.includes('-logo')) {
    return CoverType.LOGO;
  }
  if (lower.includes('/icon') || lower.includes('_icon') || lower.includes('-icon')) {
    return CoverType.LOGO;
  }
  if (
    lower.includes('/symbol') ||
    lower.includes('_symbol') ||
    lower.includes('-symbol') ||
    lower.includes('/emblem')
  ) {
    return CoverType.LOGO;
  }
  return CoverType.UNKNOWN;
}

function candidatesFromObservation(obs: {
  source: string;
  sourceId: string;
  candidate: NormalizedCandidate;
}): CoverCandidate[] {
  const candidates: CoverCandidate[] = [];
  const candidateTitle = obs.candidate.titles[0]?.value ?? null;

  for (const url of obs.candidate.coverUrls) {
    const input: CoverCandidateInput = {
      url,
      source: obs.source,
      sourceId: obs.sourceId,
      title: candidateTitle ?? undefined,
      type: inferCoverType(url),
    };

    candidates.push({
      url: input.url,
      source: input.source,
      sourceId: input.sourceId,
      title: input.title ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      type: input.type ?? CoverType.UNKNOWN,
      evidence: {
        source: input.source,
        sourceId: input.sourceId,
        retrievedAt: new Date(),
      },
    });
  }

  return candidates;
}

export const DEFAULT_COVER_SEARCH_TYPE = CoverSearchType.COVER;
export const DEFAULT_COVER_LIMIT = 1;
export const MIN_COVER_SELECTION_SCORE = 0.55;

export class CoverEngine {
  constructor(private readonly deps: CoverEngineDependencies) {}

  async searchCovers(query: string, options?: CoverSearchOptions): Promise<CoverResult> {
    const trimmedQuery = query.trim();
    const searchType = options?.type ?? DEFAULT_COVER_SEARCH_TYPE;
    const limit = options?.limit ?? DEFAULT_COVER_LIMIT;
    const sources = this.selectCoverSources(options?.sourceFilter);
    const sourceLimit = Math.max(limit, 5);
    const sourceResults = await this.querySources(sources, trimmedQuery, sourceLimit, searchType);

    const allCandidates: CoverCandidate[] = [];
    const errors: CoverSourceError[] = [];

    for (const result of sourceResults) {
      if (result.status === 'fulfilled') {
        const candidates = candidatesFromObservation(result.value);
        allCandidates.push(...candidates);
      } else {
        errors.push(this.extractSourceError(result.reason));
      }
    }

    const validCandidates = filterValidCandidates(allCandidates);
    const deduplicated = deduplicateCandidates(validCandidates);

    // ── Asset Eligibility gate ─────────────────────────────────
    // game is null for query-based search; entity association
    // cannot be validated without a canonical game.
    const eligible = deduplicated.filter((c) => {
      const decision = assetEligibility(c, null, searchType);
      if (!decision.eligible) {
        logAssetEligibilityDecision(c, decision);
        return false;
      }
      return true;
    });

    const typeFiltered = filterByType(eligible, searchType);
    const ranked = rankCandidates(typeFiltered, trimmedQuery);
    const limited = ranked.slice(0, limit);

    const bestCandidate = limited.length > 0 ? limited[0] : null;
    const selected =
      bestCandidate && bestCandidate.ranking.totalScore >= MIN_COVER_SELECTION_SCORE
        ? bestCandidate.candidate
        : null;

    return {
      query: trimmedQuery,
      gameId: null,
      type: searchType,
      limit,
      selected: selected
        ? {
            url: selected.url,
            source: selected.source,
            sourceId: selected.sourceId,
            width: selected.width,
            height: selected.height,
            type: selected.type,
          }
        : null,
      candidates: limited,
      errors,
    };
  }

  async discoverCovers(
    gameId: string,
    query: string,
    sourceFilter?: readonly string[],
  ): Promise<CoverResult> {
    const result = await this.searchCovers(query, {
      sourceFilter,
      type: CoverSearchType.COVER,
      limit: 1,
    });
    return { ...result, gameId };
  }

  private selectCoverSources(filter?: readonly string[]): readonly SourceAdapter[] {
    const allSources = this.deps.sourceRegistry.getAll();
    const coverSources = allSources.filter((s) => s.capabilities.searchCovers);

    if (!filter || filter.length === 0) {
      return coverSources;
    }

    return coverSources.filter((s) => filter.includes(s.source));
  }

  private async querySources(
    sources: readonly SourceAdapter[],
    query: string,
    limit: number,
    searchType: CoverSearchType = CoverSearchType.COVER,
  ): Promise<
    PromiseSettledResult<{ source: string; sourceId: string; candidate: NormalizedCandidate }>[]
  > {
    const promises = sources.map(async (adapter) => {
      if (
        adapter.source === 'wikipedia' &&
        searchType === CoverSearchType.COVER &&
        this.deps.wikipediaCoverDiscovery
      ) {
        return this.queryWikipediaCoverDiscovery(query, limit);
      }

      const result = await adapter.search(query, { limit });
      const candidates = result.candidates;

      if (candidates.length === 0) {
        return [];
      }

      const observations: {
        source: string;
        sourceId: string;
        candidate: NormalizedCandidate;
      }[] = [];

      for (const raw of candidates) {
        const normalized = normalizeCandidate(raw as RawCandidateInput, raw.source, raw.sourceId);
        observations.push({
          source: adapter.source,
          sourceId: raw.sourceId,
          candidate: normalized,
        });
      }

      return observations;
    });

    const settled = await Promise.allSettled(promises);
    const flattened: PromiseSettledResult<{
      source: string;
      sourceId: string;
      candidate: NormalizedCandidate;
    }>[] = [];

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        for (const obs of result.value) {
          flattened.push({ status: 'fulfilled', value: obs });
        }
      } else {
        flattened.push(result);
      }
    }

    return flattened;
  }

  private async queryWikipediaCoverDiscovery(
    query: string,
    limit: number,
  ): Promise<{ source: string; sourceId: string; candidate: NormalizedCandidate }[]> {
    if (!this.deps.wikipediaCoverDiscovery) {
      return [];
    }

    const discoveryResult = await this.deps.wikipediaCoverDiscovery.discoverCovers(query);

    const observations: {
      source: string;
      sourceId: string;
      candidate: NormalizedCandidate;
    }[] = [];

    for (const wikiCandidate of discoveryResult.candidates.slice(0, limit)) {
      const normalized = this.wikipediaCoverToNormalizedCandidate(wikiCandidate, query);
      observations.push({
        source: 'wikipedia',
        sourceId: String(wikiCandidate.pageId),
        candidate: normalized,
      });
    }

    return observations;
  }

  private wikipediaCoverToNormalizedCandidate(
    wikiCandidate: WikipediaCoverCandidate,
    query: string,
  ): NormalizedCandidate {
    return {
      titles: [{ value: wikiCandidate.title, type: 'primary' }],
      developers: [],
      publishers: [],
      genres: [],
      releases: [],
      externalIdentifiers: [{ source: 'wikipedia', id: String(wikiCandidate.pageId) }],
      provenance: {
        source: 'wikipedia',
        sourceId: String(wikiCandidate.pageId),
        retrievedAt: new Date().toISOString(),
        rawTitle: query,
      },
      classificationHints: [
        {
          category: 'GAME',
          confidence: wikiCandidate.validationSignals.confidence,
          evidence: `Wikipedia page validated as video game (confidence: ${wikiCandidate.validationSignals.confidence})`,
        },
      ],
      description: null,
      coverUrls: [wikiCandidate.imageUrl],
    };
  }

  private extractSourceError(reason: unknown): CoverSourceError {
    if (reason instanceof SourceError) {
      return {
        source: reason.source,
        errorType: reason.errorType,
        message: reason.message,
        retryable: reason.retryable,
      };
    }

    if (reason instanceof Error) {
      return {
        source: 'unknown',
        errorType: 'internal_error',
        message: reason.message,
        retryable: false,
      };
    }

    return {
      source: 'unknown',
      errorType: 'internal_error',
      message: String(reason),
      retryable: false,
    };
  }
}
