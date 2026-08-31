# ATP Engine — API

## 1. Purpose

The ATP Engine exposes a REST API for game discovery, metadata retrieval, search, filtering, cover retrieval, and catalog management.

The API is implemented using Express.

---

# 2. API Principles

The API must:

- expose domain capabilities;
- validate all external input;
- return predictable structures;
- distinguish client errors from internal failures;
- avoid leaking infrastructure details;
- support pagination;
- support filtering;
- remain independent from source-specific response formats.

---

# 3. Base Path

All endpoints should use a versioned API prefix.

Recommended:

```text
/api/v1
```

The exact prefix must be centralized in configuration.

---

# 4. Response Format

Successful responses should use predictable JSON structures.

Example:

```text
{
  "data": {...}
}
```

Collections should include pagination metadata.

Example:

```text
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

---

# 5. Error Format

Errors should have a consistent structure.

Example:

```text
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Invalid search parameters"
  }
}
```

Internal implementation details must not be exposed.

---

# 6. Game Search

## GET `/api/v1/games/search`

Search the canonical catalog for games matching a term.

Example:

```text
GET /api/v1/games/search?q=zelda
```

The endpoint queries the database using partial/case-insensitive matching on titles, developers, and publishers.

Supports pagination via `page` and `limit` query parameters.

### Origin Behavior

Search follows a **database-first, scraper-fallback** strategy:

1. Query the database for matching games.
2. If database results are non-empty, return them directly (`origin: "database"`).
3. If the database returns empty or the query fails, fall back to external source discovery via the source registry.
4. Discovered candidates are normalized and returned (`origin: "scraper"`).

Results from external sources are **not persisted** during search — this is a discovery operation.

### Response

```json
{
  "data": [
    {
      "id": "game-123",
      "title": "The Legend of Zelda: Breath of the Wild",
      "origin": "database",
      "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

When results come from external sources:

```json
{
  "data": [
    {
      "title": "Zelda: Twilight Princess",
      "origin": "scraper",
      "platforms": ["Wii", "GameCube"],
      "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

# 7. Search Behavior

Search supports:

- partial title matching;
- alternate titles;
- database-first lookup with scraper fallback;
- classification;
- deduplication;
- ranking;
- pagination.

### Origin Field

Every result object includes an `origin` field indicating where the data came from:

| Value | Meaning |
|-------|---------|
| `"database"` | Result came from the canonical database |
| `"scraper"` | Result came from external source discovery (scraper fallback) |

The `origin` field allows consumers to distinguish persisted catalog data from freshly discovered candidates.

---

# 8. Database-First Search

Search follows a strict database-first strategy:

```text
Request
  ↓
Database query (partial/case-insensitive)
  ↓
Results non-empty?
 ├── YES → Return with origin: "database"
 └── NO (empty or failure)
       ↓
     External source discovery (scraper fallback)
       ↓
     Normalize candidates
       ↓
     Return with origin: "scraper"
```

The database is always consulted first. External scraping only occurs when the database returns no results or the query fails.

This ensures:
- fast responses for known games;
- no unnecessary external requests;
- identity-safe behavior (no arbitrary scraping for known entities).

---

# 9. Multi-Source Discovery

When external discovery is necessary:

```text
Search
 ↓
Source Registry
 ├── Wikipedia
 ├── SteamDB
 └── future sources
 ↓
Candidate aggregation
```

Results must be normalized before being returned.

---

# 10. Search Classification

Search results must pass classification.

Non-game entities should not normally appear in game search results.

Examples to filter:

```text
movies
anime
TV shows
DLC
soundtracks
characters
promotional content
```

unless the API explicitly requests another entity type.

---

# 11. Search Ranking

Candidates should be ranked using deterministic relevance signals.

Potential signals:

- exact title match;
- normalized title match;
- partial match;
- alternate title;
- release metadata;
- source quality;
- classification confidence;
- identity confidence.

AI may assist when native ranking is insufficient.

---

# 12. Pagination

Search endpoints must support pagination.

Minimum parameters:

```text
page
limit
```

Defaults must be defined centrally.

Invalid pagination values must be rejected.

---

# 13. Game Retrieval

## GET `/api/v1/games/:id`

Returns a canonical game.

Example:

```text
GET /api/v1/games/game-123
```

The endpoint queries the database and returns the canonical Game.

Returns 404 if the game is not found.

### Origin Behavior

Single game retrieval is **database-only** and **identity-safe**:

- The database is the sole source for game identity resolution by ID.
- No external scraping is triggered on failure — a missing game returns 404.
- This prevents arbitrary scraping based on user-supplied identifiers.

### Response

```json
{
  "data": {
    "id": "game-123",
    "title": "The Legend of Zelda: Breath of the Wild",
    "origin": "database",
    "platforms": [...],
    "developers": [...],
    "publishers": [...],
    "genres": [...]
  }
}
```

---

# 14. Database-Only Metadata Retrieval

Individual game retrieval by ID follows a **database-only** strategy:

```text
Request (by game ID)
  ↓
Database lookup
  ↓
Found?
 ├── YES → Return with origin: "database"
 └── NO  → 404 Not Found
```

External sources are **not** consulted for arbitrary ID-based lookups. This is an intentional identity-safety boundary — scraping must not be triggered by user-supplied identifiers.

---

# 15. Cover Search (Independent)

## GET `/api/v1/covers/search`

Search for cover images by query. No Game required.

Example:

```text
GET /api/v1/covers/search?q=Doom%20Eternal
GET /api/v1/covers/search?q=Doom%20Eternal&type=cover&limit=3
GET /api/v1/covers/search?q=Doom%20Eternal&type=logo
GET /api/v1/covers/search?q=Doom%20Eternal&type=all&limit=9
```

### Query Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `q` | yes | — | Search query (1–200 chars, trimmed) |
| `type` | no | `cover` | `cover`, `logo`, or `all` |
| `limit` | no | `1` | Number of candidates to return (1–9) |
| `source` | no | — | Filter to specific source (e.g., `wikipedia`, `steam`) |

### Type Semantics

- `type=cover` — Returns `front_cover`, `box_art`, `poster`, `key_art`, and `unknown` candidates. Excludes `logo` and `screenshot`.
- `type=logo` — Returns only `logo` candidates.
- `type=all` — Returns all valid candidates regardless of type.

### Limit Semantics

- `limit` is applied **after** ranking. It returns the N highest-ranked candidates.
- `limit=3` means "give me the 3 best matching candidates," not "give me the first 3 candidates returned by sources."

### Response

```json
{
  "data": {
    "query": "Doom Eternal",
    "type": "cover",
    "limit": 3,
    "selected": {
      "url": "https://example.com/cover.jpg",
      "source": "wikipedia",
      "sourceId": "wp-123",
      "width": 600,
      "height": 900,
      "type": "front_cover",
      "origin": "scraper"
    },
    "candidates": [
      {
        "url": "https://example.com/cover.jpg",
        "source": "wikipedia",
        "sourceId": "wp-123",
        "width": 600,
        "height": 900,
        "type": "front_cover",
        "origin": "scraper",
        "ranking": {
          "relevanceScore": 0.9,
          "sourceScore": 0.8,
          "typeScore": 1.0,
          "qualityScore": 0.8,
          "aspectRatioScore": 1.0,
          "totalScore": 0.9
        }
      }
    ],
    "errors": []
  }
}
```

### Origin Behavior

Cover search is **always scraper-origin**:

- Covers are discovered from external sources (Wikipedia, Steam, etc.) at request time.
- There is no persisted cover database to consult — results are always freshly sourced.
- The `origin` field is always `"scraper"` for cover search results.

### Behavior

- Queries all sources with `searchCovers` capability.
- Sources without `searchCovers` are silently skipped.
- Failed sources are isolated — partial success is valid.
- Returns 200 with `selected: null` when no covers found (not an error).
- Does NOT persist results. This is a discovery operation.
- Filter is applied before ranking. Limit is applied after ranking.

### Default Behavior

The existing request:

```text
GET /api/v1/covers/search?q=Doom%20Eternal
```

behaves as `type=cover`, `limit=1`. Existing consumers do not need to change.

---

# 16. Game Cover

## GET `/api/v1/games/:id/cover`

Returns the best available cover image for a canonical game.

Example:

```text
GET /api/v1/games/game-123/cover
```

### Behavior

- If the game already has a persisted cover, returns the cached cover immediately.
- If no cover exists, queries all sources with `searchCovers` capability using the game's primary title.
- If a cover is found, it is persisted on the game record for future requests.
- Returns 404 if the game is not found.
- Returns 200 with `selected: null` when no covers found.

### Response

```json
{
  "data": {
    "gameId": "game-123",
    "query": "Doom Eternal",
    "selected": {
      "url": "https://example.com/cover.jpg",
      "source": "wikipedia",
      "sourceId": "wp-123",
      "width": 600,
      "height": 900,
      "type": "front_cover",
      "origin": "scraper"
    },
    "candidates": [...],
    "errors": []
  }
}
```

### Origin Behavior

Game cover retrieval is **scraper-origin**:

- If a persisted cover exists on the game record, it is returned immediately (still marked `origin: "scraper"` since the cover itself was sourced from an external provider).
- If no cover exists, external sources are queried and the selected cover is persisted.
- The `origin` field on cover objects is always `"scraper"` — covers are inherently source-derived.

---

# 17. Cover Types

| Type | Description |
|------|-------------|
| `front_cover` | Standard game box art |
| `box_art` | Alternative box art |
| `poster` | Promotional poster |
| `key_art` | Key promotional art |
| `screenshot` | In-game screenshot |
| `unknown` | Unclassified cover type |

---

# 18. Cover Ranking

Candidates are ranked using deterministic weighted scoring:

| Factor | Weight | Description |
|--------|--------|-------------|
| Relevance | 0.35 | Query-title match quality |
| Source reliability | 0.25 | Steam (0.9), Wikipedia (0.8), others (0.5) |
| Cover type | 0.25 | front_cover (1.0), box_art (0.95), poster (0.85), key_art (0.8), unknown (0.6), screenshot (0.3) |
| Quality (resolution) | 0.08 | Based on pixel count thresholds |
| Aspect ratio | 0.07 | Deviation from ideal 2:3 ratio |

Tie-breaking: relevance → type → source → URL lexicographic order.

---

# 19. Cover Error Handling

- Source failures are isolated and returned in the `errors` array.
- A single source failure does not cause a 500 response.
- Returns 200 with `selected: null` when no covers are found (not an error).

A separate search operation may be supported:

```text
GET /covers/search?q=zelda
```

The exact endpoint may evolve during implementation.

Cover results should be filtered and ranked.

The API must not return arbitrary image search results without classification/relevance checks.

---

# 17. Game Filtering

## GET `/api/v1/games`

Returns canonical games matching filters.

Supported filters:

```text
search
title
platform
platformFamily
developer
publisher
genre
classification
completeness
releaseYear
```

Additional filters may be introduced later.

### Origin Behavior

Catalog filtering is **database-only**:

- All filters operate against the canonical database.
- No external scraping is triggered on empty results or failures.
- An empty result set returns an empty array with `origin: "database"`.
- This ensures predictable, identity-safe catalog queries.

### Response

```json
{
  "data": [
    {
      "id": "game-123",
      "title": "The Legend of Zelda: Breath of the Wild",
      "origin": "database",
      "platforms": ["Nintendo Switch", "Wii U"],
      "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

# 18. Filter Semantics

Filters should be composable.

Example:

```text
GET /api/v1/games
    ?platformFamily=PlayStation
    &genre=RPG
    &release=2023
```

means:

```text
platformFamily = PlayStation
AND
genre = RPG
AND
release year = 2023
```

unless an endpoint explicitly documents different semantics.

---

# 19. Search Terms

Search should support partial/case-insensitive matching where appropriate.

Normalization must be performed consistently.

---

# 20. Release Filters

Release filters may support:

```text
releaseYear
releaseFrom
releaseTo
```

The final query contract should avoid ambiguous parameter names.

---

# 21. Platform Filters

Platform filtering should operate on canonical release/platform data rather than raw source strings whenever possible.

For example:

```text
Nintendo Switch
```

should not be treated as a completely different platform from:

```text
Switch
```

if normalization establishes equivalence.

### Platform Family Filtering

The API should support filtering by platform family to enable broad queries:

```text
GET /api/v1/games?platformFamily=PlayStation
```

returns all games with releases on any PlayStation platform (PS1, PS2, PS3, PS4, PS5, PSP, Vita).

Platform families: `PlayStation`, `Xbox`, `Nintendo`, `PC`, `Mobile`, `Sega`, `Atari`.

### Mobile Platform Filtering

For mobile games, the API should support:

```text
GET /api/v1/games?platformFamily=Mobile
```

returns all games with releases on Android or iOS.

```text
GET /api/v1/games?platform=Android
```

returns only Android releases.

```text
GET /api/v1/games?platform=iOS
```

returns only iOS releases.

### Distribution Channel Filtering

The API should support filtering by distribution channel:

```text
GET /api/v1/games?distributionChannel=Steam
```

returns all games available through Steam, regardless of platform.

```text
GET /api/v1/games?distributionChannel=Google Play
```

returns all games available through Google Play (Android).

```text
GET /api/v1/games?distributionChannel=Apple App Store
```

returns all games available through the App Store (iOS).

**Important**: Distribution channel is NOT a platform. Filtering by `distributionChannel=Steam` returns games where Steam is listed as a distribution channel, not games on a platform called "Steam".

---

# 22. Developer and Publisher Filters

Developer and publisher filters should use canonical entities or normalized names.

Source-specific naming differences must be normalized before filtering.

---

# 23. Genre Filters

Genres should use canonical normalized values.

Source-specific genre labels may be mapped to canonical genres.

---

# 24. Pagination for Catalog Queries

All potentially large collection endpoints must support pagination.

Minimum:

```text
page
limit
```

The API must return total/result metadata when practical.

---

# 25. Game Lists

The API may expose lists of games according to filters.

Example:

```text
GET /api/v1/games
```

with combinations of:

```text
search
title
release
platform
developer
publisher
genre
```

The filtering system must remain independent of the external source search system.

---

# 26. Discovery vs Catalog

These are different operations.

### Discovery

Searches external sources to find candidates.

### Catalog

Searches canonical ATP data.

The API should not expose this distinction unnecessarily to clients, but the application architecture must preserve it internally.

---

# 27. Explicit Discovery Endpoint

If external discovery needs to be exposed separately, it may use an endpoint such as:

```text
POST /api/v1/discovery/search
```

This endpoint should be considered an advanced/internal capability unless a clear consumer requires it.

---

# 28. Manual Game Registration

If manual registration is required:

```text
POST /api/v1/games
```

The request should contain validated canonical metadata.

The API must still perform domain validation and duplicate detection.

---

# 29. Update

If canonical game editing is supported:

```text
PATCH /api/v1/games/:id
```

Updates must respect domain invariants.

External source synchronization must not blindly overwrite manually curated information.

---

# 30. Delete

If deletion is supported:

```text
DELETE /api/v1/games/:id
```

Deletion must be explicit.

Source disappearance must never automatically trigger deletion.

---

# 31. Health

The API should expose a health endpoint.

Example:

```text
GET /health
```

It should provide enough information to determine whether the application is operational.

---

# 32. Readiness

A separate readiness endpoint may be provided:

```text
GET /ready
```

This may check required dependencies such as:

```text
MongoDB
```

AI should not necessarily be considered mandatory for readiness because AI is optional.

---

# 33. API Error Categories

The application should distinguish errors such as:

```text
VALIDATION_ERROR
NOT_FOUND
CONFLICT
SOURCE_ERROR
AI_ERROR
PERSISTENCE_ERROR
INTERNAL_ERROR
```

AI and source failures may sometimes be degraded into successful native results.

They should only become API errors when the requested operation genuinely cannot be completed.

---

# 34. Source Failures

A single source failure must not automatically produce a `500` response if other sources or canonical data can satisfy the request.

Example:

```text
Wikipedia → unavailable
SteamDB → available
Database → available
```

The request may still succeed.

---

# 35. API and AI

The API must not expose AI implementation details unnecessarily.

A consumer should not need to know whether a result was produced by:

```text
native logic
Ollama
remote LLM
```

unless provenance/debugging is explicitly requested.

---

# 36. API and Provenance

Advanced responses may optionally expose provenance information.

Example:

```text
{
  "source": "steamdb",
  "externalId": "..."
}
```

This should be controlled by the API contract.

---

# 37. API and Domain Models

HTTP DTOs must not automatically become domain entities.

The preferred flow is:

```text
HTTP Request
 ↓
Zod schema
 ↓
DTO
 ↓
Application use case
 ↓
Domain
```

---

# 38. Controllers

Controllers should remain thin.

A controller should primarily:

1. receive the request;
2. validate/parse input;
3. invoke a use case;
4. map the result to HTTP;
5. return the response.

Business logic does not belong in controllers.

---

# 39. Middleware

Middleware may handle:

- request IDs;
- logging;
- error translation;
- authentication if later required;
- request limits;
- common HTTP concerns.

Middleware must not become a hidden location for domain rules.

---

# 40. API Versioning

Breaking API changes should use a new API version.

For example:

```text
/api/v1
/api/v2
```

Do not silently change the meaning of existing contracts.

---

# 41. API Documentation

The API should eventually expose machine-readable documentation, preferably through OpenAPI.

The OpenAPI specification should be generated or maintained alongside the implementation.

---

# 42. API Testing

API tests must cover:

- validation;
- successful requests;
- pagination;
- filtering;
- not-found behavior;
- source failure;
- AI failure;
- persistence failure;
- response schemas.

External sources and AI providers should be mocked in normal API tests.

---

# 43. API Invariants

1. All external input is validated.
2. Controllers remain thin.
3. Domain logic does not depend on Express.
4. Collection endpoints support pagination.
5. Filters are composable.
6. Database-first behavior is preserved for search.
7. Catalog filtering is database-only.
8. Single game retrieval is database-only and identity-safe.
9. Cover results are always scraper-origin.
10. Source failures are isolated.
11. AI is optional.
12. AI implementation details are hidden behind application contracts.
13. API responses use stable contracts.
14. Infrastructure details are not leaked.
15. Canonical data is never blindly overwritten by source data.
16. Every response object includes an `origin` field indicating data provenance.

---

# 44. Goal

The API is an interface to the ATP Engine, not the engine itself.

The API should remain a thin transport layer over stable application use cases.
