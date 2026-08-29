import { describe, it, expect } from 'vitest';
import { MockAdapter } from './fixtures/mock-adapter.js';
import { SourceError } from '../../src/sources/source-errors.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';

const sampleCandidate: RawCandidate = {
  source: 'mock',
  sourceId: '1',
  title: 'Test Game',
  platforms: ['Windows'],
  developers: ['TestDev'],
};

describe('MockAdapter', () => {
  describe('search', () => {
    it('returns empty results by default', async () => {
      const adapter = new MockAdapter({ source: 'mock' });
      const result = await adapter.search('anything');
      expect(result.candidates).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('returns configured search results', async () => {
      const adapter = new MockAdapter({
        source: 'mock',
        searchResults: [sampleCandidate],
      });
      const result = await adapter.search('Test');
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].title).toBe('Test Game');
    });

    it('respects limit option', async () => {
      const candidates: RawCandidate[] = [
        { source: 'mock', sourceId: '1', title: 'A' },
        { source: 'mock', sourceId: '2', title: 'B' },
        { source: 'mock', sourceId: '3', title: 'C' },
      ];
      const adapter = new MockAdapter({ source: 'mock', searchResults: candidates });
      const result = await adapter.search('x', { limit: 2 });
      expect(result.candidates).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('throws configured search error', async () => {
      const adapter = new MockAdapter({
        source: 'mock',
        searchError: new SourceError('mock', 'timeout', 'Search timed out'),
      });
      await expect(adapter.search('test')).rejects.toThrow(SourceError);
    });

    it('tracks search call count and query', async () => {
      const adapter = new MockAdapter({
        source: 'mock',
        searchResults: [sampleCandidate],
      });
      expect(adapter.getSearchCallCount()).toBe(0);

      await adapter.search('first');
      expect(adapter.getSearchCallCount()).toBe(1);
      expect(adapter.getLastSearchQuery()).toBe('first');

      await adapter.search('second');
      expect(adapter.getSearchCallCount()).toBe(2);
      expect(adapter.getLastSearchQuery()).toBe('second');
    });
  });

  describe('getById', () => {
    it('returns null by default', async () => {
      const adapter = new MockAdapter({ source: 'mock' });
      const result = await adapter.getById('1');
      expect(result).toBeNull();
    });

    it('returns configured getById result', async () => {
      const adapter = new MockAdapter({
        source: 'mock',
        getByIdResult: sampleCandidate,
      });
      const result = await adapter.getById('1');
      expect(result).toBe(sampleCandidate);
    });

    it('throws configured getById error', async () => {
      const adapter = new MockAdapter({
        source: 'mock',
        getByIdError: new SourceError('mock', 'not_found', 'Not found'),
      });
      await expect(adapter.getById('999')).rejects.toThrow(SourceError);
    });

    it('tracks getById call count and id', async () => {
      const adapter = new MockAdapter({ source: 'mock' });
      expect(adapter.getGetByIdCallCount()).toBe(0);

      await adapter.getById('abc');
      expect(adapter.getGetByIdCallCount()).toBe(1);
      expect(adapter.getLastGetByIdId()).toBe('abc');

      await adapter.getById('xyz');
      expect(adapter.getGetByIdCallCount()).toBe(2);
      expect(adapter.getLastGetByIdId()).toBe('xyz');
    });
  });

  describe('capabilities', () => {
    it('has search and getById enabled', () => {
      const adapter = new MockAdapter({ source: 'mock' });
      expect(adapter.capabilities.search).toBe(true);
      expect(adapter.capabilities.getById).toBe(true);
      expect(adapter.capabilities.searchPagination).toBe('none');
    });
  });
});
