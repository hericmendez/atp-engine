# ATP Engine — Post-MVP Roadmap

**Date**: 2026-08-31
**Status**: Planning — Awaiting Approval

---

## 1. Current State Audit

### What Exists

| Layer | Components | Files |
|-------|-----------|-------|
| **Domain** | Game, Release, Platform (value object), PlatformCatalogEntry, CoverCandidate, GameRelationship, 15 enums/value objects | 18 files |
| **Application** | CatalogService, CoverService, EnrichmentService, PlatformCatalogService | 4 services |
| **Infrastructure** | MongoGameRepository, MongoPlatformCatalogRepository, MongoDB connection, config, logger, retry, timeout, LRU cache | 10 files |
| **Interfaces** | 4 route files, 5 middleware, validation schemas, API types | 11 files |
| **Discovery** | DiscoveryEngine, aggregation, 2 source adapters (Wikipedia, Steam) | 5 files |
| **Classification** | DeterministicClassifier, signals, results | 5 files |
| **Identity** | DeterministicIdentityResolver, signals, results | 5 files |
| **Enrichment** | EnrichmentEngine (pure), EnrichmentService (persistence) | 3 files |
| **Normalization** | normalize(), platform aliases, region aliases | 5 files |
| **Cover** | CoverEngine, cover-rank, cover-validate | 4 files |
| **AI** | Classifier, Enrichment, Identity Resolver, Ollama provider, prompts | 10 files |

**Total**: 108 source files, 47 test files, 867 tests passing, 33 doc files.

### Test Distribution

| Domain | Tests |
|--------|-------|
| Normalization | 198 |
| Classification | 54 |
| Cover | 100 |
| Enrichment | 35 |
| Identity | 36 |
| Discovery | 31 |
| API | 124 |
| AI | 87 |
| Infrastructure | 59 |
| Domain | 57 |
| Sources | 112 |
| Application | 9 |
| Root | 24 |

### Architecture Invariants (All Verified)

- Domain has zero infrastructure imports
- Domain has zero Express imports
- Application has zero MongoDB imports
- AI is optional behind interfaces
- Deterministic-first processing
- External sources substitutable via SourceAdapter
- Source failures isolated (Promise.allSettled)
- Persistence behind repository interfaces
- All external input validated (Zod)
- Controllers remain thin
- Error handler translates to consistent JSON

---

## 2. Architectural Findings

### Strengths

1. **Clean layering** — Domain, Application, Infrastructure, Interfaces properly separated
2. **Immutable domain** — All domain types are readonly, updates produce new instances
3. **Repository pattern** — Clean interfaces, MongoDB implementation swappable
4. **Deterministic-first** — Every AI operation has a native fallback
5. **Source isolation** — Adapters behind SourceAdapter interface, failures don't cascade
6. **Comprehensive test suite** — 867 tests across all layers
7. **Production middleware** — Request ID, logging, timeout, rate limiting, error handling
8. **Database-first** — Search checks DB before hitting external sources

### Weaknesses / Gaps

1. **Platform catalog is empty by default** — No seed data, no import mechanism. Platforms only exist if discovered through game search (and even then, games have UNKNOWN platforms).
2. **Platform value object is disconnected from PlatformCatalogEntry** — `Platform` (in releases) is `{ name, family, type }`. `PlatformCatalogEntry` (in platform catalog) is `{ id, name, company, releaseYear, status, family, type, thumb }`. They share `name` but are not linked. A game's `releases.platform.name` does not resolve to a `PlatformCatalogEntry.id`.
3. **No game-platform linkage** — Games reference platforms by name string. There's no foreign key to the platform catalog. A game on "PlayStation" doesn't automatically count toward the PlayStation platform's `gameCount`.
4. **gameCount is derived, not authoritative** — The platform catalog counts games via aggregation on `releases.platform.name`. This works but is a cross-collection join, not a direct relationship.
5. **Platform catalog has no seed data** — The `platforms` collection is empty. All 14 games in the test database have `UNKNOWN` as their platform name.
6. **No write endpoints** — The entire API is read-only (GET). Search and cover persist as side effects, but there's no explicit create/update/delete.
7. **No relationship exposure** — Game relationships exist in the domain but are not exposed through any API endpoint.
8. **No catalog statistics** — No way to query total games, platforms, completeness distribution, etc.
9. **No background processing** — Enrichment happens synchronously during search. No worker to progressively improve `FOUND_PARTIAL` games.
10. **Only 2 sources** — Wikipedia and Steam. Many games won't have good coverage from these alone.

### Discrepancies Between Documentation and Code

| Issue | Document | Actual |
|-------|----------|--------|
| MVP checkpoint lists 6 endpoints | `phase-16-mvp-checkpoint.md` | 8 endpoints (Phase 17 added 2 platform endpoints) |
| Game search sort options | MVP checkpoint lists `title, createdAt, updatedAt, completeness` | Actually supports `title, name, createdAt, updatedAt, completeness, releaseDate` |
| Game catalog sort options | MVP checkpoint lists same 4 | Same 6 as search |
| `releaseYearFrom`/`releaseYearTo` | Not in MVP checkpoint | Implemented and tested |
| Multi-value filters | Not in MVP checkpoint | Implemented and tested |

---

## 3. API Inventory

### Implemented Endpoints

| # | Method | Path | Description | Read/Write | Dependencies | Status |
|---|--------|------|-------------|------------|--------------|--------|
| 1 | `GET` | `/health` | Server health, DB status, AI status | Read | None | ✅ Stable |
| 2 | `GET` | `/api/v1/games` | List games with composable filters, pagination, sorting | Read | MongoDB | ✅ Stable |
| 3 | `GET` | `/api/v1/games/search` | Search games by term (DB-first, discovery fallback) | Read+Write | MongoDB, Wikipedia, Steam | ✅ Stable |
| 4 | `GET` | `/api/v1/games/:id` | Retrieve single game by domain ID | Read | MongoDB | ✅ Stable |
| 5 | `GET` | `/api/v1/covers/search` | Search cover images by query | Read | Wikipedia, Steam | ✅ Stable |
| 6 | `GET` | `/api/v1/games/:id/cover` | Discover and cache cover for a game | Read+Write | MongoDB, Wikipedia, Steam | ✅ Stable |
| 7 | `GET` | `/api/v1/platforms/summary` | List platforms with filters, pagination, sorting | Read | MongoDB | ✅ Stable (empty data) |
| 8 | `GET` | `/api/v1/platforms/:platformId` | Retrieve single platform by ID | Read | MongoDB | ✅ Stable (empty data) |

### Endpoints Documented but Not Implemented

None. All documented endpoints exist.

### Internal Capabilities Without Endpoints

| Capability | Domain Support | API Exposure |
|------------|---------------|--------------|
| Game relationships (remake, remaster, port, etc.) | `GameRelationship` type, `gameAddRelationship()` | ❌ Not exposed |
| Game update/mutation | `GameRepository.update()` | ❌ No endpoint |
| Game delete | `GameRepository.deleteById()` | ❌ No endpoint |
| Catalog statistics | Queryable via `findMany` + `countDocuments` | ❌ No dedicated endpoint |
| Batch enrichment | `EnrichmentService.enrich()` | ❌ No endpoint |
| Platform catalog CRUD | `PlatformCatalogRepository` (read-only interface) | ❌ No create/update/delete |
| Source confidence/analytics | `SourceEvidence` tracked per game | ❌ Not exposed |
| Enrichment progress tracking | `MetadataCompleteness` per game | ❌ Not exposed |

### `GET /api/v1/games` Query Parameters (Complete)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | — | Partial match on titles, developers, publishers |
| `title` | string | — | Partial match on titles only |
| `platform` | string | — | Partial/comma-separated match on platform name |
| `platformFamily` | string | — | Exact match on platform family |
| `developer` | string | — | Partial/comma-separated match on developer name |
| `publisher` | string | — | Partial/comma-separated match on publisher name |
| `genre` | string | — | Partial/comma-separated match on genre name |
| `classification` | enum | — | Exact match: GAME, DLC, EXPANSION, MOVIE, TV_SHOW, ANIME, SOUNDTRACK, BOOK, HARDWARE, PROMOTIONAL, CHARACTER, FRANCHISE, PERSON, EVENT, UNKNOWN |
| `completeness` | enum | — | Exact match: NOT_FOUND, FOUND_PARTIAL, FOUND_SUFFICIENT, FOUND_COMPLETE |
| `releaseYear` | int | — | Exact year match (1950–2100) |
| `releaseYearFrom` | int | — | Minimum release year (inclusive) |
| `releaseYearTo` | int | — | Maximum release year (inclusive) |
| `page` | int | 1 | Page number (min 1) |
| `limit` | int | 20 | Results per page (1–100) |
| `sort` | enum | updatedAt | title, name, createdAt, updatedAt, completeness, releaseDate |
| `order` | enum | desc | asc or desc |

**Filter semantics**: Comma-separated values within same filter = OR. Across different filters = AND.

---

## 4. Platform Catalog Assessment

### Current State

The platform catalog **exists and is functional** (Phase 17), but:

1. **The `platforms` MongoDB collection is empty** — No seed data, no import mechanism.
2. **Platform `PlatformCatalogEntry` and `Platform` value object are disconnected** — A game's `releases.platform.name` (e.g., "PlayStation") does not resolve to any `PlatformCatalogEntry.id`.
3. **`gameCount` is computed via aggregation** — Works correctly but is a cross-collection join, not a direct relationship.
4. **No way to seed platforms** — The domain supports it (`PlatformCatalogRepository` has `findMany`, `findById`, `findByCompany`), but there's no create/update method in the repository interface, no seed script, and no import adapter.

### What's Missing

| Capability | Status | Priority |
|------------|--------|----------|
| Platform catalog CRUD (create, update) | ❌ Repository interface is read-only | High |
| Seed data / canonical platform dataset | ❌ No mechanism | High |
| Platform ↔ Game linkage | ❌ Games reference platform by name, not by ID | Medium |
| Platform thumbnails from external sources | ❌ `thumb` field exists, never populated | Low |
| Platform generation/era concept | ❌ Not in domain model | Low |
| Platform family validation | ❌ Family is a free-form enum, not validated against catalog | Low |

### Recommended Architecture

The platform catalog should remain a **separate collection** with its own lifecycle. Games reference platforms by name (value object), and the catalog provides metadata enrichment. This is the correct separation — games are the core entity, platforms are contextual metadata.

For seeding: A dedicated `PlatformSeedService` or adapter should populate the `platforms` collection from a canonical dataset (manually curated JSON, or derived from a trusted source).

---

## 5. Game Query Assessment

### Current State

`GET /api/v1/games` is fully functional with:

- 12 filter parameters (search, title, platform, platforms[], platformFamily, developer, developers[], publisher, publishers[], genre, genres[], classification, completeness, releaseYear, releaseYearFrom, releaseYearTo)
- 6 sort fields (title, name, createdAt, updatedAt, completeness, releaseDate)
- Pagination (page, limit)
- Comma-separated multi-value filters with OR semantics within, AND across

### What Works

- All filter combinations compose correctly
- Multi-value filters use `$in` with per-element regex
- Release year range uses `$gte`/`$lte`
- Sort tie-breakers ensure deterministic ordering
- Pagination is correct (total count, total pages)

### What Could Improve

| Improvement | Priority | Notes |
|-------------|----------|-------|
| `platformId` filter (exact match to catalog) | Medium | Currently only `platform` (name regex) and `platformFamily` |
| `developerId` / `publisherId` filter | Low | No ID-based developer/publisher entities yet |
| `region` filter | Low | Region exists in releases but not filterable |
| `hasCover` filter | Low | Quick filter for games with/without covers |
| `sortBy=completeness` semantic ordering | Low | Currently alphabetical, not by completeness rank |

### Assessment

The game query API is **complete for current needs**. The remaining improvements are incremental and don't block any critical functionality.

---

## 6. Data/Seeding Assessment

### Problem

The live validation showed:

```
Platform catalog empty: no platform catalog entries were seeded.
```

All 14 test games had `UNKNOWN` as their platform because Wikipedia search results don't include structured platform data.

### Root Cause

1. **Discovery results lack platform metadata** — Wikipedia articles about games don't always mention the platform in a structured way.
2. **No platform seed data** — The `platforms` collection has no entries.
3. **Platform catalog is read-only** — No create/upsert method in the repository interface.

### Recommended Strategy

**Phase A: Platform Seed Data**

Create a curated JSON dataset of ~200-500 canonical platforms with:
- `id`, `name`, `company`, `releaseYear`, `status`, `family`, `type`
- Examples: Nintendo Switch, PlayStation 5, Xbox Series X, Game Boy, NES, etc.

This can be:
- A static JSON file imported at startup or via a script
- A `PlatformSeedService` that upserts from the dataset
- Not from an external API (too fragile, licensing concerns)

**Phase B: Platform Auto-Discovery (Optional)**

When a game is discovered with a known platform name (e.g., "Nintendo Switch"), auto-create a `PlatformCatalogEntry` if one doesn't exist. This is a soft-association, not a hard requirement.

### What NOT to Do

- Don't scrape a platform database (Wikipedia, MobyGames, etc.) — licensing, maintenance, fragility
- Don't make platform catalog dependent on external API availability
- Don't auto-create platforms for every discovered game (noise)

---

## 7. Post-MVP Roadmap

### Phase 18 — Platform Seed & Catalog Completeness

**Objective**: Make the platform catalog useful by providing seed data and enabling platform lifecycle management.

**Problem Solved**: Platform catalog is empty. Users can't browse platforms or see game counts.

**Why This Position**: The platform catalog endpoints already exist (Phase 17). This phase fills them with data and makes the catalog functional. It's the natural next step after the API surface is defined.

**Dependencies**: None (Phase 17 complete).

**Scope**:
- Create curated platform seed dataset (JSON, ~300 platforms)
- Add `create`/`upsert` methods to `PlatformCatalogRepository` interface
- Implement `MongoPlatformCatalogRepository` create/upsert
- Add `PlatformSeedService` to application layer
- Wire seed service into server startup (idempotent upsert)
- Verify `gameCount` aggregation works with seeded data
- Add integration tests for seed + catalog flows

**Files Affected**:
- `src/domain/platform/platform-catalog-repository.ts` (add create/upsert)
- `src/infrastructure/persistence/mongodb/mongo-platform-catalog-repository.ts` (implement)
- `src/application/platform-seed-service.ts` (new)
- `src/server.ts` (wire seed)
- `tests/api/phase18.test.ts` (new)
- `data/platforms.json` (new, seed dataset)

**Tests Needed**:
- Platform seed idempotency (upsert doesn't duplicate)
- Platform catalog with seeded data
- Game count aggregation with real platform names
- Platform filters with real data
- Platform sort with real data

**Completion Criteria**:
- `GET /api/v1/platforms/summary` returns ~300 platforms
- `GET /api/v1/platforms/summary?companyName=Nintendo` returns Nintendo platforms
- `GET /api/v1/platforms/:id` returns platform details
- Game count per platform is accurate
- Seed is idempotent (running twice doesn't create duplicates)
- All 867+ tests pass

**Risks**:
- Seed data accuracy — curated data may have errors
- Seed data maintenance — needs updates as new platforms release

**Explicitly NOT in Scope**:
- External API integration for platforms
- Platform auto-discovery from game search
- Platform thumbnails from external sources
- Game ↔ Platform foreign key linkage

---

### Phase 19 — Background Enrichment Worker

**Objective**: Progressively improve catalog quality by enriching `FOUND_PARTIAL` games in the background.

**Problem Solved**: Games discovered from search often have incomplete metadata. Manual re-search is the only way to improve them.

**Why This Position**: Enrichment engine already exists and works. This phase adds scheduling to run it autonomously. Requires Phase 18 (platform data) to enrich platform information correctly.

**Dependencies**: Phase 18 (platform seed data for accurate platform enrichment).

**Scope**:
- Create `EnrichmentWorker` that queries `FOUND_PARTIAL` games
- Add configurable batch size, interval, and source selection
- Worker runs as a background interval (not a separate process)
- Enrichment uses existing `EnrichmentService.enrich()`
- Worker reports progress via structured logging
- Add `GET /api/v1/admin/enrichment/status` endpoint (optional, for observability)
- Graceful shutdown support

**Files Affected**:
- `src/worker/enrichment-worker.ts` (new)
- `src/server.ts` (wire worker lifecycle)
- `src/interfaces/http/routes/admin.ts` (new, optional)
- `tests/worker/enrichment-worker.test.ts` (new)

**Tests Needed**:
- Worker processes FOUND_PARTIAL games
- Worker respects batch size limit
- Worker skips already-complete games
- Worker handles enrichment failures gracefully
- Worker shutdown is clean
- Worker doesn't process games during active requests (no contention)

**Completion Criteria**:
- Worker runs on server startup
- Processes N games per interval
- Updates completeness from FOUND_PARTIAL → FOUND_SUFFICIENT/FOUND_COMPLETE
- All 867+ tests pass
- No impact on existing API performance

**Risks**:
- External API rate limiting during batch enrichment
- Network failures during background processing
- Contention with foreground requests (same MongoDB pool)

**Explicitly NOT in Scope**:
- Separate worker process (use in-process interval)
- Cron-based scheduling (use simple interval)
- External task queue (Bull, etc.)
- Priority-based enrichment

---

### Phase 20 — Source Expansion (IGDB/Twitch)

**Objective**: Improve discovery coverage by adding a third source with structured game metadata.

**Problem Solved**: Wikipedia and Steam don't cover all games (especially retro, indie, non-PC). IGDB provides structured metadata including platform, release date, genres, developers.

**Why This Position**: The SourceAdapter interface is already defined and tested. Adding a new source is architecturally straightforward. This phase comes after enrichment (Phase 19) because enriched games will benefit from the additional data.

**Dependencies**: None (SourceAdapter interface exists). Benefits from Phase 19 (enrichment will use new source data).

**Scope**:
- Create `IGDBAdapter` implementing `SourceAdapter`
- Add IGDB configuration (API key, base URL)
- Register IGDB in `SourceRegistry`
- Add IGDB to discovery pipeline
- Add IGDB to cover search (if IGDB provides images)
- Update normalization for IGDB-specific platform/genre names
- Add integration tests with mocked IGDB responses

**Files Affected**:
- `src/sources/igdb/igdb-adapter.ts` (new)
- `src/sources/igdb/index.ts` (new)
- `src/server.ts` (register adapter)
- `src/infrastructure/config/config.ts` (add IGDB config)
- `tests/sources/igdb/igdb-adapter.test.ts` (new)

**Tests Needed**:
- IGDB adapter implements SourceAdapter correctly
- IGDB normalization handles platform name mapping
- IGDB failure doesn't break other sources
- IGDB integration with discovery engine
- IGDB-specific genre/platform normalization

**Completion Criteria**:
- IGDB adapter registered and discoverable
- Discovery queries Wikipedia + Steam + IGDB
- IGDB failures isolated (other sources continue)
- Platform names from IGDB normalized correctly
- All 867+ tests pass

**Risks**:
- IGDB API rate limits (10 req/sec without auth key)
- IGDB data quality varies by game
- IGDB API changes (versioning)
- API key management

**Explicitly NOT in Scope**:
- Multiple source providers (just IGDB)
- Source-specific caching
- Source health monitoring
- Source priority/fallback ordering

---

### Phase 21 — Catalog Statistics & Health

**Objective**: Expose catalog health metrics for monitoring and observability.

**Problem Solved**: No way to understand catalog quality, completeness distribution, or source coverage without querying the database directly.

**Why This Position**: Stats are useful for monitoring enrichment progress (Phase 19) and source expansion impact (Phase 20). Low risk, high observability value.

**Dependencies**: None. Benefits from Phase 18-20 (more data to report on).

**Scope**:
- Create `GET /api/v1/catalog/stats` endpoint
- Return: total games, total platforms, completeness distribution, classification distribution, source coverage, last enrichment timestamp
- Add `GET /api/v1/catalog/stats/sources` for per-source breakdown
- Use aggregation pipelines for efficient counting
- Cache results with short TTL (5 minutes) to avoid repeated aggregation

**Files Affected**:
- `src/application/catalog-stats-service.ts` (new)
- `src/interfaces/http/routes/catalog.ts` (new)
- `src/interfaces/http/app.ts` (register route)
- `tests/api/catalog-stats.test.ts` (new)

**Tests Needed**:
- Stats return correct totals
- Completeness distribution is accurate
- Classification distribution is accurate
- Source coverage counts are correct
- Stats endpoint doesn't impact query performance
- Cache works correctly

**Completion Criteria**:
- `GET /api/v1/catalog/stats` returns accurate metrics
- Response time < 100ms (with cache)
- All 867+ tests pass

**Risks**:
- Aggregation performance on large collections
- Stale cache showing outdated stats

**Explicitly NOT in Scope**:
- Historical stats / time series
- Alerting / notifications
- Dashboard UI
- Export to external monitoring systems

---

### Phase 22 — Relationship API

**Objective**: Expose game relationships through the API, enabling consumers to discover remakes, remasters, ports, and related games.

**Problem Solved**: Game relationships exist in the domain but are invisible to API consumers. The Save State app needs to show "this game has a remaster" or "this is a port of that game."

**Why This Position**: Relationships are a core domain concept that's already fully modeled. This phase is purely API exposure. Comes after catalog statistics (Phase 21) because relationship data enriches the stats.

**Dependencies**: None (domain already supports it). Benefits from Phase 20 (more sources discover more relationships).

**Scope**:
- Add `GET /api/v1/games/:id/relationships` endpoint
- Return all relationships for a game with target game details
- Add `GET /api/v1/relationships?sourceGameId=X&targetGameId=Y` for specific lookup
- Add relationship type filter: `?type=REMAKE`
- Optionally: `POST /api/v1/games/:id/relationships` for manual relationship creation (admin)
- Update `GameResponse` to include relationship summary

**Files Affected**:
- `src/interfaces/http/routes/relationships.ts` (new)
- `src/interfaces/http/app.ts` (register route)
- `src/interfaces/http/validation/schemas.ts` (add relationship schemas)
- `src/interfaces/http/types/api.ts` (add RelationshipResponse)
- `tests/api/relationships.test.ts` (new)

**Tests Needed**:
- List relationships for a game
- Filter by relationship type
- Relationship includes target game details
- Empty relationships return empty array
- Invalid game ID returns 404

**Completion Criteria**:
- `GET /api/v1/games/:id/relationships` works
- Relationship types are filterable
- Target game details included in response
- All 867+ tests pass

**Risks**:
- Circular relationships (A→B→A)
- Orphaned relationships (target game deleted)
- Performance on games with many relationships

**Explicitly NOT in Scope**:
- Relationship creation from discovery (automatic)
- Bidirectional relationship inference
- Relationship confidence scoring
- Graph traversal queries

---

### Phase 23 — Game Write API (Admin)

**Objective**: Enable explicit game creation, update, and deletion for administrative operations.

**Problem Solved**: Currently, games are only created as a side effect of search/discovery. No way to manually correct metadata, merge duplicates, or remove invalid entries.

**Why This Position**: Write operations are high-risk and require careful design. This phase comes after the read API is stable and well-tested. Requires Phase 22 (relationships) to handle merge scenarios correctly.

**Dependencies**: Phase 22 (relationship API for merge support).

**Scope**:
- `POST /api/v1/games` — Create game manually
- `PATCH /api/v1/games/:id` — Update game metadata
- `DELETE /api/v1/games/:id` — Soft-delete game (mark as deleted, don't remove)
- `POST /api/v1/games/:id/merge` — Merge two games (combine metadata, redirect relationships)
- Input validation for all write operations
- Audit logging for all mutations

**Files Affected**:
- `src/interfaces/http/routes/games.ts` (add POST, PATCH, DELETE)
- `src/interfaces/http/validation/schemas.ts` (add write schemas)
- `src/application/catalog-service.ts` (add create, update, delete methods)
- `tests/api/games-write.test.ts` (new)

**Tests Needed**:
- Create game with valid data
- Create game with invalid data (validation errors)
- Update game metadata
- Update non-existent game (404)
- Delete game (soft delete)
- Merge two games
- Merge preserves relationships
- Audit log captures all mutations

**Completion Criteria**:
- All write endpoints functional
- Input validation prevents invalid data
- Soft delete preserves referential integrity
- Merge works correctly
- All 867+ tests pass

**Risks**:
- Data corruption from bad writes
- Race conditions during concurrent edits
- Merge logic complexity
- Orphaned relationships after delete

**Explicitly NOT in Scope**:
- Bulk import/export
- Authentication/authorization (assumed internal use)
- Version history / undo
- Conflict resolution for concurrent edits

---

### Phase 24 — Authentication & API Keys

**Objective**: Secure the API for external consumers and multi-tenant deployment.

**Problem Solved**: The API is currently open. If ATP is consumed by Save State or other external apps, authentication is required.

**Why This Position**: Authentication is a cross-cutting concern that adds complexity. It should only be added when there's a real deployment need. This phase comes after the core API is stable.

**Dependencies**: None. But benefits from Phase 23 (write operations need auth).

**Scope**:
- API key authentication middleware
- `X-API-Key` header validation
- Key management (create, revoke, list)
- Rate limiting per API key (instead of global)
- Optional: JWT-based auth for user-facing scenarios
- Role-based access (read-only vs read-write)

**Files Affected**:
- `src/interfaces/http/middleware/auth.ts` (new)
- `src/infrastructure/auth/key-store.ts` (new)
- `src/interfaces/http/routes/admin.ts` (key management)
- `src/interfaces/http/middleware/rate-limiter.ts` (per-key)

**Tests Needed**:
- Valid API key allows access
- Invalid API key returns 401
- Missing API key returns 401
- Rate limiting per key works
- Key revocation works

**Completion Criteria**:
- API key auth works for all endpoints
- Rate limiting is per-key
- Key management endpoints work
- All 867+ tests pass (with auth tests)

**Risks**:
- Key management complexity
- Performance impact of auth middleware
- Key rotation handling

**Explicitly NOT in Scope**:
- OAuth / OIDC
- User management
- Session management
- Multi-factor authentication

---

### Phase 25 — Performance & Scale

**Objective**: Optimize for larger catalogs (10k+ games) and higher request volumes.

**Problem Solved**: Current implementation works for small catalogs. May not scale to full production volumes.

**Why This Position**: Performance optimization should be driven by measurement, not speculation. This phase comes after the API is feature-complete.

**Dependencies**: All previous phases.

**Scope**:
- MongoDB aggregation pipeline optimization
- Query result caching (Redis or in-memory)
- Connection pool tuning
- Response compression (gzip)
- Database index review and optimization
- Load testing with realistic data volumes
- Memory profiling

**Files Affected**:
- Various infrastructure files
- `src/infrastructure/cache/` (new)
- Load test scripts (new)

**Tests Needed**:
- Response time benchmarks
- Memory usage under load
- Cache hit rates
- Index usage analysis

**Completion Criteria**:
- P95 response time < 200ms for catalog queries
- Memory usage stable under 1000 concurrent connections
- No memory leaks
- All 867+ tests pass

**Risks**:
- Premature optimization
- Caching complexity
- Cache invalidation

**Explicitly NOT in Scope**:
- Horizontal scaling
- Database sharding
- CDN integration
- Microservice decomposition

---

## 8. Phase Dependencies

```text
Phase 18 — Platform Seed & Catalog     (no dependencies)
    ↓
Phase 19 — Background Enrichment       (depends on 18 for platform data)
    ↓
Phase 20 — Source Expansion (IGDB)     (no dependencies, benefits from 19)
    ↓
Phase 21 — Catalog Statistics          (no dependencies, benefits from 18-20)
    ↓
Phase 22 — Relationship API            (no dependencies, benefits from 20)
    ↓
Phase 23 — Game Write API              (depends on 22 for merge)
    ↓
Phase 24 — Authentication              (no dependencies, benefits from 23)
    ↓
Phase 25 — Performance & Scale         (depends on all above)
```

Phases 18-22 can be worked in parallel if resources allow. Phases 23-25 should be sequential.

---

## 9. Priority Classification

### Core (Must-Have for Production Catalog)

| Phase | Why |
|-------|-----|
| **Phase 18 — Platform Seed** | Without seed data, the platform catalog is useless. Every game needs platform context. |
| **Phase 19 — Background Enrichment** | Catalog quality degrades without progressive improvement. Manual re-search is not scalable. |
| **Phase 21 — Catalog Statistics** | Essential for monitoring catalog health and enrichment progress. |

### Important (High Value, Not Blocking)

| Phase | Why |
|-------|-----|
| **Phase 20 — Source Expansion** | Dramatically improves coverage. Wikipedia + Steam miss many games. |
| **Phase 22 — Relationship API** | Core domain concept, needed by Save State for game lineage display. |
| **Phase 23 — Game Write API** | Enables manual correction and merge. Critical for catalog quality long-term. |

### Optional (Can Wait)

| Phase | Why |
|-------|-----|
| **Phase 24 — Authentication** | Only needed for external/public deployment. Internal use doesn't require it. |
| **Phase 25 — Performance** | Premature until real load patterns are measured. |

### Deployment-Specific

| Phase | Depends On |
|-------|-----------|
| Phase 24 — Authentication | Deployment model (internal vs external) |
| Phase 25 — Performance | Actual traffic patterns and data volume |

---

## 10. Risks

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Platform seed data accuracy | Medium | Manual curation, community validation |
| IGDB API changes | Medium | Adapter isolation, version pinning |
| Background enrichment rate limits | Low | Configurable batch size, exponential backoff |
| Game merge complexity | High | Thorough testing, audit logging, soft delete first |
| Cache invalidation | Medium | Short TTL, manual invalidation endpoint |

### Architectural Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Feature creep | High | Strict phase scoping, "explicitly NOT in scope" |
| Premature optimization | Medium | Measure first, optimize based on data |
| Authentication complexity | Medium | Start with API keys, not OAuth |
| Write API data corruption | High | Validation, audit logging, soft delete |

### Process Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope expansion during implementation | High | Phase reports with strict scope |
| Test suite growth | Low | Parallel test development |
| Documentation drift | Medium | Update README with each phase |

---

## 11. Recommended Next Phase

**Phase 18 — Platform Seed & Catalog Completeness**

### Why

1. **Immediate impact** — The platform catalog endpoints exist but return empty data. This phase makes them useful.
2. **Low risk** — Seed data is static, upsert is idempotent, no external API dependencies.
3. **Foundation for enrichment** — Background enrichment (Phase 19) needs platform data to enrich platform information correctly.
4. **User-facing value** — Users can browse platforms, see game counts, filter by company/status/year.
5. **No architectural changes** — Pure data addition + repository CRUD methods.

### What To Do

1. Curate a JSON dataset of ~300 canonical platforms
2. Add `create`/`upsert` to `PlatformCatalogRepository` interface
3. Implement in `MongoPlatformCatalogRepository`
4. Create `PlatformSeedService` (idempotent upsert)
5. Wire into server startup
6. Test with real seeded data
7. Update README with platform data examples

### What NOT To Do

- Don't add external API integration for platforms
- Don't modify the Game domain model
- Don't add authentication
- Don't create new endpoints (existing ones are sufficient)

---

## 12. Definition of v1.0

The ATP Engine reaches v1.0 when:

```text
✅ All MVP requirements met (Phase 0-16)
✅ Platform catalog seeded and functional (Phase 18)
✅ Background enrichment running (Phase 19)
✅ At least 3 source adapters (Phase 20)
✅ Catalog statistics available (Phase 21)
✅ 867+ tests passing
✅ All validations clean
✅ README accurately documents all endpoints
✅ Docker production-ready
```

### v1.0 Capabilities

- Game search with discovery + persistence
- Game catalog with composable filters
- Platform catalog with seed data
- Cover discovery with deterministic ranking
- Background enrichment for progressive improvement
- 3+ source adapters (Wikipedia, Steam, IGDB)
- Catalog health statistics
- Deterministic-first, AI-optional
- Production Docker
- 900+ automated tests

---

## 13. Definition of post-v1.0

After v1.0, the ATP Engine evolves toward:

```text
Relationships exposed via API (Phase 22)
Game write operations (Phase 23)
Authentication for external consumers (Phase 24)
Performance optimization (Phase 25)
```

These are **important but not blocking**. The engine is functional and useful at v1.0. Post-v1.0 phases add polish, security, and scale.

---

## Conclusion

### "What should we implement first now that the MVP is ready, and why?"

**Phase 18 — Platform Seed & Catalog Completeness.**

The platform catalog endpoints exist but return empty data. This is the most visible gap in the current implementation. Seeding ~300 canonical platforms immediately makes the catalog browsable, enables game count aggregation, and provides the foundation for enrichment. It's low-risk, high-impact, and architecturally clean.

### "What capabilities are still missing for ATP to be considered a truly complete game catalog engine?"

1. **Platform data** — Catalog exists but is empty. Needs seed data.
2. **Progressive enrichment** — Games discovered from search have incomplete metadata. Background worker needed.
3. **Source diversity** — Wikipedia + Steam miss many games (retro, indie, non-PC). IGDB would dramatically improve coverage.
4. **Catalog observability** — No way to monitor catalog health, completeness, or source coverage.
5. **Relationship exposure** — Domain supports relationships but API doesn't expose them.
6. **Write operations** — No way to manually correct, merge, or delete games.
7. **Authentication** — Needed for external consumers.

Of these, **platform data** and **progressive enrichment** are the most critical. The others are important but not blocking for a functional catalog engine.

### "MVP complete ≠ project finished"

Correct. The MVP demonstrates the core pipeline works. The post-MVP roadmap transforms it from a proof-of-concept into a production catalog engine. The key insight is that **data quality matters more than feature quantity** — seed data, enrichment, and source diversity will do more for catalog usefulness than new API features.
