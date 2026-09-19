import type { DiscoveryGroupResult } from '../discovery/discovery-types.js';
import type {
  CatalogEligibilityDecision,
} from '../eligibility/catalog-eligibility.js';
import type { QuarantineRepository } from './quarantine-repository.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface QuarantineServiceDependencies {
  quarantineRepository: QuarantineRepository;
}

/**
 * Preserves rejected discovery candidates for later inspection (bulk sync
 * accounting: processed vs accepted vs rejected). Accepted groups never
 * touch quarantine. Recording failures are logged, never fatal to
 * ingestion.
 */
export class QuarantineService {
  private readonly quarantineRepository: QuarantineRepository;

  constructor(deps: QuarantineServiceDependencies) {
    this.quarantineRepository = deps.quarantineRepository;
  }

  async recordRejection(
    group: DiscoveryGroupResult,
    decision: CatalogEligibilityDecision,
  ): Promise<void> {
    if (decision.eligible) {
      return;
    }
    if (
      decision.status !== 'INELIGIBLE' &&
      decision.status !== 'DEFERRED'
    ) {
      return;
    }
    try {
      const first = group.observations[0];
      await this.quarantineRepository.record({
        groupId: group.groupId,
        source: first?.source ?? 'unknown',
        sourceId: first?.sourceId,
        status: decision.status,
        reason: decision.reason,
        blockingReasons: decision.blockingReasons,
        classification: decision.signals.classification,
        classificationConfidence: decision.signals.classificationConfidence,
        identityConfidence: decision.signals.identityConfidence,
        sourceCount: decision.signals.sourceCount,
        titles: group.observations.flatMap((o) =>
          o.candidate.titles.map((t) => t.value),
        ),
        retrievedAt: first?.retrievedAt ?? new Date().toISOString(),
      });
    } catch (error) {
      logger.warn('quarantine.record.failed', {
        groupId: group.groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
