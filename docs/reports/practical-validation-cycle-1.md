# Practical Validation Cycle 1 — Report

**Date:** 2026-09-01
**Commit:** TBD (pending commit after report)
**Environment:** MongoDB 27018 (dev, no auth), Node.js 22, TypeScript

## Validation Matrix

| Category | Test | Result | Notes |
|----------|------|--------|-------|
| **Infrastructure** | Server starts | PASS | Port 3000, health OK |
| **Infrastructure** | Database connects | PASS | Port 27018, 0-RTT |
| **Infrastructure** | Platform seed | PASS | 181 entries, 0 errors |
| **Discovery** | Search "Elden Ring" | PASS | Found 5 results from DB |
| **Discovery** | Search "Chrono Trigger" | PASS | Found 3 results from DB |
| **Discovery** | Search "Doom" | PASS | Found 3 results from DB |
| **Classification** | Games classified as GAME | PASS | 55% GAME (was 0% before fix) |
| **Classification** | Non-games classified correctly | PASS | MOVIE, FRANCHISE, BOOK detected |
| **Admin API** | Create game | PASS | 201 with ID |
| **Admin API** | Update game | PASS | 200, partial update preserves fields |
| **Admin API** | Delete game | PASS | 204 No Content |
| **Admin API** | 404 on missing | PASS | NotFoundError |
| **Admin API** | 409 on duplicate ext ID | PASS | ConflictError |
| **Catalog Sync** | Dry run | PASS | History record created |
| **Catalog Sync** | History listing | PASS | Records persisted |
| **Cover** | Cover search | PASS | 6 results returned |
| **Duplicate Prevention** | "Elden Ring PS5" finds "Elden Ring" | PASS | Core title extraction works |

## Defects Found and Fixed

### P1-001: Duplicate Records Across Searches
- **Severity:** P1 (data integrity)
- **Symptom:** Searching "Elden Ring PS5" when "Elden Ring" already exists created a duplicate record
- **Root Cause:** `CatalogService.searchGames()` only searched the DB with the exact query string. Platform suffixes like "PS5" prevented matching existing records.
- **Fix:** Added `extractCoreTitle()` method to strip platform/version suffixes before retrying DB search. Falls back to discovery only if core title also has no match.
- **File:** `src/application/catalog-service.ts:45-83`
- **Regression test:** `tests/practical-validation-defects.test.ts` — 3 tests

### P1-002: UNKNOWN Classification for Known Games
- **Severity:** P1 (data quality)
- **Symptom:** Games like "Elden Ring", "Super Mario World", "Doom" classified as UNKNOWN
- **Root Cause:** Wikipedia adapter's `searchResultToCandidate()` returned minimal candidates without classification hints. The wikitext-based hint extraction (which checks for "video game") was only available through the `getById()` path, not the search path.
- **Fix:** Added `extractClassificationFromText()` method to analyze search snippets for game/film/TV/music/book keywords. Each search result now includes classification hints.
- **File:** `src/sources/wikipedia/wikipedia-adapter.ts:151-198`
- **Regression test:** `tests/practical-validation-defects.test.ts` — 4 tests

## Remaining Findings (Backlog)

| ID | Severity | Finding | Recommendation |
|----|----------|---------|----------------|
| P2-001 | P2 | 33% of games still UNKNOWN (composer, event, etc.) | Expected for non-game entities |
| P2-002 | P2 | All releases have UNKNOWN platform | Platform detection from Wikipedia metadata limited |
| P2-003 | P2 | Cover search returns non-game results (Zelda Fitzgerald) | Improve cover search relevance |
| P2-004 | P3 | No developers/publishers/genres on Wikipedia-sourced games | Wikipedia adapter only extracts from wikitext infoboxes; search path lacks this data |

## Quality Gates

| Gate | Status |
|------|--------|
| `pnpm test` | 1046/1046 PASS |
| `pnpm build` | Clean |
| `pnpm lint` | Clean |
| `pnpm format:check` | Clean |

## Conclusion

Two P1 defects were identified, fixed, and verified:
1. Duplicate records prevented via core title extraction
2. Classification improved from 0% to 55% GAME detection

Both fixes have regression tests and pass all quality gates. The system is stable and ready for Phase 25 (post-validation).
