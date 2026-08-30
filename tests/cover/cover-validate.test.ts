import { describe, it, expect } from 'vitest';
import {
  validateCoverUrl,
  validateCoverCandidate,
  filterValidCandidates,
  normalizeCoverUrl,
  deduplicateCandidates,
} from '../../src/cover/cover-validate.js';
import { createCoverCandidate } from '../../src/domain/cover/cover-candidate.js';
import { CoverType } from '../../src/domain/cover/cover-candidate.js';

describe('cover-validate', () => {
  describe('validateCoverUrl', () => {
    it('accepts valid http URL', () => {
      const result = validateCoverUrl('http://example.com/image.jpg');
      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('accepts valid https URL', () => {
      const result = validateCoverUrl('https://example.com/image.jpg');
      expect(result.valid).toBe(true);
    });

    it('rejects empty URL', () => {
      const result = validateCoverUrl('');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('empty_url');
    });

    it('rejects whitespace-only URL', () => {
      const result = validateCoverUrl('   ');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('empty_url');
    });

    it('rejects non-http URL', () => {
      const result = validateCoverUrl('ftp://example.com/image.jpg');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_url_format');
    });

    it('rejects incomplete URL (domain only, no path)', () => {
      const result = validateCoverUrl('https://example.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('incomplete_url');
    });

    it('rejects bare protocol', () => {
      const result = validateCoverUrl('https://');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_url_format');
    });
  });

  describe('validateCoverCandidate', () => {
    it('accepts valid candidate', () => {
      const candidate = createCoverCandidate({
        url: 'https://example.com/cover.jpg',
        source: 'wikipedia',
        sourceId: 'abc123',
      });
      const result = validateCoverCandidate(candidate);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('rejects candidate with invalid URL', () => {
      const candidate = createCoverCandidate({
        url: 'not-a-url',
        source: 'wikipedia',
        sourceId: 'abc123',
      });
      const result = validateCoverCandidate(candidate);
      expect(result.valid).toBe(false);
    });

    it('rejects candidate with empty source', () => {
      const candidate = {
        url: 'https://example.com/cover.jpg',
        source: '',
        sourceId: 'abc123',
        width: null,
        height: null,
        type: CoverType.UNKNOWN,
        evidence: { source: 'test', sourceId: 'test', retrievedAt: new Date() },
      };
      const result = validateCoverCandidate(candidate);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_source');
    });

    it('rejects candidate with empty sourceId', () => {
      const candidate = {
        url: 'https://example.com/cover.jpg',
        source: 'wikipedia',
        sourceId: '',
        width: null,
        height: null,
        type: CoverType.UNKNOWN,
        evidence: { source: 'test', sourceId: 'test', retrievedAt: new Date() },
      };
      const result = validateCoverCandidate(candidate);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_source_id');
    });
  });

  describe('filterValidCandidates', () => {
    it('keeps only valid candidates', () => {
      const valid = createCoverCandidate({
        url: 'https://example.com/cover.jpg',
        source: 'wikipedia',
        sourceId: 'abc',
      });
      const invalid = createCoverCandidate({
        url: 'bad-url',
        source: 'wikipedia',
        sourceId: 'def',
      });

      const result = filterValidCandidates([valid, invalid]);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/cover.jpg');
    });

    it('returns empty array when all invalid', () => {
      const invalid = createCoverCandidate({
        url: 'bad-url',
        source: 'wikipedia',
        sourceId: 'def',
      });
      const result = filterValidCandidates([invalid]);
      expect(result).toHaveLength(0);
    });
  });

  describe('normalizeCoverUrl', () => {
    it('trims whitespace', () => {
      expect(normalizeCoverUrl('  https://example.com/cover.jpg  ')).toBe(
        'https://example.com/cover.jpg',
      );
    });

    it('lowercases URL', () => {
      expect(normalizeCoverUrl('HTTPS://Example.COM/Cover.JPG')).toBe(
        'https://example.com/cover.jpg',
      );
    });

    it('strips trailing slash', () => {
      expect(normalizeCoverUrl('https://example.com/cover.jpg/')).toBe(
        'https://example.com/cover.jpg',
      );
    });

    it('strips multiple trailing slashes', () => {
      expect(normalizeCoverUrl('https://example.com/cover.jpg///')).toBe(
        'https://example.com/cover.jpg',
      );
    });
  });

  describe('deduplicateCandidates', () => {
    it('deduplicates by source:sourceId', () => {
      const a = createCoverCandidate({
        url: 'https://example.com/cover1.jpg',
        source: 'wikipedia',
        sourceId: 'abc',
      });
      const b = createCoverCandidate({
        url: 'https://example.com/cover2.jpg',
        source: 'wikipedia',
        sourceId: 'abc',
      });

      const result = deduplicateCandidates([a, b]);
      expect(result).toHaveLength(1);
    });

    it('deduplicates by normalized URL', () => {
      const a = createCoverCandidate({
        url: 'https://example.com/Cover.JPG',
        source: 'wikipedia',
        sourceId: 'abc',
      });
      const b = createCoverCandidate({
        url: 'https://example.com/cover.jpg',
        source: 'steam',
        sourceId: 'def',
      });

      const result = deduplicateCandidates([a, b]);
      expect(result).toHaveLength(1);
    });

    it('keeps distinct candidates', () => {
      const a = createCoverCandidate({
        url: 'https://example.com/cover1.jpg',
        source: 'wikipedia',
        sourceId: 'abc',
      });
      const b = createCoverCandidate({
        url: 'https://example.com/cover2.jpg',
        source: 'steam',
        sourceId: 'def',
      });

      const result = deduplicateCandidates([a, b]);
      expect(result).toHaveLength(2);
    });

    it('preserves order of first occurrence', () => {
      const a = createCoverCandidate({
        url: 'https://example.com/first.jpg',
        source: 'wikipedia',
        sourceId: 'abc',
      });
      const b = createCoverCandidate({
        url: 'https://example.com/second.jpg',
        source: 'steam',
        sourceId: 'def',
      });

      const result = deduplicateCandidates([a, b]);
      expect(result[0].sourceId).toBe('abc');
      expect(result[1].sourceId).toBe('def');
    });

    it('returns empty array for empty input', () => {
      expect(deduplicateCandidates([])).toHaveLength(0);
    });
  });
});
