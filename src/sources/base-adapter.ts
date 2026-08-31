import type {
  SourceAdapter,
  SearchOptions,
  SearchResult,
  SourceCapabilities,
} from './source-adapter.js';
import type { RawCandidate } from './raw-candidate.js';
import { SourceError, createSourceTimeout } from './source-errors.js';
import { logger } from '../infrastructure/logger/logger.js';
import { withRetry } from '../infrastructure/retry.js';
import type { RetryOptions } from '../infrastructure/retry.js';

export interface BaseAdapterConfig {
  readonly source: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  readonly retry?: Partial<RetryOptions>;
}

function isRetryableSourceError(error: unknown): boolean {
  if (error instanceof SourceError) {
    return (
      error.errorType === 'rate_limited' ||
      error.errorType === 'network_failure' ||
      error.errorType === 'invalid_response' ||
      error.errorType === 'timeout'
    );
  }
  return false;
}

export abstract class BaseAdapter implements SourceAdapter {
  readonly source: string;
  readonly capabilities: SourceCapabilities;
  protected readonly baseUrl: string;
  protected readonly timeoutMs: number;
  protected readonly userAgent: string;
  protected readonly retryOptions: Partial<RetryOptions> | undefined;

  constructor(config: BaseAdapterConfig, capabilities: SourceCapabilities) {
    this.source = config.source;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.userAgent = config.userAgent ?? 'ATP-Engine/1.0';
    this.capabilities = capabilities;
    this.retryOptions = config.retry;
  }

  abstract search(query: string, options?: SearchOptions): Promise<SearchResult>;
  abstract getById(id: string): Promise<RawCandidate | null>;

  protected async fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const doFetch = () => this.fetchJsonOnce<T>(url, signal);

    if (this.retryOptions) {
      return withRetry(doFetch, {
        ...this.retryOptions,
        retryOn: isRetryableSourceError,
      });
    }

    return doFetch();
  }

  private async fetchJsonOnce<T>(url: string, signal?: AbortSignal): Promise<T> {
    const startTime = Date.now();
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

      const data = (await response.json()) as T;
      const durationMs = Date.now() - startTime;

      logger.info('source.request.completed', {
        source: this.source,
        operation: 'fetchJson',
        url,
        statusCode: response.status,
        durationMs,
        success: true,
      });

      return data;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof SourceError) {
        logger.warn('source.request.failed', {
          source: this.source,
          operation: 'fetchJson',
          url,
          errorType: error.errorType,
          durationMs,
          success: false,
        });
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.warn('source.request.failed', {
          source: this.source,
          operation: 'fetchJson',
          url,
          errorType: 'timeout',
          durationMs,
          success: false,
        });
        throw createSourceTimeout(this.source, this.timeoutMs);
      }

      logger.warn('source.request.failed', {
        source: this.source,
        operation: 'fetchJson',
        url,
        errorType: 'network_failure',
        durationMs,
        success: false,
      });

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
