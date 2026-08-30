import { describe, it, expect } from 'vitest';
import { rankCandidate, rankCandidates } from '../../src/cover/cover-rank.js';
import { CoverType } from '../../src/domain/cover/cover-candidate.js';

function makeCandidate(overrides: {
  url?: string;
  source?: string;
  sourceId?: string;
  type?: CoverType;
  width?: number | null;
  height?: number | null;
  title?: string;
}) {
  return {
    url: overrides.url ?? 'https://example.com/cover.jpg',
    source: overrides.source ?? 'wikipedia',
    sourceId: overrides.sourceId ?? 'test-id',
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    type: overrides.type ?? CoverType.UNKNOWN,
    evidence: {
      source: overrides.source ?? 'wikipedia',
      sourceId: overrides.sourceId ?? 'test-id',
      retrievedAt: new Date(),
    },
  };
}

describe('cover-rank', () => {
  describe('rankCandidate', () => {
    it('returns a ranking breakdown for a candidate', () => {
      const candidate = makeCandidate({});
      const ranked = rankCandidate(candidate);

      expect(ranked.candidate).toBe(candidate);
      expect(ranked.ranking).toBeDefined();
      expect(typeof ranked.ranking.totalScore).toBe('number');
      expect(typeof ranked.ranking.sourceScore).toBe('number');
      expect(typeof ranked.ranking.typeScore).toBe('number');
      expect(typeof ranked.ranking.qualityScore).toBe('number');
      expect(typeof ranked.ranking.aspectRatioScore).toBe('number');
    });

    it('scores steam source higher than unknown source', () => {
      const steam = rankCandidate(makeCandidate({ source: 'steam' }));
      const unknown = rankCandidate(makeCandidate({ source: 'other' }));

      expect(steam.ranking.sourceScore).toBeGreaterThan(unknown.ranking.sourceScore);
    });

    it('scores front_cover type highest', () => {
      const frontCover = rankCandidate(makeCandidate({ type: CoverType.FRONT_COVER }));
      const screenshot = rankCandidate(makeCandidate({ type: CoverType.SCREENSHOT }));

      expect(frontCover.ranking.typeScore).toBeGreaterThan(screenshot.ranking.typeScore);
    });

    it('scores box_art slightly below front_cover', () => {
      const frontCover = rankCandidate(makeCandidate({ type: CoverType.FRONT_COVER }));
      const boxArt = rankCandidate(makeCandidate({ type: CoverType.BOX_ART }));

      expect(frontCover.ranking.typeScore).toBeGreaterThan(boxArt.ranking.typeScore);
    });

    it('scores high resolution higher than low resolution', () => {
      const highRes = rankCandidate(makeCandidate({ width: 800, height: 1200 }));
      const lowRes = rankCandidate(makeCandidate({ width: 100, height: 150 }));

      expect(highRes.ranking.qualityScore).toBeGreaterThan(lowRes.ranking.qualityScore);
    });

    it('gives neutral score when dimensions are null', () => {
      const ranked = rankCandidate(makeCandidate({ width: null, height: null }));
      expect(ranked.ranking.qualityScore).toBe(0.5);
    });

    it('scores ideal aspect ratio (2:3) highest', () => {
      const ideal = rankCandidate(makeCandidate({ width: 600, height: 900 }));
      const square = rankCandidate(makeCandidate({ width: 600, height: 600 }));

      expect(ideal.ranking.aspectRatioScore).toBeGreaterThanOrEqual(
        square.ranking.aspectRatioScore,
      );
    });

    it('totalScore is between 0 and 1', () => {
      const ranked = rankCandidate(makeCandidate({}));
      expect(ranked.ranking.totalScore).toBeGreaterThanOrEqual(0);
      expect(ranked.ranking.totalScore).toBeLessThanOrEqual(1);
    });

    it('has relevanceScore field', () => {
      const ranked = rankCandidate(makeCandidate({}));
      expect(typeof ranked.ranking.relevanceScore).toBe('number');
      expect(ranked.ranking.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(ranked.ranking.relevanceScore).toBeLessThanOrEqual(1);
    });

    it('totalScore matches weighted formula', () => {
      const ranked = rankCandidate(
        makeCandidate({
          source: 'steam',
          type: CoverType.FRONT_COVER,
          width: 800,
          height: 1200,
        }),
      );

      const expected =
        ranked.ranking.relevanceScore * 0.35 +
        ranked.ranking.sourceScore * 0.25 +
        ranked.ranking.typeScore * 0.25 +
        ranked.ranking.qualityScore * 0.08 +
        ranked.ranking.aspectRatioScore * 0.07;

      expect(ranked.ranking.totalScore).toBeCloseTo(expected, 10);
    });
  });

  describe('rankCandidates', () => {
    it('returns candidates sorted by totalScore descending', () => {
      const candidates = [
        makeCandidate({ source: 'other', type: CoverType.SCREENSHOT }),
        makeCandidate({ source: 'steam', type: CoverType.FRONT_COVER }),
        makeCandidate({ source: 'wikipedia', type: CoverType.UNKNOWN }),
      ];

      const ranked = rankCandidates(candidates);

      expect(ranked).toHaveLength(3);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].ranking.totalScore).toBeGreaterThanOrEqual(
          ranked[i].ranking.totalScore,
        );
      }
    });

    it('returns empty array for empty input', () => {
      expect(rankCandidates([])).toHaveLength(0);
    });

    it('returns single ranked candidate', () => {
      const ranked = rankCandidates([makeCandidate({})]);
      expect(ranked).toHaveLength(1);
    });

    it('preserves all candidates', () => {
      const candidates = Array.from({ length: 10 }, (_, i) =>
        makeCandidate({ url: `https://example.com/cover${i}.jpg`, sourceId: `id-${i}` }),
      );
      const ranked = rankCandidates(candidates);
      expect(ranked).toHaveLength(10);
    });

    it('deterministic: same input produces same output', () => {
      const candidates = [
        makeCandidate({ source: 'steam', type: CoverType.FRONT_COVER, width: 800, height: 1200 }),
        makeCandidate({ source: 'wikipedia', type: CoverType.UNKNOWN, width: 300, height: 450 }),
      ];

      const first = rankCandidates(candidates);
      const second = rankCandidates(candidates);

      expect(first.map((r) => r.ranking.totalScore)).toEqual(
        second.map((r) => r.ranking.totalScore),
      );
    });
  });

  describe('relevance scoring', () => {
    it('exact title match gets highest relevance', () => {
      const exact = rankCandidate(
        makeCandidate({ title: 'Doom Eternal', sourceId: 'Doom Eternal' }),
        'Doom Eternal',
      );
      const partial = rankCandidate(
        makeCandidate({ title: 'Doom', sourceId: 'Doom' }),
        'Doom Eternal',
      );

      expect(exact.ranking.relevanceScore).toBeGreaterThan(partial.ranking.relevanceScore);
    });

    it('title starting with query gets high relevance', () => {
      const startsWith = rankCandidate(
        makeCandidate({ title: 'Doom Eternal', sourceId: 'Doom Eternal' }),
        'Doom',
      );
      const noMatch = rankCandidate(
        makeCandidate({ title: 'Quake', sourceId: 'Quake' }),
        'Doom Eternal',
      );

      expect(startsWith.ranking.relevanceScore).toBeGreaterThan(noMatch.ranking.relevanceScore);
    });

    it('partial word match gets moderate relevance', () => {
      const wordMatch = rankCandidate(
        makeCandidate({ title: 'Doom 3: BFG Edition', sourceId: 'Doom 3: BFG Edition' }),
        'Doom Eternal',
      );
      const noMatch = rankCandidate(
        makeCandidate({ title: 'Halo', sourceId: 'Halo' }),
        'Doom Eternal',
      );

      expect(wordMatch.ranking.relevanceScore).toBeGreaterThan(noMatch.ranking.relevanceScore);
    });

    it('no match gets low relevance', () => {
      const noMatch = rankCandidate(
        makeCandidate({ title: 'Halo', sourceId: 'Halo' }),
        'Doom Eternal',
      );

      expect(noMatch.ranking.relevanceScore).toBeLessThanOrEqual(0.3);
    });

    it('relevance without query defaults to 0.5', () => {
      const ranked = rankCandidate(makeCandidate({}));
      expect(ranked.ranking.relevanceScore).toBe(0.5);
    });

    it('relevance supera quality when query matches', () => {
      const highResNoMatch = rankCandidate(
        makeCandidate({
          title: 'Halo',
          sourceId: 'Halo',
          width: 1200,
          height: 1800,
          type: CoverType.FRONT_COVER,
          source: 'steam',
        }),
        'Doom Eternal',
      );
      const lowResExactMatch = rankCandidate(
        makeCandidate({
          title: 'Doom Eternal',
          sourceId: 'Doom Eternal',
          width: 200,
          height: 300,
          type: CoverType.UNKNOWN,
          source: 'wikipedia',
        }),
        'Doom Eternal',
      );

      expect(lowResExactMatch.ranking.totalScore).toBeGreaterThan(
        highResNoMatch.ranking.totalScore,
      );
    });

    it('ranking with query is deterministic', () => {
      const candidates = [
        makeCandidate({ sourceId: 'Doom Eternal', title: 'Doom Eternal' }),
        makeCandidate({ sourceId: 'Halo', title: 'Halo' }),
        makeCandidate({ sourceId: 'Doom 3', title: 'Doom 3' }),
      ];

      const first = rankCandidates(candidates, 'Doom Eternal');
      const second = rankCandidates(candidates, 'Doom Eternal');

      expect(first.map((r) => r.ranking.totalScore)).toEqual(
        second.map((r) => r.ranking.totalScore),
      );
    });
  });
});
