import { describe, it, expect } from 'vitest';
import { CoverEngine } from '../../src/cover/cover-engine.js';
import { SourceRegistry } from '../../src/sources/source-registry.js';
import type { SourceAdapter, SearchResult } from '../../src/sources/source-adapter.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import type {
  WikipediaCoverCandidate,
  WikipediaCoverDiscoveryResult,
} from '../../src/sources/wikipedia/cover/wikipedia-cover-types.js';
import type { WikipediaCoverDiscovery } from '../../src/sources/wikipedia/cover/wikipedia-cover-discovery.js';

/**
 * Regression tests for swallowed Wikipedia discovery errors.
 *
 * Before the fix, queryWikipediaCoverDiscovery mapped only
 * discoveryResult.candidates and discarded discoveryResult.errors, so an
 * upstream failure (429/timeout/5xx) surfaced as HTTP 200 with
 * candidates: [] and errors: [] — indistinguishable from "no cover found".
 */

const VALIDATION_SIGNALS = {
  hasInfobox: true,
  hasDeveloper: true,
  hasPublisher: true,
  hasPlatform: true,
  hasGenre: true,
  hasReleaseDate: true,
  isVideoGame: true,
  confidence: 0.9,
};

function makeWikiCandidate(overrides: Partial<WikipediaCoverCandidate> = {}): WikipediaCoverCandidate {
  return {
    pageId: 52720,
    title: 'Final Fantasy Tactics',
    imageUrl: 'https://en.wikipedia.org/wiki/Special:FilePath/Fftbox.jpg',
    imageWidth: null,
    imageHeight: null,
    relevanceScore: 0.95,
    validationSignals: { ...VALIDATION_SIGNALS },
    ...overrides,
  };
}

function stubDiscovery(
  result: WikipediaCoverDiscoveryResult,
): WikipediaCoverDiscovery {
  return {
    discoverCovers: async () => result,
  } as unknown as WikipediaCoverDiscovery;
}

class SteamStubAdapter implements SourceAdapter {
  readonly source: string;
  readonly capabilities = {
    search: true,
    getById: true,
    searchCovers: true,
    searchPagination: 'none' as const,
  };

  constructor(
    source: string,
    private readonly results: RawCandidate[] = [],
    private readonly shouldFail = false,
  ) {
    this.source = source;
  }

  async search(): Promise<SearchResult> {
    if (this.shouldFail) {
      const { SourceError } = await import('../../src/sources/source-errors.js');
      throw new SourceError(this.source, 'source_unavailable', `${this.source} adapter failure`);
    }
    return { candidates: this.results, hasMore: false };
  }

  async getById(): Promise<RawCandidate | null> {
    return null;
  }
}

function steamCover(url: string): RawCandidate {
  return {
    source: 'steam',
    sourceId: 'steam-100',
    title: 'Test Game',
    coverUrls: [url],
  };
}

function createEngine(
  discovery: WikipediaCoverDiscovery,
  steamResults: RawCandidate[] = [],
): CoverEngine {
  const registry = new SourceRegistry();
  // The wikipedia discovery branch runs per registered wikipedia adapter;
  // its own search() is bypassed while wikipediaCoverDiscovery is present.
  registry.register(new SteamStubAdapter('wikipedia'));
  registry.register(new SteamStubAdapter('steam', steamResults));
  return new CoverEngine({ sourceRegistry: registry, wikipediaCoverDiscovery: discovery });
}

describe('wikipedia discovery error propagation', () => {
  it('provider success with no candidates stays a valid empty result', async () => {
    const engine = createEngine(stubDiscovery({ candidates: [], errors: [] }));

    const result = await engine.searchCovers('Some Obscure Title');

    expect(result.candidates).toHaveLength(0);
    expect(result.selected).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('provider failure with no candidates surfaces through the errors channel', async () => {
    const engine = createEngine(
      stubDiscovery({
        candidates: [],
        errors: [
          {
            source: 'wikipedia',
            errorType: 'search_failure',
            message: 'HTTP 429: https://en.wikipedia.org/w/api.php?...',
            retryable: true,
          },
        ],
      }),
    );

    const result = await engine.searchCovers('Final Fantasy Tactics');

    expect(result.candidates).toHaveLength(0);
    expect(result.selected).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      source: 'wikipedia',
      message: 'HTTP 429: https://en.wikipedia.org/w/api.php?...',
    });
  });

  it('provider candidates still flow normally', async () => {
    const engine = createEngine(
      stubDiscovery({ candidates: [makeWikiCandidate()], errors: [] }),
    );

    const result = await engine.searchCovers('Final Fantasy Tactics');

    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.candidates[0].candidate.url).toContain('Fftbox.jpg');
  });

  it('wikipedia failure does not sink another provider success', async () => {
    const engine = createEngine(
      stubDiscovery({
        candidates: [],
        errors: [
          {
            source: 'wikipedia',
            errorType: 'search_failure',
            message: 'Request timed out after 5000ms',
            retryable: true,
          },
        ],
      }),
      [steamCover('https://example.com/steam-header.jpg')],
    );

    const result = await engine.searchCovers('Test Game');

    expect(result.selected).not.toBeNull();
    expect(result.selected?.url).toBe('https://example.com/steam-header.jpg');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe('wikipedia');
  });

  it('candidates alongside non-fatal errors keep current behavior', async () => {
    // discoverCovers only populates errors on total search failure in
    // practice; if both ever arrive, candidates still win and no
    // rejection is raised.
    const engine = createEngine(
      stubDiscovery({
        candidates: [makeWikiCandidate()],
        errors: [
          {
            source: 'wikipedia',
            errorType: 'search_failure',
            message: 'stale error alongside candidates',
            retryable: false,
          },
        ],
      }),
    );

    const result = await engine.searchCovers('Final Fantasy Tactics');

    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});
