import type {
  NormalizedCandidate,
  NormalizedTitle,
} from '../normalization/normalized-candidate.js';
import type { Game } from '../domain/game/game.js';
import type { GameTitle } from '../domain/shared/title.js';
import type { ExternalIdentifier } from '../domain/shared/external-identifier.js';
import type { Organization } from '../domain/shared/organization.js';
import type { ReleaseDate } from '../domain/shared/release-date.js';
import type { IdentityOutcome } from '../domain/shared/identity-outcome.js';
import type { GameRelationshipType } from '../domain/shared/game-relationship-type.js';
import type { IdentityResolver } from './identity-resolver.js';
import type { IdentityResolutionResult } from './identity-resolution-result.js';
import type { IdentitySignal } from './identity-signal.js';
import { logger } from '../infrastructure/logger/logger.js';

const VERSION_MARKERS = [
  'remake',
  'remastered',
  'hd',
  'definitive edition',
  "director's cut",
  'gold edition',
  'enhanced edition',
  'the war of the lions',
  'the ivalice chronicles',
  'complete edition',
  'goty',
  'game of the year',
  'digital deluxe',
  'ultimate edition',
  'anniversary edition',
] as const;

const REMAKE_MARKERS = ['remake', 'reborn', 'reimagined'] as const;

interface TitleComparison {
  readonly exactMatch: boolean;
  readonly normalizedMatch: boolean;
  readonly baseTitleMatch: boolean;
  readonly hasVersionMarkerA: boolean;
  readonly hasVersionMarkerB: boolean;
  readonly isRemakeA: boolean;
  readonly isRemakeB: boolean;
}

function normalizeTitleForComparison(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBaseTitle(title: string): string {
  let normalized = normalizeTitleForComparison(title);

  for (const marker of VERSION_MARKERS) {
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex > 0) {
      normalized = normalized.substring(0, markerIndex).trim();
      break;
    }
  }

  normalized = normalized.replace(/[:\-\–\—]$/, '').trim();

  return normalized;
}

function hasVersionMarker(title: string): boolean {
  const normalized = normalizeTitleForComparison(title);
  return VERSION_MARKERS.some((marker) => normalized.includes(marker));
}

function hasRemakeMarker(title: string): boolean {
  const normalized = normalizeTitleForComparison(title);
  return REMAKE_MARKERS.some((marker) => normalized.includes(marker));
}

function compareTitles(
  titlesA: readonly NormalizedTitle[] | readonly GameTitle[],
  titlesB: readonly NormalizedTitle[] | readonly GameTitle[],
): TitleComparison {
  const valuesA = titlesA.map((t) => t.value);
  const valuesB = titlesB.map((t) => t.value);

  const normalizedA = valuesA.map(normalizeTitleForComparison);
  const normalizedB = valuesB.map(normalizeTitleForComparison);

  const exactMatch = valuesA.some((a) => valuesB.includes(a));
  const normalizedMatch = normalizedA.some((a) => normalizedB.includes(a));

  const baseTitlesA = valuesA.map(extractBaseTitle);
  const baseTitlesB = valuesB.map(extractBaseTitle);
  const baseTitleMatch = baseTitlesA.some((a) => a.length > 0 && baseTitlesB.includes(a));

  const hasVersionMarkerA = valuesA.some(hasVersionMarker);
  const hasVersionMarkerB = valuesB.some(hasVersionMarker);

  const isRemakeA = valuesA.some(hasRemakeMarker);
  const isRemakeB = valuesB.some(hasRemakeMarker);

  return {
    exactMatch,
    normalizedMatch,
    baseTitleMatch,
    hasVersionMarkerA,
    hasVersionMarkerB,
    isRemakeA,
    isRemakeB,
  };
}

function findExternalIdMatch(
  idsA: readonly ExternalIdentifier[],
  idsB: readonly ExternalIdentifier[],
): ExternalIdentifier | null {
  for (const idA of idsA) {
    for (const idB of idsB) {
      if (idA.source === idB.source && idA.id === idB.id) {
        return idA;
      }
    }
  }
  return null;
}

function hasExternalIdMismatch(
  idsA: readonly ExternalIdentifier[],
  idsB: readonly ExternalIdentifier[],
): boolean {
  const sourcesA = new Set(idsA.map((id) => id.source));
  const sourcesB = new Set(idsB.map((id) => id.source));

  for (const source of sourcesA) {
    if (sourcesB.has(source)) {
      const idsFromA = idsA.filter((id) => id.source === source).map((id) => id.id);
      const idsFromB = idsB.filter((id) => id.source === source).map((id) => id.id);
      const hasMatch = idsFromA.some((a) => idsFromB.includes(a));
      if (!hasMatch) {
        return true;
      }
    }
  }

  return false;
}

function compareOrganizations(
  orgsA: readonly Organization[],
  orgsB: readonly Organization[],
): { readonly match: boolean; readonly evidence: string } {
  const namesA = orgsA.map((o) => o.name.toLowerCase());
  const namesB = orgsB.map((o) => o.name.toLowerCase());

  for (const nameA of namesA) {
    for (const nameB of namesB) {
      if (nameA === nameB && nameA.length > 0) {
        return { match: true, evidence: `shared organization: ${nameA}` };
      }
    }
  }

  return { match: false, evidence: '' };
}

function compareReleaseDates(
  datesA: readonly (ReleaseDate | null)[],
  datesB: readonly (ReleaseDate | null)[],
): { readonly match: boolean; readonly evidence: string } {
  const validDatesA = datesA.filter((d): d is ReleaseDate => d !== null);
  const validDatesB = datesB.filter((d): d is ReleaseDate => d !== null);

  if (validDatesA.length === 0 || validDatesB.length === 0) {
    return { match: false, evidence: 'no comparable dates' };
  }

  for (const dateA of validDatesA) {
    for (const dateB of validDatesB) {
      if (dateA.year === dateB.year && dateA.month === dateB.month && dateA.day === dateB.day) {
        return {
          match: true,
          evidence: `shared release date: ${dateA.year}-${dateA.month ?? '??'}-${dateA.day ?? '??'}`,
        };
      }

      if (dateA.year === dateB.year) {
        return { match: true, evidence: `shared release year: ${dateA.year}` };
      }
    }
  }

  return { match: false, evidence: 'different release dates' };
}

function calculateScore(signals: readonly IdentitySignal[]): number {
  let score = 0;
  for (const signal of signals) {
    score += signal.weight * signal.confidence;
  }
  return score;
}

function determineOutcome(
  score: number,
  titleComparison: TitleComparison,
  exactExternalId: ExternalIdentifier | null,
  extIdMismatch: boolean,
): { readonly outcome: IdentityOutcome; readonly relationship: GameRelationshipType | null } {
  const hasRemakeMarkers = titleComparison.isRemakeA || titleComparison.isRemakeB;
  const hasVersionMarkers = titleComparison.hasVersionMarkerA || titleComparison.hasVersionMarkerB;

  if (exactExternalId) {
    return { outcome: 'SAME_GAME', relationship: null };
  }

  if (extIdMismatch) {
    if (hasRemakeMarkers && titleComparison.baseTitleMatch) {
      return { outcome: 'RELATED_GAME', relationship: 'REMAKE' };
    }
    return { outcome: 'DIFFERENT_GAME', relationship: null };
  }

  if (hasRemakeMarkers && titleComparison.baseTitleMatch) {
    return { outcome: 'DIFFERENT_GAME', relationship: 'REMAKE' };
  }

  if (hasVersionMarkers && titleComparison.baseTitleMatch) {
    return { outcome: 'RELATED_GAME', relationship: 'REMASTER' };
  }

  if (score >= 0.35) {
    return { outcome: 'SAME_GAME', relationship: null };
  }

  if (score <= -0.3) {
    return { outcome: 'DIFFERENT_GAME', relationship: null };
  }

  return { outcome: 'UNRESOLVED', relationship: null };
}

export class DeterministicIdentityResolver implements IdentityResolver {
  async resolve(
    candidate: NormalizedCandidate,
    existingGame: Game | null,
  ): Promise<IdentityResolutionResult> {
    const startTime = Date.now();
    const signals: IdentitySignal[] = [];

    if (existingGame === null) {
      const result = this.buildNoGameResult(candidate, signals);
      logger.info('identity_resolution.completed', {
        outcome: result.outcome,
        confidence: result.confidence,
        durationMs: Date.now() - startTime,
      });
      return result;
    }

    const exactExternalId = findExternalIdMatch(
      candidate.externalIdentifiers,
      existingGame.externalIdentifiers,
    );
    this.collectExternalIdSignals(
      candidate.externalIdentifiers,
      existingGame.externalIdentifiers,
      exactExternalId,
      signals,
    );

    const titleComparison = compareTitles(candidate.titles, existingGame.titles);
    this.collectTitleSignals(titleComparison, signals);

    this.collectDeveloperSignals(candidate.developers, existingGame.developers, signals);
    this.collectPublisherSignals(candidate.publishers, existingGame.publishers, signals);

    const candidateDates = candidate.releases.map((r) => r.releaseDate);
    const gameDates = existingGame.releases.map((r) => r.releaseDate);
    this.collectDateSignals(candidateDates, gameDates, signals);

    const score = calculateScore(signals);
    const extIdMismatch = hasExternalIdMismatch(
      candidate.externalIdentifiers,
      existingGame.externalIdentifiers,
    );

    const { outcome, relationship } = determineOutcome(
      score,
      titleComparison,
      exactExternalId,
      extIdMismatch,
    );
    const confidence = exactExternalId !== null ? 1.0 : Math.min(Math.abs(score) + 0.1, 0.95);
    const reason = this.buildReason(outcome, signals);

    const durationMs = Date.now() - startTime;

    logger.info('identity_resolution.completed', {
      outcome,
      relationship,
      confidence,
      signalCount: signals.length,
      durationMs,
    });

    return {
      outcome,
      relationship,
      confidence,
      signals,
      reason,
      method: 'NATIVE',
    };
  }

  private buildNoGameResult(
    _candidate: NormalizedCandidate,
    signals: IdentitySignal[],
  ): IdentityResolutionResult {
    signals.push({
      source: 'title-exact-match',
      weight: 0,
      confidence: 0,
      evidence: 'no existing game to compare against',
    });

    return {
      outcome: 'UNRESOLVED',
      relationship: null,
      confidence: 0,
      signals,
      reason: 'no existing game provided for comparison',
      method: 'NATIVE',
    };
  }

  private collectExternalIdSignals(
    candidateIds: readonly ExternalIdentifier[],
    gameIds: readonly ExternalIdentifier[],
    exactMatch: ExternalIdentifier | null,
    signals: IdentitySignal[],
  ): void {
    if (exactMatch) {
      signals.push({
        source: 'external-id-match',
        weight: 1.0,
        confidence: 1.0,
        evidence: `exact external ID match: ${exactMatch.source}:${exactMatch.id}`,
      });
      return;
    }

    const candidateSources = candidateIds.map((id) => id.source);
    const gameSources = gameIds.map((id) => id.source);
    const sharedSources = candidateSources.filter((s) => gameSources.includes(s));

    if (sharedSources.length > 0) {
      for (const source of sharedSources) {
        signals.push({
          source: 'external-id-mismatch',
          weight: -0.8,
          confidence: 0.9,
          evidence: `external ID mismatch on ${source}`,
        });
      }
    }
  }

  private collectTitleSignals(titleComparison: TitleComparison, signals: IdentitySignal[]): void {
    if (titleComparison.exactMatch) {
      signals.push({
        source: 'title-exact-match',
        weight: 0.5,
        confidence: 1.0,
        evidence: 'exact title match',
      });
    } else if (titleComparison.normalizedMatch) {
      signals.push({
        source: 'title-normalized-match',
        weight: 0.4,
        confidence: 0.9,
        evidence: 'normalized title match',
      });
    } else if (titleComparison.baseTitleMatch) {
      signals.push({
        source: 'title-similar',
        weight: 0.2,
        confidence: 0.7,
        evidence: 'base title match (excluding version markers)',
      });
    } else {
      signals.push({
        source: 'title-different',
        weight: -0.3,
        confidence: 0.8,
        evidence: 'no title match found',
      });
    }

    if (titleComparison.hasVersionMarkerA || titleComparison.hasVersionMarkerB) {
      signals.push({
        source: 'version-marker-detected',
        weight: -0.4,
        confidence: 0.85,
        evidence: 'version marker detected in title',
      });
    }

    if (titleComparison.isRemakeA || titleComparison.isRemakeB) {
      signals.push({
        source: 'remake-marker-detected',
        weight: -0.9,
        confidence: 0.95,
        evidence: 'remake marker detected in title',
      });
    }
  }

  private collectDeveloperSignals(
    candidateDevs: readonly Organization[],
    gameDevs: readonly Organization[],
    signals: IdentitySignal[],
  ): void {
    const result = compareOrganizations(candidateDevs, gameDevs);
    if (result.match) {
      signals.push({
        source: 'developer-match',
        weight: 0.2,
        confidence: 0.8,
        evidence: result.evidence,
      });
    } else if (candidateDevs.length > 0 && gameDevs.length > 0) {
      signals.push({
        source: 'developer-different',
        weight: -0.15,
        confidence: 0.6,
        evidence: 'different developers',
      });
    }
  }

  private collectPublisherSignals(
    candidatePubs: readonly Organization[],
    gamePubs: readonly Organization[],
    signals: IdentitySignal[],
  ): void {
    const result = compareOrganizations(candidatePubs, gamePubs);
    if (result.match) {
      signals.push({
        source: 'publisher-match',
        weight: 0.1,
        confidence: 0.6,
        evidence: result.evidence,
      });
    } else if (candidatePubs.length > 0 && gamePubs.length > 0) {
      signals.push({
        source: 'publisher-different',
        weight: -0.05,
        confidence: 0.4,
        evidence: 'different publishers',
      });
    }
  }

  private collectDateSignals(
    candidateDates: readonly (ReleaseDate | null)[],
    gameDates: readonly (ReleaseDate | null)[],
    signals: IdentitySignal[],
  ): void {
    const result = compareReleaseDates(candidateDates, gameDates);
    if (result.match) {
      signals.push({
        source: 'release-date-match',
        weight: 0.15,
        confidence: 0.7,
        evidence: result.evidence,
      });
    } else if (result.evidence === 'different release dates') {
      signals.push({
        source: 'release-date-different',
        weight: -0.1,
        confidence: 0.5,
        evidence: result.evidence,
      });
    }
  }

  private buildReason(outcome: IdentityOutcome, signals: readonly IdentitySignal[]): string {
    const topSignals = [...signals]
      .sort((a, b) => Math.abs(b.weight * b.confidence) - Math.abs(a.weight * a.confidence))
      .slice(0, 3);

    const reasons = topSignals.map((s) => s.evidence);

    return `${outcome}: ${reasons.join('; ')}`;
  }
}
