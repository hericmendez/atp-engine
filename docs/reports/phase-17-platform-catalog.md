# Phase 17 — Platform Catalog & Advanced Game Queries

## Step-by-Step Implementation

1. **Reconnaissance** — Audited Platform domain, GameQuery, MongoGameRepository, schemas, routes
2. **PlatformCatalog domain** — Created `PlatformCatalogEntry` as new domain entity (separate from Platform value object)
3. **PlatformCatalog repository** — Created repository interface with `findMany`, `findById`, `findByCompany`, `countByCompanyId`
4. **MongoDB platform schema** — Created Mongoose schema with indexes on name, company, releaseYear, status, family
5. **MongoDB platform repository** — Implemented with batch gameCount aggregation
6. **PlatformCatalogService** — Created `listPlatforms` and `getPlatformById`
7. **Platform routes** — Created `GET /platforms/summary` and `GET /platforms/:platformId`
8. **Platform validation schemas** — Created `PlatformCatalogQuerySchema` with comma-separated transforms and `PlatformIdParamSchema`
9. **Extended game queries** — Added `platforms`, `developers`, `publishers`, `genres` arrays to `GameQuery`; added `releaseYearFrom`/`releaseYearTo` range fields
10. **Extended game sorting** — Added `releaseDate` and `name` aliases to `GameSortField`
11. **Comma-separated parsing** — Added Zod transforms to `CatalogQuerySchema` for multi-value filter parsing
12. **Updated MongoGameRepository** — Extended `buildFilter` for multi-value `$in` queries and release year ranges; extended `buildSort` for new sort fields
13. **Server wiring** — Wired `PlatformCatalogService` and `MongoPlatformCatalogRepository` in `server.ts`
14. **App wiring** — Updated `AppDependencies` and `createApp` to include `PlatformRouterDependencies`
15. **Fixed existing tests** — Updated `app.test.ts`, `games-api.test.ts`, `cover-api.test.ts` to provide `platforms` dependency
16. **Phase 17 tests** — Created 26 new tests covering platform catalog and advanced game filtering
17. **README updated** — Added Platform Catalog endpoints, multi-value filter documentation, new sort fields
18. **Roadmap updated** — Added Phase 17 section

## Architectural Decisions

### PlatformCatalogEntry as New Domain Entity

- **Decision**: Create a new `PlatformCatalogEntry` domain type separate from the existing `Platform` value object
- **Context**: `Platform` is a value object embedded in Game releases (`{ name, family, type }`). It has no id, no company, no releaseYear, no status. The platform catalog needs independent entities with full metadata for browsing, including platforms with zero games.
- **Alternatives considered**: Extend the `Platform` value object with catalog fields
- **Chosen approach**: New `PlatformCatalogEntry` type in `src/domain/platform/`
- **Reason**: Preserves the value object semantics of `Platform` (used in Game releases) while enabling independent catalog browsing. Zero-game platforms like historical consoles can exist in the catalog without requiring game associations.
- **Trade-off**: Two platform-related types in the domain (`Platform` value object, `PlatformCatalogEntry` entity), but they serve distinct purposes.

### Comma-Separated Multi-Value Filters

- **Decision**: Use comma-separated values in query params for multi-value filtering (e.g., `?platform=Nintendo Switch,PlayStation 5`)
- **Context**: Need OR semantics within a single filter (any of these platforms) and AND across filters (this platform AND this genre)
- **Alternatives considered**: Repeated query params (`?platform=nintendo+switch&platform=playstation+5`)
- **Chosen approach**: Comma-separated with Zod `.transform()` parsing
- **Reason**: More ergonomic for API consumers, consistent with existing single-value pattern, no need for array query param handling in Express
- **Trade-off**: Values containing commas could be problematic (unlikely in game metadata)

### showEmptyPlatforms Defaults to False

- **Decision**: Platform catalog excludes platforms with zero games unless explicitly requested
- **Context**: Most consumers want platforms they can browse games for. Historical/obscure platforms without games add noise.
- **Alternatives considered**: Always include all platforms; default to true
- **Chosen approach**: Default false, explicit `showEmptyPlatforms=true` to include
- **Reason**: Reduces noise for primary use case. Supports archival use case when explicitly requested.
- **Trade-off**: Extra parameter needed for complete catalog view.

### gameCount via Batch Aggregation

- **Decision**: Compute game counts per platform using MongoDB aggregation pipeline per page, not N+1 queries
- **Context**: Each platform needs its game count. Naive approach would query games once per platform.
- **Alternatives considered**: Store gameCount on the platform document (denormalized); N+1 queries
- **Chosen approach**: Batch aggregation on games collection for the current page of platforms
- **Reason**: Consistent counts without denormalization overhead. No stale data. Bounded query count (one per page).
- **Trade-off**: Slightly more complex than denormalized count, but avoids sync issues.

## Domain-to-Persistence Mapping

```
PlatformCatalogEntry (domain)
    ↓
PlatformCatalogSchema (Mongoose)
    ↓
MongoDB platforms collection

Platform (value object, embedded in Game.releases)
    ↓
Embedded in GameSchema releases array
```

Platform domain separation:
- `Platform` value object: `{ name: string, family: string | null, type: string | null }` — used in Game releases
- `PlatformCatalogEntry`: `{ id, name, company, releaseYear, status, family, type, thumb }` — independent catalog entity

## Repository Flow

### Platform Summary (listPlatforms)

```
Request
    ↓
PlatformCatalogQuerySchema.parse(req.query)
    ↓
PlatformCatalogService.listPlatforms(query)
    ↓
MongoPlatformCatalogRepository.findMany(query)
    ↓
MongoDB: filter by company, status, releaseYear, releaseYearRange
    ↓
Enrich with gameCount via batch aggregation
    ↓
Filter out empty platforms (if showEmpty=false)
    ↓
Sort by field
    ↓
Paginate
    ↓
Response
```

### Game Multi-Value Filtering

```
Request: ?platform=Nintendo Switch,PlayStation 5&genre=RPG
    ↓
CatalogQuerySchema.parse(req.query)
    ↓ Zod transform splits comma-separated values
    ↓
games: { platforms: ['Nintendo Switch', 'PlayStation 5'], genres: ['RPG'] }
    ↓
MongoGameRepository.buildFilter(query)
    ↓
$in: [{ $elemMatch: { 'platform.name': /Nintendo Switch/i } }, { $elemMatch: { 'platform.name': /PlayStation 5/i } }]
    ↓ (AND across filters)
$in: [{ $elemMatch: { 'genres.name': /RPG/i } }]
```

## Testing Strategy

- **Platform catalog tests**: 14 tests covering filters, pagination, sorting, empty platform handling, single platform retrieval, 404 handling
- **Advanced game filtering tests**: 12 tests covering multi-value platform/genre/developer/publisher, release year range, combined filters, sorting, pagination
- **Mock-based**: All tests use in-memory mocks, no external dependencies
- **Existing tests preserved**: All 841 pre-Phase-17 tests continue to pass

## Files Changed

### Created
- `src/domain/platform/platform-catalog.ts` — PlatformCatalogEntry domain model
- `src/domain/platform/platform-catalog-repository.ts` — Repository interface
- `src/domain/platform/index.ts` — Domain exports
- `src/infrastructure/persistence/mongodb/platform-catalog-schema.ts` — Mongoose schema
- `src/infrastructure/persistence/mongodb/mongo-platform-catalog-repository.ts` — MongoDB repository
- `src/application/platform-catalog-service.ts` — PlatformCatalogService
- `src/interfaces/http/routes/platforms.ts` — Platform catalog routes
- `tests/api/phase17.test.ts` — Phase 17 test suite
- `docs/reports/phase-17-platform-catalog.md` — This report

### Modified
- `src/domain/game/game-repository.ts` — Extended GameQuery, GameSortField
- `src/infrastructure/persistence/mongodb/mongo-game-repository.ts` — Extended buildFilter, buildSort
- `src/interfaces/http/validation/schemas.ts` — Extended with multi-value parsing, platform schemas
- `src/interfaces/http/routes/games.ts` — Passes new multi-value filters
- `src/interfaces/http/app.ts` — Added PlatformRouterDependencies
- `src/server.ts` — Wired PlatformCatalogService
- `README.md` — Added platform endpoints, new filter docs
- `docs/roadmap.md` — Added Phase 17 section
- `tests/app.test.ts` — Added platforms dependency
- `tests/api/games-api.test.ts` — Added platforms dependency
- `tests/api/cover-api.test.ts` — Added platforms dependency

## Validation Results

```
pnpm build   — ✅ passes
pnpm lint    — ✅ passes
pnpm format  — ✅ passes (all files unchanged)
pnpm test    — ✅ 867 tests passing (841 existing + 26 new)
```

## Known Limitations

- Platform catalog is read-only from MongoDB. No seed/import mechanism yet.
- `gameCount` aggregation is computed per page, not globally cached.
- Platform catalog `family` and `type` are not normalized against a fixed vocabulary (same as Platform value object).
- No `gameCount` sorting optimization (full aggregation pipeline runs for all filtered platforms before pagination).

## Next Step

Phase 18 — awaiting scope definition.
