/**
 * Deterministic validation for the MobyGames platform mapping dataset.
 *
 * A mapping row links a snapshot identity (`mobygamesPlatformId`) to a
 * known ATP platform id. Nothing is ever inferred from names: MAPPED
 * rows require a snapshot-backed numeric id, and name-keyed rows may
 * only ever be UNRESOLVED pointers (e.g. a manifest entry with no
 * confirmed provider id yet).
 */

export type PlatformMappingStatus = 'MAPPED' | 'UNRESOLVED';

export interface PlatformMappingEntry {
  readonly mobygamesPlatformId?: number;
  /** Manifest name pointer, allowed only on UNRESOLVED rows that
   * reference a manifest entry with no confirmed provider id. */
  readonly manifestName?: string;
  readonly atpPlatformId?: string;
  readonly status: PlatformMappingStatus;
  /** Required on MAPPED: documented deterministic evidence for the link. */
  readonly evidence?: string;
  /** Required on UNRESOLVED: machine-readable cause. */
  readonly reason?: string;
}

export interface SnapshotIdentity {
  readonly source: string;
  readonly sourcePlatformId: number;
  readonly name: string;
}

export interface MappingDatasetInput {
  readonly snapshot: readonly SnapshotIdentity[];
  readonly mapping: readonly PlatformMappingEntry[];
  /** Ids of curated ATP platforms the mapping may target. */
  readonly atpPlatformIds: readonly string[];
  /** Manifest names UNRESOLVED rows may point at. */
  readonly manifestNames: readonly string[];
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function validateMappingDataset(input: MappingDatasetInput): readonly string[] {
  const errors: string[] = [];

  const snapshotIds = new Set<number>();
  for (const entry of input.snapshot) {
    if (!isPositiveInt(entry.sourcePlatformId)) {
      errors.push(`snapshot: sourcePlatformId must be an integer > 0 (got ${String(entry.sourcePlatformId)})`);
      continue;
    }
    if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
      errors.push(`snapshot: name must be non-empty for id ${entry.sourcePlatformId}`);
    }
    if (snapshotIds.has(entry.sourcePlatformId)) {
      errors.push(`snapshot: duplicate sourcePlatformId ${entry.sourcePlatformId}`);
    }
    snapshotIds.add(entry.sourcePlatformId);
  }

  const mappedTargets = new Map<number, string>();
  const unresolvedIds = new Set<number>();
  const rejectIfUnresolved = (id: number, where: string): void => {
    if (unresolvedIds.has(id)) {
      errors.push(
        `${where}: mobygamesPlatformId ${id} is already UNRESOLVED and cannot also be MAPPED`,
      );
    }
  };
  input.mapping.forEach((row, index) => {
    const where = `mapping[${index}]`;
    if (row.status !== 'MAPPED' && row.status !== 'UNRESOLVED') {
      errors.push(`${where}: unsupported status ${String(row.status)}`);
      return;
    }

    if (row.status === 'MAPPED') {
      if (!isPositiveInt(row.mobygamesPlatformId)) {
        errors.push(`${where}: MAPPED requires mobygamesPlatformId > 0`);
        return;
      }
      if (row.manifestName !== undefined) {
        errors.push(`${where}: MAPPED rows must not carry manifestName (identity only)`);
      }
      if (!snapshotIds.has(row.mobygamesPlatformId)) {
        errors.push(
          `${where}: mobygamesPlatformId ${row.mobygamesPlatformId} is not in the snapshot`,
        );
      }
      if (typeof row.atpPlatformId !== 'string' || row.atpPlatformId.length === 0) {
        errors.push(`${where}: MAPPED requires atpPlatformId`);
      } else if (!input.atpPlatformIds.includes(row.atpPlatformId)) {
        errors.push(`${where}: unknown atpPlatformId "${row.atpPlatformId}"`);
      }
      if (typeof row.evidence !== 'string' || row.evidence.trim().length === 0) {
        errors.push(`${where}: MAPPED requires documented evidence`);
      }
      const previous = mappedTargets.get(row.mobygamesPlatformId);
      if (previous !== undefined) {
        errors.push(
          `${where}: duplicate mapping for mobygamesPlatformId ${row.mobygamesPlatformId}` +
            (previous !== row.atpPlatformId ? ` (already maps to "${previous}")` : ''),
        );
      }
      mappedTargets.set(row.mobygamesPlatformId, row.atpPlatformId ?? '');
      rejectIfUnresolved(row.mobygamesPlatformId, where);
      return;
    }

    // UNRESOLVED: exactly one reference, never a target.
    const hasId = row.mobygamesPlatformId !== undefined;
    const hasName = row.manifestName !== undefined;
    if (hasId === hasName) {
      errors.push(`${where}: UNRESOLVED requires exactly one of mobygamesPlatformId, manifestName`);
      return;
    }
    if (row.atpPlatformId !== undefined) {
      errors.push(`${where}: UNRESOLVED must not carry atpPlatformId`);
      return;
    }
    if (typeof row.reason !== 'string' || row.reason.trim().length === 0) {
      errors.push(`${where}: UNRESOLVED requires a reason`);
      return;
    }
    if (hasId && !isPositiveInt(row.mobygamesPlatformId)) {
      errors.push(`${where}: mobygamesPlatformId must be an integer > 0`);
    }
    if (hasId && !snapshotIds.has(row.mobygamesPlatformId as number)) {
      errors.push(
        `${where}: mobygamesPlatformId ${row.mobygamesPlatformId} is not in the snapshot`,
      );
    }
    if (hasId) {
      if (unresolvedIds.has(row.mobygamesPlatformId as number)) {
        errors.push(
          `${where}: duplicate UNRESOLVED row for mobygamesPlatformId ${row.mobygamesPlatformId}`,
        );
      }
      unresolvedIds.add(row.mobygamesPlatformId as number);
      if (mappedTargets.has(row.mobygamesPlatformId as number)) {
        errors.push(
          `${where}: mobygamesPlatformId ${row.mobygamesPlatformId} is already MAPPED and cannot also be UNRESOLVED`,
        );
      }
    }
    if (hasName && !input.manifestNames.includes(row.manifestName as string)) {
      errors.push(`${where}: manifestName "${row.manifestName}" is not in the manifest`);
    }
  });

  return errors;
}
