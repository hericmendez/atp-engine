import { describe, it, expect, vi } from 'vitest';
import { withRetry, RetryError } from '../../src/infrastructure/retry.js';

describe('withRetry', () => {
  it('should return result on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw RetryError after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(fn, { maxAttempts: 2 })).rejects.toThrow(RetryError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry if retryOn returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no-retry'));
    await expect(withRetry(fn, { retryOn: () => false })).rejects.toThrow('no-retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry only retryable errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('retryable'))
      .mockRejectedValueOnce(new Error('no-retry'));
    await expect(
      withRetry(fn, { retryOn: (e) => (e as Error).message === 'retryable' }),
    ).rejects.toThrow('no-retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
