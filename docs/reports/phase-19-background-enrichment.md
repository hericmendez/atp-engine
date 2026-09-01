# Phase 19 — Background Enrichment

## Step-by-Step Implementation

1. **Reconnaissance** — Audited EnrichmentEngine, EnrichmentService, SourceAdapters, SourceRegistry, DiscoveryEngine, GameRepository, retry/timeout infrastructure, Game domain model, Mongoose schema
2. **Domain evolution** — Added `lastEnrichedAt: Date | null` to Game interface, `createGame()`, `gameWithLastEnrichedAt()` factory
3. **Persistence** — Added `lastEnrichedAt` to GameDocument, Mongoose schema with default null, compound index on `{completeness, lastEnrichedAt}`
4. **Mapper** — Updated `toDomain()` and `toPersistence()` in game-mapper.ts
5. **EnrichmentRunner** — Created `src/application/enrichment-runner.ts` with candidate selection, source fetching via `getById()`, normalization, classification, and enrichment
6. **EnrichmentScheduler** — Created `src/infrastructure/enrichment-scheduler.ts` with `EnrichmentScheduler` interface and `IntervalEnrichmentScheduler` implementation
7. **Server wiring** — Wired runner and scheduler into server.ts with graceful shutdown
8. **Build fixes** — Added `lastEnrichedAt` to all Game object literals in `discovery-to-game.ts` and `aggregation.ts`
9. **Tests** — Created `tests/api/phase19.test.ts` with 23 tests covering all scenarios
10. **Live validation** — Validated enrichment flow with real Wikipedia API call, confirmed `lastEnrichedAt` tracking and idempotency

## Architectural Decisions

### lastEnrichedAt on Game Domain

- **Decision**: Add `lastEnrichedAt: Date | null` to Game interface
- **Context**: Need to avoid re-processing recently enriched games. Without this field, every run re-processes all incomplete games, wasting API calls.
- **Alternatives considered**: Use `updatedAt` as proxy (unreliable — any update changes it); separate tracking collection (over-engineered for Phase 19)
- **Chosen approach**: Single nullable Date field on Game
- **Reason**: Minimal, explicit, answers "when was this game last enriched?" and "when should it be retried?"
- **Trade-off**: Adds one field to Game domain, but it's a legitimate enrichment concern.

### EnrichmentRunner in Application Layer

- **Decision**: Create `EnrichmentRunner` in `src/application/`, not in infrastructure
- **Context**: The runner orchestrates business logic (candidate selection, enrichment) with infrastructure (source fetching, persistence)
- **Alternatives considered**: Put runner in infrastructure (violates layered architecture); put runner in domain (violates no-infrastructure-in-domain rule)
- **Chosen approach**: Application layer service with dependencies injected
- **Reason**: Follows existing pattern (CatalogService, EnrichmentService in application layer). Testable in isolation with mocks.
- **Trade-off**: Runner depends on both domain and infrastructure interfaces, but this is appropriate for application layer.

### IntervalEnrichmentScheduler as Infrastructure

- **Decision**: Create scheduler as infrastructure concern, separate from business logic
- **Context**: User explicitly requested separation between enrichment logic and execution mechanism
- **Alternatives considered**: `setInterval` in EnrichmentRunner (mixes concerns); cron library (premature)
- **Chosen approach**: `EnrichmentScheduler` interface + `IntervalEnrichmentScheduler` implementation
- **Reason**: Allows swapping interval for cron, worker, BullMQ, or separate process without rewriting enrichment logic
- **Trade-off**: Extra abstraction layer, but enables future flexibility

### Pure Enrichment Function (Not EnrichmentService)

- **Decision**: Runner calls `enrichGame()` directly, not `EnrichmentService.enrich()`
- **Context**: EnrichmentService persists changes internally, causing double-writes when runner also sets `lastEnrichedAt`
- **Alternatives considered**: Modify EnrichmentService to accept `lastEnrichedAt` parameter (mixes concerns); use EnrichmentService and accept double-write (wasteful)
- **Chosen approach**: Call pure enrichment function, handle persistence in runner
- **Reason**: Single write per item, full control over persistence flow, no double-write overhead
- **Trade-off**: Runner bypasses EnrichmentService logging, but has its own structured logging

### Source Failure Handling

- **Decision**: Source fetch failures are caught per-observation, not per-item
- **Context**: A game may have multiple external identifiers (Wikipedia + Steam). One failing source shouldn't prevent enrichment from other sources.
- **Alternatives considered**: Fail entire item on any source failure (too aggressive); retry all sources on failure (wasteful)
- **Chosen approach**: Try each source independently, skip failed sources, enrich with whatever observations succeeded
- **Trade-off**: Partial enrichment is acceptable — some data is better than no data

## Domain-to-Persistence Mapping

```
Game.lastEnrichedAt (domain: Date | null)
    ↓
GameDocument.lastEnrichedAt (Mongoose: Date, default null)
    ↓
MongoDB: lastEnrichedAt field, indexed with completeness
```

## Repository Flow

### Candidate Selection

```
EnrichmentRunner.runOnce()
    ↓
selectCandidates()
    ↓
GameRepository.findMany({
  completeness: 'FOUND_PARTIAL',
  sort: { field: 'updatedAt', direction: 'asc' },
  limit: batchSize
})
    ↓
Filter: externalIdentifiers.length > 0
Filter: lastEnrichedAt === null || lastEnrichedAt < cooldownDate
    ↓
Return candidate games (oldest first)
```

### Item Processing

```
processItem(game)
    ↓
fetchObservations(game):
  For each externalIdentifier:
    sourceRegistry.get(source) → adapter
    adapter.getById(id) → RawCandidate
    normalizeCandidate(raw) → NormalizedCandidate
    classifier.classify(normalized) → ClassificationResult
    → DiscoverySourceObservation
    ↓
enrichGame(game, observations) → EnrichmentResult
    ↓
gameWithLastEnrichedAt(result.game, new Date())
    ↓
gameRepository.update(enrichedGame)
    ↓
Return EnrichmentItemResult
```

### Batch Processing

```
processBatch(candidates):
  chunk(candidates, concurrency) → chunks
  For each chunk:
    Promise.allSettled(chunk.map(processItem))
    ↓
  Aggregate results
```

## Retry/Timeout

- **Item timeout**: 15s per source fetch (configurable)
- **No retry at runner level**: Source adapters have their own retry via BaseAdapter
- **Concurrency**: 2 items at a time (configurable)
- **Batch size**: 10 items per run (configurable)
- **Cooldown**: 60s between runs per item (configurable)

## Idempotency

- `lastEnrichedAt` prevents re-processing within cooldown window
- Enrichment engine is purely additive — running twice produces same result
- Second run: game has `lastEnrichedAt` set → filtered out by cooldown check → no duplicate writes

## Candidate Selection Strategy

1. Query `FOUND_PARTIAL` games sorted by `updatedAt` ascending (oldest first)
2. Filter to games with external identifiers (enrichment needs source IDs)
3. Filter out recently enriched games (within cooldown window)
4. Limit to batch size

**Why only FOUND_PARTIAL?**
- `NOT_FOUND` games have no data to enrich from
- `FOUND_SUFFICIENT` and `FOUND_COMPLETE` are already well-populated
- `FOUND_PARTIAL` games have some data but are incomplete — highest enrichment ROI

**Why require external identifiers?**
- Enrichment fetches fresh data via `adapter.getById(externalId)`
- Without external IDs, we'd need to search by title (expensive, less targeted)
- Games without external IDs can be enriched via manual re-search

## Files Changed

### Created
- `src/application/enrichment-runner.ts` — EnrichmentRunner with candidate selection, source fetching, batch processing
- `src/infrastructure/enrichment-scheduler.ts` — EnrichmentScheduler interface + IntervalEnrichmentScheduler
- `tests/api/phase19.test.ts` — 23 tests covering all scenarios

### Modified
- `src/domain/game/game.ts` — Added `lastEnrichedAt` to Game interface, `gameWithLastEnrichedAt()` factory
- `src/infrastructure/persistence/mongodb/game-schema.ts` — Added `lastEnrichedAt` field + index
- `src/infrastructure/persistence/mongodb/game-mapper.ts` — Updated toDomain/toPersistence
- `src/server.ts` — Wired EnrichmentRunner + IntervalEnrichmentScheduler
- `src/application/discovery-to-game.ts` — Added `lastEnrichedAt: null` to Game literal
- `src/discovery/aggregation.ts` — Added `lastEnrichedAt: null` to fake Game literal
- `docs/roadmap.md` — Added Phase 19 section

## Validation Results

```
pnpm build         — ✅ passes
pnpm lint          — ✅ passes
pnpm format:check  — ✅ passes
pnpm test          — ✅ 911 tests passing (888 existing + 23 new)
```

### Live Validation

| Test | Result |
|------|--------|
| Candidate selection (FOUND_PARTIAL + extIds + old updatedAt) | ✅ Found 1 candidate |
| Source fetch (Wikipedia page 64739) | ✅ HTTP 200, 260ms |
| Enrichment engine execution | ✅ Completed without error |
| `lastEnrichedAt` set on game | ✅ `2026-09-01T01:46:08.719Z` |
| Second run skips recently enriched game | ✅ 0 candidates found |
| No duplicate writes | ✅ Confirmed |
| Server startup/shutdown | ✅ Scheduler starts and stops cleanly |

## Known Limitations

- **Games without external identifiers cannot be enriched** — Wikipedia adapter doesn't provide external IDs for search results. Only games with explicit `externalIdentifiers` are candidates.
- **Platform resolution not implemented** — Enrichment adds NEW releases with correct platform info but cannot upgrade existing "UNKNOWN" releases. This is a domain limitation documented for future phases.
- **No admin endpoint** — Enrichment status is observable via structured logging only. Admin API deferred to future phase if needed.
- **No retry at runner level** — Relies on source adapter retry (BaseAdapter). If all retries fail, the source is skipped for that item.
- **Completeness may not improve** — If Wikipedia/Steam don't provide missing data, enrichment runs but produces no changes. This is correct behavior — the runner still marks the item as enriched to avoid re-processing.

## Impact on Next Phases

- **Phase 20 (IGDB Source)**: Once IGDB adapter is added, enrichment runner will automatically use it for games with IGDB external identifiers. No changes needed to runner.
- **Phase 21 (Catalog Stats)**: `lastEnrichedAt` can be used for enrichment analytics. `gameCount` on platforms may improve as games get enriched with correct platform info.
- **Future: Platform resolution**: A dedicated step to merge "UNKNOWN" platform releases with correct platform data from enrichment.
- **Future: Cron/worker**: Replace `IntervalEnrichmentScheduler` with cron-based or queue-based scheduler without rewriting enrichment logic.

## Next Step

Phase 20 — IGDB Source. Add IGDB as a new source adapter for richer game metadata. Awaiting user confirmation to proceed.
