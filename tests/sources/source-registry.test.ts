import { describe, it, expect } from 'vitest';
import { SourceRegistry } from '../../src/sources/source-registry.js';
import { MockAdapter } from './fixtures/mock-adapter.js';
import type { SourceAdapter } from '../../src/sources/source-adapter.js';

function createAdapter(source: string): SourceAdapter {
  return new MockAdapter({ source });
}

describe('SourceRegistry', () => {
  it('starts empty', () => {
    const registry = new SourceRegistry();
    expect(registry.getAll()).toEqual([]);
    expect(registry.getSources()).toEqual([]);
  });

  describe('register', () => {
    it('registers an adapter', () => {
      const registry = new SourceRegistry();
      const adapter = createAdapter('wikipedia');
      registry.register(adapter);
      expect(registry.has('wikipedia')).toBe(true);
      expect(registry.get('wikipedia')).toBe(adapter);
    });

    it('throws on duplicate source name', () => {
      const registry = new SourceRegistry();
      registry.register(createAdapter('wikipedia'));
      expect(() => registry.register(createAdapter('wikipedia'))).toThrow(
        'Source adapter already registered: wikipedia',
      );
    });

    it('registers multiple different sources', () => {
      const registry = new SourceRegistry();
      registry.register(createAdapter('wikipedia'));
      registry.register(createAdapter('steam'));
      expect(registry.has('wikipedia')).toBe(true);
      expect(registry.has('steam')).toBe(true);
      expect(registry.getAll()).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('removes an existing adapter', () => {
      const registry = new SourceRegistry();
      registry.register(createAdapter('wikipedia'));
      const removed = registry.unregister('wikipedia');
      expect(removed).toBe(true);
      expect(registry.has('wikipedia')).toBe(false);
    });

    it('returns false for non-existent source', () => {
      const registry = new SourceRegistry();
      const removed = registry.unregister('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('get', () => {
    it('returns the adapter for a registered source', () => {
      const registry = new SourceRegistry();
      const adapter = createAdapter('steam');
      registry.register(adapter);
      expect(registry.get('steam')).toBe(adapter);
    });

    it('returns undefined for unregistered source', () => {
      const registry = new SourceRegistry();
      expect(registry.get('missing')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all registered adapters', () => {
      const registry = new SourceRegistry();
      const a1 = createAdapter('wikipedia');
      const a2 = createAdapter('steam');
      registry.register(a1);
      registry.register(a2);
      const all = registry.getAll();
      expect(all).toContain(a1);
      expect(all).toContain(a2);
      expect(all).toHaveLength(2);
    });
  });

  describe('getSources', () => {
    it('returns source names of all registered adapters', () => {
      const registry = new SourceRegistry();
      registry.register(createAdapter('steam'));
      registry.register(createAdapter('wikipedia'));
      const sources = registry.getSources();
      expect(sources).toContain('steam');
      expect(sources).toContain('wikipedia');
      expect(sources).toHaveLength(2);
    });
  });
});
