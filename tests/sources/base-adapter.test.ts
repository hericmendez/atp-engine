import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAdapter, type BaseAdapterConfig } from '../../src/sources/base-adapter.js';
import type { SourceCapabilities } from '../../src/sources/source-adapter.js';
import { SourceError } from '../../src/sources/source-errors.js';

class TestAdapter extends BaseAdapter {
  constructor(config: BaseAdapterConfig, capabilities: SourceCapabilities) {
    super(config, capabilities);
  }

  async search() {
    return { candidates: [], hasMore: false };
  }

  async getById(id: string) {
    const url = `${this.baseUrl}/items/${id}`;
    return this.fetchJson<{ id: string }>(url);
  }

  async fetchWithSignal(url: string, signal: AbortSignal) {
    return this.fetchJson<unknown>(url, signal);
  }
}

const defaultConfig: BaseAdapterConfig = {
  source: 'test-source',
  baseUrl: 'https://api.example.com',
  timeoutMs: 5000,
  userAgent: 'TestAgent/1.0',
};

const defaultCapabilities: SourceCapabilities = {
  search: true,
  getById: true,
  searchPagination: 'none',
};

describe('BaseAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('sets source and baseUrl from config', () => {
      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      expect(adapter.source).toBe('test-source');
      expect(adapter['baseUrl']).toBe('https://api.example.com');
    });

    it('defaults timeoutMs to 10000 when not provided', () => {
      const adapter = new TestAdapter({ source: 's', baseUrl: 'http://x' }, defaultCapabilities);
      expect(adapter['timeoutMs']).toBe(10000);
    });

    it('defaults userAgent to ATP-Engine/1.0 when not provided', () => {
      const adapter = new TestAdapter({ source: 's', baseUrl: 'http://x' }, defaultCapabilities);
      expect(adapter['userAgent']).toBe('ATP-Engine/1.0');
    });

    it('uses provided timeoutMs and userAgent', () => {
      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      expect(adapter['timeoutMs']).toBe(5000);
      expect(adapter['userAgent']).toBe('TestAgent/1.0');
    });

    it('exposes capabilities', () => {
      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      expect(adapter.capabilities).toBe(defaultCapabilities);
    });
  });

  describe('fetchJson', () => {
    it('returns parsed JSON on successful response', async () => {
      const mockData = { id: '123', name: 'Test' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      const result = await adapter.getById('123');
      expect(result).toEqual(mockData);
    });

    it('sends correct headers', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      await adapter.getById('1');

      const [, options] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(options?.headers).toEqual({
        'User-Agent': 'TestAgent/1.0',
        Accept: 'application/json',
      });
    });

    it('throws SourceError with not_found on 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      await expect(adapter.getById('999')).rejects.toThrow(SourceError);
      try {
        await adapter.getById('999');
      } catch (e) {
        expect((e as SourceError).errorType).toBe('not_found');
        expect((e as SourceError).retryable).toBe(false);
      }
    });

    it('throws SourceError with rate_limited on 429', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Too Many Requests', { status: 429 }),
      );

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      try {
        await adapter.getById('1');
      } catch (e) {
        expect((e as SourceError).errorType).toBe('rate_limited');
        expect((e as SourceError).retryable).toBe(true);
      }
    });

    it('throws SourceError with invalid_response on other HTTP errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Server Error', { status: 500 }),
      );

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      try {
        await adapter.getById('1');
      } catch (e) {
        expect((e as SourceError).errorType).toBe('invalid_response');
        expect((e as SourceError).retryable).toBe(false);
      }
    });

    it('throws SourceError with timeout on AbortError', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        const error = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(error);
      });

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      try {
        await adapter.getById('1');
      } catch (e) {
        expect((e as SourceError).errorType).toBe('timeout');
        expect((e as SourceError).retryable).toBe(true);
        expect((e as SourceError).message).toContain('5000');
      }
    });

    it('throws SourceError with network_failure on fetch rejection', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      try {
        await adapter.getById('1');
      } catch (e) {
        expect((e as SourceError).errorType).toBe('network_failure');
        expect((e as SourceError).retryable).toBe(true);
        expect((e as SourceError).message).toContain('ECONNREFUSED');
      }
    });

    it('uses external signal when provided', async () => {
      const controller = new AbortController();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      await adapter.fetchWithSignal('https://api.example.com/data', controller.signal);

      const [, options] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(options?.signal).toBe(controller.signal);
    });

    it('uses internal timeout controller when no external signal provided', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const adapter = new TestAdapter(defaultConfig, defaultCapabilities);
      await adapter.getById('1');

      const [, options] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
