# Phase 15 — Reconnaissance Report

**Date**: 2026-08-31
**Status**: Reconnaissance Complete — No Code Changes

---

## 1. Executive Summary

The ATP Engine has completed Phases 0–14 with 833 tests passing, clean build/lint/format, and a layered architecture with domain independence, deterministic-first processing, and optional AI. The system is functionally correct and operationally sound for its current scope.

Phase 15 reconnaissance examined every subsystem for residual debt, architectural risks, performance gaps, and observability needs. The codebase is in good health. No critical issues were found.

The primary findings are:
- One resource leak in the rate limiter (setInterval without cleanup)
- One performance hot path (organizationsEquivalent RegExp creation in enrichment loops)
- The 14.3 aggregation optimization still has O(n²) worst case (acceptable, documented)
- Several low-severity maintainability items (type assertions, swallowed AI errors)

---

## 2. Architecture Health

**Status: Strong**

Layered architecture is well-preserved:
- Domain has zero infrastructure dependencies
- Application layer orchestrates without leaking transport concerns
- Infrastructure implements interfaces from domain/application
- AI is behind explicit capability interfaces (Classifier, IdentityResolver, ConflictResolver)

Boundaries are clean. No domain code imports Express, MongoDB, or LLM SDKs. The `fake Game` object in `aggregation.ts:areSameGame` is the only architectural impurity — it creates a temporary domain object to satisfy the IdentityResolver interface. This is a pragmatic choice, not a violation.

---

## 3. Reliability Assessment

**Status: Solid for current scale**

| Component | Status | Notes |
|-----------|--------|-------|
| Retry utility | ✅ | Clean exponential backoff + jitter, integrated into BaseAdapter |
| Timeout abstraction | ✅ | Generic withTimeout, clean AbortController usage |
| HTTP rate limiting | ⚠️ | Functional but has resource leak (see §7) |
| Request timeout | ✅ | 30s global, proper cleanup on response finish |
| Request/correlation IDs | ✅ | AsyncLocalStorage, automatic propagation |
| Health check | ✅ | Reports DB + AI status, returns 200 degraded |
| Source failure isolation | ✅ | Promise.allSettled, errors don't cascade |
| Circuit breaker | — | Not implemented, not needed at current scale |

**Recommendation**: Defer circuit breaker. Current retry + timeout + source failure isolation is sufficient for the expected traffic pattern. A circuit breaker would add complexity without measurable benefit.

---

## 4. Performance Assessment

**Status: Acceptable, with one hot path**

### Phase 14 Results
All 5 optimizations implemented and verified:
- Database indexes for common query patterns
- MongoDB connection pooling (maxPoolSize: 10)
- Steam parallel search (concurrency: 5)
- Wikipedia LRU cache (500 entries, 5min TTL)
- Aggregation pre-grouping via Union-Find

### Remaining Hot Path

`organizationsEquivalent()` in `enrichment-engine.ts:37-53` creates `new RegExp(...)` on every invocation. This function is called inside nested loops:
- `enrichOrganizations` iterates observations × candidate orgs × existing orgs
- `deduplicateOrganizations` iterates all orgs × result set

For a game with 3 observations, each having 2 developers/publishers, against a game with 2 existing organizations, this creates approximately 12–24 RegExp objects per enrichment call.

**Impact**: Low at current scale (single-game enrichment). Would matter at batch scale.

**Recommendation**: Defer. The current traffic does not justify optimization. If batch enrichment is added later, memoize the suffix list or pre-compile the regexes.

### Database Query Efficiency

All queries fetch full documents without projection. For the catalog listing endpoint (`findMany`), this means returning full release arrays, evidence arrays, and relationship arrays when the API response only needs a subset.

**Impact**: Low. The document sizes are manageable. Projection optimization would help at scale.

**Recommendation**: Defer. Not a bottleneck at current document counts.

---

## 5. Observability Assessment

**Status: Sufficient for current needs**

Structured logging covers:
- HTTP requests (method, path, status, duration, requestId)
- Discovery lifecycle (started/completed with counts and duration)
- Classification results (category, confidence, signals, duration)
- Identity resolution (outcome, confidence, signals, duration)
- Enrichment (gameId, observationCount, changeCount, conflicts, completeness, duration)
- Source requests (source, operation, url, status/errorType, duration)
- AI operations (provider, model, operation, success/fallback, confidence, duration)
- Retry attempts (attempt number, delay, error)

### Metrics Assessment

No dedicated metrics platform (Prometheus, OpenTelemetry) is in use. The structured logs provide equivalent signal for:
- Request latency (HTTP level)
- Source latency and error rates
- AI success/failure rates
- Discovery duration
- Enrichment change/conflict rates

**Recommendation**: Defer metrics. The current structured logging provides sufficient operational visibility. Introducing Prometheus/OpenTelemetry would add infrastructure complexity without immediate benefit. Revisit when:
- Multiple instances are deployed
- Dashboarding is needed
- Alerting requirements emerge

---

## 6. Identity Resolution Audit (14.3)

**Status: Correct, with documented risk**

### How It Works

1. `preGroupByExternalId()` builds a Union-Find structure grouping observations with matching `source:id` external identifiers
2. For each pre-group, all observations with matching external IDs are merged WITHOUT calling `areSameGame()` — this is the optimization
3. After merging pre-group members, the pre-group leader is compared against ALL remaining observations via `areSameGame()` — this preserves the original cross-group comparison behavior

### Correctness Analysis

**Same external ID → guaranteed same game**: If observation A has `steam:12345` and observation B has `steam:12345`, they are definitively the same game. No identity resolution needed.

**Cross-group comparison preserved**: After merging same-ID observations, the pre-group leader still runs through `areSameGame()` against all non-used observations. This catches cases like:
- Wikipedia `w1` with title "Zelda" and no external ID
- Steam `s1` with title "Zelda" and external ID `steam:12345`

These get merged because `areSameGame()` compares titles, not just external IDs.

**Edge cases verified**:
- Observations with no external IDs: They form singleton pre-groups and proceed through normal `areSameGame()` comparison
- Multiple external IDs: Union-Find correctly chains — if A has `steam:123` and B has `wikipedia:456`, and C has `steam:123`, then A and C are in the same pre-group, and B is compared against them via `areSameGame()`
- Divergent external IDs: If A has `steam:123` and B has `steam:999`, they are in different pre-groups, and `areSameGame()` is still called (the external ID mismatch signal in the identity resolver handles this)

**Risk level**: Low. The optimization reduces redundant `areSameGame()` calls for trivially-matched observations while preserving full cross-group comparison.

### Remaining Concern

The `areSameGame()` function constructs a `fake Game` object from observation A to pass to the identity resolver. This works because the identity resolver only reads `externalIdentifiers` from the game parameter. If the resolver's contract changes to read other game fields (releases, developers, etc.), the fake game would need updating. This is a maintainability concern, not a correctness concern.

---

## 7. Technical Debt

| ID | Problem | Severity | Type | Evidence | Recommendation |
|----|---------|----------|------|----------|----------------|
| TD-R1 | Rate limiter `setInterval` never cleared | Medium | Reliability | `rate-limiter.ts:27` — setInterval without cleanup; creates timer per middleware instance; no `close()` method | Fix in Phase 15 |
| TD-R2 | `organizationsEquivalent` RegExp in loops | Medium | Performance | `enrichment-engine.ts:48` — `new RegExp(...)` per call inside nested enrichment loops | Defer (needs measurement) |
| TD-A1 | `fake Game` in `areSameGame()` | Low | Maintainability | `aggregation.ts:187-200` — temporary domain object created per comparison | Defer (document risk) |
| TD-A2 | Type assertions in `game-mapper.ts` | Low | Maintainability | `game-mapper.ts:31,32,73,74,82` — `as PlatformFamily`, `as Game['classification']`, etc. | Defer (Mongoose typing limitation) |
| TD-A3 | Swallowed errors in AI catch blocks | Low | Observability | `ai-classifier.ts:57`, `ai-identity-resolver.ts:63`, `ai-enrichment.ts:96` — catch {} with fallback log but no error propagation | Acceptable (AI failure → deterministic fallback) |
| TD-A4 | LRU cache doesn't proactively purge expired entries | Low | Correctness | `lru-cache.ts` — expired entries only removed on access | Acceptable (TTL-based expiry on read is sufficient) |
| TD-O1 | Health check uses `OLLAMA_URL` as AI configured proxy | Low | Observability | `health.ts:24` — checking URL presence, not actual connectivity | Defer |
| TD-O2 | No database projection in `findMany` | Low | Performance | `mongo-game-repository.ts:77` — full document fetch for list endpoints | Defer (needs measurement) |
| TD-O3 | Steam app list cache has no TTL | Low | Staleness | `steam-adapter.ts:143-160` — `appListCache` persists for process lifetime | Acceptable (app list changes rarely; process restart refreshes) |

---

## 8. Phase 15 Candidates

| Subtask | Problem | Value | Complexity | Risk | Recommendation |
|---------|---------|-------|------------|------|----------------|
| Fix rate limiter leak | setInterval without cleanup | Medium | Low | Low | Fix in Phase 15 |
| Enrichment RegExp memoization | organizationsEquivalent hot path | Low | Low | Low | Needs measurement first |
| Game mapper type assertions | Unsafe casts on Mongoose output | Low | Low | Low | Defer (Mongoose typing limitation) |
| AI error observability | Swallowed errors in catch blocks | Low | Low | Low | Acceptable pattern |
| Circuit breaker | Repeated source failures | Low | Medium | Medium | Defer (not needed at scale) |
| Metrics platform | Structured log aggregation | Low | Medium | Low | Defer (logs sufficient) |
| DB projection optimization | Full document fetch for lists | Low | Medium | Low | Defer (needs measurement) |
| Cache proactive expiry | LRU expired entries linger | Negligible | Low | Low | Acceptable |

---

## 9. Deferred Items

| Item | Reason |
|------|--------|
| Circuit breaker | Retry + timeout sufficient for current traffic; complexity not justified |
| Metrics platform | Structured logging provides equivalent operational signal |
| Source-level rate limiting | External sources handle their own limits; low traffic |
| DB projection optimization | Document sizes manageable; not a bottleneck |
| Enrichment RegExp memoization | Needs profiling data to justify |
| Steam app list TTL | App list rarely changes; process restart refreshes |
| LRU proactive expiry | TTL-based expiry on read is sufficient |

---

## 10. Proposed Phase 15 Scope

Given the reconnaissance findings, Phase 15 should address only the one confirmed reliability issue:

### 15.1 — Rate Limiter Resource Leak Fix

**Objective**: Eliminate the `setInterval` resource leak in the rate limiter middleware.

**Files**:
- `src/interfaces/http/middleware/rate-limiter.ts`

**Implementation**:
- Store the interval ID returned by `setInterval`
- Expose a `close()` method on the middleware factory that calls `clearInterval`
- Call `close()` during application shutdown (if a shutdown hook exists)
- Alternatively, use lazy cleanup: only purge expired entries when a new request arrives (no background timer)

**Tests**:
- Verify cleanup on close
- Verify no lingering timers after middleware creation

**Risk**: Low — changes internal implementation, no contract change

**Dependencies**: None

### Items NOT in Phase 15 Scope

Based on the reconnaissance:

- **Circuit breaker**: Not justified at current scale. Revisit when traffic increases or multi-source failure patterns are observed.
- **Metrics platform**: Structured logging provides sufficient visibility. Revisit when dashboarding/alerting is needed.
- **Enrichment optimization**: Needs profiling data. Premature without measurement.
- **DB projection**: Document sizes manageable. Premature without measurement.
- **AI error propagation**: The catch-fallback-log pattern is intentional and correct for the AI-as-assistant architecture.

---

## 11. Architectural Decisions

No new architectural decisions are required for Phase 15.

The one confirmed decision:

**Rate limiter cleanup approach**: Use lazy cleanup (purge expired entries on next request) instead of background `setInterval`. This eliminates the resource leak without adding shutdown hook complexity.

---

## 12. Validation

Current state confirmed:

```text
Tests: 833 passed, 0 failed
Build: PASS
Lint: PASS
Format: PASS
Branch: main
Commits: 42e37ea (Phase 14 commit)
```

No uncommitted changes.
