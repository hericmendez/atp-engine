import { describe, it, expect } from 'vitest';
import { assetEligibility } from '../../src/eligibility/asset-eligibility.js';
import type { CoverCandidate } from '../../src/domain/cover/cover-candidate.js';
import { CoverType, CoverSearchType } from '../../src/domain/cover/cover-candidate.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeCandidate(overrides?: Partial<CoverCandidate>): CoverCandidate {
  return {
    url: 'https://example.com/cover.jpg',
    source: 'wikipedia',
    sourceId: 'test-123',
    title: 'Test Game',
    width: null,
    height: null,
    type: CoverType.UNKNOWN,
    evidence: {
      source: 'wikipedia',
      sourceId: 'test-123',
      retrievedAt: new Date(),
    },
    ...overrides,
  };
}

function makeGame(overrides?: Partial<Game>): Game {
  return {
    id: createGameId('test-game-1'),
    titles: [createGameTitle('Test Game', 'primary')],
    releases: [],
    developers: [],
    publishers: [],
    genres: [],
    externalIdentifiers: [
      createExternalIdentifier('wikipedia', 'Test_Game'),
      createExternalIdentifier('steam', '12345'),
    ],
    relationships: [],
    evidence: [],
    classification: 'GAME',
    completeness: 'FOUND_COMPLETE',
    cover: null,
    lastEnrichedAt: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('asset-eligibility', () => {
  describe('entity association — with canonical game', () => {
    it('sourceId matches game external ID → eligible', () => {
      const candidate = makeCandidate({ source: 'wikipedia', sourceId: 'Test_Game' });
      const game = makeGame();

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
      expect(decision.confidence).toBe(1.0);
    });

    it('sourceId does NOT match game external ID → reject entity_mismatch', () => {
      const candidate = makeCandidate({ source: 'wikipedia', sourceId: 'Zelda_(name)' });
      const game = makeGame({
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'The_Legend_of_Zelda')],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('entity_mismatch');
    });

    it('different source — IDs not comparable → eligible with warning (unverifiable)', () => {
      const candidate = makeCandidate({ source: 'igdb', sourceId: 'igdb-456' });
      const game = makeGame({
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'Test_Game')],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
      expect(decision.confidence).toBe(0.4);
      expect(decision.warnings.some((w) => w.includes('no external identifier'))).toBe(true);
      expect(decision.blockingReasons).not.toContain('entity_mismatch');
    });

    it('game has this source but different ID → reject entity_mismatch', () => {
      const candidate = makeCandidate({ source: 'steam', sourceId: '99999' });
      const game = makeGame({
        externalIdentifiers: [createExternalIdentifier('steam', '12345')],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('entity_mismatch');
    });
  });

  describe('entity association — without canonical game (query-based)', () => {
    it('game === null → does not invent association, accepts with warning', () => {
      const candidate = makeCandidate({
        source: 'wikipedia',
        sourceId: 'Zelda_(name)',
        title: 'Zelda Fitzgerald',
      });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
      expect(decision.confidence).toBe(0.5);
      expect(decision.reason).toContain('canonical game');
      expect(decision.blockingReasons).toHaveLength(0);
      expect(decision.warnings.some((w) => w.includes('entity association'))).toBe(true);
      expect(decision.blockingReasons).not.toContain('entity_mismatch');
    });
  });

  describe('type appropriateness', () => {
    it('COVER search + FRONT_COVER → eligible', () => {
      const candidate = makeCandidate({ type: CoverType.FRONT_COVER });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
    });

    it('COVER search + BOX_ART → eligible', () => {
      const candidate = makeCandidate({ type: CoverType.BOX_ART });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
    });

    it('COVER search + POSTER → eligible', () => {
      const candidate = makeCandidate({ type: CoverType.POSTER });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
    });

    it('COVER search + KEY_ART → eligible', () => {
      const candidate = makeCandidate({ type: CoverType.KEY_ART });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(true);
    });

    it('COVER search + LOGO → reject type_mismatch', () => {
      const candidate = makeCandidate({ type: CoverType.LOGO });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('type_mismatch');
    });

    it('COVER search + SCREENSHOT → reject type_mismatch', () => {
      const candidate = makeCandidate({ type: CoverType.SCREENSHOT });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('type_mismatch');
    });

    it('LOGO search + LOGO → eligible', () => {
      const candidate = makeCandidate({ type: CoverType.LOGO });

      const decision = assetEligibility(candidate, null, CoverSearchType.LOGO);

      expect(decision.eligible).toBe(true);
    });

    it('LOGO search + FRONT_COVER → reject type_mismatch', () => {
      const candidate = makeCandidate({ type: CoverType.FRONT_COVER });

      const decision = assetEligibility(candidate, null, CoverSearchType.LOGO);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('type_mismatch');
    });

    it('ALL search + any type → eligible', () => {
      const types = [
        CoverType.FRONT_COVER,
        CoverType.BOX_ART,
        CoverType.POSTER,
        CoverType.KEY_ART,
        CoverType.SCREENSHOT,
        CoverType.LOGO,
        CoverType.UNKNOWN,
      ];

      for (const type of types) {
        const candidate = makeCandidate({ type });
        const decision = assetEligibility(candidate, null, CoverSearchType.ALL);
        expect(decision.eligible).toBe(true);
      }
    });
  });

  describe('missing metadata', () => {
    it('no source → reject', () => {
      const candidate = makeCandidate({ source: '' });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('missing_source');
    });

    it('no sourceId → reject', () => {
      const candidate = makeCandidate({ sourceId: '' });

      const decision = assetEligibility(candidate, null, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('missing_source_id');
    });
  });

  describe('Zelda Fitzgerald regression', () => {
    it('asset from "Zelda_(name)" should NOT represent "The_Legend_of_Zelda"', () => {
      const candidate = makeCandidate({
        source: 'wikipedia',
        sourceId: 'Zelda_(name)',
        title: 'Zelda Fitzgerald',
        url: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Zelda_Fitzgerald_1920.jpg',
      });

      const game = makeGame({
        titles: [createGameTitle('The Legend of Zelda', 'primary')],
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'The_Legend_of_Zelda')],
      });

      const decision = assetEligibility(candidate, game, CoverSearchType.COVER);

      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain('entity_mismatch');
    });
  });

  describe('William Pellen regression', () => {
    it('asset from "William_Pellen" should NOT represent "Hollow_Knight"', () => {
      const candidate = makeCandidate({
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
});
