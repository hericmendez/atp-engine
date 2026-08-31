# ATP Engine — Cover Engine

## 1. Purpose

The Cover Engine is a dedicated subsystem for discovering, validating, ranking, and persisting cover images for games in the ATP catalog.

It supports two distinct modes:

1. **Query-based Cover Discovery** — search by arbitrary terms, no Game required
2. **Game-based Cover Discovery** — discover covers for an existing canonical Game

Both modes share the same infrastructure: multi-source discovery → validation → deduplication → relevance-aware deterministic ranking.

---

## 2. Architecture

```text
                        ┌─────────────────────────┐
                        │   HTTP / API Layer       │
                        │                          │
                        │  GET /covers/search?q=...│
                        │  GET /games/:id/cover    │
                        └──────────┬──────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │     CoverService         │
                        │                          │
                        │  searchCovers(query)      │
                        │  getGameCover(gameId)     │
                        └──────────┬──────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │      CoverEngine         │
                        │                          │
                        │  searchCovers(query)  ◄──── primary method
                        │  discoverCovers(game)  ◄──── delegates to searchCovers
                        └──────────┬──────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
             ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼─────┐
             │ Wikipedia   │ │   Steam    │ │ future   │
             │  Adapter    │ │  Adapter   │ │ sources  │
             └─────────────┘ └────────────┘ └──────────┘
```

---

## 3. Two Modes

### Query-based Cover Discovery

```ts
await coverEngine.searchCovers("Doom Eternal")
```

- Searches all sources with `searchCovers: true`
- No Game required
- Returns `CoverResult` with `gameId: null`
- Does NOT persist results
- Suitable for: cover search UI, pre-game-creation cover selection

### Game-based Cover Discovery

```ts
await coverEngine.discoverCovers("game-1", "Doom Eternal")
```

- Delegates to `searchCovers(query)`
- Sets `gameId` on the result
- Used by `CoverService.getGameCover()` which handles persistence
- Suitable for: enriching an existing Game with a cover

---

## 4. Domain Types

### Origin

All cover results include an `origin` field indicating the data source:

| Value | Meaning |
|-------|---------|
| `"scraper"` | Result came from external source discovery (Wikipedia, Steam, etc.) |

Cover search is **always scraper-origin**. There is no persisted cover database — results are always freshly discovered from external sources at request time.

### CoverType

```typescript
const CoverType = {
  FRONT_COVER: 'front_cover',
  BOX_ART: 'box_art',
  POSTER: 'poster',
  KEY_ART: 'key_art',
  SCREENSHOT: 'screenshot',
  LOGO: 'logo',
  UNKNOWN: 'unknown',
} as const;
```

### CoverSearchType

```typescript
const CoverSearchType = {
  COVER: 'cover',
  LOGO: 'logo',
  ALL: 'all',
} as const;
```

`CoverSearchType` is a **filter** that controls which `CoverType` values are eligible for ranking and selection. It does not classify candidates — it filters them.

| Search Type | Accepted CoverTypes |
|-------------|---------------------|
| `cover` | front_cover, box_art, poster, key_art, unknown |
| `logo` | logo |
| `all` | all types |

`UNKNOWN` is included in `cover` searches because it may represent a valid cover whose type could not be inferred from the URL alone.

### CoverResult

```typescript
interface CoverResult {
  query: string;           // the search query used
  gameId: string | null;   // null for query-based, set for game-based
  type: CoverSearchType;   // the search type filter applied
  limit: number;           // the max candidates returned
  selected: Cover | null;
  candidates: readonly RankedCoverCandidate[];
  errors: readonly CoverSourceError[];
}
```

All `Cover` and `RankedCoverCandidate` objects include an `origin: "scraper"` field, since cover results are always sourced from external providers.

### CoverRankingBreakdown

```typescript
interface CoverRankingBreakdown {
  relevanceScore: number;   // how well the candidate matches the query
  sourceScore: number;      // source reliability
  typeScore: number;        // cover type appropriateness
  qualityScore: number;     // image resolution
  aspectRatioScore: number; // deviation from ideal 2:3 ratio
  totalScore: number;       // weighted sum
}
```

---

## 5. Ranking

### Weights

| Factor | Weight | Description |
|--------|--------|-------------|
| Relevance | 0.35 | Query-title match quality |
| Source reliability | 0.25 | Steam (0.9), Wikipedia (0.8), other (0.5) |
| Cover type | 0.25 | front_cover (1.0), box_art (0.95), etc. |
| Quality (resolution) | 0.08 | Based on pixel count |
| Aspect ratio | 0.07 | Deviation from ideal 2:3 |

### Relevance Scoring

| Match Type | Score |
|------------|-------|
| Exact match | 1.0 |
| Title starts with query | 0.9 |
| Query starts with title | 0.85 |
| All query words found in title | 0.8 |
| Partial word matches | 0.5–0.7 |
| Substring containment | 0.6 |
| No match | 0.3 |
| No title available | 0.3 |

### Determinism

Ranking is fully deterministic:
- Same input always produces same output
- Tie-breaking: relevance → type → source → URL lexicographic

---

## 6. Validation

### URL Validation

- Non-empty
- Starts with `http://` or `https://`
- Passes `new URL()` construction

### Candidate Validation

- Valid URL
- Non-empty source
- Non-empty sourceId

### Query Validation

- Required, non-empty
- Max 200 characters
- Trimmed of whitespace

---

## 7. Deduplication

Two mechanisms:

1. **Source:SourceId** — same source and external ID = same candidate
2. **Normalized URL** — lowercased, trailing slashes stripped

First candidate in input order wins.

---

## 8. Failure Isolation

`Promise.allSettled` queries all sources in parallel.

- One source failure does not block others
- Errors collected in `CoverResult.errors`
- Sources without `searchCovers` silently skipped
- Partial success is valid

---

## 9. Source Integration

### Wikipedia

Query flow:
```text
query
  → MediaWiki search API (list=search)
  → page IDs
  → pageimages API (prop=pageimages, pithumbsize=600)
  → CoverCandidate[] with coverUrls
```

Uses only official MediaWiki APIs. No HTML scraping.

### Steam

Query flow:
```text
query
  → App list (cached)
  → Name matching
  → appdetails API per match
  → CoverCandidate[] with header_image, capsule_image
```

**Limitation**: Steam's search is name-based, not cover-based. The app list must be fetched and filtered client-side. Results depend on the completeness of the app list cache.

---

## 10. Persistence

- **Query-based search** does NOT persist. It is a discovery operation.
- **Game-based discovery** persists the selected cover on `Game.cover`.
- `CoverCandidate` ≠ `Canonical Game.cover`
- A cover becomes canonical only when explicitly persisted to a Game.

---

## 11. Identity Boundary

The Cover Engine does NOT:

- Create Games
- Merge Games
- Resolve identity
- Alter classification

Searching for `"Doom"` and finding an image does NOT mean we found the canonical Game.

Identity Resolution is Phase 6 responsibility.

---

## 12. API

### GET /api/v1/covers/search?q=...

Independent cover search. No Game required.

**Query Parameters**:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `q` | yes | — | Search query (1–200 chars, trimmed) |
| `type` | no | `cover` | `cover`, `logo`, or `all` |
| `limit` | no | `1` | Number of candidates to return (1–9) |
| `source` | no | — | Filter to specific source |

**Type Semantics**:

- `type=cover` — Returns front_cover, box_art, poster, key_art, and unknown candidates. Excludes logos and screenshots.
- `type=logo` — Returns only logo candidates. Excludes all other types.
- `type=all` — Returns all valid candidates regardless of type.

**Limit Semantics**:

- `limit` is applied **after** ranking. It returns the N highest-ranked candidates.
- `limit=3` means "give me the 3 best matching candidates," not "give me the first 3 candidates returned by sources."

**Response**:

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
        "ranking": { "..." }
      }
    ],
    "errors": []
  }
}
```

**Behavior**:

- Queries all sources with `searchCovers` capability.
- Sources without `searchCovers` are silently skipped.
- Failed sources are isolated — partial success is valid.
- Returns 200 with `selected: null` when no covers found (not an error).
- Does NOT persist results. This is a discovery operation.
- Filter is applied before ranking. Limit is applied after ranking.

### GET /api/v1/games/:id/cover

Cover for an existing Game. Persists selection.

**Response**:
```json
{
  "data": {
    "gameId": "game-1",
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

---

## 13. Invariants

1. **Cover ≠ Identity** — covers do not affect game identity resolution
2. **Cover ≠ Screenshot** — `CoverType` enum distinguishes them
3. **No-cover is not an error** — HTTP 200 with `selected: null`
4. **Deterministic ranking** — same input → same output
5. **Failure isolation** — one source failure does not block others
6. **Source silently skipped** — sources without `searchCovers` are ignored
7. **Query-based search is stateless** — no persistence, no Game required
8. **Game-based discovery persists** — via `CoverService.getGameCover()`
9. **CoverCandidate ≠ Canonical Cover** — only persisted covers are canonical
10. **Cover Engine does not create/merge Games** — identity is separate
11. **Cover results are always scraper-origin** — `origin: "scraper"` on all cover objects
