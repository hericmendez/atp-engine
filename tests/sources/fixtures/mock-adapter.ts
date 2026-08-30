import type {
  SourceAdapter,
  SearchOptions,
  SearchResult,
  SourceCapabilities,
} from '../../../src/sources/source-adapter.js';
import type { RawCandidate } from '../../../src/sources/raw-candidate.js';

export interface MockAdapterConfig {
  readonly source: string;
  readonly searchResults?: RawCandidate[];
  readonly getByIdResult?: RawCandidate | null;
  readonly searchError?: Error;
  readonly getByIdError?: Error;
  readonly delayMs?: number;
  readonly searchCovers?: boolean;
}

export class MockAdapter implements SourceAdapter {
  readonly source: string;
  readonly capabilities: SourceCapabilities;

  private readonly searchResults: RawCandidate[];
  private readonly getByIdResult: RawCandidate | null;
  private readonly searchError?: Error;
  private readonly getByIdError?: Error;
  private readonly delayMs: number;

  private searchCallCount = 0;
  private getByIdCallCount = 0;
  private lastSearchQuery = '';
  private lastGetByIdId = '';

  constructor(config: MockAdapterConfig) {
    this.source = config.source;
    this.searchResults = config.searchResults ?? [];
    this.getByIdResult = config.getByIdResult ?? null;
    this.searchError = config.searchError;
    this.getByIdError = config.getByIdError;
    this.delayMs = config.delayMs ?? 0;
    this.capabilities = {
      search: true,
      getById: true,
      searchCovers: config.searchCovers ?? false,
      searchPagination: 'none',
    };
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    this.searchCallCount++;
    this.lastSearchQuery = query;

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.searchError) {
      throw this.searchError;
    }

    const limit = options?.limit ?? 10;
    const candidates = this.searchResults.slice(0, limit);

    return {
      candidates,
      hasMore: this.searchResults.length > limit,
    };
  }

  async getById(id: string): Promise<RawCandidate | null> {
    this.getByIdCallCount++;
    this.lastGetByIdId = id;

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.getByIdError) {
      throw this.getByIdError;
    }

    return this.getByIdResult;
  }

  getSearchCallCount(): number {
    return this.searchCallCount;
  }

  getGetByIdCallCount(): number {
    return this.getByIdCallCount;
  }

  getLastSearchQuery(): string {
    return this.lastSearchQuery;
  }

  getLastGetByIdId(): string {
    return this.lastGetByIdId;
  }
}
