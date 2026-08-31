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

export interface CoverEngineDependencies {
  readonly sourceRegistry: SourceRegistry;
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
    const sourceResults = await this.querySources(sources, trimmedQuery, sourceLimit);

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
    const typeFiltered = filterByType(deduplicated, searchType);
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
  ): Promise<
    PromiseSettledResult<{ source: string; sourceId: string; candidate: NormalizedCandidate }>[]
  > {
    const promises = sources.map(async (adapter) => {
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
