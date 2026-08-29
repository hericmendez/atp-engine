# ATP Engine — API

## 1. Purpose

The ATP Engine exposes a REST API for game discovery, metadata retrieval, search, filtering, cover retrieval, and catalog management.

The API is implemented using Express.

---

# 2. API Principles

The API must:

* expose domain capabilities;
* validate all external input;
* return predictable structures;
* distinguish client errors from internal failures;
* avoid leaking infrastructure details;
* support pagination;
* support filtering;
* remain independent from source-specific response formats.

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

## GET `/games/search`

Search external sources and/or the canonical catalog for games matching a term.

Example:

```text
GET /api/v1/games/search?q=zelda
```

The endpoint may combine:

* database results;
* external discovery;
* normalization;
* classification;
* identity resolution;
* ranking.

---

# 7. Search Behavior

Search should support:

* partial title matching;
* alternate titles;
* source discovery;
* classification;
* deduplication;
* ranking;
* pagination.

---

# 8. Database-First Search

Where applicable, ATP should consult the canonical database before external sources.

If the database already contains sufficient results, unnecessary external requests should be avoided.

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

* exact title match;
* normalized title match;
* partial match;
* alternate title;
* release metadata;
* source quality;
* classification confidence;
* identity confidence.

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

## GET `/games/:id`

Returns a canonical game.

Example:

```text
GET /api/v1/games/123
```

The endpoint should:

1. query the database;
2. determine whether stored metadata is sufficient;
3. enrich from external sources if necessary;
4. persist validated enrichment;
5. return the canonical Game.

---

# 14. Database-First Metadata Retrieval

Individual game retrieval must follow:

```text
Request
 ↓
Database
 ↓
Complete?
 ├── YES → Return
 └── NO
       ↓
External sources
       ↓
Normalize
       ↓
Classify
       ↓
Resolve identity
       ↓
Enrich
       ↓
Persist
       ↓
Return
```

---

# 15. Game Cover

## GET `/games/:id/cover`

Returns the best available cover image for a canonical game.

Cover retrieval is a dedicated capability.

The engine may:

* use a persisted cover;
* retrieve external covers;
* rank candidates;
* filter unsuitable images;
* persist the selected cover.

---

# 16. Cover Search

A separate search operation may be supported:

```text
GET /covers/search?q=zelda
```

The exact endpoint may evolve during implementation.

Cover results should be filtered and ranked.

The API must not return arbitrary image search results without classification/relevance checks.

---

# 17. Game Filtering

## GET `/games`

Returns canonical games matching filters.

Supported filters:

```text
search
title
release
platform
platformFamily
developer
publisher
genre
distributionChannel
```

Additional filters may be introduced later.

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

* request IDs;
* logging;
* error translation;
* authentication if later required;
* request limits;
* common HTTP concerns.

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

* validation;
* successful requests;
* pagination;
* filtering;
* not-found behavior;
* source failure;
* AI failure;
* persistence failure;
* response schemas.

External sources and AI providers should be mocked in normal API tests.

---

# 43. API Invariants

1. All external input is validated.
2. Controllers remain thin.
3. Domain logic does not depend on Express.
4. Collection endpoints support pagination.
5. Filters are composable.
6. Database-first behavior is preserved where applicable.
7. Source failures are isolated.
8. AI is optional.
9. AI implementation details are hidden behind application contracts.
10. API responses use stable contracts.
11. Infrastructure details are not leaked.
12. Canonical data is never blindly overwritten by source data.

---

# 44. Goal

The API is an interface to the ATP Engine, not the engine itself.

The API should remain a thin transport layer over stable application use cases.
