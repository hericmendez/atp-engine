# Phase 16 — Reconnaissance Report

**Date**: 2026-08-31
**Status**: Reconnaissance Complete — No Code Changes

---

## 1. Executive Summary

All planned phases (0–15) of the ATP Engine are complete. 833 tests pass, build/lint/format are clean, architecture is healthy.

Phase 16 reconnaissance examined the entire codebase for the highest-value next work. The most significant finding:

**The EnrichmentEngine exists and is well-tested, but is never called from the application layer or API.** This is the single largest architectural gap in the system.

Additionally, discovery results are ephemeral — every search for an unknown game re-queries all external sources with no caching benefit.

The recommended Phase 16 scope is to wire enrichment into the application layer and persist discovery results. This closes the most critical gap without introducing new infrastructure.

---

## 2. Architecture Health

**Status: Strong — No violations**

- Domain: zero infrastructure imports
- Application: orchestration without transport concerns
- Infrastructure: implements domain/application interfaces
- Interfaces: HTTP routes, middleware, validation

All architectural invariants preserved.

---

## 3. Current State

### What Works End-to-End

| Capability | Status | Flow |
|------------|--------|------|
| Game search (DB) | ✅ | API → CatalogService → MongoGameRepository |
| Game search (scraper fallback) | ✅ | API → CatalogService → DiscoveryEngine → Sources |
| Cover search (query-based) | ✅ | API → CoverService → CoverEngine → Sources |
| Cover discovery (game-based) | ✅ | API → CoverService → CoverEngine → Sources → persists |
| Health check | ✅ | API → MongoDB + AI status |
| Classification | ✅ | DeterministicClassifier (100% accuracy) |
| Identity resolution | ✅ | DeterministicIdentityResolver (native) + AI (async) |
| Enrichment engine | ⚠️ | EXISTS but NEVER CALLED from application/API |

### What Exists but Is Not Wired

| Component | File | Status |
|-----------|------|--------|
| EnrichmentEngine | `src/enrichment/enrichment-engine.ts` | Pure function, 32 unit tests, never called from app |
| EnrichmentService | Does not exist | Missing |
| Discovery → persistence | Does not exist | Scraper results are ephemeral |
| Background enrichment | Does not exist | No scheduler, workers, or queues |
| Batch operations | Does not exist | No bulk endpoints |
| Relationship API | Does not exist | Domain supports it, API does not expose it |
| Catalog statistics | Does not exist | No health/analytics endpoint |
| Game update/merge API | Does not exist | Repository supports it, API does not expose it |

---

## 4. The Enrichment Gap — Detailed Analysis

### The Problem

The `EnrichmentEngine` (`src/enrichment/enrichment-engine.ts`) is a pure function:

```typescript
export function enrichGame(
  existingGame: Game,
  observations: NormalizedCandidate[],
  sourceEvidence: SourceEvidence[],
): EnrichmentResult
```

It:
- Takes an existing game and new observations
- Additively enriches titles, organizations, genres, external identifiers, evidence, releases
- Detects conflicts (conservative)
- Calculates metadata completeness
- Returns the enriched game + change metadata

**It is never called from any application service, API route, or integration point.**

### The Flow That Should Exist

```text
User searches for "Zelda"
  ↓
CatalogService.searchViaDiscovery()
  ↓
DiscoveryEngine discovers candidates
  ↓
Candidates are classified and identity-resolved
  ↓
Candidates are mapped to NormalizedCandidates (discovery-to-game.ts)
  ↓
[ GAP: EnrichmentEngine should be called here ]
  ↓
Enriched game should be persisted
  ↓
Subsequent searches benefit from cached data
```

### What Currently Happens

```text
User searches for "Zelda"
  ↓
CatalogService.searchViaDiscovery()
  ↓
DiscoveryEngine discovers candidates
  ↓
Candidates are classified and identity-resolved
  ↓
Candidates are mapped to discovery groups (synthetic IDs)
  ↓
Results returned with origin: 'scraper'
  ↓
NOT PERSISTED — next search re-queries all sources
```

### Impact

1. **Every search for an unknown game is a full external API call** — no caching
2. **Catalog never grows from search** — the database only contains games that were explicitly saved via some other path (which currently doesn't exist via the API)
3. **Enrichment is dead code** — well-tested, well-designed, but unused
4. **Completeness scores are never calculated** — the field exists but is never populated for discovered games

---

## 5. Candidate Subtasks

### 5.1 — EnrichmentService (FIX NOW)

**Objective**: Wire the EnrichmentEngine into the application layer.

**Scope**:
- Create `src/application/enrichment-service.ts`
- Service takes a gameId + observations, calls `enrichGame()`, persists result
- Wire into the search flow or provide explicit endpoint
- Integration tests with real MongoDB

**Dependencies**: EnrichmentEngine (exists), MongoGameRepository (exists), CatalogService (exists)

**Risk**: Low — adds new service, does not change existing behavior

**Exit criteria**:
- EnrichmentService exists and is tested
- Enrichment is called during search or via explicit endpoint
- Enriched games are persisted to the database
- Subsequent searches for the same game use cached data

### 5.2 — Persist Discovery Results (DO NEXT)

**Objective**: Stop making every search for unknown games a full external API call.

**Scope**:
- After discovery + classification + identity resolution, persist the result
- Use database-first behavior: if game already exists, return it
- If new, create it with the discovered data
- Ensure idempotence (same search → same result)

**Dependencies**: 5.1 (EnrichmentService)

**Risk**: Medium — changes the search flow semantics from ephemeral to persistent

**Exit criteria**:
- Searching for an unknown game creates a canonical record
- Re-searching the same game returns the cached record (origin: 'database')
- No duplicate records created from repeated searches

### 5.3 — Catalog Statistics Endpoint (DEFER)

**Objective**: Expose catalog health metrics.

**Scope**:
- `GET /api/v1/catalog/stats` endpoint
- Returns: completeness distribution, source coverage, classification breakdown, total games

**Dependencies**: None (read-only query on existing data)

**Risk**: Low — additive, read-only

### 5.4 — Background Enrichment Worker (DEFER)

**Objective**: Progressively improve catalog quality for incomplete games.

**Scope**:
- Background job that identifies `FOUND_PARTIAL` games
- Queries external sources for missing fields
- Enriches and persists

**Dependencies**: 5.1, 5.2

**Risk**: Medium — introduces scheduling infrastructure

### 5.5 — Relationship API (DEFER)

**Objective**: Expose game relationships via API.

**Scope**:
- `GET /api/v1/games/:id/relationships`
- `POST /api/v1/games/:id/relationships`

**Dependencies**: None (domain already supports it)

**Risk**: Low — additive

### 5.6 — Batch Operations (DEFER)

**Objective**: Enable bulk import and enrichment.

**Scope**:
- `POST /api/v1/games/batch-enrich` — enrich multiple games
- Bulk import from external catalogs

**Dependencies**: 5.1

**Risk**: Medium — introduces batch processing patterns

---

## 6. Dependencies

```text
5.1 EnrichmentService
  ↓
5.2 Persist Discovery Results
  ↓
5.4 Background Enrichment Worker
  ↓
5.6 Batch Operations

5.3 Catalog Statistics (independent)
5.5 Relationship API (independent)
```

---

## 7. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Persisting discovery results changes search semantics | Medium | Ensure database-first behavior is preserved; scraper fallback still works for new games |
| Enrichment may produce conflicts during auto-persistence | Low | Use conservative conflict detection (already implemented) |
| Background worker adds infrastructure complexity | Medium | Defer until enrichment wiring is stable |
| Batch operations may cause rate limiting on external sources | Low | Use existing retry + timeout infrastructure |

---

## 8. Test Coverage

### What Is Well-Tested

- EnrichmentEngine: 32 unit tests (pure function)
- DiscoveryEngine: 31 tests (multi-source, failures, ranking)
- CatalogService: mocked tests (no integration)
- All API endpoints: mocked tests

### Gaps

- No integration tests for CatalogService with real MongoDB
- No tests for enrichment-to-persistence pipeline
- No tests for discovery-to-canonical flow
- No tests for the `discovery-to-game` mapper through the full pipeline

### Required for Phase 16

- Integration tests for EnrichmentService
- Integration tests for discovery → enrichment → persistence flow
- Tests for idempotent search behavior

---

## 9. Proposed Scope

### Phase 16.1 — EnrichmentService (FIX NOW)

Wire the existing EnrichmentEngine into the application layer.

### Phase 16.2 — Persist Discovery Results (DO NEXT)

After discovery, persist canonical games so subsequent searches use cached data.

### Phase 16.3 — Integration Tests (DO NEXT)

Add integration tests for the enrichment and persistence flows.

### Items NOT in Phase 16

- Background enrichment worker (needs scheduling infrastructure)
- Batch operations (needs batch patterns)
- Relationship API (independent, can be separate)
- Catalog statistics (independent, can be separate)
- Game update/merge API (admin functionality)
- Authentication (deferred to deployment)

---

## 10. Deferred Items

| Item | Reason |
|------|--------|
| Background enrichment worker | Needs scheduling infrastructure; wire enrichment first |
| Batch operations | Needs batch patterns; wire enrichment first |
| Relationship API | Independent; can be separate phase |
| Catalog statistics | Independent; can be separate phase |
| Game update/merge API | Admin functionality; not core flow |
| Authentication | Internal service; not public-facing |
| DB projection optimization | Needs measurement |
| Enrichment RegExp memoization | Needs measurement |

---

## 11. Architectural Decisions

No new architectural decisions required for Phase 16.

The existing architecture supports the proposed changes:
- EnrichmentEngine is already a pure function
- MongoGameRepository already supports create/update
- CatalogService already has database-first behavior
- The enrichment service fits naturally in the application layer

---

## 12. Exit Criteria

Phase 16 is complete when:

```text
EnrichmentService exists and is tested
  +
Enrichment is called during search or via explicit endpoint
  +
Enriched games are persisted to the database
  +
Subsequent searches for the same game return cached data
  +
Integration tests pass
  +
833+ tests pass (no regressions)
  +
Build/lint/format clean
```

---

## 13. Recommendation

**Implement Phase 16.1 (EnrichmentService) and 16.2 (Persist Discovery Results) as the next work.**

These close the most critical architectural gap in the system — the enrichment engine exists but is never used. This is dead code that was deliberately built and tested but never integrated.

The work is:
- High value (closes a real gap)
- Low risk (adds new code, does not change existing behavior)
- Well-scoped (clear files, clear tests, clear exit criteria)
- Consistent with the roadmap's philosophy (correctness before optimization, deterministic-first)

After Phase 16, the system will have a complete discovery → enrichment → persistence pipeline, and the catalog will grow organically from user searches.
