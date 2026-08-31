# Phase 16 — Discovery → Enrichment → Persistence Pipeline

**Date**: 2026-08-31
**Status**: Complete

---

## 1. Summary

Phase 16 closed the most critical architectural gap in the ATP Engine: the EnrichmentEngine existed as a well-tested pure function but was never called from the application layer. Discovery results were ephemeral — every search for an unknown game re-queried all external sources with no caching benefit.

The confirmed scope was:

1. **EnrichmentService** — Wire the existing EnrichmentEngine into the application layer
2. **CatalogService persistence** — Persist discovery results so subsequent searches use cached data
3. **Server wiring** — Connect EnrichmentService into the dependency graph
4. **Test suite** — 8 integration scenarios covering the full pipeline

All exit criteria met: 841 tests pass, build/lint/format clean, architecture preserved.

---

## 2. Step-by-Step Implementation

### 2.1 — EnrichmentService (16.1)

Created `src/application/enrichment-service.ts`.

The service wraps the pure `enrichGame()` function with repository persistence:

```typescript
export class EnrichmentService {
  async enrich(
    game: Game,
    observations: readonly DiscoverySourceObservation[],
  ): Promise<EnrichmentResult> {
    const result = enrichGame(game, observations);

    if (result.changes.length > 0) {
      await this.gameRepository.update(result.game);
    }

    return result;
  }
}
```

Key design decisions:
- **Pure delegation**: `enrichGame()` is never modified; the service adds only persistence
- **Conditional update**: `update()` is called only when changes exist (avoids unnecessary writes)
- **Returns full result**: Caller receives `EnrichmentResult` with game, changes, conflicts, completeness

### 2.2 — CatalogService Persistence (16.2)

Rewrote `src/application/catalog-service.ts` to add:

- `EnrichmentService` as optional dependency
- `discoverAndPersist()` private method — orchestrates discovery → persistence → enrichment
- `persistDiscoveryGroup()` private method — handles single group persistence with external identifier deduplication

The `searchGames()` flow became:

```text
findMany(search)
  ↓
Items found? → YES → return with origin: 'database'
  ↓ NO
discoverAndPersist(search)
  ↓
discoveryEngine.discover()
  ↓
For each group: persistDiscoveryGroup(group)
  ↓
Return with origin: persistedGames.length > 0 ? 'database' : 'scraper'
```

The `persistDiscoveryGroup()` flow:

```text
Extract best external identifier from group
  ↓
findByExternalIdentifier(source, id)
  ↓
Existing game found?
  ├── YES + enrichmentService → enrich existing → return enriched game
  ├── YES + no enrichment → return existing game
  └── NO → discoveryGroupToGame() → save → enrich → return new game
```

### 2.3 — Server Wiring (16.3)

Updated `src/server.ts` to import and wire `EnrichmentService`:

```typescript
const enrichmentService = new EnrichmentService({ gameRepository });
const catalogService = new CatalogService({
  gameRepository,
  discoveryEngine,
  enrichmentService,
});
```

### 2.4 — Test Suite (16.5)

Created `tests/api/discovery-enrichment-persistence.test.ts` with 8 scenarios:

| Scenario | What it tests |
|----------|---------------|
| 1 — New game | Discovery → persistence → canonical game returned |
| 2 — Repeat search | Second search returns DB result, no re-discovery |
| 3 — Existing game enrichment | Existing game found by external ID → enriched with new observations |
| 4 — Idempotence | Same input → same result, no duplicates |
| 5 — Multiple sources | Multiple observations converge into one game |
| 6 — Identity safety | Distinct games with similar titles are not merged |
| 7 — Source failure (total) | Discovery engine failure → graceful fallback |
| 7 — Source failure (partial) | One group fails → other groups still persist |

Updated `tests/api/catalog-service.test.ts` to cover persistence behavior.

---

## 3. Architectural Decisions

### 3.1 — Origin Semantics

**Decision**: `discoverAndPersist` returns `origin: 'scraper'` when `persistedGames` is empty, `'database'` when games were persisted.

**Context**: Initial implementation always returned `'database'` even when nothing was persisted (e.g., all groups failed). This conflated "discovery was attempted" with "data was stored."

**Alternatives considered**:
- Always return `'database'` after discovery attempt — rejected because it misrepresents the data source
- Return a new origin like `'discovery'` — rejected because it breaks the existing `DataOrigin` type

**Chosen approach**: Conditional origin based on persistence outcome. Semantically correct: if nothing is in the DB, the data is scraper-sourced.

**Trade-off**: Adds a conditional check but preserves type simplicity.

### 3.2 — External Identifier Deduplication

**Decision**: `persistDiscoveryGroup` checks `findByExternalIdentifier` before creating a new game.

**Context**: The same game may be discovered multiple times with different search queries. Without deduplication, each search creates a duplicate record.

**Alternatives considered**:
- Title-based deduplication — rejected because titles are ambiguous (e.g., "Resident Evil 4" 2005 vs 2023)
- Hash-based deduplication — rejected because it requires all fields to match exactly

**Chosen approach**: External identifier lookup. When a discovered game shares an external identifier with an existing game, the existing game is enriched rather than duplicated.

**Trade-off**: Requires each discovery source to provide stable external identifiers. Games without external identifiers may create duplicates (acceptable for initial implementation).

### 3.3 — Enrichment After Persistence

**Decision**: Enrichment runs after `save()`, not before.

**Context**: `enrichGame()` needs a valid `Game` object. The game must exist in the repository before enrichment can update it.

**Alternatives considered**:
- Enrich before save — rejected because `enrichGame()` returns a new game object; saving an enriched game that doesn't exist yet would work but conflates two operations
- Single transaction — rejected because MongoDB transactions add complexity; the current approach is idempotent (re-enriching is safe)

**Chosen approach**: Save → enrich → update. Two writes but idempotent and simple.

**Trade-off**: Two DB operations instead of one. Acceptable for the initial implementation; batch optimization deferred.

---

## 4. Domain-to-Persistence Mapping

### Discovery Group → Game

| Discovery Field | Game Field | Transformation |
|----------------|------------|----------------|
| `observations[0].candidate.titles` | `titles` | Mapped via `mapTitles()` |
| `observations[0].candidate.developers` | `developers` | Direct copy |
| `observations[0].candidate.publishers` | `publishers` | Direct copy |
| `observations[0].candidate.genres` | `genres` | Direct copy |
| `observations[0].candidate.externalIdentifiers` | `externalIdentifiers` | Direct copy |
| `observations[0].source + sourceId` | `evidence` | Mapped to `SourceEvidence` |
| `mergedClassification.category` | `classification` | Validated against `VALID_CLASSIFICATION_CATEGORIES` |
| `rankingScore` | `completeness` | Mapped: ≥0.7 → `FOUND_SUFFICIENT`, 2 sources → `FOUND_COMPLETE` |
| (none) | `cover` | Always `null` from discovery |

### External Identifier Preservation

When an existing game is enriched, its external identifiers are preserved:

```typescript
// enrichGame() adds new identifiers but never removes existing ones
existingGame.externalIdentifiers: [steam:254700]
enrichment adds: [steam:254700, wikipedia:wp-100]
```

---

## 5. Repository Flow

### First Search (New Game)

```text
searchGames('Hollow Knight')
  ↓
findMany({search: 'Hollow Knight'}) → items: []
  ↓
discoverAndPersist('Hollow Knight')
  ↓
discoveryEngine.discover({query: 'Hollow Knight', limit: 20, offset: 0})
  ↓
Returns 1 group with wikipedia:wp-100
  ↓
persistDiscoveryGroup(group)
  ↓
findByExternalIdentifier('wikipedia', 'wp-100') → null
  ↓
discoveryGroupToGame(group) → candidateGame
  ↓
save({...candidateGame, id: 'atp-wikipedia-wp-100'})
  ↓
enrichmentService.enrich(newGame, observations)
  ↓
enrichGame(newGame, observations) → result
  ↓
If changes > 0: update(result.game)
  ↓
Return {origin: 'database', items: [enrichedGame]}
```

### Second Search (Repeat)

```text
searchGames('Hollow Knight')
  ↓
findMany({search: 'Hollow Knight'}) → items: [existingGame]
  ↓
Return {origin: 'database', items: [existingGame]}
  ↓
No discovery triggered
```

### Existing Game Enrichment

```text
searchGames('Metroidvania game')
  ↓
findMany({search: 'Metroidvania game'}) → items: []
  ↓
discoverAndPersist('Metroidvania game')
  ↓
discoveryEngine.discover() → group with wikipedia:wp-100
  ↓
persistDiscoveryGroup(group)
  ↓
findByExternalIdentifier('wikipedia', 'wp-100') → existingGame (genres: [])
  ↓
existing + enrichmentService → enrich(existing, observations)
  ↓
enrichGame(existing, observations) → adds Metroidvania genre
  ↓
update(enrichedGame)
  ↓
Return {origin: 'database', items: [enrichedGame]}
```

### Identity Safety (Distinct Games)

```text
searchGames('RE4 Remake')
  ↓
findMany({search: 'RE4 Remake'}) → items: []
  ↓
discoverAndPersist('RE4 Remake')
  ↓
discoveryEngine.discover() → group with steam:st-2050650
  ↓
persistDiscoveryGroup(group)
  ↓
findByExternalIdentifier('steam', 'st-2050650') → null
  ↓
(Existing game has steam:254700, not st-2050650)
  ↓
discoveryGroupToGame(group) → newGame
  ↓
save(newGame) → new canonical record
  ↓
Return {origin: 'database', items: [newGame]}
  ↓
Original game (steam:254700) untouched
```

---

## 6. Duplicate Protection

### Application Level

`persistDiscoveryGroup` checks `findByExternalIdentifier` before creating:

```typescript
if (extId) {
  const existing = await this.gameRepository.findByExternalIdentifier({
    source: extId.source,
    externalId: extId.id,
  });

  if (existing && this.enrichmentService) {
    // Enrich existing, don't create duplicate
    const result = await this.enrichmentService.enrich(existing, group.observations);
    return result.game;
  }

  if (existing) {
    return existing;
  }
}

// Only create if no existing game found
const newGame = discoveryGroupToGame(group);
await this.gameRepository.save(newGame);
```

### Database Level

`MongoGameRepository.save()` throws `ValidationError` on duplicate external identifiers (unique sparse index). This is a safety net; the application-level check should prevent this in normal operation.

---

## 7. Testing Strategy

### In-Memory Mocks

All 8 pipeline scenarios use a `createTrackingRepository()` that maintains arrays in memory:

```typescript
function createTrackingRepository(initialGames: Game[] = []) {
  const allGames = [...initialGames];
  const savedGames: Game[] = [];
  const updatedGames: Game[] = [];

  // Repository methods operate on allGames
  // savedGames and updatedGames track side effects
}
```

This provides:
- **Full visibility** into persistence calls
- **Shared state** between `save` and `findMany` (same `allGames` array)
- **No infrastructure** required (no MongoDB, no network)

### Test Isolation

Each test creates fresh instances:
- New `createTrackingRepository()` per test
- New `EnrichmentService` per test
- New `CatalogService` per test
- Mock discovery engine per test

### Scenario Coverage

| Scenario | Assertions |
|----------|------------|
| 1 — New game | origin, items length, title, developers, external IDs, evidence, save count |
| 2 — Repeat search | origin, items, title, discover not called, save count |
| 3 — Enrichment | origin, items, ID preserved, genres updated, update called, no save |
| 4 — Idempotence | save count same after second search |
| 5 — Multi-source | items, title, genres ≥2, external IDs ≥2, save count |
| 6 — Identity safety | ID differs from existing, external ID present, original preserved |
| 7a — Total failure | origin scraper, items empty |
| 7b — Partial failure | origin database, items 1, title correct |

---

## 8. Files Changed

| File | Action | Responsibility |
|------|--------|---------------|
| `src/application/enrichment-service.ts` | **CREATED** | Wraps `enrichGame()` with repository persistence |
| `src/application/catalog-service.ts` | **MODIFIED** | Added `discoverAndPersist`, `persistDiscoveryGroup`, EnrichmentService dependency |
| `src/server.ts` | **MODIFIED** | Wires EnrichmentService into CatalogService |
| `tests/api/discovery-enrichment-persistence.test.ts` | **CREATED** | 8 pipeline integration scenarios |
| `tests/api/catalog-service.test.ts` | **MODIFIED** | Updated for persistence behavior, tracking mock |

### Files NOT Changed

| File | Reason |
|------|--------|
| `src/enrichment/enrichment-engine.ts` | Pure function, 32 tests, never modify |
| `src/application/discovery-to-game.ts` | Pure mapper, used by persistDiscoveryGroup |
| `src/domain/game/game.ts` | Domain model unchanged |
| `src/domain/game/game-repository.ts` | Interface unchanged |
| `src/infrastructure/persistence/mongodb/mongo-game-repository.ts` | Implementation unchanged |

---

## 9. Test Fixes (Post-Implementation)

After initial implementation, 4 test failures were identified and fixed:

### Fix 1 — Origin Semantics

**File**: `src/application/catalog-service.ts:140`

**Problem**: `discoverAndPersist` always returned `origin: 'database'` even when `persistedGames` was empty (all groups failed to persist).

**Fix**:
```typescript
// Before
origin: 'database',

// After
origin: persistedGames.length > 0 ? 'database' : 'scraper',
```

**Root cause**: The return statement was unconditional. When all `persistDiscoveryGroup` calls threw (caught by inner try/catch), `persistedGames` remained empty but origin was still `'database'`.

### Fix 2 — Mock Call Count

**File**: `tests/api/discovery-enrichment-persistence.test.ts:293`

**Problem**: Scenario 2 asserted `discoveryEngine.discover` was never called, but it was called once during the first search.

**Fix**:
```typescript
// Before
await service.searchGames('Hollow Knight');
repo.savedGames.length = 0;
repo.updatedGames.length = 0;

// After
await service.searchGames('Hollow Knight');
vi.clearAllMocks();
repo.savedGames.length = 0;
repo.updatedGames.length = 0;
```

**Root cause**: `not.toHaveBeenCalled()` checks cumulative calls across the entire test, not just the second search. The first search legitimately triggers discovery. `vi.clearAllMocks()` resets call counters between searches.

### Fix 3 — Search Term Matching

**File**: `tests/api/discovery-enrichment-persistence.test.ts:322`

**Problem**: Scenario 3 searched for `'Hollow Knight'` which matched the existing game's title. `findMany` returned the game directly, bypassing discovery and enrichment entirely.

**Fix**:
```typescript
// Before
const result = await service.searchGames('Hollow Knight');

// After
const result = await service.searchGames('Metroidvania game');
```

**Root cause**: `searchGames` returns early when `findMany` finds results. The test needs discovery to run so `persistDiscoveryGroup` can find the existing game by external identifier and enrich it. Using a search term that doesn't match the title forces the discovery path.

### Fix 4 — Same Root Cause as Fix 3

**File**: `tests/api/discovery-enrichment-persistence.test.ts:445`

**Problem**: Scenario 6 searched for `'Resident Evil 4'` which matched the existing game's title. Same early-return issue.

**Fix**:
```typescript
// Before
const result = await service.searchGames('Resident Evil 4');

// After
const result = await service.searchGames('RE4 Remake');
```

---

## 10. Validation Results

```text
Tests:       841 passed (841)
Build:       PASS
Lint:        PASS
Format:      PASS
```

---

## 11. Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| No MongoDB transactions | Save + enrich are two separate writes; partial failure possible | Idempotent: re-enriching is safe |
| External ID required for dedup | Games without external IDs may create duplicates | Discovery always provides external IDs from sources |
| No batch enrichment | Each group enriched individually | Acceptable for initial implementation |
| No background enrichment | Existing incomplete games not progressively enriched | Deferred to Phase 17+ |
| Cover always null from discovery | Discovered games have no cover | Cover discovery is a separate concern (Phase 10) |

---

## 12. Roadmap Status

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
```

---

## 13. Next Step

Phase 17 candidates (from reconnaissance):

- **Background enrichment worker** — Progressively improve `FOUND_PARTIAL` games
- **Catalog statistics endpoint** — Expose catalog health metrics
- **Relationship API** — Expose game relationships via API

No commit created. Awaiting user instruction.
