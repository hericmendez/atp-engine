import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout, TimeoutError } from '../../src/infrastructure/timeout.js';
import { RetryError } from '../../src/infrastructure/retry.js';
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
}

const defaultCapabilities: SourceCapabilities = {
  search: true,
  getById: true,
  searchPagination: 'none',
};

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves before timeout', async () => {
    const result = await withTimeout(async () => 'ok', { timeoutMs: 5000 });
    expect(result).toBe('ok');
  });

  it('throws TimeoutError when operation exceeds timeout', async () => {
    const promise = withTimeout(
      async (signal) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('done'), 10000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
      { timeoutMs: 5000 },
    );

    vi.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow(TimeoutError);
  });

  it('TimeoutError contains timeoutMs', async () => {
    const promise = withTimeout(
      async (signal) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('done'), 10000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
      { timeoutMs: 3000 },
    );

    vi.advanceTimersByTime(3000);

    try {
      await promise;
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TimeoutError);
      expect((e as TimeoutError).timeoutMs).toBe(3000);
    }
  });

  it('cleans up timer on success', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    await withTimeout(async () => 'ok', { timeoutMs: 5000 });
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('passes abort signal to function', async () => {
    let receivedSignal: AbortSignal | undefined;
    await withTimeout(
      async (signal) => {
        receivedSignal = signal;
        return 'ok';
      },
      { timeoutMs: 5000 },
    );
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('Failure-mode: source timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('converts AbortError to SourceError timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const error = new DOMException('The operation was aborted', 'AbortError');
      return Promise.reject(error);
    });

    const adapter = new TestAdapter(
      { source: 'test', baseUrl: 'http://x', timeoutMs: 5000 },
      defaultCapabilities,
    );

    try {
      await adapter.getById('1');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SourceError);
      expect((e as SourceError).errorType).toBe('timeout');
    }
  });
});

describe('Failure-mode: retry on transient errors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries on rate_limited (429) and eventually succeeds', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new SourceError('test', 'rate_limited', 'Rate limited'))
      .mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200 }));

    const adapter = new TestAdapter(
      {
        source: 'test',
        baseUrl: 'http://x',
        timeoutMs: 5000,
        retry: { maxAttempts: 3, baseDelayMs: 100, jitter: false },
      },
      defaultCapabilities,
    );

    const promise = adapter.getById('1');
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on network_failure and eventually succeeds', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200 }));

    const adapter = new TestAdapter(
      {
        source: 'test',
        baseUrl: 'http://x',
        timeoutMs: 5000,
        retry: { maxAttempts: 3, baseDelayMs: 100, jitter: false },
      },
      defaultCapabilities,
    );

    const promise = adapter.getById('1');
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on invalid_response (5xx) and eventually succeeds', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new SourceError('test', 'invalid_response', 'HTTP 500'))
      .mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200 }));

    const adapter = new TestAdapter(
      {
        source: 'test',
        baseUrl: 'http://x',
        timeoutMs: 5000,
        retry: { maxAttempts: 3, baseDelayMs: 100, jitter: false },
      },
      defaultCapabilities,
    );

    const promise = adapter.getById('1');
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Failure-mode: no retry on non-retryable errors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not retry on not_found (404)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Not Found', { status: 404 }));

    const adapter = new TestAdapter(
      {
        source: 'test',
        baseUrl: 'http://x',
        timeoutMs: 5000,
        retry: { maxAttempts: 3, baseDelayMs: 100, jitter: false },
      },
      defaultCapabilities,
    );

    await expect(adapter.getById('999')).rejects.toThrow(SourceError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Failure-mode: retry exhaustion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('throws RetryError after exhausting all attempts', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new SourceError('test', 'rate_limited', 'Rate limited'),
    );

    const adapter = new TestAdapter(
      {
        source: 'test',
        baseUrl: 'http://x',
        timeoutMs: 5000,
        retry: { maxAttempts: 2, baseDelayMs: 100, jitter: false },
      },
      defaultCapabilities,
    );

    const promise = adapter.getById('1').catch((e) => e);
    await vi.advanceTimersByTimeAsync(500);
    const error = await promise;

    expect(error).toBeInstanceOf(RetryError);
    expect((error as RetryError).attempts).toBe(2);
  });
});

describe('Failure-mode: malformed response', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws on invalid JSON response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json {{{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new TestAdapter(
      { source: 'test', baseUrl: 'http://x', timeoutMs: 5000 },
      defaultCapabilities,
    );

    await expect(adapter.getById('1')).rejects.toThrow();
  });
});

describe('Failure-mode: concurrent timeout and retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries after timeout and eventually succeeds', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
      }
      return Promise.resolve(new Response(JSON.stringify({ id: '1' }), { status: 200 }));
    });

    const adapter = new TestAdapter(
      {
        source: 'test',
        baseUrl: 'http://x',
        timeoutMs: 100,
        retry: { maxAttempts: 2, baseDelayMs: 50, jitter: false },
      },
      defaultCapabilities,
    );

    const promise = adapter.getById('1');
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toEqual({ id: '1' });
    expect(callCount).toBe(2);
  });
});
