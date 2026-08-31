import type { ClassificationCategory } from '../domain/shared/classification-category.js';
import type { IdentityOutcome } from '../domain/shared/identity-outcome.js';
import type { GameRelationshipType } from '../domain/shared/game-relationship-type.js';

// ─── Valid Vocabularies ────────────────────────────────────────

export const VALID_CLASSIFICATION_CATEGORIES: readonly ClassificationCategory[] = [
  'GAME',
  'DLC',
  'EXPANSION',
  'MOVIE',
  'TV_SHOW',
  'ANIME',
  'SOUNDTRACK',
  'BOOK',
  'HARDWARE',
  'PROMOTIONAL',
  'CHARACTER',
  'FRANCHISE',
  'PERSON',
  'EVENT',
  'UNKNOWN',
] as const;

export const VALID_IDENTITY_OUTCOMES: readonly IdentityOutcome[] = [
  'SAME_GAME',
  'DIFFERENT_GAME',
  'RELATED_GAME',
  'UNRESOLVED',
] as const;

export const VALID_RELATIONSHIP_TYPES: readonly GameRelationshipType[] = [
  'REMAKE',
  'REMASTER',
  'ENHANCED_VERSION',
  'PORT',
  'EXPANSION',
  'REGIONAL_RELEASE',
  'ALTERNATE_TITLE',
  'RELATED_GAME',
] as const;

// ─── Thresholds ────────────────────────────────────────────────

export const CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD = 0.7;
export const CLASSIFICATION_AMBIGUITY_THRESHOLD = 0.1;
export const AI_MIN_CONFIDENCE = 0.5;

export const IDENTITY_LOW_CONFIDENCE_THRESHOLD = 0.6;

export const ENRICHMENT_MIN_CONFIDENCE = 0.7;
