import { describe, it, expect } from 'vitest';
import { getRequestId, runWithContext } from '../../src/infrastructure/request-context.js';

describe('requestContextStorage', () => {
  it('returns undefined when no context is active', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('provides requestId within a context', () => {
    runWithContext({ requestId: 'test-123' }, () => {
      expect(getRequestId()).toBe('test-123');
    });
  });

  it('returns undefined outside the context', () => {
    runWithContext({ requestId: 'test-456' }, () => {
      expect(getRequestId()).toBe('test-456');
    });
    expect(getRequestId()).toBeUndefined();
  });

  it('supports nested contexts', () => {
    runWithContext({ requestId: 'outer' }, () => {
      expect(getRequestId()).toBe('outer');
      runWithContext({ requestId: 'inner' }, () => {
        expect(getRequestId()).toBe('inner');
      });
      expect(getRequestId()).toBe('outer');
    });
  });

  it('supports empty context', () => {
    runWithContext({}, () => {
      expect(getRequestId()).toBeUndefined();
    });
  });
});
