# Phase 23 — Catalog Sync History

## Step-by-Step Implementation

1. **Reconnaissance** — Read post-mvp-roadmap.md, phase-21 report, phase-22 report, AGENTS.md; audited CatalogSyncService, CatalogSyncTypes, server.ts, createApp, scheduler
2. **Domain types** — Created `src/application/catalog-sync-history-types.ts` with `SyncTrigger`, `SyncHistoryStatus`, `CatalogSyncHistoryPlatformResult`, `CatalogSyncHistoryTotals`, `CatalogSyncHistory`
3. **Repository interface** — Created `src/application/catalog-sync-history-repository.ts` with `CatalogSyncHistoryRepository`, `SyncHistoryQuery`, `PaginatedSyncHistoryResult`
4. **Sync types update** — Added `trigger?: 'manual' | 'scheduled'` to `SyncRequest`, `historyId?: string` to `SyncResult`
5. **Mongoose schema** — Created `src/infrastructure/persistence/mongodb/catalog-sync-history-schema.ts` with indexes on `startedAt(-1)`, `status`, `trigger`, `requestedPlatformIds`, `completedAt(-1)`
6. **MongoDB repository** — Created `src/infrastructure/persistence/mongodb/mongo-catalog-sync-history-repository.ts` implementing CRUD + paginated queries
7. **Service integration** — Rewrote `src/application/catalog-sync-service.ts`: added optional `historyRepository` to deps, creates running record at start, updates at end (or on failure), returns `historyId`, graceful degradation when history unavailable
8. **Scheduler update** — Updated `src/infrastructure/catalog-sync-scheduler.ts` to pass `trigger: 'scheduled'` to `sync()`
9. **Route** — Created `src/interfaces/http/routes/catalog-sync-history.ts` with `GET /catalog/sync/history` and `GET /catalog/sync/history/:id`
10. **Validation** — Added `CatalogSyncHistoryQuerySchema`, `SyncHistoryIdParamSchema` to schemas.ts
11. **App wiring** — Added `catalogSyncHistory` to `AppDependencies` and `createApp`
12. **Server wiring** — Instantiated `MongoCatalogSyncHistoryRepository`, wired into service and createApp; manual sync route passes `trigger: 'manual'`
13. **Tests** — Created `tests/api/phase23-sync-history.test.ts` (12 tests: service history integration + trigger default) and `tests/api/phase23-history-api.test.ts` (20 tests: repository + API endpoints)
14. **Existing test updates** — Updated 6 test files with `catalogSyncHistory` mock dependency
15. **Lint fixes** — Fixed `as any` → `as never` in mock objects; removed unused imports; fixed unused `query` parameter

## Architectural Decisions

### History in Application Layer

- **Decision**: Place `CatalogSyncHistory` type and `CatalogSyncHistoryRepository` in application layer, not domain
- **Context**: Sync history is an operational audit trail, not a domain concept. Games have identity, history records are system artifacts.
- **Alternatives considered**: Domain layer (would pollute domain with operational concerns); infrastructure only (would prevent service layer from depending on it)
- **Chosen approach**: Application layer — service defines the interface, infrastructure provides the implementation
- **Reason**: Clean separation. History is a service-level concern, not a business domain concept.
- **Trade-off**: None meaningful — this is the natural home for operational types

### History as Audit Trail, Not Event Sourcing

- **Decision**: Store final sync result, not event stream
- **Context**: Each sync is a single operation with a clear start/end. We need to know WHAT happened, not replay every intermediate step.
- **Alternatives considered**: Event sourcing (too complex for current needs); no persistence (loses operational visibility)
- **Chosen approach**: Single record per sync with final status and platform results
- **Reason**: Simple, sufficient for debugging and auditing. Each sync produces one history record.
- **Trade-off**: Cannot replay individual steps within a sync — but that level of detail is not needed yet

### Optional HistoryRepository for Backward Compat

- **Decision**: `historyRepository` is optional in `CatalogSyncHistoryDependencies`
- **Context**: Existing tests and some deployments may not have MongoDB configured for history. History failure must not block sync.
- **Alternatives considered**: Required dependency (breaks existing tests); separate service (unnecessary complexity)
- **Chosen approach**: Optional with graceful degradation — if history create/update fails, sync continues
- **Reason**: Resilience. A failed audit log should never prevent a catalog sync from completing.
- **Trade-off**: History may be silently lost if MongoDB is unavailable — logged as warning, not error

### Trigger Passed Explicitly

- **Decision**: `SyncRequest.trigger` is `'manual' | 'scheduled'`, passed explicitly by caller
- **Context**: Scheduler needs to distinguish its syncs from manual API calls for audit purposes.
- **Alternatives considered**: Auto-detected (fragile, couples service to scheduler); inferred from request shape (unreliable)
- **Chosen approach**: Explicit parameter, defaults to `'manual'`
- **Reason**: Explicit beats implicit. Caller knows whether it triggered the sync.
- **Trade-off**: Scheduler must explicitly pass the parameter — minor verbosity

### Mongoose `errors` Reserved Key

- **Decision**: Use `suppressReservedKeysWarning: true` on sub-schemas that contain an `errors` field
- **Context**: Mongoose reserves `errors` for Document validation. Our domain uses `errors` (count of errors per platform) consistently across types.
- **Alternatives considered**: Rename to `errorCount` (would change domain type for Mongoose implementation detail); move errors outside subdocument (would change schema shape)
- **Chosen approach**: Suppress the warning since it's cosmetic — the field works correctly at runtime
- **Reason**: Preserves domain terminology. The warning is about potential confusion, not functional issues.
- **Trade-off**: Warning suppressed — if Mongoose changes behavior in future, this may need revisiting

### Crash Scenario: Running Status Left As-Is

- **Decision**: If the server crashes mid-sync, the history record stays in `running` status
- **Context**: No heartbeat or process supervision to detect crashes. `running` status is sufficient to indicate incomplete sync.
- **Alternatives considered**: Mark as `interrupted` on restart (requires startup reconciliation); TTL-based cleanup (complex)
- **Chosen approach**: Leave as-is — operational visibility is sufficient
- **Reason**: Simple. `running` status with no completion time clearly indicates incomplete sync.
- **Trade-off**: Manual cleanup needed if stale records accumulate — acceptable for current scale

## Domain-to-Persistence Mapping

```text
CatalogSyncHistory (application type)
    ↓
CatalogSyncHistoryDocument (Mongoose Document)
    ↓
catalogsynchistories collection
    ↓
Indexes: startedAt(-1), status, trigger, requestedPlatformIds, completedAt(-1)
```

## Repository Flow

### Create History Record

```text
CatalogSyncService.sync()
    ↓
historyRepository.create({ status: 'running', startedAt: now, ... })
    ↓
MongoCatalogSyncHistoryRepository.create()
    ↓
CatalogSyncHistoryModel.save()
    ↓
Returns historyId
```

### Update History Record

```text
CatalogSyncService.sync() [after executeSync completes]
    ↓
historyRepository.update(historyId, { completedAt, status, totals, platformResults, durationMs })
    ↓
MongoCatalogSyncHistoryRepository.update()
    ↓
CatalogSyncHistoryModel.updateOne({ _id: id }, { $set: fields })
```

### Query History

```text
GET /api/v1/catalog/sync/history?status=completed&trigger=manual&page=1&limit=20
    ↓
historyRepository.findMany({ status, trigger, page, limit })
    ↓
MongoCatalogSyncHistoryRepository.findMany()
    ↓
CatalogSyncHistoryModel.find(filter).sort().skip().limit().lean()
    ↓
Returns PaginatedSyncHistoryResult
```

## Testing Strategy

- Service integration tests use in-memory mock repository
- API endpoint tests use full HTTP stack with mocked dependencies
- Repository tests use in-memory mock model
- No MongoDB integration tests in unit suite
- 32 new tests added (12 service + 20 API/repository)

## Files Changed

| File | Responsibility |
|------|---------------|
| `src/application/catalog-sync-history-types.ts` | History domain types |
| `src/application/catalog-sync-history-repository.ts` | Repository interface + query types |
| `src/application/catalog-sync-types.ts` | Added trigger, historyId |
| `src/application/catalog-sync-service.ts` | History recording integration |
| `src/infrastructure/persistence/mongodb/catalog-sync-history-schema.ts` | Mongoose schema + indexes |
| `src/infrastructure/persistence/mongodb/mongo-catalog-sync-history-repository.ts` | MongoDB repository impl |
| `src/infrastructure/catalog-sync-scheduler.ts` | Pass trigger: 'scheduled' |
| `src/interfaces/http/routes/catalog-sync-history.ts` | History API routes |
| `src/interfaces/http/routes/catalog-sync.ts` | Pass trigger: 'manual' |
| `src/interfaces/http/validation/schemas.ts` | History query/param schemas |
| `src/interfaces/http/app.ts` | Wired history into AppDependencies |
| `src/server.ts` | Repository instantiation + wiring |
| `tests/api/phase23-sync-history.test.ts` | Service integration tests |
| `tests/api/phase23-history-api.test.ts` | Repository + API endpoint tests |
| `docs/roadmap.md` | Added Phase 23 section |

## Validation Results

```text
pnpm test          — 1016 passed (49 test files)
pnpm build         — clean (tsc)
pnpm lint          — clean
pnpm format:check  — clean
```

Live validation blocked by pre-existing MongoDB auth issue (port 27017 requires credentials, server connects without). Affects ALL MongoDB operations equally — not specific to Phase 23 code. History gracefully degrades when persistence unavailable.

## Known Limitations

- Crashed mid-sync records stay in `running` status (no cleanup mechanism)
- `errors` reserved key warning suppressed via schema option
- No TTL or archival for old history records
- History collection not auto-created until first insert (Mongoose behavior)

## Next Step

Phase 24 — Game Write API (Admin) per `docs/reports/post-mvp-roadmap.md`.
