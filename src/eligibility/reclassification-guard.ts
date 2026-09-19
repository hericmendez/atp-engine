/**
 * Reclassification guard for existing canonical games.
 *
 * Pure function: compares the stored canonical classification
 * (gameType/gameStatus) against an incoming ingestion candidate's
 * classification and decides whether the update may proceed.
 *
 * Rules:
 * - Either side null (missing) is never a conflict. Stored nulls are
 *   legacy data predating gameType/gameStatus; incoming nulls must never
 *   overwrite known stored values (the enrichment engine does not write
 *   classification, so "compatible" here means "proceed, preserve stored").
 * - Same values on both sides are safe → compatible.
 * - A material change in gameType OR gameStatus (both are compared,
 *   never only one) → conflict. The caller must quarantine instead of
 *   mutating the canonical record, and must never mint a duplicate Game.
 */

export interface ClassificationPair {
  readonly gameType: string | null | undefined;
  readonly gameStatus: string | null | undefined;
}

export type ReclassificationVerdict =
  | { readonly kind: 'compatible' }
  | {
      readonly kind: 'conflict';
      readonly changedFields: readonly ('gameType' | 'gameStatus')[];
      readonly storedType: string | null;
      readonly storedStatus: string | null;
      readonly incomingType: string | null;
      readonly incomingStatus: string | null;
    };

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function checkReclassification(
  stored: ClassificationPair,
  incoming: ClassificationPair,
): ReclassificationVerdict {
  const storedType = normalize(stored.gameType);
  const storedStatus = normalize(stored.gameStatus);
  const incomingType = normalize(incoming.gameType);
  const incomingStatus = normalize(incoming.gameStatus);

  const changedFields: ('gameType' | 'gameStatus')[] = [];

  // A known value on both sides that differs is a material change.
  // Any null on either side is missing data, never a conflict.
  if (storedType !== null && incomingType !== null && storedType !== incomingType) {
    changedFields.push('gameType');
  }
  if (storedStatus !== null && incomingStatus !== null && storedStatus !== incomingStatus) {
    changedFields.push('gameStatus');
  }

  if (changedFields.length === 0) {
    return { kind: 'compatible' };
  }

  return {
    kind: 'conflict',
    changedFields,
    storedType,
    storedStatus,
    incomingType,
    incomingStatus,
  };
}
