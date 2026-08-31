import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { ClassificationResult } from '../classification/classification-result.js';
import type {
  DiscoverySourceObservation,
  DiscoveryGroupResult,
  RankingBreakdown,
} from './discovery-types.js';
import type { IdentityResolver } from '../identity/identity-resolver.js';
import type { IdentityResolutionResult } from '../identity/identity-resolution-result.js';
import type { IdentityOutcome } from '../domain/shared/identity-outcome.js';
import type { Game } from '../domain/game/game.js';
import type { GameId } from '../domain/shared/ids.js';

function generateGroupId(observations: readonly DiscoverySourceObservation[]): string {
  const sourceKey = observations
    .map((o) => `${o.source}:${o.sourceId}`)
    .sort()
    .join('|');
  let hash = 0;
  for (let i = 0; i < sourceKey.length; i++) {
    const char = sourceKey.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `group-${Math.abs(hash).toString(36)}`;
}

class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
  }
}

function preGroupByExternalId(observations: readonly DiscoverySourceObservation[]): number[][] {
  const uf = new UnionFind(observations.length);
  const idIndex = new Map<string, number>();

  for (let i = 0; i < observations.length; i++) {
    for (const ext of observations[i].candidate.externalIdentifiers) {
      const key = `${ext.source}:${ext.id}`;
      const existing = idIndex.get(key);
      if (existing !== undefined) {
        uf.union(existing, i);
      } else {
        idIndex.set(key, i);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < observations.length; i++) {
    const root = uf.find(i);
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(i);
  }

  return [...groups.values()];
}

function calculateMetadataCompleteness(candidate: NormalizedCandidate): number {
  let score = 0;
  let total = 0;

  total += 1;
  if (candidate.titles.length > 0) score += 1;

  total += 1;
  if (candidate.developers.length > 0) score += 1;

  total += 1;
  if (candidate.publishers.length > 0) score += 1;

  total += 1;
  if (candidate.genres.length > 0) score += 1;

  total += 1;
  if (candidate.releases.length > 0) {
    const hasDate = candidate.releases.some((r) => r.releaseDate !== null);
    if (hasDate) score += 1;
  }

  total += 1;
  if (candidate.description !== null && candidate.description.length > 0) score += 1;

  total += 1;
  if (candidate.externalIdentifiers.length > 0) score += 1;

  return total > 0 ? score / total : 0;
}

function calculateTitleRelevance(candidate: NormalizedCandidate, query: string): number {
  const normalizedQuery = query.toLowerCase().trim();
  if (normalizedQuery.length === 0) return 0;

  for (const title of candidate.titles) {
    const normalizedTitle = title.value.toLowerCase().trim();
    if (normalizedTitle === normalizedQuery) return 1.0;
    if (normalizedTitle.includes(normalizedQuery)) return 0.8;
    if (normalizedQuery.includes(normalizedTitle)) return 0.6;
  }

  const queryWords = normalizedQuery.split(/\s+/);
  for (const title of candidate.titles) {
    const normalizedTitle = title.value.toLowerCase().trim();
    const matchingWords = queryWords.filter((w) => normalizedTitle.includes(w));
    if (matchingWords.length > 0) {
      return 0.2 * (matchingWords.length / queryWords.length);
    }
  }

  return 0;
}

function calculateRankingScore(
  observations: readonly DiscoverySourceObservation[],
  identityResolution: IdentityResolutionResult,
  mergedClassification: ClassificationResult,
  query: string,
): { readonly score: number; readonly breakdown: RankingBreakdown } {
  const identityConfidence = identityResolution.confidence;
  const classificationConfidence = mergedClassification.confidence;
  const sourceCount = observations.length;

  let totalCompleteness = 0;
  let totalTitleRelevance = 0;
  for (const obs of observations) {
    totalCompleteness += calculateMetadataCompleteness(obs.candidate);
    totalTitleRelevance += calculateTitleRelevance(obs.candidate, query);
  }
  const metadataCompleteness = totalCompleteness / observations.length;
  const titleRelevance = totalTitleRelevance / observations.length;

  const score =
    identityConfidence * 0.3 +
    classificationConfidence * 0.2 +
    Math.min(sourceCount / 3, 1) * 0.2 +
    metadataCompleteness * 0.15 +
    titleRelevance * 0.15;

  return {
    score,
    breakdown: {
      identityConfidence,
      classificationConfidence,
      sourceCount,
      metadataCompleteness,
      titleRelevance,
    },
  };
}

async function areSameGame(
  obsA: DiscoverySourceObservation,
  obsB: DiscoverySourceObservation,
  resolver: IdentityResolver,
): Promise<boolean> {
  const fakeGame: Game = {
    id: 'temp' as GameId,
    titles: obsA.candidate.titles.map((t) => ({ value: t.value, type: t.type })),
    releases: [],
    developers: obsA.candidate.developers,
    publishers: obsA.candidate.publishers,
    genres: obsA.candidate.genres,
    externalIdentifiers: obsA.candidate.externalIdentifiers,
    relationships: [],
    evidence: [],
    classification: 'UNKNOWN',
    completeness: 'FOUND_PARTIAL',
    cover: null,
  };

  const resolution = await resolver.resolve(obsB.candidate, fakeGame);
  return resolution.outcome === 'SAME_GAME';
}

export async function aggregateAndDeduplicate(
  observations: readonly DiscoverySourceObservation[],
  identityResolver: IdentityResolver,
  query: string,
): Promise<readonly DiscoveryGroupResult[]> {
  if (observations.length === 0) return [];

  const preGroups = preGroupByExternalId(observations);

  const used = new Set<number>();
  const groups: DiscoveryGroupResult[] = [];

  for (const preGroup of preGroups) {
    const firstIdx = preGroup.find((i) => !used.has(i));
    if (firstIdx === undefined) continue;

    const groupObservations: DiscoverySourceObservation[] = [observations[firstIdx]];
    used.add(firstIdx);

    for (const otherIdx of preGroup) {
      if (otherIdx === firstIdx || used.has(otherIdx)) continue;
      groupObservations.push(observations[otherIdx]);
      used.add(otherIdx);
    }

    for (let j = 0; j < observations.length; j++) {
      if (used.has(j)) continue;

      if (await areSameGame(observations[firstIdx], observations[j], identityResolver)) {
        groupObservations.push(observations[j]);
        used.add(j);
      }
    }

    const mergedClassification = groupObservations[0].classification;
    const identityResolution: IdentityResolutionResult = {
      outcome: 'SAME_GAME' as IdentityOutcome,
      relationship: null,
      confidence: 1.0,
      signals: [],
      reason: `Grouped ${groupObservations.length} observation(s) as same game`,
      method: 'NATIVE',
    };

    const { score, breakdown } = calculateRankingScore(
      groupObservations,
      identityResolution,
      mergedClassification,
      query,
    );

    groups.push({
      groupId: generateGroupId(groupObservations),
      observations: groupObservations,
      mergedClassification,
      identityResolution,
      rankingScore: score,
      rankingBreakdown: breakdown,
    });
  }

  return groups;
}

export function rankGroups(
  groups: readonly DiscoveryGroupResult[],
): readonly DiscoveryGroupResult[] {
  return [...groups].sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) {
      return b.rankingScore - a.rankingScore;
    }
    if (b.observations.length !== a.observations.length) {
      return b.observations.length - a.observations.length;
    }
    return a.groupId.localeCompare(b.groupId);
  });
}
