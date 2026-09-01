# Phase 21 — Catalog Synchronization Engine

## Step-by-Step Implementation

1. **Reconnaissance** — Read AGENTS.md, roadmap.md, post-mvp-roadmap.md; audited DiscoveryEngine, CatalogService, EnrichmentService, PlatformCatalogService, PlatformCatalogRepository, GameRepository, SourceAdapter, SourceRegistry, classification, normalization, identity resolution, persistence, HTTP routes, Zod schemas, discovery types, normalization, server.ts
2. **Sync types** — Created `src/application/catalog-sync-types.ts` with `SyncRequest`, `SyncResult`, `PlatformSyncResult`, `SyncTotals`, `ResolvedPlatform` types
3. **CatalogSyncService** — Created `src/application/catalog-sync-service.ts` with platform resolution, query construction, discovery orchestration, platform filtering, classification filtering, identity resolution via external ID lookup, persistence, enrichment, dry run support, platform failure isolation, structured result aggregation
4. **Validation schema** — Added `CatalogSyncRequestSchema` to `src/interfaces/http/validation/schemas.ts` with platforms/activeOnly conditional validation, date format validation, date order validation
5. **Sync route** — Created `src/interfaces/http/routes/catalog-sync.ts` with `POST /api/v1/catalog/sync` endpoint
6. **App wiring** — Updated `AppDependencies` and `createApp` in `src/interfaces/http/app.ts`; wired `CatalogSyncService` in `src/server.ts`
7. **Existing tests** — Updated 5 test files (`app.test.ts`, `games-api.test.ts`, `cover-api.test.ts`, `phase17.test.ts`, `phase18.test.ts`) to include `catalogSync` dependency mock
8. **New tests** — Created `tests/api/phase21-catalog-sync.test.ts` with 22 tests covering: empty platform resolution, single platform sync, activeOnly mode, dry run, non-GAME rejection, external ID deduplication (existing/update/unchanged), platform failure isolation, partial status, duplicate platform IDs, platform relevance filtering, query construction, multi-platform aggregation, error handling, duration reporting, API validation (missing platforms, invalid date, from>to, activeOnly acceptance, dryRun passthrough)

## Architectural Decisions

### CatalogSyncService as Application Service

- **Decision**: Place CatalogSyncService in the application layer, not infrastructure
- **Context**: The sync service orchestrates domain services (GameRepository, PlatformCatalogRepository, DiscoveryEngine, EnrichmentService) but does not own domain logic itself
- **Alternatives considered**: Domain service (would require domain to depend on infrastructure interfaces); infrastructure service (would leak orchestration into persistence layer)
- **Chosen approach**: Application service pattern — depends on domain interfaces, orchestrates cross-cutting flow
- **Reason**: Follows existing CatalogService/EnrichmentService pattern. Clean separation. Testable with mocks.
- **Trade-off**: Service has moderate complexity, but this is inherent to orchestration

### Query Construction via Text Strings

- **Decision**: Build text query strings like "Nintendo Switch games 2025" instead of structured platform/date filters
- **Context**: DiscoveryEngine only accepts text `query` strings — no structured platform or date filtering exists
- **Alternatives considered**: Extend DiscoveryEngine with structured filters (significant refactor, not needed for MVP); skip query construction and search generically (too broad, wastes source API calls)
- **Chosen approach**: Construct natural-language query strings per platform
- **Reason**: Works with existing DiscoveryEngine API. Produces reasonable source queries. Platform relevance is enforced by post-query filtering.
- **Trade-off**: Some irrelevant results may be returned by sources, but these are filtered by platform relevance check

### Platform Relevance Filtering (Post-Query)

- **Decision**: Filter discovery results by platform relevance after the query, not before
- **Context**: Sources don't all support platform-specific queries. Wikipedia returns all results for a text query. Platform filtering must happen locally.
- **Alternatives considered**: Source-specific platform filtering (requires per-source logic, leaks adapter details); skip filtering (too many irrelevant results for persistence)
- **Chosen approach**: Check releases[].platform, titles, and description for platform name match
- **Reason**: Covers most common platform attribution patterns. Simple string matching is sufficient for known platform names.
- **Trade-off**: May miss games with unusual platform naming, but this is acceptable for MVP

### Failure Isolation per Platform

- **Decision**: Each platform sync is independent — one failure does not block others
- **Context**: Sync may process multiple platforms. A failure in one (network, parsing) should not abort the entire sync.
- **Alternatives considered**: Fail-fast (abort all on first error); transactional (all-or-nothing)
- **Chosen approach**: Try/catch per platform, report individual status
- **Reason**: Sync is inherently best-effort. Partial results are more useful than no results. Status is clearly reported.
- **Trade-off**: Some platforms may succeed while others fail, requiring manual retry for failed ones

## Domain-to-Persistence Mapping

```text
SyncRequest
    ↓
PlatformCatalogRepository.findMany/findById → PlatformCatalogEntry
    ↓
DiscoveryEngine.discover({query}) → DiscoveryResult
    ↓
Platform filtering → DiscoveryGroupResult[]
    ↓
Classification check (GAME only)
    ↓
GameRepository.findByExternalIdentifier → existing Game?
    ↓
  existing? → EnrichmentService.enrich → updated
  new?      → discoveryGroupToGame → GameRepository.save → created
```

## Repository Flow

### Single Platform Sync

1. `POST /api/v1/catalog/sync { platforms: ["nintendo-switch"], from: "2025-01-01", to: "2025-12-31" }`
2. Zod validates request
3. `CatalogSyncService.sync()` resolves platform `nintendo-switch` via `PlatformCatalogRepository.findById()`
4. Constructs query: `"Nintendo Switch games 2025"`
5. Calls `DiscoveryEngine.discover({ query, limit: 100 })`
6. Filters groups to those mentioning "Nintendo Switch" in releases/titles/description
7. For each group: checks classification is GAME, checks external ID for existing game, persists or enriches
8. Returns `SyncResult` with per-platform and aggregate totals

### Dry Run

Same as above but `gameRepository.save()` and `enrichmentService.enrich()` are never called. Results are computed but not persisted.

## Testing Strategy

- **Unit tests** for CatalogSyncService with mocked GameRepository, PlatformCatalogRepository, DiscoveryEngine, EnrichmentService — fast, deterministic, no infrastructure
- **Integration tests** for POST /api/v1/catalog/sync route with mocked CatalogSyncService — validates Zod parsing, HTTP status codes, response shape
- **Live validation** confirmed server starts, route accepts requests, validation rejects bad input, sync service processes valid requests

## Files Changed

| File | Responsibility |
|------|---------------|
| `src/application/catalog-sync-types.ts` | Sync request/result types |
| `src/application/catalog-sync-service.ts` | Core sync orchestration |
| `src/interfaces/http/routes/catalog-sync.ts` | POST /api/v1/catalog/sync route |
| `src/interfaces/http/validation/schemas.ts` | Added CatalogSyncRequestSchema |
| `src/interfaces/http/app.ts` | Updated AppDependencies, added sync router |
| `src/server.ts` | Wired CatalogSyncService |
| `tests/api/phase21-catalog-sync.test.ts` | 22 new tests |
| `tests/app.test.ts` | Added catalogSync mock |
| `tests/api/games-api.test.ts` | Added catalogSync mock |
| `tests/api/cover-api.test.ts` | Added catalogSync mock |
| `tests/api/phase17.test.ts` | Added catalogSync mock |
| `tests/api/phase18.test.ts` | Added catalogSync mock |
| `docs/roadmap.md` | Added Phase 21 section |

## Validation Results

```
pnpm test       → 961 passed (46 test files)
pnpm build      → clean (tsc)
pnpm lint       → clean (0 errors)
pnpm format:check → All matched files use Prettier code style
```

## Known Limitations

- Platform relevance filtering uses simple string matching on platform name — may miss unusual naming conventions
- Query construction uses text queries — no structured date/platform filtering in DiscoveryEngine yet
- Sync does not handle games that exist across multiple platforms as a single entity (cross-platform dedup happens at external ID level only)
- No scheduler/cron — sync must be triggered manually; automatic scheduling is deferred to a future phase
- MongoDB platform seeding is failing on local dev (port mismatch) — pre-existing infrastructure issue

## Next Step

Phase 22 — Automated Scheduling (or next phase per post-mvp-roadmap.md).
