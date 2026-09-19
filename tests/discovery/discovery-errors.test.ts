import { describe, it, expect } from 'vitest';
import {
  sanitizeDiscoveryError,
  sanitizeDiscoveryErrorMessage,
  sanitizeDiscoveryErrors,
} from '../../src/discovery/discovery-errors.js';

describe('sanitizeDiscoveryErrorMessage', () => {
  it('strips upstream URLs', () => {
    expect(
      sanitizeDiscoveryErrorMessage(
        'HTTP 429: https://en.wikipedia.org/w/api.php?action=query&list=search',
      ),
    ).toBe('HTTP 429:');
  });

  it('strips URLs with credentials and tokens', () => {
    const result = sanitizeDiscoveryErrorMessage(
      'Network error: https://user:secret@api.example.com/games?token=abc123 failed',
    );

    expect(result).not.toContain('user');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('https://');
  });

  it('leaves already-safe messages untouched', () => {
    expect(sanitizeDiscoveryErrorMessage('Request timed out after 5000ms')).toBe(
      'Request timed out after 5000ms',
    );
  });

  it('falls back when nothing remains after stripping', () => {
    expect(sanitizeDiscoveryErrorMessage('https://api.example.com/x')).toBe(
      'Upstream provider request failed',
    );
  });
});

describe('sanitizeDiscoveryError', () => {
  it('preserves source, type, and retryability while sanitizing the message', () => {
    const result = sanitizeDiscoveryError({
      source: 'wikipedia',
      errorType: 'invalid_response',
      message: 'HTTP 429: https://en.wikipedia.org/w/api.php?x=1',
      retryable: true,
    });

    expect(result).toEqual({
      source: 'wikipedia',
      errorType: 'invalid_response',
      message: 'HTTP 429:',
      retryable: true,
    });
  });

  it('maps arrays without dropping entries', () => {
    const result = sanitizeDiscoveryErrors([
      { source: 'wikipedia', errorType: 'timeout', message: 'slow https://a.example/x', retryable: true },
      { source: 'steam', errorType: 'network_failure', message: 'boom', retryable: true },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].message).toBe('slow');
    expect(result[1].message).toBe('boom');
  });
});
