# ATP Engine — MVP Checkpoint

**Date**: 2026-08-31
**Status**: Phase 16 Complete — MVP Assessment

---

## 1. Current MVP Capabilities

### End-to-End Flows

| Capability | Status | Flow |
|------------|--------|------|
| Game search (DB) | ✅ | API → CatalogService → MongoGameRepository |
| Game search (discovery + persistence) | ✅ | API → CatalogService → DiscoveryEngine → EnrichmentService → Repository |
| Game catalog filtering | ✅ | API → CatalogService → MongoGameRepository |
| Single game retrieval | ✅ | API → CatalogService → MongoGameRepository |
| Cover search (query-based) | ✅ | API → CoverService → CoverEngine → Sources |
| Cover discovery (game-based) | ✅ | API → CoverService → CoverEngine → Sources → persists |
| Health check | ✅ | API → MongoDB + AI status |
| Classification | ✅ | DeterministicClassifier (100% accuracy) |
| Identity resolution | ✅ | DeterministicIdentityResolver (native) + AI (async, optional) |
| Enrichment | ✅ | EnrichmentService → enrichGame() → Repository |
| Discovery → Persistence | ✅ | CatalogService.discoverAndPersist() → persist per group → external ID dedup |
| Normalization | ✅ | Title, platform, region, developer, publisher, genre normalization |
| Multi-source discovery | ✅ | Wikipedia + Steam with failure isolation |
| Source failure isolation | ✅ | Promise.allSettled per source |
| AI assistance | ✅ | Optional, behind interfaces, deterministic fallback |
| Reliability | ✅ | Retry, timeout, rate limiting, structured logging |
| Performance | ✅ | DB indexes, connection pool, parallel source queries, LRU cache |
| Production Docker | ✅ | .dockerignore, NODE_ENV, HEALTHCHECK, --omit=dev |

### What Works

1. **Search**: Query Wikipedia + Steam → classify → normalize → deduplicate → persist → return with `origin: "database"`
2. **Repeat search**: Returns cached DB result (no re-discovery)
3. **Enrichment**: Existing games enriched with new observations from discovery
4. **Identity safety**: Distinct games with similar titles preserved (e.g., Resident Evil 4 2005 vs 2023)
5. **Cover discovery**: Query-based and game-based, type filtering, deterministic ranking, persistence
6. **AI fallback**: Deterministic-first, AI optional, graceful degradation
7. **Source failure**: One source down doesn't break the system
8. **Production ready**: Docker, rate limiting, logging, health checks

---

## 2. Complete API Inventory

### Endpoint Summary

| # | Method | Path | Description | Writes |
|---|--------|------|-------------|--------|
| 1 | `GET` | `/health` | Server health status | ❌ |
| 2 | `GET` | `/api/v1/games` | List games with composable filters | ❌ |
| 3 | `GET` | `/api/v1/games/search` | Search games by term | ✅ (persists discovered games) |
| 4 | `GET` | `/api/v1/games/:id` | Retrieve single game by ID | ❌ |
| 5 | `GET` | `/api/v1/covers/search` | Search cover images by query | ❌ |
| 6 | `GET` | `/api/v1/games/:id/cover` | Get cover for a game | ✅ (persists cover) |

### Detailed Endpoint Documentation

#### `GET /health`

Returns server status, dependency health, and uptime.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-08-31T01:00:00.000Z",
  "version": "0.1.0",
  "dependencies": {
    "database": "connected",
    "ai": "configured"
  },
  "uptime": 12345.678
}
```

**Dependencies**: None

---

#### `GET /api/v1/games`

List games with composable filters. Database-only — no external scraping.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | — | Partial match on titles, developers, publishers |
| `title` | string | — | Partial match on titles only |
| `platform` | string | — | Partial match on platform name |
| `platformFamily` | string | — | Exact match on platform family |
| `developer` | string | — | Partial match on developer name |
| `publisher` | string | — | Partial match on publisher name |
| `genre` | string | — | Partial match on genre name |
| `classification` | enum | — | `GAME`, `DLC`, `EXPANSION`, `MOVIE`, etc. |
| `completeness` | enum | — | `NOT_FOUND`, `FOUND_PARTIAL`, `FOUND_SUFFICIENT`, `FOUND_COMPLETE` |
| `releaseYear` | int | — | 1950–2100 |
| `page` | int | `1` | Page number (min 1) |
| `limit` | int | `20` | Results per page (1–100) |
| `sort` | enum | — | `title`, `createdAt`, `updatedAt`, `completeness` |
| `order` | enum | `desc` | `asc` or `desc` |

**Dependencies**: MongoDB (read-only)

---

#### `GET /api/v1/games/search`

Search games by term. Database-first with discovery fallback.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | **required** | Search term (min 1 char) |
| `source` | string | — | Reserved (not yet used) |
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Results per page (1–100) |
| `sort` | enum | — | `title`, `createdAt`, `updatedAt`, `completeness` |
| `order` | enum | `desc` | `asc` or `desc` |

**Search flow**:
```text
Query database → found? → return with origin: "database"
                  ↓ empty
Discover from Wikipedia + Steam → classify → normalize → deduplicate by external ID
                  ↓
Persist discovered games → enrich if existing → return with origin: "database"
```

**Dependencies**: MongoDB (read+write). Wikipedia, Steam (on empty DB).

---

#### `GET /api/v1/games/:id`

Retrieve a single game by domain ID. Database-only — no external scraping.

**Path Parameters**: `id` — Game domain ID (required)

**Dependencies**: MongoDB (read-only)

---

#### `GET /api/v1/covers/search`

Search for cover images by query. No Game required.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | **required** | Search query (1–200 chars) |
| `type` | enum | `cover` | `cover`, `logo`, or `all` |
| `limit` | int | `1` | Number of candidates (1–9) |
| `source` | string | — | Filter to specific source |

**Dependencies**: Wikipedia, Steam. No MongoDB.

---

#### `GET /api/v1/games/:id/cover`

Get cover for an existing game. Caches result on game record.

**Path Parameters**: `id` — Game domain ID (required)

**Behavior**: Cached → return immediately. Not cached → discover → persist → return.

**Dependencies**: MongoDB (read+write). Wikipedia, Steam.

---

## 3. Architecture Status

### Boundaries Preserved

| Layer | Responsibility | Imports From |
|-------|---------------|--------------|
| **Domain** | Game, Release, Platform, Identity, Classification, Enrichment | Nothing (pure) |
| **Application** | CatalogService, CoverService, EnrichmentService | Domain + Application interfaces |
| **Infrastructure** | MongoGameRepository, WikipediaAdapter, SteamAdapter, OllamaProvider | Domain + Application interfaces |
| **Interfaces** | Express routes, middleware, validation | Application services |

### Invariants Verified

| Invariant | Status |
|-----------|--------|
| Domain has zero infrastructure imports | ✅ |
| Domain has zero Express imports | ✅ |
| Application has zero MongoDB imports | ✅ |
| AI is optional behind interfaces | ✅ |
| Deterministic-first processing | ✅ |
| External sources substitutable via SourceAdapter | ✅ |
| Source failures isolated (Promise.allSettled) | ✅ |
| Persistence behind repository interfaces | ✅ |
| All external input validated (Zod) | ✅ |
| Controllers remain thin | ✅ |
| Error handler translates to consistent JSON | ✅ |

### Architectural Blockers

**None identified.** The architecture is clean, layered, and extensible.

---

## 4. Production/MVP Readiness

### Ready

| Capability | Evidence |
|------------|----------|
| Game search with discovery + persistence | Phase 16, 8 integration scenarios |
| Game catalog filtering | Phase 9, composable filters |
| Cover discovery | Phase 10, query-based + game-based |
| Health check | Phase 0, database + AI status |
| Classification | Phase 5, 100% deterministic accuracy |
| Identity resolution | Phase 6, deterministic + AI fallback |
| Enrichment | Phase 8 + 16, pure engine + persistence |
| Multi-source | Phase 7, Wikipedia + Steam |
| Source failure isolation | Phase 13, Promise.allSettled |
| AI fallback | Phase 11, deterministic-first |
| Reliability | Phase 13, retry, timeout, rate limiting |
| Performance | Phase 14, DB indexes, LRU cache, parallel sources |
| Production Docker | Phase 15, NODE_ENV, HEALTHCHECK, --omit=dev |
| API validation | Zod schemas, consistent error format |
| Request tracing | Request IDs, structured logging |
| Test suite | 841 tests, all passing |

### Intentionally Deferred

| Item | Reason |
|------|--------|
| Background enrichment worker | Needs scheduling infrastructure |
| Catalog statistics endpoint | Nice-to-have, not blocking |
| Relationship API | Domain supports it, API doesn't expose it |
| Game update/delete API | Admin functionality, not core |
| Batch operations | Needs batch patterns |
| API authentication | Internal service, not public-facing |
| Helmet/CORS | Backend-to-backend, no browser |
| Backup strategy | Needs deployment target |
| Migration tooling | MongoDB flexible schema sufficient |
| Circuit breaker | Retry + timeout sufficient |
| Dedicated metrics | Structured logging sufficient |

### Would Prevent MVP Status

**None.** All core capabilities are implemented and tested.

---

## 5. Remaining Backlog

### Required Before MVP

**None.** All MVP requirements from the roadmap (Section 20) are met.

### Post-MVP Features

| Feature | Priority | Dependencies |
|---------|----------|--------------|
| Background enrichment worker | Medium | EnrichmentService ✅ |
| Catalog statistics endpoint | Low | None |
| Relationship API | Low | Domain ✅ |
| Game update/delete API | Medium | None |
| Batch enrichment | Medium | EnrichmentService ✅ |
| Additional sources (IGDB, RAWG, etc.) | Medium | SourceAdapter ✅ |
| Scheduled source synchronization | Low | Background worker |

### Scale/Performance Improvements

| Improvement | Priority | Context |
|-------------|----------|---------|
| DB projection optimization | Low | Needs measurement |
| Enrichment RegExp memoization | Low | Needs measurement |
| Query result caching | Low | MongoDB TTL indexes |
| Connection pool tuning | Low | Needs load testing |

### Deployment-Specific Concerns

| Concern | Priority | Context |
|---------|----------|---------|
| Authentication/API keys | Medium | Depends on deployment model |
| Rate limiting per-client | Low | Current is global |
| Horizontal scaling | Low | MongoDB replica sets |
| Backup/restore | Medium | Needs deployment target |
| Monitoring/alerting | Medium | Structured logs → observability platform |

### Nice-to-Have/Admin Features

| Feature | Priority |
|---------|----------|
| Admin dashboard | Low |
| Manual game merge | Low |
| Source confidence analytics | Low |
| AI evaluation dashboards | Low |
| Catalog health reports | Low |

---

## 6. Final Recommendation

### Is the ATP Engine currently an MVP?

**Yes.**

### Why

The ATP Engine satisfies all 16 MVP requirements defined in the roadmap (Section 20):

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Search multiple sources | ✅ | Wikipedia + Steam adapters |
| 2 | Normalize results | ✅ | Title, platform, region, developer, publisher, genre normalization |
| 3 | Filter non-game entities | ✅ | DeterministicClassifier, 100% accuracy |
| 4 | Resolve obvious duplicate identities | ✅ | DeterministicIdentityResolver, external ID matching |
| 5 | Handle platforms, families, regions | ✅ | Platform ontology, region normalization |
| 6 | Distinguish obvious remakes | ✅ | Identity resolver handles RE4 2005 vs 2023 |
| 7 | Track distribution channels/launchers | ✅ | Domain model supports it |
| 8 | Handle mobile platforms correctly | ✅ | Android/iOS as platforms |
| 9 | Distinguish platform from distribution | ✅ | Android ≠ Google Play |
| 10 | Persist canonical Games | ✅ | MongoGameRepository |
| 11 | Retrieve from database first | ✅ | Database-first search |
| 12 | Search by term | ✅ | GET /api/v1/games/search |
| 13 | Filter catalog | ✅ | GET /api/v1/games with composable filters |
| 14 | Paginate | ✅ | All collection endpoints |
| 15 | Retrieve covers | ✅ | Cover search + game cover |
| 16 | Operate without AI | ✅ | Deterministic-first, AI optional |

### Additional Capabilities Beyond MVP

- Discovery → enrichment → persistence pipeline
- Cover discovery with deterministic ranking
- Source failure isolation
- Production Docker configuration
- Structured logging with request tracing
- Rate limiting
- 841 automated tests

### What Would Make It "More Than MVP"

- Background enrichment for progressive catalog improvement
- Multiple source adapters beyond Wikipedia/Steam
- API authentication for external consumers
- Monitoring/alerting integration
- Horizontal scaling support

---

## 7. Validation Results

```text
Tests:       841 passed (841)
Build:       PASS
Lint:        PASS
Format:      PASS
```

---

## 8. Git State

```text
Branch:      main
Last commit: 42e37ea (Phase 14)
Modified:    README.md (API documentation update)
Untracked:   docs/reports/phase-16-discovery-enrichment-persistence.md
             docs/reports/phase-16-reconnaissance.md
No commit created.
```

---

## 9. Roadmap Status

```text
Phase 0  — Foundation ✅
Phase 1  — Domain Model ✅
Phase 2  — Repository and Persistence ✅
Phase 3  — Normalization ✅
Phase 4  — Source Infrastructure ✅
Phase 5  — Classification ✅
Phase 6  — Identity Resolution ✅
Phase 7  — Discovery Engine ✅
Phase 8  — Canonical Enrichment ✅
Phase 9  — Search and Catalog API ✅
Phase 10 — Cover Engine ✅
Phase 11 — AI Integration ✅
Phase 12 — AI Evaluation ✅
Phase 13 — Reliability ✅
Phase 14 — Performance ✅
Phase 15 — Production Hardening ✅
Phase 16 — Discovery → Enrichment → Persistence ✅

ALL PLANNED PHASES COMPLETE
```
