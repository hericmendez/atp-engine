import type { CoverCandidate, RankedCoverCandidate } from '../domain/cover/cover-candidate.js';
import { CoverType } from '../domain/cover/cover-candidate.js';

const SOURCE_RELIABILITY: Record<string, number> = {
  steam: 0.9,
  wikipedia: 0.8,
};

const DEFAULT_SOURCE_SCORE = 0.5;

const TYPE_SCORES: Record<string, number> = {
  [CoverType.FRONT_COVER]: 1.0,
  [CoverType.BOX_ART]: 0.95,
  [CoverType.POSTER]: 0.85,
  [CoverType.KEY_ART]: 0.8,
  [CoverType.UNKNOWN]: 0.6,
  [CoverType.SCREENSHOT]: 0.3,
};

const IDEAL_ASPECT_RATIO = 2 / 3;
const ASPECT_RATIO_TOLERANCE = 0.4;

const WEIGHTS = {
  relevance: 0.35,
  source: 0.25,
  type: 0.25,
  quality: 0.08,
  aspectRatio: 0.07,
} as const;

function getSourceScore(source: string): number {
  return SOURCE_RELIABILITY[source.toLowerCase()] ?? DEFAULT_SOURCE_SCORE;
}

function getTypeScore(type: CoverType): number {
  return TYPE_SCORES[type] ?? TYPE_SCORES[CoverType.UNKNOWN];
}

function getQualityScore(width: number | null, height: number | null): number {
  if (width === null || height === null) {
    return 0.5;
  }

  const pixels = width * height;

  if (pixels >= 600 * 900) return 1.0;
  if (pixels >= 300 * 450) return 0.8;
  if (pixels >= 200 * 300) return 0.6;
  if (pixels >= 100 * 150) return 0.4;
  return 0.2;
}

function getAspectRatioScore(width: number | null, height: number | null): number {
  if (width === null || height === null || width === 0 || height === 0) {
    return 0.5;
  }

  const ratio = width / height;
  const deviation = Math.abs(ratio - IDEAL_ASPECT_RATIO);

  if (deviation <= ASPECT_RATIO_TOLERANCE * 0.3) return 1.0;
  if (deviation <= ASPECT_RATIO_TOLERANCE * 0.6) return 0.8;
  if (deviation <= ASPECT_RATIO_TOLERANCE) return 0.6;
  if (deviation <= ASPECT_RATIO_TOLERANCE * 1.5) return 0.4;
  return 0.2;
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeRelevanceScore(candidateTitle: string | undefined, query: string): number {
  if (!candidateTitle) {
    return 0.3;
  }

  const normalizedTitle = normalizeForComparison(candidateTitle);
  const normalizedQuery = normalizeForComparison(query);

  if (!normalizedQuery || !normalizedTitle) {
    return 0.3;
  }

  if (normalizedTitle === normalizedQuery) {
    return 1.0;
  }

  if (normalizedTitle.startsWith(normalizedQuery)) {
    return 0.9;
  }

  if (normalizedQuery.startsWith(normalizedTitle)) {
    return 0.85;
  }

  const queryWords = normalizedQuery.split(' ');
  const titleWords = normalizedTitle.split(' ');
  const matchingWords = queryWords.filter((w) =>
    titleWords.some((tw) => tw.includes(w) || w.includes(tw)),
  );

  if (matchingWords.length === queryWords.length) {
    return 0.8;
  }

  if (matchingWords.length > 0) {
    return 0.5 + (matchingWords.length / queryWords.length) * 0.2;
  }

  if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) {
    return 0.6;
  }

  return 0.3;
}

export function rankCandidate(candidate: CoverCandidate, query?: string): RankedCoverCandidate {
  const sourceScore = getSourceScore(candidate.source);
  const typeScore = getTypeScore(candidate.type);
  const qualityScore = getQualityScore(candidate.width, candidate.height);
  const aspectRatioScore = getAspectRatioScore(candidate.width, candidate.height);
  const relevanceScore = query ? computeRelevanceScore(candidate.evidence.sourceId, query) : 0.5;

  const totalScore =
    relevanceScore * WEIGHTS.relevance +
    sourceScore * WEIGHTS.source +
    typeScore * WEIGHTS.type +
    qualityScore * WEIGHTS.quality +
    aspectRatioScore * WEIGHTS.aspectRatio;

  return {
    candidate,
    ranking: {
      sourceScore,
      typeScore,
      qualityScore,
      aspectRatioScore,
      relevanceScore,
      totalScore,
    },
  };
}

export function rankCandidates(
  candidates: CoverCandidate[],
  query?: string,
): RankedCoverCandidate[] {
  const ranked = candidates.map((c) => rankCandidate(c, query));

  ranked.sort((a, b) => {
    const scoreDiff = b.ranking.totalScore - a.ranking.totalScore;
    if (Math.abs(scoreDiff) > 0.001) {
      return scoreDiff;
    }

    if (a.ranking.relevanceScore !== b.ranking.relevanceScore) {
      return b.ranking.relevanceScore - a.ranking.relevanceScore;
    }

    if (a.ranking.typeScore !== b.ranking.typeScore) {
      return b.ranking.typeScore - a.ranking.typeScore;
    }

    if (a.ranking.sourceScore !== b.ranking.sourceScore) {
      return b.ranking.sourceScore - a.ranking.sourceScore;
    }

    return a.candidate.url.localeCompare(b.candidate.url);
  });

  return ranked;
}
