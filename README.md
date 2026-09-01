# ATP Engine

> Ash Twin Project — Video Game Metadata Discovery and Catalog Engine

## Overview

ATP Engine is a standalone service for discovering, classifying, normalizing, resolving, and persisting video game metadata from multiple external sources.

Its primary purpose is to build and maintain a reliable canonical catalog of video games.

ATP is designed to operate independently from any consuming application.

Applications such as Save State may use ATP as a metadata service, but ATP does not own user-specific gaming data.

---

# Core Responsibilities

ATP is responsible for:

- discovering games across multiple sources;
- searching games by terms;
- retrieving metadata for individual games;
- discovering game covers;
- filtering and ranking search results;
- classifying candidates;
- identifying duplicate or equivalent records;
- distinguishing different games with similar names;
- representing relationships between related games;
- normalizing metadata;
- persisting validated canonical information;
- enriching incomplete records;
- querying the canonical catalog.

---

# Original Scraper Baseline

The original Next.js scraper established the initial functional baseline.

It was capable of:

- searching multiple sources;
- filtering source results;
- searching game metadata by term;
- discovering game covers;
- returning a small set of filtered cover candidates;
- distinguishing games from unrelated media such as movies, anime, DLC, and promotional content.

It did not yet implement persistent catalog storage.

ATP Engine preserves these capabilities while moving them into a dedicated, extensible service architecture.

---

# Design Principles

## 1. Database First

When requesting metadata for an individual game:

```text
Request
  ↓
Database
  ↓
Sufficient?
 ├── YES → Return
 └── NO → External discovery
```

External sources should not be queried unnecessarily when sufficient canonical information already exists.

---

## 2. Deterministic First

ATP should prefer deterministic rules whenever they provide sufficient evidence.

AI exists primarily to assist with ambiguity.

```text
Deterministic processing
        ↓
Ambiguous?
   ├── NO → Continue
   └── YES → AI assistance
```

---

## 3. AI Is Optional

ATP must remain operational when no AI provider is available.

AI may assist with:

- classification;
- identity resolution;
- semantic normalization;
- conflict resolution;
- candidate ranking.

AI is never the canonical source of truth.

---

## 4. Native Fallback

Whenever an AI operation fails:

```text
AI unavailable
     ↓
Native engine
     ↓
Continue whenever possible
```

The system must not become dependent on an LLM for basic operation.

---

## 5. External Sources Are Untrusted

Source data is treated as evidence, not canonical truth.

```text
Source
  ↓
Adapter
  ↓
Normalization
  ↓
Classification
  ↓
Resolution
  ↓
Validation
  ↓
Canonical data
```

---

# Supported Catalog Concepts

ATP is expected to represent:

- games;
- releases;
- platforms;
- regions;
- developers;
- publishers;
- genres;
- alternate titles;
- external identifiers;
- relationships between related games;
- source provenance.

---

# Identity Examples

ATP must be able to distinguish:

```text
Resident Evil 4 (2005)
≠
Resident Evil 4 (2023 Remake)
```

while recognizing:

```text
The Legend of Zelda:
Breath of the Wild — Wii U
=
The Legend of Zelda:
Breath of the Wild — Nintendo Switch
```

and:

```text
Resident Evil 3 — NTSC/USA
=
Resident Evil 3 — PAL/EUR
```

when represented as regional releases of the same game.

Related versions may remain distinct:

```text
Final Fantasy Tactics
Final Fantasy Tactics: The War of the Lions
Final Fantasy Tactics: The Ivalice Chronicles
```

The engine must represent their relationship instead of blindly merging them.

---

# API Endpoints

All endpoints are prefixed with `http://localhost:3000` (configurable via `PORT` env var).

## Endpoint Summary

| Method | Path | Description | Category |
|--------|------|-------------|----------|
| `GET` | `/health` | Server health status | Health |
| `GET` | `/api/v1/games` | List games with filters | Catalog |
| `GET` | `/api/v1/games/search` | Search games by term | Search |
| `GET` | `/api/v1/games/:id` | Retrieve single game | Catalog |
| `GET` | `/api/v1/covers/search` | Search cover images | Covers |
| `GET` | `/api/v1/games/:id/cover` | Get cover for a game | Covers |
| `GET` | `/api/v1/platforms/summary` | List platforms with filters | Platform Catalog |
| `GET` | `/api/v1/platforms/:platformId` | Retrieve single platform | Platform Catalog |
| `POST` | `/api/v1/catalog/sync` | Synchronize catalog for platforms | Catalog Sync |
| `GET` | `/api/v1/catalog/sync/history` | List sync history records | Sync History |
| `GET` | `/api/v1/catalog/sync/history/:id` | Get sync history by ID | Sync History |
| `POST` | `/api/v1/admin/games` | Create game manually | Admin Write |
| `PATCH` | `/api/v1/admin/games/:id` | Update game metadata | Admin Write |
| `DELETE` | `/api/v1/admin/games/:id` | Delete a game | Admin Write |

---

## Health Check

### `GET /health`

Returns server status, dependency health, and uptime.

**curl**:

```bash
curl "http://localhost:3000/health"
```

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2026-08-31T01:00:00.000Z",
  "version": "0.1.0",
  "dependencies": {
    "database": "connected",
    "ai": "configured"
  },
  "uptime": 12345.678
}
```

**Status values**:

| `status` | Meaning |
|----------|---------|
| `ok` | Database connected |
| `degraded` | Database disconnected (AI status informational only) |

**Dependencies**:

| Field | Values | Meaning |
|-------|--------|---------|
| `database` | `connected` / `disconnected` | MongoDB connection state |
| `ai` | `configured` / `not_configured` | OLLAMA_URL env var presence |

**No external dependencies. No writes.**

---

## Game Catalog

### `GET /api/v1/games`

List games with composable filters, pagination, and sorting. Database-only — no external scraping.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | — | Partial match on titles, developers, publishers |
| `title` | string | — | Partial match on titles only |
| `platform` | string | — | Partial match on platform name (e.g., `Nintendo Switch`). Supports comma-separated values for OR semantics (e.g., `Nintendo Switch,PlayStation 5`) |
| `platformFamily` | string | — | Exact match on platform family |
| `developer` | string | — | Partial match on developer name. Supports comma-separated values |
| `publisher` | string | — | Partial match on publisher name. Supports comma-separated values |
| `genre` | string | — | Partial match on genre name. Supports comma-separated values |
| `classification` | enum | — | `GAME`, `DLC`, `EXPANSION`, `MOVIE`, `TV_SHOW`, `ANIME`, `SOUNDTRACK`, `BOOK`, `HARDWARE`, `PROMOTIONAL`, `CHARACTER`, `FRANCHISE`, `PERSON`, `EVENT`, `UNKNOWN` |
| `completeness` | enum | — | `NOT_FOUND`, `FOUND_PARTIAL`, `FOUND_SUFFICIENT`, `FOUND_COMPLETE` |
| `releaseYear` | int | — | Exact year match (1950–2100) |
| `releaseYearFrom` | int | — | Minimum release year (inclusive, 1950–2100) |
| `releaseYearTo` | int | — | Maximum release year (inclusive, 1950–2100) |
| `page` | int | `1` | Page number (min 1) |
| `limit` | int | `20` | Results per page (1–100) |
| `sort` | enum | — | `title`, `name`, `createdAt`, `updatedAt`, `completeness`, `releaseDate` |
| `order` | enum | `desc` | `asc` or `desc` |

All filters are composable (AND logic). Multiple values within the same filter use OR semantics (e.g., `platform=Nintendo Switch,PlayStation 5` returns games on either platform).

**curl — basic listing**:

```bash
curl "http://localhost:3000/api/v1/games"
```

**curl — filtered by platform and genre**:

```bash
curl "http://localhost:3000/api/v1/games?platform=Nintendo%20Switch&genre=Adventure"
```

**curl — filtered by developer and classification**:

```bash
curl "http://localhost:3000/api/v1/games?developer=Nintendo&classification=GAME"
```

**curl — filtered by release year and completeness**:

```bash
curl "http://localhost:3000/api/v1/games?releaseYear=2017&completeness=FOUND_COMPLETE"
```

**curl — paginated and sorted**:

```bash
curl "http://localhost:3000/api/v1/games?page=2&limit=10&sort=title&order=asc"
```

**curl — combined filters**:

```bash
curl "http://localhost:3000/api/v1/games?platformFamily=Nintendo&developer=Nintendo&genre=Adventure&releaseYear=2017&sort=title&order=asc&limit=5"
```

**curl — multiple platforms (OR)**:

```bash
curl "http://localhost:3000/api/v1/games?platform=Nintendo%20Switch,PlayStation%205&classification=GAME"
```

**curl — multiple genres (OR)**:

```bash
curl "http://localhost:3000/api/v1/games?genre=RPG,Action&developer=Square%20Enix"
```

**curl — release year range**:

```bash
curl "http://localhost:3000/api/v1/games?releaseYearFrom=2017&releaseYearTo=2023&sort=releaseDate&order=asc"
```

**Response**:

```json
{
  "data": [
    {
      "id": "game-abc123",
      "titles": [{ "value": "The Legend of Zelda: Breath of the Wild", "type": "primary" }],
      "releases": [
        {
          "id": "rel-1",
          "platform": { "name": "Nintendo Switch", "family": "Nintendo", "type": "handheld" },
          "region": { "name": "Global" },
          "releaseDate": { "year": 2017, "month": 3, "day": 3, "precision": "day" },
          "version": null,
          "edition": null,
          "distributionChannels": [],
          "launchers": []
        }
      ],
      "developers": [{ "name": "Nintendo EPD" }],
      "publishers": [{ "name": "Nintendo" }],
      "genres": [{ "name": "Action" }, { "name": "Adventure" }],
      "externalIdentifiers": [{ "source": "wikipedia", "id": "12345" }],
      "relationships": [],
      "evidence": [],
      "classification": "GAME",
      "completeness": "FOUND_COMPLETE"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  },
  "origin": "database"
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters |
| 500 | `PERSISTENCE_ERROR` | MongoDB connection or query failure |

**Dependencies**: MongoDB (read-only). No external APIs. No writes.

---

## Game Search

### `GET /api/v1/games/search`

Search games by term. Database-first with discovery fallback — if no DB matches exist, discovers from external sources and persists results.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | **required** | Search term (min 1 char) |
| `source` | string | — | Reserved (not yet used) |
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Results per page (1–100) |
| `sort` | enum | — | `title`, `name`, `createdAt`, `updatedAt`, `completeness`, `releaseDate` |
| `order` | enum | `desc` | `asc` or `desc` |

**Note**: `GET /api/v1/games/search?q=Doom` and `GET /api/v1/games?search=Doom` produce identical results.

**Search flow**:

```text
Query database for matching games
  ↓
Results found? → YES → return with origin: "database"
  ↓ NO
Discover from external sources (Wikipedia, Steam)
  ↓
Classify candidates
  ↓
Resolve identity (deduplicate by external ID)
  ↓
Persist discovered games
  ↓
Enrich if existing game found
  ↓
Return with origin: "database"
```

**curl — basic search**:

```bash
curl "http://localhost:3000/api/v1/games/search?q=Doom"
```

**curl — search with pagination**:

```bash
curl "http://localhost:3000/api/v1/games/search?q=Zelda&page=1&limit=5"
```

**curl — search sorted by title**:

```bash
curl "http://localhost:3000/api/v1/games/search?q=Final%20Fantasy&sort=title&order=asc"
```

**Response**: Same structure as `GET /api/v1/games`.

**Origin behavior**:

| Scenario | `origin` | Description |
|----------|----------|-------------|
| DB has matches | `database` | Returned directly from catalog |
| DB empty, discovery succeeds | `database` | Discovered games persisted and returned |
| DB empty, discovery fails | `scraper` | Empty results (no external data cached) |
| DB fails | `scraper` | Fallback to discovery |

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing `q` parameter |
| 500 | `PERSISTENCE_ERROR` | MongoDB failure |

**Dependencies**: MongoDB (read+write). Wikipedia, Steam (on empty DB). Writes discovered games.

---

## Single Game

### `GET /api/v1/games/:id`

Retrieve a single game by its domain ID. Database-only — no external scraping.

**Path Parameters**:

| Parameter | Description |
|-----------|-------------|
| `id` | Game domain ID (required, non-empty) |

**How to get a valid ID**: Call `GET /api/v1/games?limit=1` and use the `id` field from the first result.

**curl**:

```bash
curl "http://localhost:3000/api/v1/games/game-abc123"
```

**Response**:

```json
{
  "data": {
    "id": "game-abc123",
    "titles": [
      { "value": "The Legend of Zelda: Breath of the Wild", "type": "primary" }
    ],
    "releases": [...],
    "developers": [{ "name": "Nintendo EPD" }],
    "publishers": [{ "name": "Nintendo" }],
    "genres": [{ "name": "Action" }, { "name": "Adventure" }],
    "externalIdentifiers": [...],
    "relationships": [...],
    "evidence": [...],
    "classification": "GAME",
    "completeness": "FOUND_COMPLETE"
  },
  "origin": "database"
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Empty or missing `id` |
| 404 | `NOT_FOUND` | No game with that ID exists |
| 500 | `PERSISTENCE_ERROR` | MongoDB failure |

**Dependencies**: MongoDB (read-only). No external APIs. No writes.

---

## Cover Search

### `GET /api/v1/covers/search`

Search for cover images by query. Does not require an existing Game in the database.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | **required** | Search query (1–200 chars, trimmed) |
| `type` | enum | `cover` | `cover`, `logo`, or `all` |
| `limit` | int | `1` | Number of candidates to return (1–9) |
| `source` | string | — | Filter to specific source (`wikipedia`, `steam`) |

**Type semantics**:

- `cover` — Returns `front_cover`, `box_art`, `poster`, `key_art`, and `unknown` candidates. Excludes logos and screenshots.
- `logo` — Returns only `logo` candidates.
- `all` — Returns all valid candidates regardless of type.

**Limit semantics**: Limit is applied **after** ranking. `limit=3` means "the 3 best candidates," not "the first 3 returned."

**curl — basic cover search**:

```bash
curl "http://localhost:3000/api/v1/covers/search?q=Doom%20Eternal"
```

**curl — get top 3 covers**:

```bash
curl "http://localhost:3000/api/v1/covers/search?q=Doom%20Eternal&type=cover&limit=3"
```

**curl — search for logos only**:

```bash
curl "http://localhost:3000/api/v1/covers/search?q=Nintendo&type=logo&limit=5"
```

**curl — search all types**:

```bash
curl "http://localhost:3000/api/v1/covers/search?q=Zelda&type=all&limit=9"
```

**curl — search from a specific source**:

```bash
curl "http://localhost:3000/api/v1/covers/search?q=Hollow%20Knight&source=wikipedia&limit=3"
```

**Response**:

```json
{
  "data": {
    "query": "Doom Eternal",
    "type": "cover",
    "limit": 3,
    "selected": {
      "url": "https://upload.wikimedia.org/wikipedia/en/8/86/Doom_Eternal_cover_art.jpg",
      "source": "wikipedia",
      "sourceId": "6509467",
      "width": null,
      "height": null,
      "type": "front_cover"
    },
    "candidates": [
      {
        "url": "https://upload.wikimedia.org/wikipedia/en/8/86/Doom_Eternal_cover_art.jpg",
        "source": "wikipedia",
        "sourceId": "6509467",
        "width": null,
        "height": null,
        "type": "front_cover",
        "ranking": {
          "relevanceScore": 0.95,
          "sourceScore": 0.8,
          "typeScore": 1.0,
          "qualityScore": 0.5,
          "aspectRatioScore": 1.0,
          "totalScore": 0.9
        }
      }
    ],
    "errors": []
  }
}
```

`selected` is `null` when no candidates exceed the minimum selection score (0.55).

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing `q`, invalid `type`, `limit` out of range |
| 500 | `INTERNAL_ERROR` | Unexpected failure |

**Dependencies**: Wikipedia, Steam (external APIs). No MongoDB. No writes.

---

## Game Cover

### `GET /api/v1/games/:id/cover`

Discover and return a cover for an existing game. If the game already has a cached cover, returns it immediately. Otherwise, queries external sources, ranks candidates, and persists the result.

**Path Parameters**:

| Parameter | Description |
|-----------|-------------|
| `id` | Game domain ID (required) |

**How to get a valid ID**: Call `GET /api/v1/games?limit=1` and use the `id` field.

**curl**:

```bash
curl "http://localhost:3000/api/v1/games/game-abc123/cover"
```

**Behavior**:

1. If game does not exist → **404 Not Found**
2. If game already has a `cover` field → returns cached cover (no external calls)
3. If game has no cover → queries Wikipedia + Steam, ranks candidates, persists best match

**Response (with cover)**:

```json
{
  "data": {
    "gameId": "game-abc123",
    "query": "The Legend of Zelda: Breath of the Wild",
    "type": "cover",
    "limit": 1,
    "selected": {
      "url": "https://upload.wikimedia.org/wikipedia/en/c/c6/Breath_of_the_Wild.jpg",
      "source": "wikipedia",
      "sourceId": "42398765",
      "width": null,
      "height": null,
      "type": "front_cover"
    },
    "candidates": [],
    "errors": []
  },
  "origin": "database"
}
```

**Response (no cover found)**:

```json
{
  "data": {
    "gameId": "game-abc123",
    "query": "Obscure Game Title",
    "type": "cover",
    "limit": 1,
    "selected": null,
    "candidates": [],
    "errors": []
  },
  "origin": "scraper"
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Empty or missing `id` |
| 404 | `NOT_FOUND` | No game with that ID exists |
| 500 | `INTERNAL_ERROR` | Unexpected failure |

**Dependencies**: MongoDB (read+write). Wikipedia, Steam. Writes cover to game record.

---

## Platform Catalog Summary

### `GET /api/v1/platforms/summary`

List platforms from the catalog with composable filters, pagination, and sorting. Returns game counts per platform.

The platform catalog is seeded on server startup with 181 canonical platforms spanning home consoles, handhelds, arcade systems, PCs, mobile, and retro/boutique hardware from 48 companies. The seed is idempotent — running it multiple times does not create duplicates.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `companyName` | string | — | Partial match on company name (e.g., `Nintendo`, `Sony`) |
| `platformStatus` | enum | — | `active`, `inactive`, `discontinued` |
| `releaseYear` | int | — | Exact year match (1950–2100) |
| `releaseYearRange` | string | — | Year range in `from-to` format (e.g., `1990-2000`) |
| `showEmptyPlatforms` | boolean | `false` | Include platforms with zero games |
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Results per page (1–100) |
| `sort` | enum | — | `name`, `releaseYear`, `gameCount` |
| `order` | enum | `asc` | `asc` or `desc` |

**curl — basic listing** (platforms with games only):

```bash
curl "http://localhost:3000/api/v1/platforms/summary"
```

**curl — filter by company**:

```bash
curl "http://localhost:3000/api/v1/platforms/summary?companyName=Nintendo"
```

**curl — filter by status and release range**:

```bash
curl "http://localhost:3000/api/v1/platforms/summary?platformStatus=active&releaseYearRange=2000-2025"
```

**curl — include empty platforms**:

```bash
curl "http://localhost:3000/api/v1/platforms/summary?showEmptyPlatforms=true"
```

**curl — sorted by release year**:

```bash
curl "http://localhost:3000/api/v1/platforms/summary?sort=releaseYear&order=desc"
```

**Response**:

```json
{
  "data": [
    {
      "id": "nintendo-switch",
      "name": "Nintendo Switch",
      "company": "Nintendo",
      "releaseYear": 2017,
      "status": "active",
      "family": "Nintendo",
      "type": "handheld",
      "thumb": null,
      "gameCount": 42
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  },
  "origin": "database"
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters |
| 500 | `PERSISTENCE_ERROR` | MongoDB connection or query failure |

**Dependencies**: MongoDB (read-only). No external APIs. No writes.

---

## Single Platform

### `GET /api/v1/platforms/:platformId`

Retrieve a single platform by its domain ID.

**Path Parameters**:

| Parameter | Description |
|-----------|-------------|
| `platformId` | Platform domain ID (required, non-empty) |

**How to get a valid ID**: Call `GET /api/v1/platforms/summary` and use the `id` field.

**curl**:

```bash
curl "http://localhost:3000/api/v1/platforms/nintendo-switch"
```

**Response**:

```json
{
  "data": {
    "id": "nintendo-switch",
    "name": "Nintendo Switch",
    "company": "Nintendo",
    "releaseYear": 2017,
    "status": "active",
    "family": "Nintendo",
    "type": "handheld",
    "thumb": null,
    "gameCount": 42
  },
  "origin": "database"
}
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Empty or missing `platformId` |
| 404 | `NOT_FOUND` | No platform with that ID exists |
| 500 | `PERSISTENCE_ERROR` | MongoDB failure |

**Dependencies**: MongoDB (read-only). No external APIs. No writes.

---

## Catalog Sync

### `POST /api/v1/catalog/sync`

Synchronize the game catalog for one or more platforms by querying all registered discovery sources, filtering by platform relevance, and persisting new or enriched games.

**Request body**:

```json
{
  "platforms": ["nintendo-switch"],
  "activeOnly": false,
  "from": "2025-01-01",
  "to": "2025-12-31",
  "dryRun": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `platforms` | `string[]` | Yes (unless `activeOnly`) | Platform IDs to sync |
| `activeOnly` | `boolean` | No | Sync all active platforms (default: `false`) |
| `from` | `string` | Yes | Start date (ISO format) |
| `to` | `string` | Yes | End date (ISO format) |
| `dryRun` | `boolean` | No | Return results without persisting (default: `false`) |

**Response**:

```json
{
  "data": {
    "status": "completed",
    "platforms": [
      {
        "platformId": "nintendo-switch",
        "platformName": "Nintendo Switch",
        "candidatesFound": 12,
        "newGames": 8,
        "existingGames": 2,
        "updatedGames": 1,
        "rejected": 1,
        "errors": 0,
        "status": "completed"
      }
    ],
    "totals": {
      "candidatesFound": 12,
      "newGames": 8,
      "existingGames": 2,
      "updatedGames": 1,
      "rejected": 1,
      "errors": 0
    },
    "dryRun": true,
    "durationMs": 3421
  }
}
```

**Examples**:

```bash
# Dry run sync for Nintendo Switch
curl -X POST http://localhost:3000/api/v1/catalog/sync \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["nintendo-switch"],"from":"2025-01-01","to":"2025-12-31","dryRun":true}'

# Sync all active platforms
curl -X POST http://localhost:3000/api/v1/catalog/sync \
  -H 'Content-Type: application/json' \
  -d '{"activeOnly":true,"from":"2025-01-01","to":"2025-12-31"}'
```

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing platforms+activeOnly, invalid dates, from>to |
| 500 | `PERSISTENCE_ERROR` | MongoDB failure |

**Dependencies**: MongoDB (read/write). Discovery sources (Wikipedia, Steam, optionally IGDB). No AI dependency.

---

## Automated Catalog Sync (Scheduler)

When `CATALOG_SYNC_ENABLED=true`, the server automatically runs catalog synchronization on a configurable interval for all active platforms using a rolling date window.

### Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `CATALOG_SYNC_ENABLED` | `false` | Enable/disable the scheduler |
| `CATALOG_SYNC_INTERVAL_MS` | `86400000` (24h) | Sync interval in milliseconds |
| `CATALOG_SYNC_LOOKBACK_DAYS` | `30` | Rolling window — syncs games from `now - lookbackDays` to `now` |

**curl — trigger immediate sync manually**:

```bash
curl -X POST http://localhost:3000/api/v1/catalog/sync \
  -H 'Content-Type: application/json' \
  -d '{"activeOnly":true,"from":"2025-08-01","to":"2025-09-01"}'
```

---

## Sync History

### `GET /api/v1/catalog/sync/history`

List catalog synchronization history records with optional filtering and pagination.

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `string` | — | Filter: `running`, `completed`, `partial`, `failed` |
| `trigger` | `string` | — | Filter: `manual`, `scheduled` |
| `platformId` | `string` | — | Filter by platform ID |
| `from` | `string` | — | Filter by start date (ISO format) |
| `to` | `string` | — | Filter by end date (ISO format) |
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `20` | Results per page (max 100) |
| `sort.field` | `string` | `startedAt` | Sort by: `startedAt`, `completedAt`, `status`, `trigger` |
| `sort.direction` | `string` | `desc` | Sort direction: `asc`, `desc` |

**Response**:

```json
{
  "data": [
    {
      "id": "abc123",
      "startedAt": "2025-09-01T12:00:00Z",
      "completedAt": "2025-09-01T12:05:00Z",
      "trigger": "manual",
      "status": "completed",
      "dryRun": false,
      "from": "2025-01-01",
      "to": "2025-12-31",
      "requestedPlatformIds": ["nintendo-switch"],
      "resolvedPlatformNames": ["Nintendo Switch"],
      "totals": {
        "candidatesFound": 12,
        "newGames": 8,
        "existingGames": 2,
        "updatedGames": 1,
        "rejected": 1,
        "errors": 0
      },
      "platformResults": [
        {
          "platformId": "nintendo-switch",
          "platformName": "Nintendo Switch",
          "candidatesFound": 12,
          "newGames": 8,
          "existingGames": 2,
          "updatedGames": 1,
          "rejected": 1,
          "errors": 0,
          "status": "completed"
        }
      ],
      "error": null,
      "durationMs": 3421,
      "createdAt": "2025-09-01T12:00:00Z",
      "updatedAt": "2025-09-01T12:05:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `GET /api/v1/catalog/sync/history/:id`

Get a single sync history record by ID.

**Response**: Same shape as individual items in the list response.

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid ID format |
| 404 | `NOT_FOUND` | History record not found |

**Note**: Each `POST /api/v1/catalog/sync` request now returns a `historyId` field in the result, linking to the corresponding history record.

---

## Admin Game Write API

Administrative endpoints for manual game management. Authentication is intentionally deferred to a future phase.

### `POST /api/v1/admin/games`

Create a new game manually.

**Request body**:

```json
{
  "titles": [{ "value": "Game Name", "type": "primary" }],
  "developers": [{ "name": "Studio Name" }],
  "publishers": [{ "name": "Publisher Name" }],
  "genres": [{ "name": "Action" }],
  "externalIdentifiers": [{ "source": "igdb", "id": "12345" }],
  "classification": "GAME",
  "completeness": "FOUND_PARTIAL"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `titles` | `array` | Yes | At least one title. Each has `value` (required) and `type` (optional: `primary`, `alternate`, `localized`, `abbreviated`) |
| `developers` | `array` | No | Array of `{ name: string }` |
| `publishers` | `array` | No | Array of `{ name: string }` |
| `genres` | `array` | No | Array of `{ name: string }` |
| `externalIdentifiers` | `array` | No | Array of `{ source: string, id: string }`. Duplicates of existing games return 409. |
| `classification` | `string` | No | `GAME`, `DLC`, `EXPANSION`, etc. Default: `UNKNOWN` |
| `completeness` | `string` | No | `NOT_FOUND`, `FOUND_PARTIAL`, `FOUND_SUFFICIENT`, `FOUND_COMPLETE`. Default: `FOUND_PARTIAL` |

**Response** (201): Created game object.

### `PATCH /api/v1/admin/games/:id`

Update an existing game. Only supplied fields are updated; unspecified fields are preserved.

**Request body**: Same fields as POST, all optional.

**Response** (200): Updated game object.

**Behavior**: External identifiers are **replaced entirely** when provided (not merged). Send the complete desired state.

### `DELETE /api/v1/admin/games/:id`

Delete a game.

**Response** (204): Empty body.

**Note**: This is a hard delete. There is no undo.

**Errors**:

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid payload, missing titles, invalid enum values |
| 404 | `NOT_FOUND` | Game not found |
| 409 | `CONFLICT` | External identifier already assigned to another game |

---

# Quick Reference

```bash
# Health
curl "http://localhost:3000/health"

# List games (first page, 20 results)
curl "http://localhost:3000/api/v1/games"

# List games with filters
curl "http://localhost:3000/api/v1/games?platform=Nintendo%20Switch&genre=Adventure&classification=GAME"

# List games with multiple filters (OR within filter, AND across)
curl "http://localhost:3000/api/v1/games?platform=Nintendo%20Switch,PlayStation%205&genre=RPG"

# List games by release year range
curl "http://localhost:3000/api/v1/games?releaseYearFrom=2017&releaseYearTo=2023&sort=releaseDate&order=asc"

# Search games
curl "http://localhost:3000/api/v1/games/search?q=Doom"

# Get single game (replace GAME_ID with real ID from catalog)
curl "http://localhost:3000/api/v1/games/GAME_ID"

# Cover search
curl "http://localhost:3000/api/v1/covers/search?q=Doom%20Eternal&type=cover&limit=3"

# Game cover (replace GAME_ID with real ID)
curl "http://localhost:3000/api/v1/games/GAME_ID/cover"

# Platform catalog
curl "http://localhost:3000/api/v1/platforms/summary"

# Platforms by company
curl "http://localhost:3000/api/v1/platforms/summary?companyName=Nintendo"

# Single platform (replace PLATFORM_ID)
curl "http://localhost:3000/api/v1/platforms/PLATFORM_ID"

# Catalog sync (dry run)
curl -X POST http://localhost:3000/api/v1/catalog/sync \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["nintendo-switch"],"from":"2025-01-01","to":"2025-12-31","dryRun":true}'
```

---

# Dependencies

| Endpoint | MongoDB | External APIs | Writes |
|----------|---------|---------------|--------|
| `GET /health` | ❌ | ❌ | ❌ |
| `GET /api/v1/games` | ✅ read | ❌ | ❌ |
| `GET /api/v1/games/search` | ✅ read+write | ✅ Wikipedia, Steam (on empty DB) | ✅ persists discovered games |
| `GET /api/v1/games/:id` | ✅ read | ❌ | ❌ |
| `GET /api/v1/covers/search` | ❌ | ✅ Wikipedia, Steam | ❌ |
| `GET /api/v1/games/:id/cover` | ✅ read+write | ✅ Wikipedia, Steam | ✅ persists cover |
| `GET /api/v1/platforms/summary` | ✅ read | ❌ | ❌ |
| `GET /api/v1/platforms/:platformId` | ✅ read | ❌ | ❌ |
| `POST /api/v1/catalog/sync` | ✅ read+write | ✅ Wikipedia, Steam, IGDB | ✅ persists discovered games |

**External source adapters**:

- `WikipediaAdapter` — queries `en.wikipedia.org/w/api.php` for page images
- `SteamAdapter` — queries `store.steampowered.com/api` for header capsules

---

# Error Responses

All error responses follow a consistent structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "requestId": "abc-123"
  }
}
```

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid request data (Zod validation failure) |
| 404 | `NOT_FOUND` | Resource not found |
| 500 | `PERSISTENCE_ERROR` | MongoDB connection or query failure |
| 500 | `INTERNAL_ERROR` | Unexpected failure |
| 502 | `SOURCE_ERROR` | External source failure |
| 502 | `AI_ERROR` | AI provider failure |

---

# Middleware

The following middleware is applied to all requests (in order):

1. **Body Parser** — `express.json()` (100kb limit)
2. **Request ID** — Generates unique ID, sets `X-Request-Id` header
3. **Request Logger** — Logs method, path, status, duration
4. **Request Timeout** — 30s timeout (configurable)
5. **Rate Limiter** — 100 requests per 60s window (configurable)
6. **Error Handler** — Translates errors to consistent JSON responses

---

# High-Level Architecture

```text
                    ATP API
                       │
                       ▼
                 Application
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
      Domain                    AI Boundary
          │                         │
          └────────────┬────────────┘
                       ▼
                 Infrastructure
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Database     Sources      AI Providers
```

---

# AI Architecture

AI is capability-oriented rather than provider-oriented.

Possible capabilities include:

```text
GameClassifier
IdentityResolver
ConflictResolver
MetadataNormalizer
```

Providers are infrastructure implementations.

The domain must not depend on a specific provider.

---

# Development

Read the following before making architectural changes:

```text
AGENTS.md
engineering-rules.md
```

Then consult the relevant documents under:

```text
docs/
```

---

# Documentation

Architecture:

```text
docs/architecture.md
```

Domain:

```text
docs/domain-model.md
```

Discovery:

```text
docs/discovery.md
```

Classification:

```text
docs/classification.md
```

Identity:

```text
docs/identity-resolution.md
```

Sources:

```text
docs/sources.md
```

Persistence:

```text
docs/persistence.md
```

AI:

```text
docs/ai.md
```

API:

```text
docs/api.md
```

Roadmap:

```text
docs/roadmap.md
```

---

# Project Philosophy

ATP is not a scraper wrapped in an API.

It is a **knowledge engine**.

Scraping is only one mechanism used to acquire evidence.

The long-term goal is:

```text
External World
      ↓
Evidence
      ↓
Interpretation
      ↓
Identity
      ↓
Canonical Knowledge
      ↓
Persistent Catalog
```

The catalog should become increasingly useful as knowledge accumulates.

---

# Final Principle

ATP should remain useful without:

- a specific external source;
- a specific AI provider;
- a specific LLM;
- a specific consuming application.

The core of ATP is its domain and deterministic processing.

AI exists to make that core better at handling ambiguity.
