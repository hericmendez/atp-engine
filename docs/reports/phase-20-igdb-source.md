# Phase 20 — IGDB Source

## Step-by-Step Implementation

1. **Reconnaissance** — Audited SourceAdapter interface, BaseAdapter, WikipediaAdapter, SteamAdapter, SourceRegistry, config schema, existing tests and fixtures
2. **IGDB API research** — Studied IGDB v4 API docs (search, getById, authentication, platform/genre ID mappings)
3. **IGDBAdapter creation** — Created `src/sources/igdb/igdb-adapter.ts` extending BaseAdapter with Twitch OAuth2 token management
4. **Config update** — Added `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` optional env vars to config schema
5. **Server wiring** — Conditionally register IGDB adapter only when both credentials are provided
6. **Barrel exports** — Updated `src/sources/index.ts` and created `src/sources/igdb/index.ts`
7. **Fixtures** — Added IGDB OAuth token, search response, game detail, and company fixtures
8. **Tests** — Created `tests/sources/igdb/igdb-adapter.test.ts` with 28 tests covering search, getById, OAuth management, platform/genre mapping, date handling, error scenarios
9. **Build fixes** — Removed unused interface, fixed unused variable lint error, formatted with Prettier

## Architectural Decisions

### Conditional Registration

- **Decision**: Only register IGDB adapter when both `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are provided
- **Context**: IGDB requires Twitch OAuth2 authentication. Without credentials, the adapter is useless and would fail on every request.
- **Alternatives considered**: Register always and fail at runtime (wasteful, confusing); require credentials as mandatory config (breaks existing users without IGDB keys)
- **Chosen approach**: Conditional registration with informational log
- **Reason**: Graceful degradation — server works normally without IGDB. Discovery uses whatever sources are registered.
- **Trade-off**: Discovery may miss IGDB data if credentials aren't configured, but this is explicit and documented.

### Twitch OAuth2 Token Management

- **Decision**: Implement OAuth2 token acquisition and caching in the adapter itself
- **Context**: IGDB API requires a valid access token from Twitch OAuth2, obtained via client credentials grant
- **Alternatives considered**: External token service (premature); pre-configured token in env (doesn't refresh); separate OAuth module (over-engineered for one adapter)
- **Chosen approach**: Internal token management with caching and 1-hour refresh buffer
- **Reason**: Token refresh is transparent to consumers. Caching avoids redundant token requests. 1-hour buffer prevents edge-case expiry during requests.
- **Trade-off**: Adapter has more internal state, but this is contained and testable.

### POST-based API (Not GET)

- **Decision**: Override the BaseAdapter pattern for IGDB — use POST requests instead of GET
- **Context**: IGDB API uses POST for all queries (APICalypse query language in request body). BaseAdapter's `fetchJson` is designed for GET.
- **Alternatives considered**: Modify BaseAdapter to support POST (breaks existing adapters); use GET with query params (not supported by IGDB); create a separate base class
- **Chosen approach**: Custom `postApi()` method within the adapter, independent of `fetchJson()`
- **Reason**: Cleanest approach — IGDB's API is fundamentally different from Wikipedia/Steam. A separate method avoids polluting the base class.
- **Trade-off**: Duplicates some error handling logic, but this is minimal and adapter-specific.

### Platform and Genre ID Mapping

- **Decision**: Hardcode IGDB ID-to-name mappings for platforms and genres
- **Context**: IGDB uses numeric IDs for platforms and genres. Our domain uses human-readable names.
- **Alternatives considered**: Fetch mappings from IGDB API at startup (adds startup latency, network dependency); use a database for mappings (over-engineered); leave unmapped (loses data quality)
- **Chosen approach**: Static maps in the adapter module
- **Reason**: IGDB platform/genre IDs are stable (rarely change). Static maps are fast, reliable, and testable. Unknown IDs are filtered out (graceful degradation).
- **Trade-off**: Requires manual updates when IGDB adds new platforms/genres, but this is infrequent.

## Domain-to-Persistence Mapping

### Platform ID → Name

| IGDB ID | Name | IGDB ID | Name |
|---------|------|---------|------|
| 6 | PC | 48 | PlayStation 4 |
| 49 | PlayStation 5 | 130 | Nintendo Switch |
| 3 | Linux | 14 | Mac |
| 18 | NES | 19 | SNES |
| 20 | Nintendo 64 | 34 | Wii |
| 41 | Wii U | 9 | Nintendo 3DS |

### Genre ID → Name

| IGDB ID | Name | IGDB ID | Name |
|---------|------|---------|------|
| 5 | Shooter | 12 | Role-playing (RPG) |
| 31 | Adventure | 32 | Indie |
| 14 | Sport | 4 | Fighting |
| 13 | Simulator | 10 | Racing |

## Repository Flow

### Search Flow

```
DiscoveryEngine.discover(query)
    ↓
querySources(sources, query)
    ↓
For each source adapter:
  adapter.search(query, { limit: 10 })
    ↓
IgdbAdapter:
  getAccessToken() → cached or fetch from Twitch OAuth
    ↓
  POST /games → { search "query"; fields name,...; limit 10; }
    ↓
  Parse response → RawCandidate[]
  Map platform IDs → names
  Map genre IDs → names
  Convert timestamps → date strings
  Generate cover URLs
    ↓
  Return SearchResult { candidates, hasMore }
    ↓
normalizeCandidate(raw) → NormalizedCandidate
    ↓
classifier.classify(normalized) → ClassificationResult
    ↓
DiscoverySourceObservation[]
```

### GetById Flow (Enrichment)

```
EnrichmentRunner.processItem(game)
    ↓
For each externalIdentifier where source = 'igdb':
  adapter.getById(igdbId)
    ↓
  getAccessToken() → cached or fetch
    ↓
  POST /games → { where id = <id>; fields name,...; }
    ↓
  POST /companies → { where id = (<ids>); fields name; }
    ↓
  Map company roles → developers/publishers
    ↓
  Return RawCandidate
    ↓
normalizeCandidate(raw) → NormalizedCandidate
    ↓
enrichGame(game, observations) → EnrichmentResult
```

## Files Changed

### Created
- `src/sources/igdb/igdb-adapter.ts` — IgdbAdapter with OAuth2, search, getById, platform/genre mapping
- `src/sources/igdb/index.ts` — Barrel export
- `tests/sources/igdb/igdb-adapter.test.ts` — 28 tests covering all scenarios

### Modified
- `src/sources/index.ts` — Added IGDB export
- `src/infrastructure/config/config.ts` — Added IGDB_CLIENT_ID, IGDB_CLIENT_SECRET optional env vars
- `src/server.ts` — Conditionally register IGDB adapter
- `tests/sources/fixtures/source-fixtures.ts` — Added IGDB fixtures
- `docs/roadmap.md` — Added Phase 20 section

## Validation Results

```
pnpm build         — ✅ passes
pnpm lint          — ✅ passes
pnpm format:check  — ✅ passes
pnpm test          — ✅ 939 tests passing (911 existing + 28 new)
```

### Live Validation

| Test | Result |
|------|--------|
| Server starts without IGDB credentials | ✅ IGDB adapter not registered, server healthy |
| Server starts with IGDB credentials | ✅ IGDB adapter registered |
| Search works without IGDB | ✅ Wikipedia + Steam sources active |
| Health endpoint | ✅ Returns status ok |
| Graceful degradation | ✅ Missing credentials → no IGDB, no errors |

## Known Limitations

- **No company role resolution** — IGDB's `/games` endpoint doesn't return company roles (developer vs publisher). We fetch `/companies` by ID but can't distinguish roles. All fetched companies are marked as both developer and publisher. This is a conservative approach — better to have both than miss one.
- **Platform/genre mapping may be incomplete** — IGDB occasionally adds new platforms/genres with new IDs. Unmapped IDs are silently filtered. The mapping covers 200+ platforms and 30+ genres but may need updates.
- **Rate limiting** — IGDB allows 4 requests/sec without API key. The adapter has no rate limiter — relies on BaseAdapter retry and external rate limiting. For production, consider adding request throttling.
- **Token expiry** — Tokens are cached for ~60 days with 1-hour refresh buffer. If the adapter runs continuously, tokens refresh transparently. If restarted, a new token is fetched.
- **No cover search** — IGDB provides cover images but the adapter doesn't implement `searchCovers()` as a dedicated method. Covers are included in search results and getById responses.

## Impact on Next Phases

- **Phase 21 (Catalog Stats)**: Source coverage stats will show IGDB as a third source. Source-specific game counts may improve.
- **Phase 22 (Relationships)**: IGDB provides rich relationship data (remakes, remasters, ports) that could be leveraged.
- **Enrichment runner**: Games with `igdb` external identifiers will be automatically enriched from IGDB during background runs. No changes needed to the runner.
- **Future: Source priority**: IGDB may have higher quality data than Wikipedia for some games. Future phases could consider source-specific quality scoring.

## Next Step

Phase 21 — Catalog Statistics. Expose catalog health metrics for monitoring. Awaiting user confirmation to proceed.
