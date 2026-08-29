import type { RawCandidate } from './raw-candidate.js';

export interface SearchOptions {
  readonly limit?: number;
  readonly offset?: number;
}

export interface SearchResult {
  readonly candidates: readonly RawCandidate[];
  readonly totalEstimate?: number;
  readonly hasMore: boolean;
}

export interface SourceCapabilities {
  readonly search: boolean;
  readonly getById: boolean;
  readonly searchPagination: 'none' | 'offset' | 'cursor';
}

export interface SourceAdapter {
  readonly source: string;
  readonly capabilities: SourceCapabilities;

  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  getById(id: string): Promise<RawCandidate | null>;
}
