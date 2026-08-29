import type {
  SourceAdapter,
  SearchOptions,
  SearchResult,
  SourceCapabilities,
} from './source-adapter.js';
import type { RawCandidate } from './raw-candidate.js';
import { SourceError, createSourceTimeout } from './source-errors.js';

export interface BaseAdapterConfig {
  readonly source: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly userAgent?: string;
}

export abstract class BaseAdapter implements SourceAdapter {
  readonly source: string;
  readonly capabilities: SourceCapabilities;
  protected readonly baseUrl: string;
  protected readonly timeoutMs: number;
  protected readonly userAgent: string;

  constructor(config: BaseAdapterConfig, capabilities: SourceCapabilities) {
    this.source = config.source;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.userAgent = config.userAgent ?? 'ATP-Engine/1.0';
    this.capabilities = capabilities;
  }

  abstract search(query: string, options?: SearchOptions): Promise<SearchResult>;
  abstract getById(id: string): Promise<RawCandidate | null>;

  protected async fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        signal: signal ?? controller.signal,
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new SourceError(this.source, 'not_found', `Not found: ${url}`);
        }
        if (response.status === 429) {
          throw new SourceError(this.source, 'rate_limited', `Rate limited: ${url}`);
        }
        throw new SourceError(this.source, 'invalid_response', `HTTP ${response.status}: ${url}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SourceError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw createSourceTimeout(this.source, this.timeoutMs);
      }
      throw new SourceError(
        this.source,
        'network_failure',
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
