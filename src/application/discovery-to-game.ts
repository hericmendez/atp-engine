import type { Game } from '../domain/game/game.js';
import type { GameId } from '../domain/shared/ids.js';
import type { GameTitle } from '../domain/shared/title.js';
import type { DiscoveryGroupResult } from '../discovery/discovery-types.js';
import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { MetadataCompleteness } from '../domain/shared/metadata-completeness.js';
import type { ClassificationCategory } from '../domain/shared/classification-category.js';
import { VALID_CLASSIFICATION_CATEGORIES } from '../ai/constants.js';

function createDiscoveryGameId(source: string, sourceId: string): GameId {
  return `discovery-${source}-${sourceId}` as GameId;
}

function mapTitles(candidate: NormalizedCandidate): readonly GameTitle[] {
  if (candidate.titles.length === 0) {
    return [];
  }
  return candidate.titles.map((t) => ({
    value: t.value,
    type: t.type as GameTitle['type'],
  }));
}

function mapCompleteness(group: DiscoveryGroupResult): MetadataCompleteness {
  const sources = new Set(group.observations.map((o) => o.source));
  if (sources.size >= 2) return 'FOUND_COMPLETE';
  if (group.rankingScore >= 0.7) return 'FOUND_SUFFICIENT';
  return 'FOUND_PARTIAL';
}

function mapClassification(group: DiscoveryGroupResult): ClassificationCategory {
  const cat = group.mergedClassification.category;
  return (VALID_CLASSIFICATION_CATEGORIES as readonly string[]).includes(cat)
    ? (cat as ClassificationCategory)
    : 'UNKNOWN';
}

export function discoveryGroupToGame(group: DiscoveryGroupResult): Game {
  const bestObservation = group.observations.reduce((best, obs) => {
    const bestScore = best.classification.confidence;
    const obsScore = obs.classification.confidence;
    return obsScore > bestScore ? obs : best;
  }, group.observations[0]);

  const candidate = bestObservation.candidate;
  const source = bestObservation.source;
  const sourceId = bestObservation.sourceId;

  return {
    id: createDiscoveryGameId(source, sourceId),
    titles: mapTitles(candidate),
    releases: [],
    developers: [...candidate.developers],
    publishers: [...candidate.publishers],
    genres: [...candidate.genres],
    externalIdentifiers: [...candidate.externalIdentifiers],
    relationships: [],
    evidence: [
      {
        source,
        externalId: sourceId,
        retrievedAt: new Date(bestObservation.retrievedAt),
        rawTitle: candidate.provenance.rawTitle,
      },
    ],
    classification: mapClassification(group),
    completeness: mapCompleteness(group),
    cover: null,
  };
}

export function discoveryGroupsToGames(groups: readonly DiscoveryGroupResult[]): readonly Game[] {
  return groups.map(discoveryGroupToGame);
}
