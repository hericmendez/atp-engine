# Phase 14 — Performance Optimization

**Date**: 2026-08-31
**Status**: Complete

## Summary

Five behavior-preserving performance optimizations across database, sources, and aggregation layers.

## Changes

### 14.1 — Database Indexes (`game-schema.ts`)

Added 4 indexes to support common query patterns in `MongoGameRepository.buildFilter()`:

| Index | Purpose |
|---|---|
| `{ classification: 1, completeness: 1 }` | Exact-match filters on classification/completeness |
| `{ updatedAt: -1 }` | Default sort field for `findMany()` |
| `{ 'releases.releaseDate.year': 1 }` | `releaseYear` filter queries |

Existing indexes preserved: unique sparse compound on `externalIdentifiers`, index on `titles.value`.

### 14.5 — MongoDB Connection Config (`connection.ts`)

Added connection pool options to `mongoose.connect()`:

- `maxPoolSize: 10` — caps concurrent connections
- `maxIdleTimeMS: 30_000` — evicts idle connections after 30s

### 14.2 — Steam Search Parallelization (`steam-adapter.ts`)

Replaced sequential `getById()` loop in `search()` with bounded-concurrency parallel execution.

- Concurrency limit: 5
- Implementation: `parallelMap()` helper with worker pool
- Preserves result order; nulls filtered out

### 14.4 — In-Memory Cache for Wikipedia Page Images (`wikipedia-adapter.ts`)

Added `LruCache` (new `src/infrastructure/lru-cache.ts`) to cache page image API responses:

- `LruCache<string, string[]>` with `maxSize: 500`, `ttlMs: 5min`
- Caches `fetchPageImagesByPageIds()` results keyed by sorted page ID set
- Caches `fetchPageImages(title)` results keyed by `title:{name}`
- LRU eviction on capacity; TTL-based expiry

### 14.3 — Aggregation Pre-Grouping (`discovery/aggregation.ts`)

Optimized O(n²) identity resolution with pre-grouping via Union-Find:

1. `preGroupByExternalId()` — groups observations sharing exact external IDs using Union-Find
2. Only observations within the same pre-group run through `areSameGame()` identity resolution
3. Cross-group comparisons eliminated entirely
4. Worst case unchanged (all unique IDs → original O(n²)); best case O(n) for fully-matched datasets

## Files Modified

- `src/infrastructure/persistence/mongodb/game-schema.ts` — 3 new indexes
- `src/infrastructure/persistence/mongodb/connection.ts` — pool config
- `src/sources/steam/steam-adapter.ts` — parallel search
- `src/sources/wikipedia/wikipedia-adapter.ts` — page image cache
- `src/discovery/aggregation.ts` — pre-grouping
- `src/infrastructure/lru-cache.ts` — new utility

## Behavior Preservation

- No domain model changes
- No public contract changes
- All optimizations are transparent to callers
- Existing tests expected to pass unchanged
