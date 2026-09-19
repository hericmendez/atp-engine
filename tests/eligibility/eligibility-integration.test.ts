import { describe, it, expect } from 'vitest';
import {
  catalogEligibility,
  CatalogEligibilityStatus,
} from '../../src/eligibility/catalog-eligibility.js';
import { assetEligibility } from '../../src/eligibility/asset-eligibility.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { DiscoverySourceObservation } from '../../src/discovery/discovery-types.js';
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

function makeObservation(
  candidate: NormalizedCandidate,
  source = 'wikipedia',
): DiscoverySourceObservation {
  return {
    source,
    sourceId: candidate.provenance.sourceId,
    candidate,
    classification: { category: 'UNKNOWN', confidence: 0, signals: [], reason: '' },
    retrievedAt: new Date().toISOString(),
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('eligibility integration', () => {
  describe('classification → eligibility pipeline', () => {
    it('Wikipedia candidate with "video game" in description → GAME classification → eligible', async () => {
      const classifier = new DeterministicClassifier();

      const candidate = makeCandidate({
        titles: [{ value: 'Doom', type: 'primary' }],
        description: 'Doom is a video game developed by id Software',
        genres: [{ name: 'first-person shooter' }],
      });

      const classification = await classifier.classify(candidate);

      expect(classification.category).toBe('GAME');
      expect(classification.confidence).toBeGreaterThan(0.3);

      const obs = makeObservation(candidate);
      obs.classification = classification;

      const group = {
        groupId: 'group-doom',
        observations: [obs],
        mergedClassification: classification,
        identityResolution: {
          outcome: 'SAME_GAME' as const,
          relationship: null,
          confidence: 0.9,
          signals: [],
          reason: '',
          method: 'NATIVE' as const,
        },
        rankingScore: 0.8,
        rankingBreakdown: {
          identityConfidence: 0.9,
          classificationConfidence: classification.confidence,
          sourceCount: 1,
          metadataCompleteness: 0.5,
          titleRelevance: 0.8,
        },
      };

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(true);
      expect(decision.status).toBe(CatalogEligibilityStatus.ELIGIBLE);
    });

    it('non-game entity classified as PERSON → ineligible — does not cross persistence boundary', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Zelda Fitzgerald', type: 'primary' }],
        description: 'Zelda Fitzgerald was an American socialite and writer',
      });

      const personClassification = {
        category: 'PERSON' as const,
        confidence: 0.85,
        signals: [],
        reason: 'Fixture: explicit PERSON classification',
      };

      const obs = makeObservation(candidate);
      obs.classification = personClassification;

      const group = {
        groupId: 'group-zelda',
        observations: [obs],
        mergedClassification: personClassification,
        identityResolution: {
          outcome: 'SAME_GAME' as const,
          relationship: null,
          confidence: 0.8,
          signals: [],
          reason: '',
          method: 'NATIVE' as const,
        },
        rankingScore: 0.7,
        rankingBreakdown: {
          identityConfidence: 0.8,
          classificationConfidence: personClassification.confidence,
          sourceCount: 1,
          metadataCompleteness: 0.3,
          titleRelevance: 0.6,
        },
      };

      const decision = catalogEligibility(group);

      expect(decision.eligible).toBe(false);
      expect(decision.status).toBe(CatalogEligibilityStatus.INELIGIBLE);
      expect(decision.signals.classification).toBe('PERSON');
    });
  });

  describe('asset eligibility with game context', () => {
    it('asset from same source entity as game → eligible', () => {
      const candidate = {
        url: 'https://example.com/cover.jpg',
        source: 'steam',
        sourceId: '379720',
        title: 'The Witcher 3',
        width: 460,
        height: 215,
        type: CoverType.FRONT_COVER,
        evidence: { source: 'steam', sourceId: '379720', retrievedAt: new Date() },
      };

      const game: Game = {
        id: createGameId('test'),
        titles: [createGameTitle('The Witcher 3: Wild Hunt', 'primary')],
        releases: [],
        developers: [],
        publishers: [],
        genres: [],
        externalIdentifiers: [createExternalIdentifier('steam', '379720')],
        relationships: [],
        evidence: [],
        classification: 'GAME',
        completeness: 'FOUND_COMPLETE',
        cover: null,
        lastEnrichedAt: null,
      };

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
      expect(decision.confidence).toBe(1.0);
    });

    it('asset from different source entity → rejected', () => {
      const candidate = {
        url: 'https://example.com/wrong.jpg',
        source: 'wikipedia',
        sourceId: 'Zelda_(name)',
        title: 'Zelda Fitzgerald',
        width: null,
        height: null,
        type: CoverType.UNKNOWN,
        evidence: { source: 'wikipedia', sourceId: 'Zelda_(name)', retrievedAt: new Date() },
      };

      const game: Game = {
        id: createGameId('test'),
        titles: [createGameTitle('The Legend of Zelda', 'primary')],
        releases: [],
        developers: [],
        publishers: [],
        genres: [],
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'The_Legend_of_Zelda')],
        relationships: [],
        evidence: [],
        classification: 'GAME',
        completeness: 'FOUND_COMPLETE',
        cover: null,
        lastEnrichedAt: null,
      };

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('entity_mismatch');
    });
  });

  describe('eligibility does not affect existing games', () => {
    it('existing game enrichment is not affected by eligibility', () => {
      // This is a conceptual test — existing games are enriched without
      // re-evaluating eligibility. The eligibility gate only applies to
      // new entities entering the catalog through discovery.

      const game: Game = {
        id: createGameId('existing'),
        titles: [createGameTitle('Existing Game', 'primary')],
        releases: [],
        developers: [],
        publishers: [],
        genres: [],
        externalIdentifiers: [],
        relationships: [],
        evidence: [],
        classification: 'GAME',
        completeness: 'FOUND_PARTIAL',
        cover: null,
        lastEnrichedAt: null,
      };

      // The game already exists, so eligibility is not re-evaluated.
      // This test documents that design decision.
      expect(game.classification).toBe('GAME');
      expect(game.completeness).toBe('FOUND_PARTIAL');
    });
  });
});
