import { describe, it, expect } from 'vitest';
import {
  catalogEligibility,
  CatalogEligibilityStatus,
} from '../../src/eligibility/catalog-eligibility.js';
import { assetEligibility } from '../../src/eligibility/asset-eligibility.js';
import type { DiscoveryGroupResult } from '../../src/discovery/discovery-types.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { ClassificationResult } from '../../src/classification/classification-result.js';
import type { IdentityResolutionResult } from '../../src/identity/identity-resolution-result.js';
import type { CoverCandidate } from '../../src/domain/cover/cover-candidate.js';
import { CoverType, CoverSearchType } from '../../src/domain/cover/cover-candidate.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeCandidate(overrides?: Partial<NormalizedCandidate>): NormalizedCandidate {
  return {
    titles: [{ value: 'Test', type: 'primary' }],
    developers: [],
    publishers: [],
    genres: [],
    releases: [],
    externalIdentifiers: [],
    provenance: {
      source: 'wikipedia',
      sourceId: 'test',
      retrievedAt: new Date().toISOString(),
      rawTitle: 'Test',
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
    reason: '',
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<IdentityResolutionResult>): IdentityResolutionResult {
  return {
    outcome: 'SAME_GAME',
    relationship: null,
    confidence: 0.9,
    signals: [],
    reason: '',
    method: 'NATIVE',
    ...overrides,
  };
}

function makeGroup(overrides?: Partial<DiscoveryGroupResult>): DiscoveryGroupResult {
  return {
    groupId: 'group-test',
    observations: [
      {
        source: 'wikipedia',
        sourceId: 'test',
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

function makeCoverCandidate(overrides?: Partial<CoverCandidate>): CoverCandidate {
  return {
    url: 'https://example.com/cover.jpg',
    source: 'wikipedia',
    sourceId: 'test',
    title: null,
    width: null,
    height: null,
    type: CoverType.UNKNOWN,
    evidence: {
      source: 'wikipedia',
      sourceId: 'test',
      retrievedAt: new Date(),
    },
    ...overrides,
  };
}

function makeGame(overrides?: Partial<Game>): Game {
  return {
    id: createGameId('test'),
    titles: [createGameTitle('Test', 'primary')],
    releases: [],
    developers: [],
    publishers: [],
    genres: [],
    externalIdentifiers: [],
    relationships: [],
    evidence: [],
    classification: 'GAME',
    completeness: 'FOUND_COMPLETE',
    cover: null,
    lastEnrichedAt: null,
    ...overrides,
  };
}

// ─── Catalog Eligibility Regressions ─────────────────────────

describe('catalog eligibility regressions', () => {
  describe('Zelda Fitzgerald → PERSON → not eligible', () => {
    it('Wikipedia page for Zelda Fitzgerald should be rejected', () => {
      const group = makeGroup({
        groupId: 'group-zelda-fitzgerald',
        mergedClassification: makeClassification({
          category: 'PERSON',
          confidence: 0.85,
        }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'Zelda_Fitzgerald',
            candidate: makeCandidate({
              titles: [{ value: 'Zelda Fitzgerald', type: 'primary' }],
              description: 'American socialite and writer',
            }),
            classification: makeClassification({ category: 'PERSON', confidence: 0.85 }),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });
  });

  describe('William Pellen → PERSON → not eligible', () => {
    it('Wikipedia page for William Pellen should be rejected', () => {
      const group = makeGroup({
        groupId: 'group-william-pellen',
        mergedClassification: makeClassification({
          category: 'PERSON',
          confidence: 0.8,
        }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'William_Pellen',
            candidate: makeCandidate({
              titles: [{ value: 'William Pellen', type: 'primary' }],
              description: 'Australian video game developer',
            }),
            classification: makeClassification({ category: 'PERSON', confidence: 0.8 }),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });
  });

  describe('Nintendo Switch → HARDWARE → not eligible', () => {
    it('Wikipedia page for Nintendo Switch should be rejected', () => {
      const group = makeGroup({
        groupId: 'group-nintendo-switch',
        mergedClassification: makeClassification({
          category: 'HARDWARE',
          confidence: 0.9,
        }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'Nintendo_Switch',
            candidate: makeCandidate({
              titles: [{ value: 'Nintendo Switch', type: 'primary' }],
              description: 'Video game console developed by Nintendo',
            }),
            classification: makeClassification({ category: 'HARDWARE', confidence: 0.9 }),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
    });
  });

  describe('The Legend of Zelda → GAME → eligible', () => {
    it('Wikipedia page for The Legend of Zelda should be accepted', () => {
      const group = makeGroup({
        groupId: 'group-legend-of-zelda',
        mergedClassification: makeClassification({
          category: 'GAME',
          confidence: 0.9,
        }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'The_Legend_of_Zelda',
            candidate: makeCandidate({
              titles: [{ value: 'The Legend of Zelda', type: 'primary' }],
              description: 'Video game developed by Nintendo',
            }),
            classification: makeClassification({ category: 'GAME', confidence: 0.9 }),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
    });
  });

  describe('Doom → GAME → eligible', () => {
    it('Wikipedia page for Doom should be accepted', () => {
      const group = makeGroup({
        groupId: 'group-doom',
        mergedClassification: makeClassification({
          category: 'GAME',
          confidence: 0.95,
        }),
        identityResolution: makeIdentity({ confidence: 0.95 }),
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'Doom_(1993_video_game)',
            candidate: makeCandidate({
              titles: [{ value: 'Doom', type: 'primary' }],
              description: '1993 first-person shooter video game',
            }),
            classification: makeClassification({ category: 'GAME', confidence: 0.95 }),
            retrievedAt: new Date().toISOString(),
          },
          {
            source: 'steam',
            sourceId: '228980',
            candidate: makeCandidate({
              titles: [{ value: 'Doom', type: 'primary' }],
            }),
            classification: makeClassification({ category: 'GAME', confidence: 0.95 }),
            retrievedAt: new Date().toISOString(),
          },
        ],
      });

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
    });
  });
});

// ─── Asset Eligibility Regressions ───────────────────────────

describe('asset eligibility regressions', () => {
  describe('Zelda Fitzgerald image → should NOT represent The Legend of Zelda', () => {
    it('asset from Zelda_(name) should be rejected for The_Legend_of_Zelda game', () => {
      const candidate = makeCoverCandidate({
        source: 'wikipedia',
        sourceId: 'Zelda_(name)',
        title: 'Zelda Fitzgerald',
        url: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Zelda_Fitzgerald_1920.jpg',
      });

      const game = makeGame({
        titles: [createGameTitle('The Legend of Zelda', 'primary')],
        externalIdentifiers: [
          createExternalIdentifier('wikipedia', 'The_Legend_of_Zelda'),
          createExternalIdentifier('nintendo', 'legend-of-zelda'),
        ],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('entity_mismatch');
    });
  });

  describe('William Pellen image → should NOT represent Hollow Knight', () => {
    it('asset from William_Pellen should be rejected for Hollow_Knight game', () => {
      const candidate = makeCoverCandidate({
        source: 'wikipedia',
        sourceId: 'William_Pellen',
        title: 'William Pellen',
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/William_Pellen_2024.jpg',
      });

      const game = makeGame({
        titles: [createGameTitle('Hollow Knight', 'primary')],
        externalIdentifiers: [
          createExternalIdentifier('wikipedia', 'Hollow_Knight'),
          createExternalIdentifier('steam', '367520'),
        ],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('entity_mismatch');
    });
  });

  describe('correct game asset → should be accepted', () => {
    it('asset from correct Wikipedia page should be accepted', () => {
      const candidate = makeCoverCandidate({
        source: 'wikipedia',
        sourceId: 'The_Legend_of_Zelda',
        title: 'The Legend of Zelda',
        url: 'https://upload.wikimedia.org/wikipedia/en/c/c6/The_Legend_of_Zelda.jpg',
      });

      const game = makeGame({
        titles: [createGameTitle('The Legend of Zelda', 'primary')],
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'The_Legend_of_Zelda')],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
    });

    it('asset from correct Steam ID should be accepted', () => {
      const candidate = makeCoverCandidate({
        source: 'steam',
        sourceId: '379720',
        url: 'https://cdn.akamai.steamstatic.com/steam/apps/379720/header.jpg',
        type: CoverType.FRONT_COVER,
      });

      const game = makeGame({
        titles: [createGameTitle('The Witcher 3: Wild Hunt', 'primary')],
        externalIdentifiers: [createExternalIdentifier('steam', '379720')],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
    });
  });

  describe('type mismatches', () => {
    it('logo should be rejected for cover search', () => {
      const candidate = makeCoverCandidate({ type: CoverType.LOGO });
      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);
      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('type_mismatch');
    });

    it('screenshot should be rejected for cover search', () => {
      const candidate = makeCoverCandidate({ type: CoverType.SCREENSHOT });
      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);
      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('type_mismatch');
    });

    it('front_cover should be accepted for cover search', () => {
      const candidate = makeCoverCandidate({ type: CoverType.FRONT_COVER });
      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);
      expect(decision.eligible).toBe(true);
    });
  });
});
