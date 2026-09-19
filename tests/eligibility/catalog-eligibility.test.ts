import { describe, it, expect } from 'vitest';
import {
  catalogEligibility,
  CatalogEligibilityStatus,
} from '../../src/eligibility/catalog-eligibility.js';
import type { DiscoveryGroupResult } from '../../src/discovery/discovery-types.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { ClassificationResult } from '../../src/classification/classification-result.js';
import type { IdentityResolutionResult } from '../../src/identity/identity-resolution-result.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeCandidate(overrides?: Partial<NormalizedCandidate>): NormalizedCandidate {
  return {
    titles: [{ value: 'Test Game', type: 'primary' }],
    developers: [],
    publishers: [],
    genres: [],
    releases: [],
    externalIdentifiers: [],
    provenance: {
      source: 'wikipedia',
      sourceId: 'test-123',
      retrievedAt: new Date().toISOString(),
      rawTitle: 'Test Game',
    },
    classificationHints: [],
    description: null,
    coverUrls: [],
    ...overrides,
  };
}

function makeClassification(overrides?: Partial<ClassificationResult>): ClassificationResult {
  return {
    category: 'GAME',
    confidence: 0.8,
    signals: [],
    reason: 'Test classification',
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<IdentityResolutionResult>): IdentityResolutionResult {
  return {
    outcome: 'SAME_GAME',
    relationship: null,
    confidence: 0.9,
    signals: [],
    reason: 'Test identity',
    method: 'NATIVE',
    ...overrides,
  };
}

function makeGroup(overrides?: Partial<DiscoveryGroupResult>): DiscoveryGroupResult {
  return {
    groupId: 'group-test-1',
    observations: [
      {
        source: 'wikipedia',
        sourceId: 'test-123',
        candidate: makeCandidate(),
        classification: makeClassification(),
        retrievedAt: new Date().toISOString(),
      },
    ],
    mergedClassification: makeClassification(),
    identityResolution: makeIdentity(),
    rankingScore: 0.8,
    rankingBreakdown: {
      identityConfidence: 0.9,
      classificationConfidence: 0.8,
      sourceCount: 1,
      metadataCompleteness: 0.5,
      titleRelevance: 0.8,
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('catalog-eligibility', () => {
  describe('positive cases', () => {
    it('GAME with high confidence → eligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'GAME', confidence: 0.9 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
      expect(decision.reason).toContain('GAME');
    });

    it('DLC → eligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'DLC', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
    });

    it('EXPANSION → eligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'EXPANSION', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
    });

    it('GAME with FOUND_PARTIAL → eligible with warning', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'GAME', confidence: 0.8 }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'test-123',
            candidate: makeCandidate({
              titles: [{ value: 'Test Game', type: 'primary' }],
              developers: [],
              publishers: [],
              genres: [],
              releases: [],
              description: null,
            }),
            classification: makeClassification(),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(
        decision.warnings.some((w) => w.includes('Completeness') || w.includes('FOUND_PARTIAL')),
      ).toBe(true);
    });
  });

  describe('negative cases — ineligible categories', () => {
    it('PERSON → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'PERSON', confidence: 0.8 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('FRANCHISE → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'FRANCHISE', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('BOOK → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'BOOK', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('SOUNDTRACK → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'SOUNDTRACK', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('MOVIE → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'MOVIE', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('TV_SHOW → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'TV_SHOW', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('ANIME → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'ANIME', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('HARDWARE → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'HARDWARE', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('CHARACTER → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'CHARACTER', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('EVENT → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'EVENT', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('PROMOTIONAL → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'PROMOTIONAL', confidence: 0.7 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });
  });

  describe('uncertainty — UNKNOWN classification', () => {
    it('UNKNOWN + strong identity + multiple sources → eligible with warning', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'UNKNOWN', confidence: 0.5 }),
        identityResolution: makeIdentity({ confidence: 0.8 }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'test-1',
            candidate: makeCandidate(),
            classification: makeClassification({ category: 'UNKNOWN' }),
            retrievedAt: new Date().toISOString(),
          },
          {
            source: 'steam',
            sourceId: 'test-2',
            candidate: makeCandidate(),
            classification: makeClassification({ category: 'UNKNOWN' }),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
      expect(decision.warnings.some((w) => w.includes('UNKNOWN'))).toBe(true);
    });

    it('UNKNOWN + weak evidence → deferred', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'UNKNOWN', confidence: 0.3 }),
        identityResolution: makeIdentity({ confidence: 0.4 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.DEFERRED);
    });

    it('UNKNOWN + strong identity + multiple sources but low classification confidence → eligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'UNKNOWN', confidence: 0.1 }),
        identityResolution: makeIdentity({ confidence: 0.8 }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'test-1',
            candidate: makeCandidate(),
            classification: makeClassification({ category: 'UNKNOWN' }),
            retrievedAt: new Date().toISOString(),
          },
          {
            source: 'steam',
            sourceId: 'test-2',
            candidate: makeCandidate(),
            classification: makeClassification({ category: 'UNKNOWN' }),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
    });

    it('UNKNOWN + strong identity but single source → deferred', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'UNKNOWN', confidence: 0.5 }),
        identityResolution: makeIdentity({ confidence: 0.8 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.DEFERRED);
    });
  });

  describe('quality checks', () => {
    it('missing title → deferred', () => {
      const group = makeGroup({
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'test-123',
            candidate: makeCandidate({ titles: [] }),
            classification: makeClassification(),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.DEFERRED);
    });

    it('empty title → deferred', () => {
      const group = makeGroup({
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'test-123',
            candidate: makeCandidate({ titles: [{ value: '   ', type: 'primary' }] }),
            classification: makeClassification(),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.DEFERRED);
    });

    it('no observations → ineligible', () => {
      const group = makeGroup({ observations: [] });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('low classification confidence for GAME → ineligible', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'GAME', confidence: 0.2 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });

    it('low identity confidence for GAME → eligible with warning', () => {
      const group = makeGroup({
        mergedClassification: makeClassification({ category: 'GAME', confidence: 0.8 }),
        identityResolution: makeIdentity({ confidence: 0.3 }),
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.warnings.some((w) => w.includes('identity confidence'))).toBe(true);
    });
  });

  describe('signal completeness', () => {
    it('includes all required signals', () => {
      const group = makeGroup();
      const decision = catalogEligibility(group);

      expect(decision.signals).toBeDefined();
      expect(decision.signals.classification).toBe('GAME');
      expect(typeof decision.signals.classificationConfidence).toBe('number');
      expect(typeof decision.signals.identityConfidence).toBe('number');
      expect(typeof decision.signals.sourceCount).toBe('number');
      expect(typeof decision.signals.observationCount).toBe('number');
    });
  });
});
