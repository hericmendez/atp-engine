import type { PlatformRepository } from './platform-repository.js';
import {
  addPlatformExternalIdentity,
  findPlatformExternalIdentity,
} from '../domain/platform/atp-platform.js';
import { createPlatformExternalIdentity } from '../domain/platform/platform-external-identity.js';
import type { PlatformMappingEntry } from '../platform-manifest/mobygames-mapping.js';

/**
 * Controlled application of validated mapping rows to ATP platforms.
 *
 * Identity-migration responsibility only — never ingestion (no
 * CatalogSyncService involvement), never games, never quarantine.
 *
 * Flow: validate every row structurally first (any structural error
 * aborts the whole operation with zero writes); then each MAPPED row
 * is checked and applied independently. A per-row CONFLICT or
 * MISSING_ATP_PLATFORM aborts only that row. UNRESOLVED rows are
 * always skipped. Re-running is idempotent (ALREADY_PRESENT).
 */

export type ApplyIdentityResult =
  | 'APPLIED'
  | 'ALREADY_PRESENT'
  | 'CONFLICT'
  | 'MISSING_ATP_PLATFORM'
  | 'INVALID_MAPPING'
  | 'SKIPPED_UNRESOLVED';

export interface ApplyIdentityReport {
  readonly mobygamesPlatformId?: number;
  readonly manifestName?: string;
  readonly atpPlatformId?: string;
  readonly result: ApplyIdentityResult;
  readonly detail?: string;
}

export interface ApplyIdentitySummary {
  readonly dryRun: boolean;
  readonly results: readonly ApplyIdentityReport[];
}

function invalid(reason: string): ApplyIdentityReport {
  return { result: 'INVALID_MAPPING', detail: reason };
}

export class ApplyPlatformExternalIdentities {
  private readonly platformRepository: PlatformRepository;

  constructor(deps: { platformRepository: PlatformRepository }) {
    this.platformRepository = deps.platformRepository;
  }

  async apply(
    mapping: readonly PlatformMappingEntry[],
    options: { dryRun?: boolean } = {},
  ): Promise<ApplyIdentitySummary> {
    const dryRun = options.dryRun ?? false;

    // Phase 1 — structural validation of every row before any write.
    for (const row of mapping) {
      const error = this.validateRow(row);
      if (error) {
        throw new Error(`invalid mapping dataset: ${error.detail}`);
      }
    }

    // Phase 2 — independent per-row check + apply.
    const results: ApplyIdentityReport[] = [];
    for (const row of mapping) {
      if (row.status === 'UNRESOLVED') {
        results.push({
          mobygamesPlatformId: row.mobygamesPlatformId,
          manifestName: row.manifestName,
          result: 'SKIPPED_UNRESOLVED',
          detail: row.reason,
        });
        continue;
      }
      results.push(await this.applyMappedRow(row, dryRun));
    }
    return { dryRun, results };
  }

  private validateRow(row: PlatformMappingEntry): ApplyIdentityReport | null {
    if (row.status !== 'MAPPED' && row.status !== 'UNRESOLVED') {
      return invalid(`unsupported status ${String(row.status)}`);
    }
    if (row.status === 'MAPPED') {
      if (
        row.mobygamesPlatformId === undefined ||
        !Number.isInteger(row.mobygamesPlatformId) ||
        row.mobygamesPlatformId <= 0
      ) {
        return invalid('MAPPED requires mobygamesPlatformId > 0');
      }
      if (typeof row.atpPlatformId !== 'string' || row.atpPlatformId.length === 0) {
        return invalid('MAPPED requires atpPlatformId');
      }
      return null;
    }
    const hasId = row.mobygamesPlatformId !== undefined;
    const hasName = row.manifestName !== undefined;
    if (hasId === hasName) {
      return invalid('UNRESOLVED requires exactly one of mobygamesPlatformId, manifestName');
    }
    return null;
  }

  private async applyMappedRow(
    row: PlatformMappingEntry,
    dryRun: boolean,
  ): Promise<ApplyIdentityReport> {
    const atpPlatformId = row.atpPlatformId as string;
    const mobygamesPlatformId = row.mobygamesPlatformId as number;

    const platform = await this.platformRepository.findById(atpPlatformId);
    if (!platform) {
      return {
        mobygamesPlatformId,
        atpPlatformId,
        result: 'MISSING_ATP_PLATFORM',
        detail: `ATP platform "${atpPlatformId}" does not exist; not created automatically`,
      };
    }

    const identity = createPlatformExternalIdentity('mobygames', mobygamesPlatformId);
    if (findPlatformExternalIdentity(platform, 'mobygames', mobygamesPlatformId)) {
      return { mobygamesPlatformId, atpPlatformId, result: 'ALREADY_PRESENT' };
    }

    const owner = await this.platformRepository.findByExternalIdentity(
      'mobygames',
      mobygamesPlatformId,
    );
    if (owner && owner.id !== platform.id) {
      return {
        mobygamesPlatformId,
        atpPlatformId,
        result: 'CONFLICT',
        detail:
          `mobygames:${mobygamesPlatformId} already belongs to ${owner.id}; ` +
          `expected ${platform.id}; identity not moved`,
      };
    }

    if (!dryRun) {
      await this.platformRepository.save(addPlatformExternalIdentity(platform, identity));
    }
    return { mobygamesPlatformId, atpPlatformId, result: 'APPLIED' };
  }
}
