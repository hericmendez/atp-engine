import type { SourceAdapter, SearchOptions } from '../sources/source-adapter.js';
import type { SourceRegistry } from '../sources/source-registry.js';
import type { Classifier } from '../classification/classifier.js';
import type { IdentityResolver } from '../identity/identity-resolver.js';
import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { DiscoveryRequest, DiscoveryResult, DiscoverySourceError } from './discovery-types.js';
import { normalizeCandidate, type RawCandidateInput } from '../normalization/normalize.js';
import { SourceError } from '../sources/source-errors.js';
import { aggregateAndDeduplicate, rankGroups } from './aggregation.js';
import type { DiscoverySourceObservation } from './discovery-types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class DiscoveryEngine {
  constructor(
    private readonly sourceRegistry: SourceRegistry,
    private readonly classifier: Classifier,
    private readonly identityResolver: IdentityResolver,
  ) {}

  async discover(request: DiscoveryRequest): Promise<DiscoveryResult> {
    const limit = Math.min(request.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = request.offset ?? 0;
    const query = request.query.trim();

    const sources = this.selectSources(request.sourceFilter);
    const sourceResults = await this.querySources(sources, query);

    const allObservations: DiscoverySourceObservation[] = [];
    const sourceErrors: DiscoverySourceError[] = [];

    for (const result of sourceResults) {
      if (result.status === 'fulfilled') {
        const observations = this.processSourceResults(result.value);
        allObservations.push(...observations);
      } else {
        sourceErrors.push(this.extractSourceError(result.reason));
      }
    }

    const groups = aggregateAndDeduplicate(allObservations, this.identityResolver, query);
    const rankedGroups = rankGroups(groups);

    const paginatedGroups = rankedGroups.slice(offset, offset + limit);

    return {
      query,
      groups: paginatedGroups,
      totalGroups: rankedGroups.length,
      sourceErrors,
      hasMore: offset + limit < rankedGroups.length,
    };
  }

  private selectSources(filter?: readonly string[]): readonly SourceAdapter[] {
    const allSources = this.sourceRegistry.getAll();
    if (!filter || filter.length === 0) {
      return allSources.filter((s) => s.capabilities.search);
    }
    return allSources.filter((s) => s.capabilities.search && filter.includes(s.source));
  }

  private async querySources(
    sources: readonly SourceAdapter[],
    query: string,
  ): Promise<
    PromiseSettledResult<{ source: string; candidates: readonly NormalizedCandidate[] }>[]
  > {
    const searchOptions: SearchOptions = { limit: 10 };

    const promises = sources.map(async (adapter) => {
      const result = await adapter.search(query, searchOptions);
      const normalized = result.candidates.map((raw) =>
        normalizeCandidate(raw as RawCandidateInput, raw.source, raw.sourceId),
      );
      return { source: adapter.source, candidates: normalized };
    });

    return Promise.allSettled(promises);
  }

  private processSourceResults(result: {
    source: string;
    candidates: readonly NormalizedCandidate[];
  }): DiscoverySourceObservation[] {
    const observations: DiscoverySourceObservation[] = [];

    for (const candidate of result.candidates) {
      const classification = this.classifier.classify(candidate);
      observations.push({
        source: result.source,
        sourceId: candidate.provenance.sourceId,
        candidate,
        classification,
        retrievedAt: candidate.provenance.retrievedAt,
      });
    }

    return observations;
  }

  private extractSourceError(reason: unknown): DiscoverySourceError {
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
