import { ClassificationCategory } from '../domain/shared/classification-category.js';
import { MetadataCompleteness } from '../domain/shared/metadata-completeness.js';
import type { ExternalIdentifier } from '../domain/shared/external-identifier.js';
import type { DiscoveryGroupResult } from '../discovery/discovery-types.js';
import { selectPersistObservation } from '../application/discovery-to-game.js';
import type { CatalogPolicyResult } from './game-type-policy.js';
import { logger } from '../infrastructure/logger/logger.js';

// ─── Status ──────────────────────────────────────────────────

export const CatalogEligibilityStatus = {
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  DEFERRED: 'DEFERRED',
} as const;

export type CatalogEligibilityStatus =
  (typeof CatalogEligibilityStatus)[keyof typeof CatalogEligibilityStatus];

// ─── Decision ────────────────────────────────────────────────

export interface CatalogEligibilityDecision {
  readonly status: CatalogEligibilityStatus;
  readonly eligible: boolean;
  readonly confidence: number;
  readonly reason: string;
  readonly blockingReasons: readonly string[];
  readonly warnings: readonly string[];
  readonly signals: CatalogEligibilitySignals;
}

// ─── Signals ─────────────────────────────────────────────────

export interface CatalogEligibilitySignals {
  readonly classification: ClassificationCategory;
  readonly classificationConfidence: number;
  readonly identityConfidence: number;
  readonly sourceCount: number;
  readonly metadataCompleteness: MetadataCompleteness;
  readonly observationCount: number;
}

// ─── Thresholds ──────────────────────────────────────────────

const MIN_CLASSIFICATION_CONFIDENCE = 0.3;
const UNKNOWN_IDENTITY_THRESHOLD = 0.7;
const UNKNOWN_SOURCE_THRESHOLD = 2;

// ─── Classification Sets ─────────────────────────────────────

const INELIGIBLE_CATEGORIES: readonly ClassificationCategory[] = [
  ClassificationCategory.PERSON,
  ClassificationCategory.FRANCHISE,
  ClassificationCategory.BOOK,
  ClassificationCategory.SOUNDTRACK,
  ClassificationCategory.MOVIE,
  ClassificationCategory.TV_SHOW,
  ClassificationCategory.ANIME,
  ClassificationCategory.HARDWARE,
  ClassificationCategory.PROMOTIONAL,
  ClassificationCategory.CHARACTER,
  ClassificationCategory.EVENT,
];

// ─── Policy ──────────────────────────────────────────────────

export function catalogEligibility(group: DiscoveryGroupResult): CatalogEligibilityDecision {
  const classification = group.mergedClassification.category;
  const classificationConfidence = group.mergedClassification.confidence;
  const identityConfidence = group.identityResolution.confidence;
  const sourceCount = new Set(group.observations.map((o) => o.source)).size;
  const observationCount = group.observations.length;

  const metadataCompleteness = deriveCompleteness(group);

  const signals: CatalogEligibilitySignals = {
    classification,
    classificationConfidence,
    identityConfidence,
    sourceCount,
    metadataCompleteness,
    observationCount,
  };

  // ── Check 1: empty group ────────────────────────────────────
  if (observationCount === 0) {
    return reject('No observations in group', [], signals);
  }

  // ── Check 2: missing title ──────────────────────────────────
  const hasTitle = group.observations.some(
    (o) => o.candidate.titles.length > 0 && o.candidate.titles[0].value.trim().length > 0,
  );
  if (!hasTitle) {
    return defer('No title available for identification', signals);
  }

  // ── Check 3: explicitly ineligible categories ───────────────
  if (INELIGIBLE_CATEGORIES.includes(classification)) {
    return reject(
      `Classification "${classification}" is not eligible for Game catalog`,
      [],
      signals,
    );
  }

  // ── Check 4: game-like categories ───────────────────────────
  if (isGameLike(classification)) {
    const warnings: string[] = [];

    if (classificationConfidence < MIN_CLASSIFICATION_CONFIDENCE) {
      return reject(
        `Classification confidence ${classificationConfidence.toFixed(2)} below minimum ${MIN_CLASSIFICATION_CONFIDENCE}`,
        [],
        signals,
      );
    }

    if (metadataCompleteness === MetadataCompleteness.NOT_FOUND) {
      warnings.push('Metadata completeness is NOT_FOUND');
    }

    if (metadataCompleteness === MetadataCompleteness.FOUND_PARTIAL) {
      warnings.push('Metadata completeness is FOUND_PARTIAL');
    }

    if (identityConfidence < 0.5) {
      warnings.push(`Low identity confidence: ${identityConfidence.toFixed(2)}`);
    }

    return {
      status: CatalogEligibilityStatus.ELIGIBLE,
      eligible: true,
      confidence: classificationConfidence,
      reason: `Classified as ${classification} with sufficient confidence`,
      blockingReasons: [],
      warnings,
      signals,
    };
  }

  // ── Check 5: UNKNOWN classification ─────────────────────────
  if (classification === ClassificationCategory.UNKNOWN) {
    return evaluateUnknown(classificationConfidence, identityConfidence, sourceCount, signals);
  }

  // ── Fallback: unknown classification not caught above ───────
  return defer(`Unclassified category "${classification}"`, signals);
}

// ─── Stable-identity ban ───────────────────────────────────────
// Bulk persist paths (sync, single-ingest persistence) must never mint
// a canonical Game without a source-provided identifier. The identity
// inspected here is the exact candidate persistence would use
// (selectPersistObservation), so the ban and the ID construction can
// never disagree and no silent atp-unknown/admin fallback is reachable.

export function stableIdentityExtId(
  group: DiscoveryGroupResult,
): ExternalIdentifier | undefined {
  return selectPersistObservation(group)?.candidate.externalIdentifiers[0];
}

export function hasStableIdentity(group: DiscoveryGroupResult): boolean {
  return stableIdentityExtId(group) !== undefined;
}

function decisionSignals(group: DiscoveryGroupResult): CatalogEligibilitySignals {
  return {
    classification: group.mergedClassification.category,
    classificationConfidence: group.mergedClassification.confidence,
    identityConfidence: group.identityResolution.confidence,
    sourceCount: new Set(group.observations.map((o) => o.source)).size,
    metadataCompleteness: deriveCompleteness(group),
    observationCount: group.observations.length,
  };
}

export function missingStableIdentityDecision(
  group: DiscoveryGroupResult,
): CatalogEligibilityDecision {
  const reason =
    'MISSING_STABLE_IDENTITY: persisted candidate carries no source-provided external identifier — refusing silent fallback ID';
  return {
    status: CatalogEligibilityStatus.DEFERRED,
    eligible: false,
    confidence: 0.5,
    reason,
    blockingReasons: ['MISSING_STABLE_IDENTITY'],
    warnings: [reason],
    signals: decisionSignals(group),
  };
}

export function unresolvedPortParentDecision(
  group: DiscoveryGroupResult,
  detail: string,
): CatalogEligibilityDecision {
  const reason = `UNRESOLVED_PORT_PARENT: ${detail}`;
  return {
    status: CatalogEligibilityStatus.DEFERRED,
    eligible: false,
    confidence: 0.5,
    reason,
    blockingReasons: ['UNRESOLVED_PORT_PARENT'],
    warnings: [reason],
    signals: decisionSignals(group),
  };
}

export function reclassificationConflictDecision(
  group: DiscoveryGroupResult,
  detail: string,
): CatalogEligibilityDecision {
  const reason = `RECLASSIFICATION_CONFLICT: ${detail}`;
  return {
    status: CatalogEligibilityStatus.DEFERRED,
    eligible: false,
    confidence: 0.5,
    reason,
    blockingReasons: ['RECLASSIFICATION_CONFLICT'],
    warnings: [reason],
    signals: decisionSignals(group),
  };
}

export function unresolvedRelationshipTargetDecision(
  group: DiscoveryGroupResult,
  detail: string,
): CatalogEligibilityDecision {
  const reason = `UNRESOLVED_RELATIONSHIP_TARGET: ${detail}`;
  return {
    status: CatalogEligibilityStatus.DEFERRED,
    eligible: false,
    confidence: 0.5,
    reason,
    blockingReasons: ['UNRESOLVED_RELATIONSHIP_TARGET'],
    warnings: [reason],
    signals: decisionSignals(group),
  };
}

/**
 * Quarantine form of a catalog-policy QUARANTINE outcome (excluded
 * game_type/status). Recorded as INELIGIBLE: the record must never become
 * canonical. The policy reason is preserved verbatim for auditability.
 */
export function policyExclusionDecision(
  group: DiscoveryGroupResult,
  policy: CatalogPolicyResult,
): CatalogEligibilityDecision {
  const reason = `POLICY_EXCLUDED: ${policy.reason}`;
  return {
    status: CatalogEligibilityStatus.INELIGIBLE,
    eligible: false,
    confidence: 1.0,
    reason,
    blockingReasons: ['POLICY_EXCLUDED'],
    warnings: [],
    signals: decisionSignals(group),
  };
}

/**
 * Quarantine form of a catalog-policy REVIEW_REQUIRED outcome (missing or
 * ambiguous provider metadata). Recorded as DEFERRED: a curatorial
 * decision may admit the record later; nothing is persisted now.
 */
export function policyReviewDecision(
  group: DiscoveryGroupResult,
  policy: CatalogPolicyResult,
): CatalogEligibilityDecision {
  const reason = `POLICY_REVIEW: ${policy.reason}`;
  return {
    status: CatalogEligibilityStatus.DEFERRED,
    eligible: false,
    confidence: 0.5,
    reason,
    blockingReasons: ['POLICY_REVIEW'],
    warnings: [reason],
    signals: decisionSignals(group),
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function isGameLike(category: ClassificationCategory): boolean {
  return (
    category === ClassificationCategory.GAME ||
    category === ClassificationCategory.DLC ||
    category === ClassificationCategory.EXPANSION
  );
}

function evaluateUnknown(
  classificationConfidence: number,
  identityConfidence: number,
  sourceCount: number,
  signals: CatalogEligibilitySignals,
): CatalogEligibilityDecision {
  const warnings: string[] = ['Classification is UNKNOWN'];

  const hasStrongIdentity = identityConfidence >= UNKNOWN_IDENTITY_THRESHOLD;
  const hasMultipleSources = sourceCount >= UNKNOWN_SOURCE_THRESHOLD;

  if (hasStrongIdentity && hasMultipleSources) {
    warnings.push('Accepted despite UNKNOWN classification due to strong supporting signals');
    return {
      status: CatalogEligibilityStatus.ELIGIBLE,
      eligible: true,
      confidence: Math.min(classificationConfidence, identityConfidence, 0.7),
      reason: 'UNKNOWN classification but strong identity confidence and multiple sources agree',
      blockingReasons: [],
      warnings,
      signals,
    };
  }

  if (hasStrongIdentity || hasMultipleSources) {
    return defer(
      'UNKNOWN classification with partial supporting signals — insufficient for definitive decision',
      signals,
    );
  }

  return defer('UNKNOWN classification with insufficient supporting signals', signals);
}

function deriveCompleteness(group: DiscoveryGroupResult): MetadataCompleteness {
  const best = group.observations[0];
  if (!best) return MetadataCompleteness.NOT_FOUND;

  const candidate = best.candidate;
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

  const ratio = total > 0 ? score / total : 0;

  if (ratio >= 0.8) return MetadataCompleteness.FOUND_COMPLETE;
  if (ratio >= 0.5) return MetadataCompleteness.FOUND_SUFFICIENT;
  if (ratio > 0) return MetadataCompleteness.FOUND_PARTIAL;
  return MetadataCompleteness.NOT_FOUND;
}

function reject(
  reason: string,
  blockingReasons: string[],
  signals: CatalogEligibilitySignals,
): CatalogEligibilityDecision {
  return {
    status: CatalogEligibilityStatus.INELIGIBLE,
    eligible: false,
    confidence: 1.0,
    reason,
    blockingReasons,
    warnings: [],
    signals,
  };
}

function defer(reason: string, signals: CatalogEligibilitySignals): CatalogEligibilityDecision {
  return {
    status: CatalogEligibilityStatus.DEFERRED,
    eligible: false,
    confidence: 0.5,
    reason,
    blockingReasons: [],
    warnings: [reason],
    signals,
  };
}

// ─── Logger integration ──────────────────────────────────────

export function logEligibilityDecision(
  groupId: string,
  decision: CatalogEligibilityDecision,
): void {
  const data = {
    groupId,
    status: decision.status,
    eligible: decision.eligible,
    confidence: decision.confidence,
    reason: decision.reason,
    classification: decision.signals.classification,
    classificationConfidence: decision.signals.classificationConfidence,
    identityConfidence: decision.signals.identityConfidence,
    sourceCount: decision.signals.sourceCount,
    blockingReasons: decision.blockingReasons,
    warnings: decision.warnings,
  };

  if (decision.status === CatalogEligibilityStatus.ELIGIBLE) {
    logger.info('eligibility.accepted', data);
  } else if (decision.status === CatalogEligibilityStatus.INELIGIBLE) {
    logger.info('eligibility.rejected', data);
  } else {
    logger.info('eligibility.deferred', data);
  }
}
