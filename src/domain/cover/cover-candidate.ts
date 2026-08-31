export const CoverType = {
  FRONT_COVER: 'front_cover',
  BOX_ART: 'box_art',
  POSTER: 'poster',
  KEY_ART: 'key_art',
  SCREENSHOT: 'screenshot',
  LOGO: 'logo',
  UNKNOWN: 'unknown',
} as const;

export type CoverType = (typeof CoverType)[keyof typeof CoverType];

export interface CoverEvidence {
  readonly source: string;
  readonly sourceId: string;
  readonly retrievedAt: Date;
}

export function createCoverEvidence(source: string, sourceId: string): CoverEvidence {
  if (!source || source.trim().length === 0) {
    throw new Error('CoverEvidence source must not be empty');
  }
  if (!sourceId || sourceId.trim().length === 0) {
    throw new Error('CoverEvidence sourceId must not be empty');
  }
  return {
    source: source.trim(),
    sourceId: sourceId.trim(),
    retrievedAt: new Date(),
  };
}

export interface CoverCandidate {
  readonly url: string;
  readonly source: string;
  readonly sourceId: string;
  readonly title: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly type: CoverType;
  readonly evidence: CoverEvidence;
}

export interface CoverCandidateInput {
  readonly url: string;
  readonly source: string;
  readonly sourceId: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly type?: CoverType;
}

export function createCoverCandidate(input: CoverCandidateInput): CoverCandidate {
  if (!input.url || input.url.trim().length === 0) {
    throw new Error('CoverCandidate url must not be empty');
  }
  if (!input.source || input.source.trim().length === 0) {
    throw new Error('CoverCandidate source must not be empty');
  }
  if (!input.sourceId || input.sourceId.trim().length === 0) {
    throw new Error('CoverCandidate sourceId must not be empty');
  }

  return {
    url: input.url.trim(),
    source: input.source.trim(),
    sourceId: input.sourceId.trim(),
    title: input.title?.trim() ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    type: input.type ?? CoverType.UNKNOWN,
    evidence: createCoverEvidence(input.source, input.sourceId),
  };
}

export function coverCandidateEquals(a: CoverCandidate, b: CoverCandidate): boolean {
  return a.url === b.url && a.source === b.source;
}

export interface Cover {
  readonly url: string;
  readonly source: string;
  readonly sourceId: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly type: CoverType;
}

export function coverFromCandidate(candidate: CoverCandidate): Cover {
  return {
    url: candidate.url,
    source: candidate.source,
    sourceId: candidate.sourceId,
    width: candidate.width,
    height: candidate.height,
    type: candidate.type,
  };
}

export interface CoverRankingBreakdown {
  readonly sourceScore: number;
  readonly typeScore: number;
  readonly qualityScore: number;
  readonly aspectRatioScore: number;
  readonly relevanceScore: number;
  readonly totalScore: number;
}

export interface RankedCoverCandidate {
  readonly candidate: CoverCandidate;
  readonly ranking: CoverRankingBreakdown;
}

export interface CoverSourceError {
  readonly source: string;
  readonly errorType: string;
  readonly message: string;
  readonly retryable: boolean;
}

export const CoverSearchType = {
  COVER: 'cover',
  LOGO: 'logo',
  ALL: 'all',
} as const;

export type CoverSearchType = (typeof CoverSearchType)[keyof typeof CoverSearchType];

export interface CoverResult {
  readonly query: string;
  readonly gameId: string | null;
  readonly type: CoverSearchType;
  readonly limit: number;
  readonly selected: Cover | null;
  readonly candidates: readonly RankedCoverCandidate[];
  readonly errors: readonly CoverSourceError[];
}
