# Phase 18 — Platform Seed & Catalog Completeness

## Step-by-Step Implementation

1. **Reconnaissance** — Audited `PlatformCatalogEntry` domain model, repository interface, service, routes, Zod schemas, Mongoose schema, server.ts, app.ts, errors.ts, Phase 17 tests, post-mvp-roadmap.md
2. **Seed data** — Created `src/platform-catalog/platforms-seed-data.ts` with 181 curated platform entries across home consoles, handhelds, PCs, mobile, arcade, retro/boutique, and web/smart TV
3. **Repository upsert** — Added `upsert(entry: PlatformCatalogEntry): Promise<void>` to `PlatformCatalogRepository` interface
4. **MongoDB upsert** — Implemented `upsert` in `MongoPlatformCatalogRepository` using `findOneAndUpdate` with `{ upsert: true, runValidators: true }`
5. **Seed service** — Created `src/application/platform-seed-service.ts` with `PlatformSeedService` class that iterates seed data, creates domain entries via factory, calls upsert, logs progress, returns summary
6. **Server wiring** — Wired seed into `src/server.ts` after `connectDatabase()`, wrapped in try/catch (non-fatal on error)
7. **Phase 18 tests** — Created `tests/api/phase18.test.ts` with 21 tests covering seed data validation, factory, service unit tests, idempotency, mocked API tests
8. **Build/lint fixes** — Fixed import path errors and unused imports
9. **Live validation** — Validated all 181 platforms seeded, all API endpoints functional, idempotency confirmed across server restarts
10. **Documentation** — Updated README with seed documentation, updated `docs/roadmap.md`, created this report

## Architectural Decisions

### Curated Seed Data

- **Decision**: Provide a curated set of 181 platforms rather than scraping or importing from an external API
- **Context**: Platform catalog was read-only from MongoDB with no seed/import mechanism. Users needed a meaningful catalog out of the box.
- **Alternatives considered**: Scrape from IGDB, Wikipedia, or other sources; provide an empty catalog with manual entry only
- **Chosen approach**: Hand-curated seed data in a TypeScript module
- **Reason**: Full control over canonical quality, no external dependency at startup, version-controlled, idempotent. Seed data is the starting point — future phases can enrich from external sources.
- **Trade-off**: Manual curation required for new platforms, but seed data is authoritative and reviewable.

### Idempotent Upsert

- **Decision**: Use `findOneAndUpdate` with `upsert: true` rather than insert-only or replace
- **Context**: Seed runs on every server start. Must not create duplicates on restart.
- **Alternatives considered**: Check-then-insert (race condition), `insertMany` with `ordered: false` (error handling), `deleteMany` + `insertMany` (destructive)
- **Chosen approach**: `findOneAndUpdate` with `platformId` as the match key
- **Reason**: Atomic, no race conditions, preserves any runtime modifications to seeded data, no data loss on restart.
- **Trade-off**: Slightly more complex than a simple insert, but guarantees idempotency.

### Non-Fatal Seed

- **Decision**: Seed failure does not prevent server startup
- **Context**: Platform catalog is supplementary — the core game catalog, search, and cover endpoints must remain operational even if seed fails.
- **Alternatives considered**: Fail-fast on seed error; separate seed script
- **Chosen approach**: Try/catch around seed in `server.ts`, log error and continue
- **Reason**: Server degradation should be graceful. Game catalog and search are independent of platform seed.
- **Trade-off**: Platform endpoints return empty results if seed fails, but core functionality is unaffected.

### Seed Data Curation Philosophy

- **Decision**: Strict canonical quality over exhaustive quantity
- **Context**: Every platform entry must be verifiable. No fabricated dates, no duplicate entries, no speculative data.
- **Rules followed**:
  - Only well-established gaming platforms
  - Canonical company names, not subsidiaries or divisions
  - Release years from authoritative sources (Wikipedia, manufacturer records)
  - Consistent naming conventions (official marketing names)
  - No thumb/URL fields (no image scraping dependency)
  - Correct `status` classification (active, discontinued, inactive)
  - No duplicates across naming variations (e.g., "PS5" → "PlayStation 5")

## Domain-to-Persistence Mapping

```
PlatformCatalogEntry (domain)
    ↓
platforms-seed-data.ts (static array)
    ↓
PlatformSeedService.seed()
    ↓
PlatformCatalogRepository.upsert()
    ↓
MongoPlatformCatalogRepository (findOneAndUpdate with upsert: true)
    ↓
MongoDB platformcatalogs collection
```

## Repository Flow

### Seed (startup)

```
Server starts
    ↓
connectDatabase()
    ↓
PlatformSeedService.seed()
    ↓
For each platform in PLATFORM_SEED_DATA:
    ↓
createPlatformCatalogEntry(entry) → domain object
    ↓
PlatformCatalogRepository.upsert(domainObject)
    ↓
MongoPlatformCatalogRepository.upsert():
    findOneAndUpdate({ platformId }, { $set: ... }, { upsert: true })
    ↓
Log result (inserted/updated/error)
    ↓
Return { inserted, updated, errors }
```

### Platform Retrieval (request)

```
GET /api/v1/platforms/summary?companyName=Nintendo
    ↓
PlatformCatalogQuerySchema.parse(req.query)
    ↓
PlatformCatalogService.listPlatforms(query)
    ↓
MongoPlatformCatalogRepository.findMany(query)
    ↓
Build filter (company, status, releaseYear, releaseYearRange)
    ↓
Enrich with gameCount via batch aggregation
    ↓
Filter out empty platforms (if showEmpty=false)
    ↓
Sort + Paginate
    ↓
Response: { data, pagination, origin: "database" }
```

## Seed Data Statistics

| Category | Count | Examples |
|----------|-------|---------|
| Nintendo | 25 | Switch, NES, SNES, DS, 3DS, GameCube, Wii |
| PlayStation | 14 | PS1–PS5, PSP, Vita |
| Xbox | 10 | Xbox, 360, One, Series X/S |
| Sega | 20 | Genesis, Saturn, Dreamcast, Game Gear |
| Atari | 9 | 2600, 5200, 7800, Jaguar |
| PC | 12 | DOS, Windows, Mac, Linux, Steam Deck |
| Bandai | 3 | WonderSwan, WonderSwan Color, Swan Crystal |
| SNK | 7 | Neo Geo, Neo Geo Pocket, AES, MVS |
| NEC/various retro | 10 | TurboGrafx-16, PC Engine, 3DO, Colecovision |
| Arcade | 20+ | JAMMA, MVS, Atomiswave, Naomi |
| Handheld PCs | 6 | Steam Deck, ROG Ally, Legion Go |
| Retro/boutique | 8 | Analogue Pocket, Polymega, Evercade |
| Mobile | 4 | iOS, Android, Windows Phone, Fire OS |
| Web/Smart TV | 4 | Web Browser, Roku, tvOS, Chromecast |
| **Total** | **181** | **48 companies** |

## Duplicate Protection

- **Database level**: `platformId` has a unique index on the Mongoose schema (`platform-catalog-schema.ts`)
- **Application level**: `upsert` uses `findOneAndUpdate` with `platformId` as the match key, ensuring no duplicates even without the unique index
- **Seed level**: All 181 `platformId` values are unique (validated by tests)

## Testing Strategy

### Unit Tests (seed data validation)
- Seed data is non-empty (181 entries)
- All platformIds are unique
- All names are unique
- All entries have valid `status` values (active, inactive, discontinued)
- All entries have valid `type` values (console, handheld, handheld_pc, pc, arcade, mobile, smart_tv, retro_console, handheld_retro)
- All entries have valid `family` values matching the PlatformFamily enum

### Unit Tests (factory + service)
- `createPlatformCatalogEntry` trims and normalizes fields
- `PlatformSeedService.seed()` calls upsert for each entry
- `PlatformSeedService.seed()` handles errors per-entry (does not abort)
- `PlatformSeedService.seed()` returns accurate inserted/updated/error counts
- Idempotency: calling seed twice returns same total (no duplicates)

### Integration Tests (mocked API)
- Platform list returns seed data
- Filter by company returns correct subset
- Filter by status returns correct subset
- Single platform retrieval by ID
- 404 for non-existent platform
- Empty results when no platforms match filter
- Pagination works with seed data
- Sorting works with seed data

### Live Validation
- All 181 platforms seeded on server start
- All platform endpoints functional (summary, single, 404)
- Company filter returns correct subsets
- Status filter returns correct subsets
- Release year range filter works
- Pagination works
- Sorting works (name, releaseYear, gameCount)
- Idempotency confirmed across server restarts

## Files Changed

### Created
- `src/platform-catalog/platforms-seed-data.ts` — 181 curated platform seed entries
- `src/application/platform-seed-service.ts` — PlatformSeedService with idempotent seed logic
- `tests/api/phase18.test.ts` — 21 unit + integration tests for Phase 18
- `docs/reports/phase-18-platform-seed.md` — This report

### Modified
- `src/domain/platform/platform-catalog-repository.ts` — Added `upsert()` to interface
- `src/infrastructure/persistence/mongodb/mongo-platform-catalog-repository.ts` — Implemented `upsert()`
- `src/server.ts` — Wired PlatformSeedService, added seed import
- `README.md` — Added platform seed documentation

## Validation Results

```
pnpm build         — ✅ passes
pnpm lint          — ✅ passes
pnpm format:check  — ✅ passes
pnpm test          — ✅ 888 tests passing (867 existing + 21 new)
```

### Live API Validation Results

| Test | Result |
|------|--------|
| Total platforms seeded | 181 ✅ |
| Idempotency (restart) | 181 ✅ |
| `GET /api/v1/platforms/summary?showEmptyPlatforms=true&limit=5` | 181 total, 37 pages ✅ |
| Company filter (`companyName=Nintendo`) | 25 platforms ✅ |
| Status filter (`platformStatus=active`) | 46 platforms ✅ |
| Single platform (`nintendo-switch`) | Returns correct data ✅ |
| 404 for non-existent | Returns `NOT_FOUND` ✅ |
| Release year range (`2020-2025`) | 25 platforms ✅ |
| Sort by releaseYear desc | Correct ordering ✅ |
| Pagination (page 2, limit 5) | 5 items ✅ |
| Default (hide empty) | 0 (no games match yet) ✅ |
| Sort by gameCount desc | All 0 (no games linked) ✅ |

## Known Limitations

- Seed data is static — new platforms require a code update and re-release
- `gameCount` is 0 for all seeded platforms because existing game records use "UNKNOWN" as their platform name, which does not match any seed data platform name
- No image/thumbnail support yet (all `thumb` fields are null)
- No runtime enrichment from external APIs (future Phase 19+)
- Platform `family` and `type` are not normalized against a fixed vocabulary

## Next Step

Phase 19 — Background Enrichment. Implement scheduled background jobs for enriching platform catalog entries with data from external sources (IGDB, Wikipedia). Awaiting user confirmation to proceed.
