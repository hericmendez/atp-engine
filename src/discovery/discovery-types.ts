import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { ClassificationResult } from '../classification/classification-result.js';
import type { IdentityResolutionResult } from '../identity/identity-resolution-result.js';

export interface DiscoveryRequest {
  readonly query: string;
  readonly sourceFilter?: readonly string[];
  readonly limit?: number;
  readonly offset?: number;
}

export interface DiscoverySourceObservation {
  readonly source: string;
  readonly sourceId: string;
  readonly candidate: NormalizedCandidate;
  readonly classification: ClassificationResult;
  readonly retrievedAt: string;
}

export interface DiscoveryGroupResult {
  readonly groupId: string;
  readonly observations: readonly DiscoverySourceObservation[];
  readonly mergedClassification: ClassificationResult;
  readonly identityResolution: IdentityResolutionResult;
  readonly rankingScore: number;
  readonly rankingBreakdown: RankingBreakdown;
}

export interface RankingBreakdown {
  readonly identityConfidence: number;
  readonly classificationConfidence: number;
  readonly sourceCount: number;
  readonly metadataCompleteness: number;
  readonly titleRelevance: number;
}

export interface DiscoveryResult {
  readonly query: string;
  readonly groups: readonly DiscoveryGroupResult[];
  readonly totalGroups: number;
  readonly sourceErrors: readonly DiscoverySourceError[];
  readonly hasMore: boolean;
}

export interface DiscoverySourceError {
  readonly source: string;
  readonly errorType: string;
  readonly message: string;
  readonly retryable: boolean;
}
