# Phase 22 — Automated Catalog Synchronization

## Step-by-Step Implementation

1. **Reconnaissance** — Read AGENTS.md, engineering-rules.md, roadmap.md, post-mvp-roadmap.md; audited EnrichmentScheduler pattern, CatalogSyncService, config.ts, server.ts shutdown, AppDependencies, createApp
2. **Config** — Added `CATALOG_SYNC_ENABLED`, `CATALOG_SYNC_INTERVAL_MS`, `CATALOG_SYNC_LOOKBACK_DAYS` to `src/infrastructure/config/config.ts`
3. **Scheduler** — Created `src/infrastructure/catalog-sync-scheduler.ts` with `CatalogSyncScheduler` interface, `CatalogSyncSchedulerStatus`, and `IntervalCatalogSyncScheduler` class
4. **Server wiring** — Updated `src/server.ts` with scheduler instantiation, startup (after enrichment scheduler), and graceful shutdown (first to stop)
5. **Tests** — Created `tests/catalog-sync-scheduler.test.ts` with 23 tests covering lifecycle, scheduled execution, concurrency guard, error handling, runNow, status, config validation

## Architectural Decisions

### Scheduler in Infrastructure Layer

- **Decision**: Place CatalogSyncScheduler in `src/infrastructure/`, not application layer
- **Context**: Scheduler is a timing mechanism — it decides WHEN to sync, not HOW. It delegates to CatalogSyncService for the actual sync logic.
- **Alternatives considered**: Application service (would mix orchestration with timing); domain service (wrong layer for setInterval)
- **Chosen approach**: Infrastructure scheduler with `CatalogSyncScheduler` interface, `IntervalCatalogSyncScheduler` implementation
- **Reason**: Follows `IntervalEnrichmentScheduler` pattern. Clean separation. Scheduler owns timing, service owns sync logic.
- **Trade-off**: Scheduler is simple (in-process setInterval) — no distributed locking, no persistence of schedule state

### Concurrency Guard via Boolean Flag

- **Decision**: Use a simple boolean `running` flag to prevent overlapping syncs
- **Context**: Sync may take longer than the interval. Overlapping syncs would waste resources and potentially cause data conflicts.
- **Alternatives considered**: Mutex/lock (more complex, unnecessary for single-process); skip guard (risk of overlapping syncs)
- **Chosen approach**: Boolean flag checked at start of each tick
- **Reason**: Sufficient for single-process deployment. Simple, deterministic, no infrastructure dependency.
- **Trade-off**: If sync hangs, scheduler is blocked until next tick — but structured error handling prevents indefinite hangs

### Rolling Window via Configurable Lookback

- **Decision**: Use `CATALOG_SYNC_LOOKBACK_DAYS` to compute rolling window (`from = now - lookbackDays`, `to = now`)
- **Context**: Full catalog sync is expensive. Rolling window focuses on recent releases, which are most likely to have new or updated data.
- **Alternatives considered**: Full catalog sync (too expensive for periodic runs); fixed date range (not adaptive)
- **Chosen approach**: Rolling window with configurable lookback
- **Reason**: Balances freshness with efficiency. 30-day default captures recent releases without overwhelming sources.
- **Trade-off**: Older releases not covered by scheduler — must be synced manually if needed

### Scheduler Disabled by Default

- **Decision**: `CATALOG_SYNC_ENABLED` defaults to `false`
- **Context**: Scheduler makes external API calls. Should not run in development, CI, or environments without source access.
- **Alternatives considered**: Enabled by default (risky for dev/CI); always enabled (no opt-out)
- **Chosen approach**: Opt-in via environment variable
- **Reason**: Safe default. Explicit enable in production deployments.
- **Trade-off**: Requires documentation of the env var for production setup

### Shutdown Order: Scheduler First, Then Enrichment

- **Decision**: Stop CatalogSyncScheduler before EnrichmentScheduler during graceful shutdown
- **Context**: Sync may trigger enrichment. Enrichment should finish before sync is killed.
- **Alternatives considered**: Stop enrichment first (would interrupt in-progress enrichment triggered by sync); stop both simultaneously (race condition)
- **Chosen approach**: CatalogSync → Enrichment → MongoDB disconnect
- **Reason**: Clean shutdown sequence. Sync stops accepting new work, enrichment finishes current batch, then DB disconnects.
- **Trade-off**: Enrichment may take extra time to finish — acceptable for graceful shutdown

## Domain-to-Persistence Mapping

```text
CATALOG_SYNC_ENABLED=true
    ↓
IntervalCatalogSyncScheduler.start()
    ↓
setInterval(tick, intervalMs)
    ↓
tick() — if running, skip
    ↓
CatalogSyncService.sync({ activeOnly: true })
    ↓
PlatformCatalogRepository.findMany({ status: 'active' })
    ↓
Per platform: DiscoveryEngine → filter → classify → persist → enrich
    ↓
Rolling window: from = now - lookbackDays, to = now
```

## Testing Strategy

- **Unit tests** for IntervalCatalogSyncScheduler with mocked CatalogSyncService — fast, deterministic, no infrastructure
- **Lifecycle tests**: start/stop, scheduled execution via fake timers, concurrency guard, error recovery
- **runNow tests**: manual trigger, concurrent protection, error handling
- **Status tests**: accurate state reporting, config validation
- **Config validation**: rejects disabled, rejects zero/negative interval, rejects zero lookbackDays

## Files Changed

| File | Responsibility |
|------|---------------|
| `src/infrastructure/catalog-sync-scheduler.ts` | Scheduler interface, status type, interval implementation |
| `src/infrastructure/config/config.ts` | Added CATALOG_SYNC_ENABLED, CATALOG_SYNC_INTERVAL_MS, CATALOG_SYNC_LOOKBACK_DAYS |
| `src/server.ts` | Scheduler instantiation, startup, graceful shutdown |
| `tests/catalog-sync-scheduler.test.ts` | 23 new tests |
| `docs/roadmap.md` | Added Phase 22 section |

## Validation Results

```
pnpm test       → 984 passed (47 test files)
pnpm build      → clean (tsc)
pnpm lint       → clean (0 errors)
pnpm format:check → All matched files use Prettier code style
```

**Live validation**:

- `CATALOG_SYNC_ENABLED=false` → "CatalogSyncScheduler: disabled, not starting"
- `CATALOG_SYNC_ENABLED=true CATALOG_SYNC_INTERVAL_MS=2000` → scheduler starts, runs every 2s, fails gracefully (no seeded platforms), recovers, stops cleanly on shutdown
- Health endpoint, manual sync endpoint, games endpoint all unaffected

## Known Limitations

- Scheduler is in-process (`setInterval`) — no distributed locking for multi-instance deployments
- No persistence of schedule state — scheduler resets on restart (rebuilds rolling window from current time)
- No sync history tracking — `lastSyncAt` is in-memory only, not persisted
- No monitoring/alerting — only structured logs; no Prometheus/metrics endpoint
- Rolling window covers `now - lookbackDays` — older releases require manual sync
- Platform seeding is failing on local dev (port mismatch) — pre-existing infrastructure issue

## Next Step

Phase 23 — next phase per `docs/reports/post-mvp-roadmap.md`.
