import type { Game } from '../domain/game/game.js';
import type { GameRepository } from '../domain/game/game-repository.js';
import type { PlatformCatalogRepository } from '../domain/platform/platform-catalog-repository.js';
import type { DiscoveryEngine } from '../discovery/discovery-engine.js';
import type { DiscoveryGroupResult } from '../discovery/discovery-types.js';
import type { DiscoverySourceObservation } from '../discovery/discovery-types.js';
import type { EnrichmentService } from './enrichment-service.js';
import type { CatalogSyncHistoryRepository } from './catalog-sync-history-repository.js';
import type {
  SyncRequest,
  SyncResult,
  PlatformSyncResult,
  ResolvedPlatform,
  SyncTotals,
  ResumableEnumerationOptions,
  ResumableEnumerationResult,
} from './catalog-sync-types.js';
import type { SyncTrigger } from './catalog-sync-history-types.js';
import { createGameId } from '../domain/shared/ids.js';
import type { GameId } from '../domain/shared/ids.js';
import { discoveryGroupToGame, selectPersistObservation } from './discovery-to-game.js';
import {
  catalogEligibility,
  logEligibilityDecision,
  hasStableIdentity,
  stableIdentityExtId,
  missingStableIdentityDecision,
  unresolvedPortParentDecision,
  reclassificationConflictDecision,
  unresolvedRelationshipTargetDecision,
  policyExclusionDecision,
  policyReviewDecision,
} from '../eligibility/catalog-eligibility.js';
import { checkReclassification } from '../eligibility/reclassification-guard.js';
import {
  evaluateCatalogPolicy,
  CatalogPolicyDecision,
} from '../eligibility/game-type-policy.js';
import type { CatalogSource } from '../sources/catalog-source.js';
import type { Classifier } from '../classification/classifier.js';
import type { ClassificationResult } from '../classification/classification-result.js';
import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import { normalizeCandidate } from '../normalization/normalize.js';
import type { ReleaseDate } from '../domain/shared/release-date.js';
import { IdentityOutcome } from '../domain/shared/identity-outcome.js';
import {
  findOriginalEdgeRequest,
  withOriginalEdge,
  type OriginalEdgeKind,
  type OriginalReference,
} from './relationships.js';
import {
  resolvePortParent,
  type PortParentReference,
} from '../eligibility/port-resolution.js';
import { mergeCandidateReleases } from '../enrichment/enrichment-engine.js';
import type { QuarantineService } from './quarantine-service.js';
import { logPersistFailure } from './persist-logging.js';
import { sanitizeErrorMessage } from './persist-logging.js';
import type { CatalogSyncStateRepository } from './catalog-sync-state-repository.js';
import { logger } from '../infrastructure/logger/logger.js';

const MAX_SYNC_LIMIT = 100;

type PortReference = Extract<PortParentReference, { kind: 'parent-reference' }>;

interface PendingPort {
  readonly group: DiscoveryGroupResult;
  readonly observation: DiscoverySourceObservation;
  readonly ref: PortReference;
}

interface PendingRelationship {
  readonly gameId: GameId;
  readonly source: string;
  readonly kind: OriginalEdgeKind;
  readonly ref: OriginalReference;
  readonly group: DiscoveryGroupResult;
}

/**
 * First available release date across a normalized candidate's releases.
 * Provider-agnostic release evidence for the catalog policy (IGDB
 * candidates carry first_release_date on every release).
 */
function firstReleaseEvidence(candidate: NormalizedCandidate): ReleaseDate | null {
  for (const release of candidate.releases) {
    if (release.releaseDate !== null) {
      return release.releaseDate;
    }
  }
  return null;
}

/**
 * Build a single-observation group for an enumerated candidate, preserving
 * provider order (no ranking: the enumeration page order is the contract).
 * Classification is real (injected classifier); identity metadata is
 * explicitly provider-declared — a single stable provider observation
 * needs no merging, so resolution fields carry the deterministic default.
 */
function buildEnumerationGroup(
  source: string,
  sourceId: string,
  candidate: NormalizedCandidate,
  classification: ClassificationResult,
): DiscoveryGroupResult {
  const observation: DiscoverySourceObservation = {
    source,
    sourceId,
    candidate,
    classification,
    retrievedAt: candidate.provenance.retrievedAt,
  };

  return {
    groupId: `enum-${source}-${sourceId}`,
    observations: [observation],
    mergedClassification: classification,
    identityResolution: {
      outcome: IdentityOutcome.SAME_GAME,
      relationship: null,
      confidence: 1.0,
      signals: [],
      reason: 'single provider-declared observation with stable external identity',
      method: 'NATIVE',
    },
    rankingScore: 0,
    rankingBreakdown: {
      identityConfidence: 1.0,
      classificationConfidence: classification.confidence,
      sourceCount: 1,
      metadataCompleteness: 0,
      titleRelevance: 0,
    },
  };
}
function findPortObservation(
  group: DiscoveryGroupResult,
): { observation: DiscoverySourceObservation; ref: PortReference } | undefined {
  // First observation (group order) whose candidate declares a resolvable
  // port-parent reference. Title matching is never consulted.
  for (const observation of group.observations) {
    const ref = resolvePortParent({
      gameType: observation.candidate.gameType,
      parentGameId: observation.candidate.parentGameId,
      versionParentId: observation.candidate.versionParentId,
    });
    if (ref.kind === 'parent-reference') {
      return { observation, ref };
    }
  }
  return undefined;
}

export interface CatalogSyncServiceDependencies {
  gameRepository: GameRepository;
  platformCatalogRepository: PlatformCatalogRepository;
  discoveryEngine: DiscoveryEngine;
  enrichmentService: EnrichmentService;
  historyRepository?: CatalogSyncHistoryRepository;
  quarantineService?: QuarantineService;
  /**
   * Optional because only enumeration ingestion needs it. The text-search
   * sync path classifies inside DiscoveryEngine.
   */
  classifier?: Classifier;
}

export class CatalogSyncService {
  private readonly gameRepository: GameRepository;
  private readonly platformCatalogRepository: PlatformCatalogRepository;
  private readonly discoveryEngine: DiscoveryEngine;
  private readonly enrichmentService: EnrichmentService;
  private readonly historyRepository?: CatalogSyncHistoryRepository;
  private readonly quarantineService?: QuarantineService;
  private readonly classifier?: Classifier;
  private pendingPorts: PendingPort[] = [];
  private pendingRelationships: PendingRelationship[] = [];

  constructor(deps: CatalogSyncServiceDependencies) {
    this.gameRepository = deps.gameRepository;
    this.platformCatalogRepository = deps.platformCatalogRepository;
    this.discoveryEngine = deps.discoveryEngine;
    this.enrichmentService = deps.enrichmentService;
    this.historyRepository = deps.historyRepository;
    this.quarantineService = deps.quarantineService;
    this.classifier = deps.classifier;
  }

  async sync(request: SyncRequest): Promise<SyncResult> {
    const startTime = Date.now();
    const trigger: SyncTrigger = request.trigger ?? 'manual';
    const dryRun = request.dryRun ?? false;

    logger.info('catalog.sync.started', {
      platformCount: request.platforms?.length ?? 0,
      activeOnly: request.activeOnly,
      from: request.from,
      to: request.to,
      dryRun,
      trigger,
    });

    const requestedPlatformIds = [...(request.platforms ?? [])];

    let historyId: string | undefined;
    // Dry runs are fully side-effect free: no history record is created
    // (and therefore never updated either — the update paths below key
    // off historyId). Disposition is only reported.
    if (!dryRun && this.historyRepository) {
      try {
        historyId = await this.historyRepository.create({
          startedAt: new Date(startTime),
          completedAt: null,
          trigger,
          status: 'running',
          dryRun,
          from: request.from,
          to: request.to,
          requestedPlatformIds,
          resolvedPlatformNames: [],
          totals: {
            candidatesFound: 0,
            newGames: 0,
            existingGames: 0,
            updatedGames: 0,
            rejected: 0,
            errors: 0,
          },
          platformResults: [],
          error: null,
          durationMs: null,
        });
      } catch (error) {
        logger.error('catalog.sync.history.create_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const result = await this.executeSync(request, startTime, historyId);

      if (historyId && this.historyRepository) {
        try {
          await this.historyRepository.update(historyId, {
            completedAt: new Date(),
            status: result.status,
            totals: result.totals,
            platformResults: result.platforms.map((p) => ({
              platformId: p.platformId,
              platformName: p.platformName,
              candidatesFound: p.candidatesFound,
              newGames: p.newGames,
              existingGames: p.existingGames,
              updatedGames: p.updatedGames,
              rejected: p.rejected,
              errors: p.errors,
              status: p.status,
              error: p.error,
            })),
            durationMs: result.durationMs,
            resolvedPlatformNames: result.platforms.map((p) => p.platformName),
            error:
              result.status === 'failed'
                ? (result.platforms.find((p) => p.error)?.error ?? 'All platforms failed')
                : null,
          });
        } catch (error) {
          logger.error('catalog.sync.history.update_failed', {
            historyId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { ...result, historyId };
    } catch (error) {
      if (historyId && this.historyRepository) {
        const durationMs = Date.now() - startTime;
        try {
          await this.historyRepository.update(historyId, {
            completedAt: new Date(),
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            durationMs,
          });
        } catch (updateError) {
          logger.error('catalog.sync.history.update_failed', {
            historyId,
            error: updateError instanceof Error ? updateError.message : String(updateError),
          });
        }
      }

      throw error;
    }
  }

  private async executeSync(
    request: SyncRequest,
    startTime: number,
    _historyId?: string,
  ): Promise<SyncResult> {
    const platforms = await this.resolvePlatforms(request);

    if (platforms.length === 0) {
      return {
        status: 'completed',
        platforms: [],
        totals: this.emptyTotals(),
        dryRun: request.dryRun ?? false,
        durationMs: Date.now() - startTime,
      };
    }

    const platformResults: PlatformSyncResult[] = [];

    for (const platform of platforms) {
      try {
        const result = await this.syncPlatform(platform, request.dryRun ?? false);
        platformResults.push(result);
      } catch (error) {
        logger.error('catalog.sync.platform.failed', {
          platformId: platform.entry.id,
          platformName: platform.entry.name,
          error: error instanceof Error ? error.message : String(error),
        });

        platformResults.push({
          platformId: platform.entry.id,
          platformName: platform.entry.name,
          candidatesFound: 0,
          newGames: 0,
          existingGames: 0,
          updatedGames: 0,
          rejected: 0,
          errors: 1,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totals = this.aggregateTotals(platformResults);
    const allFailed = platformResults.every((r) => r.status === 'failed');
    const someFailed = platformResults.some((r) => r.status === 'failed');
    const status = allFailed ? 'failed' : someFailed ? 'partial' : 'completed';

    const durationMs = Date.now() - startTime;

    logger.info('catalog.sync.completed', {
      status,
      platformCount: platforms.length,
      totalCandidates: totals.candidatesFound,
      totalNew: totals.newGames,
      totalUpdated: totals.updatedGames,
      totalRejected: totals.rejected,
      totalErrors: totals.errors,
      dryRun: request.dryRun ?? false,
      durationMs,
    });

    return {
      status,
      platforms: platformResults,
      totals,
      dryRun: request.dryRun ?? false,
      durationMs,
    };
  }

  private async resolvePlatforms(request: SyncRequest): Promise<ResolvedPlatform[]> {
    const dateRange = this.parseDateRange(request.from, request.to);

    if (request.platforms && request.platforms.length > 0) {
      const platforms: ResolvedPlatform[] = [];
      const seen = new Set<string>();

      for (const platformId of request.platforms) {
        if (seen.has(platformId)) continue;
        seen.add(platformId);

        const entry = await this.platformCatalogRepository.findById(platformId);
        if (entry) {
          platforms.push({
            entry,
            queryYear: dateRange.fromYear,
          });
        } else {
          logger.warn('catalog.sync.platform.not_found', { platformId });
        }
      }

      return platforms;
    }

    if (request.activeOnly) {
      const result = await this.platformCatalogRepository.findMany({
        status: 'active',
        limit: 500,
      });

      return result.items.map((entry) => ({
        entry,
        queryYear: dateRange.fromYear,
      }));
    }

    return [];
  }

  private parseDateRange(
    from: string,
    to: string,
  ): {
    fromYear: number | null;
    toYear: number | null;
  } {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return { fromYear: null, toYear: null };
    }

    if (fromDate > toDate) {
      return { fromYear: null, toYear: null };
    }

    return {
      fromYear: fromDate.getUTCFullYear(),
      toYear: toDate.getUTCFullYear(),
    };
  }

  private async syncPlatform(
    platform: ResolvedPlatform,
    dryRun: boolean,
  ): Promise<PlatformSyncResult> {
    const startTime = Date.now();

    logger.info('catalog.sync.platform.started', {
      platformId: platform.entry.id,
      platformName: platform.entry.name,
    });

    const query = this.buildSyncQuery(platform);

    const discoveryResult = await this.discoveryEngine.discover({
      query,
      limit: MAX_SYNC_LIMIT,
    });

    const platformFiltered = this.filterByPlatform(discoveryResult.groups, platform.entry.name);

    const settled = await this.settleGroups(platformFiltered, dryRun);

    const durationMs = Date.now() - startTime;

    logger.info('catalog.sync.platform.completed', {
      platformId: platform.entry.id,
      platformName: platform.entry.name,
      candidatesFound: platformFiltered.length,
      newGames: settled.newGames,
      existingGames: settled.existingGames,
      updatedGames: settled.updatedGames,
      rejected: settled.rejected,
      errors: settled.errors,
      durationMs,
    });

    return {
      platformId: platform.entry.id,
      platformName: platform.entry.name,
      candidatesFound: platformFiltered.length,
      newGames: settled.newGames,
      existingGames: settled.existingGames,
      updatedGames: settled.updatedGames,
      rejected: settled.rejected,
      errors: settled.errors,
      status: 'completed',
    };
  }

  /**
   * Shared first-pass + deferred second-pass settlement for one batch of
   * groups, used by both text-search sync and enumeration ingestion.
   * Preserves group order (no ranking here); callers decide ordering.
   */
  private async settleGroups(
    groups: readonly DiscoveryGroupResult[],
    dryRun: boolean,
  ): Promise<{
    newGames: number;
    existingGames: number;
    updatedGames: number;
    rejected: number;
    errors: number;
  }> {
    // Ports whose parent is not yet persisted anywhere defer to a second
    // pass at the end of this batch, so parents discovered later in the
    // same run can still be found. Reset per batch; callers are sequential.
    this.pendingPorts = [];
    this.pendingRelationships = [];

    let newGames = 0;
    let existingGames = 0;
    let updatedGames = 0;
    let rejected = 0;
    let errors = 0;

    for (const group of groups) {
      try {
        const result = await this.processGroup(group, dryRun);

        switch (result) {
          case 'new':
            newGames++;
            break;
          case 'existing':
            existingGames++;
            break;
          case 'updated':
            updatedGames++;
            break;
          case 'rejected':
            rejected++;
            break;
          case 'pending':
            // Disposition decided in the second pass below; not counted yet.
            break;
        }
      } catch (error) {
        logger.warn('catalog.sync.group.failed', {
          groupId: group.groupId,
          error: error instanceof Error ? error.message : String(error),
        });
        errors++;
      }
    }

    for (const pending of this.pendingPorts) {
      try {
        const outcome = await this.resolvePendingPort(pending, dryRun);

        switch (outcome) {
          case 'updated':
            updatedGames++;
            break;
          case 'existing':
            existingGames++;
            break;
          case 'rejected':
            rejected++;
            break;
        }
      } catch (error) {
        logger.warn('catalog.sync.port.failed', {
          groupId: pending.group.groupId,
          error: error instanceof Error ? error.message : String(error),
        });
        errors++;
      }
    }
    this.pendingPorts = [];

    // Relationship second pass: remakes/remasters whose original was
    // missing in the first pass. Resolved edges attach silently; still
    // missing targets quarantine WITHOUT touching game counters — the
    // game ingestion itself already succeeded and was counted.
    for (const pending of this.pendingRelationships) {
      try {
        await this.resolvePendingRelationship(pending, dryRun);
      } catch (error) {
        logger.warn('catalog.sync.relationship.failed', {
          gameId: pending.gameId,
          error: error instanceof Error ? error.message : String(error),
        });
        errors++;
      }
    }
    this.pendingRelationships = [];

    return { newGames, existingGames, updatedGames, rejected, errors };
  }

  /**
   * Canonical ingestion of one deterministic enumeration page (e.g.
   * `IgdbAdapter.enumerateByPlatform`). Text search is never involved;
   * only the given source enumerates. Provider order is preserved.
   *
   * Per candidate: catalog-policy gate → quarantine/review (never
   * persisted) → port without resolvable reference (immediate
   * UNRESOLVED_PORT_PARENT) → otherwise the shared pipeline
   * (classifier output feeds eligibility, ban, guard, port fold,
   * save, edges). Never touches sync history. In dry-run mode nothing
   * is written anywhere (reads only).
   */
  async ingestEnumerationPage(
    source: CatalogSource,
    platformId: number,
    options: { limit: number; offset: number; dryRun?: boolean },
  ): Promise<PlatformSyncResult> {
    const startTime = Date.now();
    const dryRun = options.dryRun ?? false;

    if (!this.classifier) {
      throw new Error('ingestEnumerationPage requires a configured classifier');
    }

    logger.info('catalog.enumeration.started', {
      source: source.source,
      platformId,
      limit: options.limit,
      offset: options.offset,
      dryRun,
    });

    const page = await source.enumerateByPlatform(platformId, {
      limit: options.limit,
      offset: options.offset,
    });

    const kept: DiscoveryGroupResult[] = [];
    let rejected = 0;

    for (const raw of page.items) {
      const candidate = normalizeCandidate(raw, raw.source, raw.sourceId);
      const classification = await this.classifier.classify(candidate);
      const group = buildEnumerationGroup(raw.source, raw.sourceId, candidate, classification);

      const policy = evaluateCatalogPolicy({
        gameType: candidate.gameType,
        gameStatus: candidate.gameStatus,
        releaseDate: firstReleaseEvidence(candidate),
      });

      if (policy.decision === CatalogPolicyDecision.QUARANTINE) {
        logger.info('catalog.enumeration.policy.excluded', {
          groupId: group.groupId,
          reason: policy.reason,
        });
        if (!dryRun) {
          await this.quarantineService?.recordRejection(group, policyExclusionDecision(group, policy));
        }
        rejected++;
        continue;
      }

      if (policy.decision === CatalogPolicyDecision.REVIEW_REQUIRED) {
        logger.info('catalog.enumeration.policy.review', {
          groupId: group.groupId,
          reason: policy.reason,
        });
        if (!dryRun) {
          await this.quarantineService?.recordRejection(group, policyReviewDecision(group, policy));
        }
        rejected++;
        continue;
      }

      if (policy.decision === CatalogPolicyDecision.PORT) {
        // Ports with a reference use the shared resolver (with its
        // second pass). A port that declares no reference can never
        // resolve — quarantine deterministically instead of persisting.
        const ref = resolvePortParent({
          gameType: candidate.gameType,
          parentGameId: candidate.parentGameId,
          versionParentId: candidate.versionParentId,
        });
        if (ref.kind !== 'parent-reference') {
          const detail =
            `port declares no resolvable parent reference ` +
            `(gameType=${candidate.gameType ?? 'null'}); ports never become canonical games`;
          logger.info('catalog.enumeration.port.unresolvable', { groupId: group.groupId });
          if (!dryRun) {
            await this.quarantineService?.recordRejection(
              group,
              unresolvedPortParentDecision(group, detail),
            );
          }
          rejected++;
          continue;
        }
      }

      kept.push(group);
    }

    const settled = await this.settleGroups(kept, dryRun);
    const durationMs = Date.now() - startTime;

    logger.info('catalog.enumeration.completed', {
      source: source.source,
      platformId,
      candidatesFound: page.items.length,
      newGames: settled.newGames,
      rejected: rejected + settled.rejected,
      durationMs,
    });

    return {
      platformId: `${source.source}:${platformId}`,
      platformName: `${source.source} platform ${platformId}`,
      candidatesFound: page.items.length,
      newGames: settled.newGames,
      existingGames: settled.existingGames,
      updatedGames: settled.updatedGames,
      rejected: rejected + settled.rejected,
      errors: settled.errors,
      status: 'completed',
    };
  }

  /**
   * Resumable enumeration ingestion over one platform scope, one page
   * at a time. This method only orchestrates the existing pipeline
   * (ingestEnumerationPage per page) — no normalize/eligibility/
   * resolution/enrichment/persist logic is duplicated here.
   *
   * Checkpoint rule: the row advances strictly AFTER each page fully
   * succeeds (nextOffset = offset + pageSize). Any page failure leaves
   * nextOffset on the uncompleted page (status FAILED) and rethrows —
   * no automatic retry. A later run reprocesses exactly that page, and
   * pipeline idempotency keeps the catalog safe. If even the
   * checkpoint write fails, the failure is logged and the original
   * error propagates: the next run reprocesses the page (prefer losing
   * progress over advancing incorrectly).
   *
   * The scope is fixed by countByPlatform() once per run; a shrinking
   * count simply completes early, a growing count is not revisited.
   * Dry runs never touch the checkpoint store. A COMPLETED scope
   * reruns as a no-op. Resuming with a different pageSize is an
   * explicit error — offsets are not transferable across page sizes.
   * Single-process sequential execution only; concurrent runs over the
   * same scope are not supported.
   */
  async ingestEnumerationResumable(
    source: CatalogSource,
    platformId: number,
    options: ResumableEnumerationOptions,
    stateRepository?: CatalogSyncStateRepository,
  ): Promise<ResumableEnumerationResult> {
    const startTime = Date.now();
    const { pageSize } = options;
    const dryRun = options.dryRun ?? false;
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw new Error(
        `ingestEnumerationResumable: pageSize must be a positive integer (got ${pageSize})`,
      );
    }

    const scope = {
      source: source.source,
      scopeType: 'platform',
      scopeId: String(platformId),
    };

    const existing = stateRepository
      ? await stateRepository.findByScope(scope.source, scope.scopeType, scope.scopeId)
      : undefined;

    if (existing && existing.status === 'COMPLETED') {
      logger.info('catalog.enumeration.resumable.already_completed', { ...scope });
      return {
        status: 'COMPLETED',
        source: scope.source,
        platformId,
        pageSize: existing.pageSize,
        totalCount: existing.totalCount,
        nextOffset: existing.nextOffset,
        processed: existing.processed,
        accepted: existing.accepted,
        quarantined: existing.quarantined,
        errorCount: existing.errorCount,
        pages: 0,
        dryRun,
        durationMs: Date.now() - startTime,
      };
    }

    if (existing && existing.pageSize !== pageSize) {
      throw new Error(
        `ingestEnumerationResumable: checkpoint pageSize mismatch for ` +
          `${scope.source}:${scope.scopeType}:${scope.scopeId} ` +
          `(checkpoint pageSize=${existing.pageSize}, requested pageSize=${pageSize}); ` +
          `resume with the original pageSize`,
      );
    }

    let totalCount: number | null;
    try {
      totalCount = await source.countByPlatform(platformId);
    } catch (error) {
      if (stateRepository && !dryRun) {
        try {
          await stateRepository.upsert({
            ...scope,
            pageSize,
            status: 'FAILED',
            nextOffset: existing?.nextOffset ?? 0,
            totalCount: existing?.totalCount ?? null,
            processed: existing?.processed ?? 0,
            accepted: existing?.accepted ?? 0,
            quarantined: existing?.quarantined ?? 0,
            errorCount: existing?.errorCount ?? 0,
            startedAt: existing?.startedAt ?? new Date(startTime).toISOString(),
            completedAt: undefined,
            error: sanitizeErrorMessage(
              error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            ),
          });
        } catch (persistError) {
          logger.warn('catalog.checkpoint.persist_failed', {
            ...scope,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          });
        }
      }
      throw error;
    }

    let offset = existing?.nextOffset ?? 0;
    let processed = existing?.processed ?? 0;
    let accepted = existing?.accepted ?? 0;
    let quarantined = existing?.quarantined ?? 0;
    let errorCount = existing?.errorCount ?? 0;
    let pages = 0;
    const startedAt = existing?.startedAt ?? new Date(startTime).toISOString();

    const persistCheckpoint = async (
      status: 'RUNNING' | 'COMPLETED' | 'FAILED',
      error?: string,
    ): Promise<void> => {
      if (!stateRepository || dryRun) {
        return;
      }
      await stateRepository.upsert({
        ...scope,
        pageSize,
        status,
        nextOffset: offset,
        totalCount,
        processed,
        accepted,
        quarantined,
        errorCount,
        startedAt,
        completedAt: status === 'COMPLETED' ? new Date().toISOString() : undefined,
        error,
      });
    };

    try {
      while (offset < totalCount) {
        const page = await this.ingestEnumerationPage(source, platformId, {
          limit: pageSize,
          offset,
          dryRun,
        });
        processed += page.candidatesFound;
        accepted += page.newGames + page.existingGames + page.updatedGames;
        quarantined += page.rejected;
        errorCount += page.errors;
        // The page fully succeeded (all writes finished): only now may
        // the checkpoint advance past it.
        offset += pageSize;
        pages += 1;
        await persistCheckpoint('RUNNING');
        logger.info('catalog.checkpoint.advanced', {
          ...scope,
          nextOffset: offset,
          candidatesFound: page.candidatesFound,
        });
      }
    } catch (error) {
      try {
        await persistCheckpoint(
          'FAILED',
          sanitizeErrorMessage(
            error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          ),
        );
      } catch (persistError) {
        logger.warn('catalog.checkpoint.persist_failed', {
          ...scope,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
      }
      throw error;
    }

    await persistCheckpoint('COMPLETED');
    logger.info('catalog.enumeration.resumable.completed', {
      ...scope,
      totalCount,
      processed,
      accepted,
      quarantined,
      errorCount,
      pages,
      dryRun,
      durationMs: Date.now() - startTime,
    });

    return {
      status: 'COMPLETED',
      source: scope.source,
      platformId,
      pageSize,
      totalCount,
      nextOffset: offset,
      processed,
      accepted,
      quarantined,
      errorCount,
      pages,
      dryRun,
      durationMs: Date.now() - startTime,
    };
  }

  private buildSyncQuery(platform: ResolvedPlatform): string {
    const parts: string[] = [platform.entry.name, 'games'];

    if (platform.queryYear) {
      parts.push(String(platform.queryYear));
    }

    return parts.join(' ');
  }

  private filterByPlatform(
    groups: readonly DiscoveryGroupResult[],
    platformName: string,
  ): readonly DiscoveryGroupResult[] {
    const normalizedPlatform = platformName.toLowerCase();

    return groups.filter((group) => {
      const hasPlatformMatch = group.observations.some((obs) => {
        const candidate = obs.candidate;

        for (const release of candidate.releases) {
          if (release.platform.name.toLowerCase().includes(normalizedPlatform)) {
            return true;
          }
        }

        const candidatePlatforms = candidate.titles.map((t) => t.value.toLowerCase());
        if (candidatePlatforms.some((t) => t.includes(normalizedPlatform))) {
          return true;
        }

        const description = candidate.description?.toLowerCase() ?? '';
        if (description.includes(normalizedPlatform)) {
          return true;
        }

        return false;
      });

      return hasPlatformMatch;
    });
  }

  private async processGroup(
    group: DiscoveryGroupResult,
    dryRun: boolean,
  ): Promise<'new' | 'existing' | 'updated' | 'rejected' | 'pending'> {
    // ── Canonical eligibility gate (shared with search persistence) ──
    // No ingestion path may bypass it. Rejections are quarantined for
    // bulk-sync accounting instead of disappearing.
    const decision = catalogEligibility(group);
    logEligibilityDecision(group.groupId, decision);

    if (!decision.eligible) {
      // Dry runs stay side-effect free: the 'rejected' counter still
      // reports, but nothing is recorded.
      if (!dryRun) {
        await this.quarantineService?.recordRejection(group, decision);
      }
      return 'rejected';
    }

    // ── Stable-identity ban ──
    // A group whose persisted candidate carries no source-provided
    // identifier must never mint a canonical Game (no atp-unknown
    // fallback). Applies to dry runs as well: disposition is reported,
    // only the quarantine write is skipped.
    if (!hasStableIdentity(group)) {
      logger.info('catalog.sync.identity.banned', { groupId: group.groupId });
      if (!dryRun) {
        await this.quarantineService?.recordRejection(group, missingStableIdentityDecision(group));
      }
      return 'rejected';
    }

    const bestObs = group.observations[0];
    const extId = bestObs
      ? group.observations.find((o) => o.candidate.externalIdentifiers.length > 0)?.candidate
          .externalIdentifiers[0]
      : undefined;

    if (extId) {
      const existing = await this.gameRepository.findByExternalIdentifier({
        source: extId.source,
        externalId: extId.id,
      });

      if (existing) {
        // Legacy path: identifiers already persisted as canonical Games
        // (including ports saved before port resolution existed) keep
        // their current behavior until the dirty-data disposition lands.
        // Only groups with no persisted identifier reach port resolution.
        //
        // ── Reclassification guard ──
        // Same canonical identity + differing classification quarantines
        // instead of mutating the stored record — and never mints a
        // duplicate Game. Runs before any update, dry runs included.
        const incomingCandidate = selectPersistObservation(group)?.candidate;
        const verdict = checkReclassification(
          { gameType: existing.gameType, gameStatus: existing.gameStatus },
          {
            gameType: incomingCandidate?.gameType ?? null,
            gameStatus: incomingCandidate?.gameStatus ?? null,
          },
        );

        if (verdict.kind === 'conflict') {
          const detail =
            `stored gameType=${verdict.storedType ?? 'null'} ` +
            `gameStatus=${verdict.storedStatus ?? 'null'} vs incoming ` +
            `gameType=${verdict.incomingType ?? 'null'} ` +
            `gameStatus=${verdict.incomingStatus ?? 'null'} ` +
            `(changed: ${verdict.changedFields.join(',')})`;
          logger.info('catalog.sync.reclassification.conflict', {
            groupId: group.groupId,
            existingId: existing.id,
            changedFields: verdict.changedFields,
          });
          if (!dryRun) {
            await this.quarantineService?.recordRejection(
              group,
              reclassificationConflictDecision(group, detail),
            );
          }
          return 'rejected';
        }

        if (dryRun) {
          return 'existing';
        }

        let current = existing;
        const updateSources: string[] = [];

        if (this.enrichmentService) {
          const result = await this.enrichmentService.enrich(existing, group.observations);
          current = result.game;
          if (result.changes.length > 0) {
            updateSources.push('enrichment');
          }
        }

        // Remakes/remasters re-ingested later still get their original
        // edge ensured (idempotent; missing targets defer to the
        // platform second pass like ports). Resolved on the enriched
        // state so the single update below carries every mutation.
        const edge = await this.attachEdge(current, group);
        current = edge.game;
        if (edge.attached) {
          updateSources.push('relationship');
        }

        if (updateSources.length > 0) {
          const extRef = extId ? `${extId.source}:${extId.id}` : undefined;
          await this.persistGame('update-existing', group, current, extRef);
          logger.info('catalog.sync.game.updated', {
            groupId: group.groupId,
            gameId: current.id,
            sources: updateSources,
          });
          return 'updated';
        }

        return 'existing';
      }
    }

    // ── Port resolution ──
    // Ports never become canonical Games. A port whose parent reference
    // resolves contributes its releases to the parent and nothing else.
    const portMatch = findPortObservation(group);
    if (portMatch) {
      return this.resolvePortToParent(group, portMatch.observation, portMatch.ref, dryRun);
    }

    if (dryRun) {
      return 'new';
    }

    const candidateGame = discoveryGroupToGame(group);

    // Guaranteed present: the stable-identity ban above inspects this
    // exact candidate, so no silent fallback is reachable.
    const idSeed = stableIdentityExtId(group) ?? candidateGame.externalIdentifiers[0];

    // Single ownership: enrich in memory, attach edge in memory, persist
    // once. No later write can clobber an earlier mutation; an enrich
    // compute failure persists nothing (atomic from the pipeline view).
    let newGame: Game = {
      ...candidateGame,
      id: createGameId(`atp-${idSeed.source}-${idSeed.id}`),
    };

    if (this.enrichmentService && group.observations.length > 0) {
      const result = await this.enrichmentService.enrich(newGame, group.observations);
      newGame = result.game;
    }

    // A remake/remaster is its own canonical Game; when its original is
    // deterministically resolvable the derivation edge folds into the
    // single save below. Missing originals defer to the platform
    // second pass.
    const edge = await this.attachEdge(newGame, group);
    newGame = edge.game;

    await this.persistGame('save-new', group, newGame, `${idSeed.source}:${idSeed.id}`);

    return 'new';
  }

  /**
   * Fold a port's releases into its canonical parent. Exactly one
   * repository lookup (port's own provider source + referenced ID); no
   * chain following, no title matching, no Game creation. When the parent
   * is absent the group waits for the platform's second pass.
   */
  private async resolvePortToParent(
    group: DiscoveryGroupResult,
    observation: DiscoverySourceObservation,
    ref: PortReference,
    dryRun: boolean,
  ): Promise<'updated' | 'existing' | 'pending'> {
    const parent = await this.gameRepository.findByExternalIdentifier({
      source: observation.source,
      externalId: ref.externalId,
    });

    if (!parent) {
      logger.info('catalog.sync.port.deferred', {
        groupId: group.groupId,
        field: ref.field,
        externalId: ref.externalId,
      });
      // The pending list is transient per-batch memory, so deferral is
      // tracked even in dry runs: the second pass then reports the
      // rejection count without writing anything.
      this.pendingPorts.push({ group, observation, ref });
      return 'pending';
    }

    const { game: merged, addedReleases } = mergeCandidateReleases(parent, group.observations);

    logger.info('catalog.sync.port.attached', {
      groupId: group.groupId,
      parentId: parent.id,
      addedReleases,
    });

    if (addedReleases === 0) {
      return 'existing';
    }

    if (!dryRun) {
      await this.persistGame(
        'update-port-fold',
        group,
        merged,
        `${observation.source}:${ref.externalId}`,
      );
      logger.info('catalog.sync.game.updated', {
        groupId: group.groupId,
        gameId: merged.id,
        sources: ['port-fold'],
      });
    }

    return 'updated';
  }

  /**
   * Second-pass disposition for ports whose parent was missing in the
   * first pass. Still missing → quarantine UNRESOLVED_PORT_PARENT
   * (rejected, auditable); never a canonical Game.
   */
  private async resolvePendingPort(
    pending: PendingPort,
    dryRun: boolean,
  ): Promise<'updated' | 'existing' | 'rejected'> {
    const parent = await this.gameRepository.findByExternalIdentifier({
      source: pending.observation.source,
      externalId: pending.ref.externalId,
    });

    if (!parent) {
      const detail =
        `no canonical game with ${pending.observation.source}:${pending.ref.externalId} ` +
        `(via ${pending.ref.field}); port contributes releases only, so it cannot be persisted alone`;
      logger.info('catalog.sync.port.unresolved', {
        groupId: pending.group.groupId,
        field: pending.ref.field,
        externalId: pending.ref.externalId,
      });
      if (!dryRun) {
        await this.quarantineService?.recordRejection(
          pending.group,
          unresolvedPortParentDecision(pending.group, detail),
        );
      }
      return 'rejected';
    }

    const { game: merged, addedReleases } = mergeCandidateReleases(
      parent,
      pending.group.observations,
    );

    if (addedReleases === 0) {
      return 'existing';
    }

    if (!dryRun) {
      await this.persistGame(
        'update-port-fold',
        pending.group,
        merged,
        `${pending.observation.source}:${pending.ref.externalId}`,
      );
      logger.info('catalog.sync.game.updated', {
        groupId: pending.group.groupId,
        gameId: merged.id,
        sources: ['port-fold'],
      });
    }

    return 'updated';
  }

  /**
   * Attach a remake/remaster derivation edge to an already-persisted
   * game. The game keeps its own identity; only a REMAKE/REMASTER edge
   * toward the deterministically resolved original is added, idempotently.
   * A missing original defers to the platform second pass (same ordering
   * problem as ports). Groups without a remake/remaster declaration, or
   * with one but no provider reference, are untouched — targets are never
   * invented.
   */
  /**
   * Pure edge resolution (no persistence): find the deterministic
   * original, attach idempotently, defer-and-quarantine when missing.
   * Callers persist the returned game themselves, exactly once, so no
   * later write can clobber an earlier mutation (no stale writes).
   */
  private async attachEdge(
    game: Game,
    group: DiscoveryGroupResult,
  ): Promise<{ game: Game; attached: boolean }> {
    const request = findOriginalEdgeRequest(group);
    if (!request) {
      return { game, attached: false };
    }

    const target = await this.gameRepository.findByExternalIdentifier({
      source: request.observation.source,
      externalId: request.ref.externalId,
    });

    if (!target) {
      logger.info('catalog.sync.relationship.deferred', {
        groupId: group.groupId,
        gameId: game.id,
        kind: request.kind,
        externalId: request.ref.externalId,
      });
      // Same transient-memory rule as ports: deferral is tracked even
      // in dry runs so the second pass can report it; the quarantine
      // record itself stays dry-run guarded.
      this.pendingRelationships.push({
        gameId: game.id,
        source: request.observation.source,
        kind: request.kind,
        ref: request.ref,
        group,
      });
      return { game, attached: false };
    }

    if (target.id === game.id) {
      logger.warn('catalog.sync.relationship.self_reference', {
        groupId: group.groupId,
        gameId: game.id,
      });
      return { game, attached: false };
    }

    const { game: withEdge, added } = withOriginalEdge(game, target.id, request.kind);

    if (!added) {
      return { game, attached: false };
    }

    logger.info('catalog.sync.relationship.attached', {
      groupId: group.groupId,
      gameId: game.id,
      targetId: target.id,
      kind: request.kind,
    });

    return { game: withEdge, attached: true };
  }

  /**
   * Single persistence funnel for this service: every game write goes
   * through here with operation context. Failures log full diagnostics
   * (operation, ids, mongo code, cause) and rethrow for the per-group
   * accounting in settleGroups. No retry exists for writes by design.
   */
  private async persistGame(
    operation: 'save-new' | 'update-existing' | 'update-port-fold' | 'update-relationship',
    group: DiscoveryGroupResult,
    game: Game,
    externalId?: string,
  ): Promise<void> {
    try {
      if (operation === 'save-new') {
        await this.gameRepository.save(game);
      } else {
        await this.gameRepository.update(game);
      }
    } catch (error) {
      logPersistFailure({
        scope: 'sync',
        operation,
        group,
        gameId: game.id,
        externalId,
        error,
      });
      throw error;
    }
  }

  /**
   * Second-pass disposition for remake/remaster edges whose original was
   * missing in the first pass. Still missing → quarantine with an
   * explicit reason; the game itself stays persisted (it is valid
   * canonical data — only the edge is unresolved). No counters change.
   */
  private async resolvePendingRelationship(
    pending: PendingRelationship,
    dryRun: boolean,
  ): Promise<void> {
    const target = await this.gameRepository.findByExternalIdentifier({
      source: pending.source,
      externalId: pending.ref.externalId,
    });

    if (!target) {
      const detail =
        `no canonical game with ${pending.source}:${pending.ref.externalId} ` +
        `(via ${pending.ref.field}) for ${pending.kind} edge from ${pending.gameId}; ` +
        `target will not be invented`;
      logger.info('catalog.sync.relationship.unresolved', {
        gameId: pending.gameId,
        kind: pending.kind,
        externalId: pending.ref.externalId,
      });
      if (!dryRun) {
        await this.quarantineService?.recordRejection(
          pending.group,
          unresolvedRelationshipTargetDecision(pending.group, detail),
        );
      }
      return;
    }

    const game = await this.gameRepository.findById(pending.gameId);
    if (!game) {
      logger.warn('catalog.sync.relationship.game_missing', { gameId: pending.gameId });
      return;
    }

    if (target.id === game.id) {
      return;
    }

    const { game: withEdge, added } = withOriginalEdge(game, target.id, pending.kind);

    if (added) {
      logger.info('catalog.sync.relationship.attached', {
        gameId: game.id,
        targetId: target.id,
        kind: pending.kind,
      });
      if (!dryRun) {
        await this.persistGame(
          'update-relationship',
          pending.group,
          withEdge,
          `${pending.source}:${pending.ref.externalId}`,
        );
        logger.info('catalog.sync.game.updated', {
          gameId: game.id,
          sources: ['relationship'],
        });
      }
    }
  }

  private aggregateTotals(results: readonly PlatformSyncResult[]): SyncTotals {
    return results.reduce(
      (acc, r) => ({
        candidatesFound: acc.candidatesFound + r.candidatesFound,
        newGames: acc.newGames + r.newGames,
        existingGames: acc.existingGames + r.existingGames,
        updatedGames: acc.updatedGames + r.updatedGames,
        rejected: acc.rejected + r.rejected,
        errors: acc.errors + r.errors,
      }),
      this.emptyTotals(),
    );
  }

  private emptyTotals(): SyncTotals {
    return {
      candidatesFound: 0,
      newGames: 0,
      existingGames: 0,
      updatedGames: 0,
      rejected: 0,
      errors: 0,
    };
  }
}
