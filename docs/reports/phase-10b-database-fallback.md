## Step-by-Step Implementation

1. Created `src/application/data-origin.ts` — `DataOrigin` type (`"database" | "scraper"`) and `CatalogResult<T>` wrapper.
2. Created `src/application/discovery-to-game.ts` — mapper from `DiscoveryGroupResult` to `Game` domain objects.
3. Rewrote `src/application/catalog-service.ts` — added optional `DiscoveryEngine` dependency, DB-first/scraper-fallback for `searchGames`, DB-only for `listGames` and `getGameById`, structured logging for fallback events.
4. Updated `src/application/cover-service.ts` — wrapped `CoverResult` in `CoverServiceResult` with `origin` field.
5. Updated `src/interfaces/http/routes/games.ts` — all responses include `origin` field.
6. Updated `src/interfaces/http/routes/cover.ts` — all responses include `origin` field.
7. Updated `src/server.ts` — wired `DiscoveryEngine` with `DeterministicClassifier` and `DeterministicIdentityResolver` into `CatalogService`.
8. Updated tests: `app.test.ts`, `catalog-service.test.ts`, `cover-service.test.ts`, `cover-api.test.ts`, `games-api.test.ts` — all mocks updated for new return types, new fallback tests added.
9. Updated documentation: `docs/api.md`, `docs/covers.md`.

## Final Request Flow

### Search (`GET /api/v1/games/search?q=Doom`)

```
Request
   ↓
CatalogService.searchGames('Doom')
   ↓
Try MongoDB (gameRepository.findMany)
   ↓
┌──────────────────────────┐
│ Database available?      │
└──────────┬───────────────┘
           │
    ┌──────┴──────┐
    │             │
   YES            NO
    │             │
    ↓             ↓
 Results?     Catch error
    │             │
 ┌──┴──┐          │
 │     │          │
 >0   =0          │
 │     │          │
 ↓     ↓          ↓
return return  DiscoveryEngine.discover
DB     fallback      │
origin       origin=scraper
```

### Catalog (`GET /api/v1/games`)

```
Request
   ↓
CatalogService.listGames(query)
   ↓
Try MongoDB
   ↓
Success → return DB results (origin=database)
Failure → propagate error (no scraping)
```

### Single Game (`GET /api/v1/games/:id`)

```
Request
   ↓
CatalogService.getGameById(id)
   ↓
MongoDB lookup
   ↓
Found → return game (origin=database)
Not found → 404
Failure → propagate error
```

### Cover Search (`GET /api/v1/covers/search?q=Doom`)

```
Request
   ↓
CoverService.searchCovers('Doom')
   ↓
CoverEngine.searchCovers → Wikipedia + Steam
   ↓
return results (origin=scraper)
```

## Origin Representation

```ts
type DataOrigin = 'database' | 'scraper';

interface CatalogResult<T> {
  data: T;
  origin: DataOrigin;
}
```

All API responses include `"origin": "database"` or `"origin": "scraper"` at the top level.

## Database Failure Behavior

- **Search**: Database failure triggers fallback to `DiscoveryEngine`. Origin = `"scraper"`. If discovery also fails, returns empty result with origin = `"scraper"`.
- **Catalog**: Database failure propagates as `PERSISTENCE_ERROR`. No scraping triggered.
- **Single game**: Database failure propagates as `PERSISTENCE_ERROR`. No scraping triggered.

## Empty Database Behavior

- **Search**: Empty DB results trigger fallback to `DiscoveryEngine`. Origin = `"scraper"`.
- **Catalog**: Empty DB returns empty array with `origin = "database"`. No scraping triggered.
- **Single game**: Empty DB returns 404.

## Catalog Behavior

`GET /api/v1/games` is DB-only. It never triggers unrestricted external scraping. If MongoDB is unavailable, the error propagates as `PERSISTENCE_ERROR`.

## Single-Game Behavior

`GET /api/v1/games/:id` is identity-safe. It performs a DB lookup only. If the game is not found, it returns 404. If MongoDB is unavailable, the error propagates. No external scraping is triggered for arbitrary IDs.

## Cover Behavior

- `GET /api/v1/covers/search` — always `origin = "scraper"` (queries Wikipedia/Steam directly).
- `GET /api/v1/games/:id/cover` — `origin = "database"` when cached cover exists, `origin = "scraper"` when discovering from sources.

## Tests Added

New tests for fallback behavior in `tests/api/catalog-service.test.ts`:
- DB returns results → database origin
- DB returns empty → scraper fallback
- DB throws persistence error → scraper fallback
- DB fails + discovery succeeds → scraper origin
- DB fails + all sources fail → empty scraper result
- No discovery engine available → empty scraper result
- DB results do not trigger discovery
- Discovery results not persisted
- Pagination passed to discovery engine

Updated tests in:
- `tests/application/cover-service.test.ts` — origin field assertions
- `tests/api/cover-api.test.ts` — origin in API responses
- `tests/api/games-api.test.ts` — updated mocks for new return types
- `tests/app.test.ts` — updated mocks for new return types

## Total Test Count

```
Previous: 721
New: 730
Added: 9
```

## Validation Results

```
npm run build    ✅ tsc
npm run lint     ✅ eslint
npm run format:check ✅ prettier
npm test         ✅ 30 files, 730 tests passing
```

## Files Changed

| File | Change |
|------|--------|
| `src/application/data-origin.ts` | NEW — DataOrigin type, CatalogResult interface |
| `src/application/discovery-to-game.ts` | NEW — DiscoveryGroupResult → Game mapper |
| `src/application/catalog-service.ts` | REWRITTEN — DB-first/scraper-fallback, origin in results |
| `src/application/cover-service.ts` | UPDATED — CoverServiceResult with origin |
| `src/interfaces/http/routes/games.ts` | UPDATED — origin in all responses |
| `src/interfaces/http/routes/cover.ts` | UPDATED — origin in all responses |
| `src/server.ts` | UPDATED — wired DiscoveryEngine |
| `tests/app.test.ts` | UPDATED — mock return types |
| `tests/api/catalog-service.test.ts` | UPDATED — 16 tests including fallback tests |
| `tests/api/cover-api.test.ts` | UPDATED — origin in mock returns and assertions |
| `tests/api/games-api.test.ts` | UPDATED — mock return types |
| `tests/application/cover-service.test.ts` | UPDATED — origin assertions |
| `docs/api.md` | UPDATED — origin field, fallback behavior |
| `docs/covers.md` | UPDATED — origin field |

## Remaining Limitations

1. Discovery-to-game mapping produces minimal `Game` objects (no releases, no full metadata). This is intentional — discovered data is evidence, not canonical.
2. Catalog listing with DB failure returns `PERSISTENCE_ERROR`. A future improvement could return a graceful "service degraded" response.
3. The `discovery-to-game` mapper classifies most games as `UNKNOWN` because the classifier runs on individual observations, and Wikipedia search results often lack enough data for confident classification.
4. No caching of discovery results. Each search query triggers fresh external API calls.

## Next Step

Phase 10 (Cover Engine) and Database-First/Scraper-Fallback are complete. Next phase is **Phase 11 — AI Integration**.
