import type { Game } from '../domain/game/game.js';
import type { Organization } from '../domain/shared/organization.js';
import type { Genre } from '../domain/shared/genre.js';
import type { ExternalIdentifier } from '../domain/shared/external-identifier.js';
import type { SourceEvidence } from '../domain/shared/source-evidence.js';
import type { MetadataCompleteness } from '../domain/shared/metadata-completeness.js';
import type { Release } from '../domain/game/release.js';
import type { NormalizedRelease } from '../normalization/normalized-candidate.js';
import type { DiscoverySourceObservation } from '../discovery/discovery-types.js';
import type { EnrichmentResult, EnrichmentChange, EnrichmentConflict } from './enrichment-types.js';
import {
  gameAddTitle,
  gameAddExternalIdentifier,
  gameAddEvidence,
  gameWithCompleteness,
} from '../domain/game/game.js';
import { createSourceEvidence } from '../domain/shared/source-evidence.js';
import { createGameTitle } from '../domain/shared/title.js';
import { createReleaseId } from '../domain/shared/ids.js';
import { MetadataCompleteness as Completeness } from '../domain/shared/metadata-completeness.js';

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesEquivalent(a: string, b: string): boolean {
  return normalizeForComparison(a) === normalizeForComparison(b);
}

function organizationsEquivalent(a: Organization, b: Organization): boolean {
  const normalizedA = normalizeForComparison(a.name);
  const normalizedB = normalizeForComparison(b.name);

  if (normalizedA === normalizedB) return true;

  const suffixes = ['inc', 'ltd', 'llc', 'corp', 'co', 'company', 'gmbh', 'kk', 'plc'];
  let strippedA = normalizedA;
  let strippedB = normalizedB;

  for (const suffix of suffixes) {
    const regex = new RegExp(`\\s+${suffix}$`);
    strippedA = strippedA.replace(regex, '').trim();
    strippedB = strippedB.replace(regex, '').trim();
  }

  return strippedA === strippedB && strippedA.length > 0;
}

function genreEquivalent(a: Genre, b: Genre): boolean {
  return titlesEquivalent(a.name, b.name);
}

function externalIdsEqual(a: ExternalIdentifier, b: ExternalIdentifier): boolean {
  return a.source === b.source && a.id === b.id;
}

function releasesMatch(a: NormalizedRelease, b: Release): boolean {
  return (
    a.platform.name === b.platform.name && (a.region?.name ?? null) === (b.region?.name ?? null)
  );
}

function buildEvidence(obs: DiscoverySourceObservation): SourceEvidence {
  return createSourceEvidence(obs.source, obs.sourceId, obs.candidate.provenance.rawTitle);
}

function calculateCompleteness(game: Game): MetadataCompleteness {
  let score = 0;
  let total = 0;

  total += 2;
  if (game.titles.length > 0) score += 1;
  if (game.titles.some((t) => t.type === 'primary')) score += 1;

  total += 1;
  if (game.releases.length > 0) score += 1;

  total += 1;
  const hasReleaseDate = game.releases.some((r) => r.releaseDate !== null);
  if (hasReleaseDate) score += 1;

  total += 1;
  if (game.developers.length > 0) score += 1;

  total += 1;
  if (game.publishers.length > 0) score += 1;

  total += 1;
  if (game.genres.length > 0) score += 1;

  total += 1;
  if (game.externalIdentifiers.length > 0) score += 1;

  total += 1;
  if (game.evidence.length > 0) score += 1;

  const ratio = total > 0 ? score / total : 0;

  if (ratio >= 0.8) return Completeness.FOUND_COMPLETE;
  if (ratio >= 0.5) return Completeness.FOUND_SUFFICIENT;
  if (ratio > 0) return Completeness.FOUND_PARTIAL;
  return Completeness.NOT_FOUND;
}

export function enrichGame(
  game: Game,
  observations: readonly DiscoverySourceObservation[],
): EnrichmentResult {
  if (observations.length === 0) {
    return {
      game,
      changes: [],
      conflicts: [],
      completeness: game.completeness,
    };
  }

  const changes: EnrichmentChange[] = [];
  const conflicts: EnrichmentConflict[] = [];
  let enriched = game;

  enriched = enrichTitles(enriched, observations, changes, conflicts);
  enriched = enrichOrganizations(enriched, observations, changes, conflicts, 'developer');
  enriched = enrichOrganizations(enriched, observations, changes, conflicts, 'publisher');
  enriched = enrichGenres(enriched, observations, changes, conflicts);
  enriched = enrichExternalIdentifiers(enriched, observations, changes, conflicts);
  enriched = enrichEvidence(enriched, observations, changes);
  enriched = enrichReleases(enriched, observations, changes, conflicts);

  const completeness = calculateCompleteness(enriched);
  enriched = gameWithCompleteness(enriched, completeness);

  return {
    game: enriched,
    changes,
    conflicts,
    completeness,
  };
}

function enrichTitles(
  game: Game,
  observations: readonly DiscoverySourceObservation[],
  changes: EnrichmentChange[],
  conflicts: EnrichmentConflict[],
): Game {
  let enriched = game;
  const existingTitles = [...enriched.titles];

  for (const obs of observations) {
    for (const normalizedTitle of obs.candidate.titles) {
      const alreadyExists = existingTitles.some(
        (t) => titlesEquivalent(t.value, normalizedTitle.value) && t.type === normalizedTitle.type,
      );

      if (alreadyExists) continue;

      const hasConflict = existingTitles.some(
        (t) => titlesEquivalent(t.value, normalizedTitle.value) && t.type !== normalizedTitle.type,
      );

      if (hasConflict) {
        const existing = existingTitles.find((t) =>
          titlesEquivalent(t.value, normalizedTitle.value),
        );
        if (existing) {
          conflicts.push({
            fieldType: 'title',
            sourceA: 'canonical',
            valueA: `${existing.value} (${existing.type})`,
            sourceB: obs.source,
            valueB: `${normalizedTitle.value} (${normalizedTitle.type})`,
            retainedValue: `${existing.value} (${existing.type})`,
            reason: 'Existing title retained; type conflict detected',
          });
        }
        continue;
      }

      const newTitle = createGameTitle(normalizedTitle.value, normalizedTitle.type);
      enriched = gameAddTitle(enriched, newTitle);
      existingTitles.push(newTitle);

      changes.push({
        fieldType: 'title',
        changeType: 'added',
        source: obs.source,
        reason: `Added ${normalizedTitle.type} title from ${obs.source}`,
        previousValue: null,
        newValue: normalizedTitle.value,
      });
    }
  }

  return enriched;
}

function enrichOrganizations(
  game: Game,
  observations: readonly DiscoverySourceObservation[],
  changes: EnrichmentChange[],
  conflicts: EnrichmentConflict[],
  kind: 'developer' | 'publisher',
): Game {
  const existingOrgs = kind === 'developer' ? [...game.developers] : [...game.publishers];
  const fieldLabel = kind === 'developer' ? 'developers' : 'publishers';

  const newOrgs: Organization[] = [];
  const newChanges: EnrichmentChange[] = [];
  const newConflicts: EnrichmentConflict[] = [];

  for (const obs of observations) {
    const candidateOrgs =
      kind === 'developer' ? obs.candidate.developers : obs.candidate.publishers;

    for (const org of candidateOrgs) {
      const alreadyExists = existingOrgs.some((e) => organizationsEquivalent(e, org));
      if (alreadyExists) continue;

      const conflict = existingOrgs.find((e) => organizationsEquivalent(e, org));
      if (conflict) {
        newConflicts.push({
          fieldType: kind,
          sourceA: 'canonical',
          valueA: conflict.name,
          sourceB: obs.source,
          valueB: org.name,
          retainedValue: conflict.name,
          reason: `Existing ${kind} retained; organization name variation detected`,
        });
        continue;
      }

      newOrgs.push(org);
      newChanges.push({
        fieldType: kind,
        changeType: 'added',
        source: obs.source,
        reason: `Added ${kind} from ${obs.source}`,
        previousValue: null,
        newValue: org.name,
      });
    }
  }

  if (newOrgs.length === 0) return game;

  const allOrgs = [...existingOrgs, ...newOrgs];
  const deduped = deduplicateOrganizations(allOrgs);

  changes.push(...newChanges);
  conflicts.push(...newConflicts);

  return {
    ...game,
    [fieldLabel]: deduped,
  };
}

function deduplicateOrganizations(orgs: readonly Organization[]): Organization[] {
  const result: Organization[] = [];
  for (const org of orgs) {
    if (!result.some((r) => organizationsEquivalent(r, org))) {
      result.push(org);
    }
  }
  return result;
}

function enrichGenres(
  game: Game,
  observations: readonly DiscoverySourceObservation[],
  changes: EnrichmentChange[],
  conflicts: EnrichmentConflict[],
): Game {
  const existingGenres = [...game.genres];
  const newGenres: Genre[] = [];

  for (const obs of observations) {
    for (const genre of obs.candidate.genres) {
      const alreadyExists = existingGenres.some((e) => genreEquivalent(e, genre));
      if (alreadyExists) continue;

      const conflict = existingGenres.find((e) => genreEquivalent(e, genre));
      if (conflict) {
        conflicts.push({
          fieldType: 'genre',
          sourceA: 'canonical',
          valueA: conflict.name,
          sourceB: obs.source,
          valueB: genre.name,
          retainedValue: conflict.name,
          reason: 'Existing genre retained; name variation detected',
        });
        continue;
      }

      newGenres.push(genre);
      changes.push({
        fieldType: 'genre',
        changeType: 'added',
        source: obs.source,
        reason: `Added genre from ${obs.source}`,
        previousValue: null,
        newValue: genre.name,
      });
    }
  }

  if (newGenres.length === 0) return game;

  return {
    ...game,
    genres: [...existingGenres, ...newGenres],
  };
}

function enrichExternalIdentifiers(
  game: Game,
  observations: readonly DiscoverySourceObservation[],
  changes: EnrichmentChange[],
  conflicts: EnrichmentConflict[],
): Game {
  let enriched = game;

  for (const obs of observations) {
    for (const extId of obs.candidate.externalIdentifiers) {
      const alreadyExists = enriched.externalIdentifiers.some((e) => externalIdsEqual(e, extId));

      if (alreadyExists) continue;

      const hasConflict = enriched.externalIdentifiers.some(
        (e) => e.source === extId.source && e.id !== extId.id,
      );

      if (hasConflict) {
        const existing = enriched.externalIdentifiers.find(
          (e) => e.source === extId.source && e.id !== extId.id,
        );
        if (existing) {
          conflicts.push({
            fieldType: 'external_identifier',
            sourceA: 'canonical',
            valueA: `${existing.source}:${existing.id}`,
            sourceB: obs.source,
            valueB: `${extId.source}:${extId.id}`,
            retainedValue: `${existing.source}:${existing.id}`,
            reason: 'Existing external identifier retained; different ID for same source',
          });
        }
        continue;
      }

      enriched = gameAddExternalIdentifier(enriched, extId);

      changes.push({
        fieldType: 'external_identifier',
        changeType: 'added',
        source: obs.source,
        reason: `Added external identifier from ${obs.source}`,
        previousValue: null,
        newValue: `${extId.source}:${extId.id}`,
      });
    }
  }

  return enriched;
}

function enrichEvidence(
  game: Game,
  observations: readonly DiscoverySourceObservation[],
  changes: EnrichmentChange[],
): Game {
  let enriched = game;

  for (const obs of observations) {
    const alreadyHasEvidence = enriched.evidence.some(
      (e) => e.source === obs.source && e.externalId === obs.sourceId,
    );

    if (alreadyHasEvidence) continue;

    const evidence = buildEvidence(obs);
    enriched = gameAddEvidence(enriched, evidence);

    changes.push({
      fieldType: 'evidence',
      changeType: 'added',
      source: obs.source,
      reason: `Added source evidence from ${obs.source}`,
      previousValue: null,
      newValue: `${obs.source}:${obs.sourceId}`,
    });
  }

  return enriched;
}

function enrichReleases(
  game: Game,
  observations: readonly DiscoverySourceObservation[],
  changes: EnrichmentChange[],
  conflicts: EnrichmentConflict[],
): Game {
  const enrichedReleases = [...game.releases];

  for (const obs of observations) {
    for (const normalizedRelease of obs.candidate.releases) {
      const existingIndex = enrichedReleases.findIndex((r) => releasesMatch(normalizedRelease, r));

      if (existingIndex >= 0) {
        const existing = enrichedReleases[existingIndex];
        const enriched = enrichSingleRelease(
          existing,
          normalizedRelease,
          obs.source,
          changes,
          conflicts,
        );
        enrichedReleases[existingIndex] = enriched;
      } else {
        const newRelease = createReleaseFromNormalized(normalizedRelease, game.id, obs);
        enrichedReleases.push(newRelease);

        changes.push({
          fieldType: 'release',
          changeType: 'added',
          source: obs.source,
          reason: `Added release for ${normalizedRelease.platform.name} from ${obs.source}`,
          previousValue: null,
          newValue: normalizedRelease.platform.name,
        });
      }
    }
  }

  return {
    ...game,
    releases: enrichedReleases,
  };
}

function enrichSingleRelease(
  existing: Release,
  normalized: NormalizedRelease,
  source: string,
  changes: EnrichmentChange[],
  conflicts: EnrichmentConflict[],
): Release {
  let enriched = existing;

  enriched = enrichReleaseDate(enriched, normalized, source, changes, conflicts);
  enriched = enrichDistributionChannels(enriched, normalized, source, changes);
  enriched = enrichLaunchers(enriched, normalized, source, changes);
  enriched = enrichReleaseExternalIdentifiers(enriched, normalized, source, changes);

  return enriched;
}

function enrichReleaseDate(
  existing: Release,
  normalized: NormalizedRelease,
  source: string,
  changes: EnrichmentChange[],
  conflicts: EnrichmentConflict[],
): Release {
  if (!normalized.releaseDate) return existing;
  if (!existing.releaseDate) {
    changes.push({
      fieldType: 'release_date',
      changeType: 'added',
      source,
      reason: `Added release date from ${source}`,
      previousValue: null,
      newValue: `${normalized.releaseDate.year}-${normalized.releaseDate.month ?? '??'}-${normalized.releaseDate.day ?? '??'}`,
    });
    return { ...existing, releaseDate: normalized.releaseDate };
  }

  const existingDate = existing.releaseDate;
  const newDate = normalized.releaseDate;

  if (
    existingDate.year === newDate.year &&
    existingDate.month === newDate.month &&
    existingDate.day === newDate.day
  ) {
    return existing;
  }

  if (existingDate.year !== newDate.year) {
    conflicts.push({
      fieldType: 'release_date',
      sourceA: 'canonical',
      valueA: `${existingDate.year}-${existingDate.month ?? '??'}-${existingDate.day ?? '??'}`,
      sourceB: source,
      valueB: `${newDate.year}-${newDate.month ?? '??'}-${newDate.day ?? '??'}`,
      retainedValue: `${existingDate.year}-${existingDate.month ?? '??'}-${existingDate.day ?? '??'}`,
      reason: 'Year conflict; existing release date retained',
    });
    return existing;
  }

  const existingPrecisionScore =
    existingDate.precision === 'day' ? 3 : existingDate.precision === 'month' ? 2 : 1;
  const newPrecisionScore = newDate.precision === 'day' ? 3 : newDate.precision === 'month' ? 2 : 1;

  if (newPrecisionScore > existingPrecisionScore) {
    changes.push({
      fieldType: 'release_date',
      changeType: 'improved_precision',
      source,
      reason: `Improved date precision from ${existingDate.precision} to ${newDate.precision} via ${source}`,
      previousValue: `${existingDate.year}-${existingDate.month ?? '??'}-${existingDate.day ?? '??'}`,
      newValue: `${newDate.year}-${newDate.month ?? '??'}-${newDate.day ?? '??'}`,
    });
    return { ...existing, releaseDate: newDate };
  }

  if (newPrecisionScore === existingPrecisionScore) {
    if (
      existingDate.month !== null &&
      newDate.month !== null &&
      existingDate.month !== newDate.month
    ) {
      conflicts.push({
        fieldType: 'release_date',
        sourceA: 'canonical',
        valueA: `${existingDate.year}-${existingDate.month}-${existingDate.day ?? '??'}`,
        sourceB: source,
        valueB: `${newDate.year}-${newDate.month}-${newDate.day ?? '??'}`,
        retainedValue: `${existingDate.year}-${existingDate.month}-${existingDate.day ?? '??'}`,
        reason: 'Month conflict at same precision; existing release date retained',
      });
      return existing;
    }

    if (existingDate.day !== null && newDate.day !== null && existingDate.day !== newDate.day) {
      conflicts.push({
        fieldType: 'release_date',
        sourceA: 'canonical',
        valueA: `${existingDate.year}-${existingDate.month ?? '??'}-${existingDate.day}`,
        sourceB: source,
        valueB: `${newDate.year}-${newDate.month ?? '??'}-${newDate.day}`,
        retainedValue: `${existingDate.year}-${existingDate.month ?? '??'}-${existingDate.day}`,
        reason: 'Day conflict at same precision; existing release date retained',
      });
      return existing;
    }
  }

  return existing;
}

function enrichDistributionChannels(
  existing: Release,
  normalized: NormalizedRelease,
  source: string,
  changes: EnrichmentChange[],
): Release {
  const existingChannels = [...existing.distributionChannels];
  let changed = false;

  for (const channel of normalized.distributionChannels) {
    const alreadyExists = existingChannels.some(
      (e) => e.name.toLowerCase() === channel.name.toLowerCase(),
    );
    if (!alreadyExists) {
      existingChannels.push(channel);
      changed = true;
      changes.push({
        fieldType: 'distribution_channel',
        changeType: 'added',
        source,
        reason: `Added distribution channel from ${source}`,
        previousValue: null,
        newValue: channel.name,
      });
    }
  }

  return changed ? { ...existing, distributionChannels: existingChannels } : existing;
}

function enrichLaunchers(
  existing: Release,
  normalized: NormalizedRelease,
  source: string,
  changes: EnrichmentChange[],
): Release {
  const existingLaunchers = [...existing.launchers];
  let changed = false;

  for (const launcher of normalized.launchers) {
    const alreadyExists = existingLaunchers.some(
      (e) => e.name.toLowerCase() === launcher.name.toLowerCase(),
    );
    if (!alreadyExists) {
      existingLaunchers.push(launcher);
      changed = true;
      changes.push({
        fieldType: 'launcher',
        changeType: 'added',
        source,
        reason: `Added launcher from ${source}`,
        previousValue: null,
        newValue: launcher.name,
      });
    }
  }

  return changed ? { ...existing, launchers: existingLaunchers } : existing;
}

function enrichReleaseExternalIdentifiers(
  existing: Release,
  normalized: NormalizedRelease,
  source: string,
  changes: EnrichmentChange[],
): Release {
  const existingIds = [...existing.externalIdentifiers];
  let changed = false;

  for (const extId of normalized.externalIdentifiers) {
    const alreadyExists = existingIds.some((e) => externalIdsEqual(e, extId));
    if (!alreadyExists) {
      existingIds.push(extId);
      changed = true;
      changes.push({
        fieldType: 'external_identifier',
        changeType: 'added',
        source,
        reason: `Added release external identifier from ${source}`,
        previousValue: null,
        newValue: `${extId.source}:${extId.id}`,
      });
    }
  }

  return changed ? { ...existing, externalIdentifiers: existingIds } : existing;
}

function createReleaseFromNormalized(
  normalized: NormalizedRelease,
  gameId: Game['id'],
  obs: DiscoverySourceObservation,
): Release {
  return {
    id: createReleaseId(`${gameId}-${normalized.platform.name}-${obs.source}-${obs.sourceId}`),
    gameId,
    platform: normalized.platform,
    region: normalized.region,
    releaseDate: normalized.releaseDate,
    version: normalized.version,
    edition: normalized.edition,
    distributionChannels: [...normalized.distributionChannels],
    launchers: [...normalized.launchers],
    externalIdentifiers: [...normalized.externalIdentifiers],
    evidence: [buildEvidence(obs)],
  };
}
