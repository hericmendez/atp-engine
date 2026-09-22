# Legacy vs ATP Engine — Comparative Audit Report

> **Generated**: 2026-09-02
> **Scope**: Full comparison of Legacy Game Scraper / Cover Search vs ATP Engine Discovery / Cover Architecture
> **Goal**: Identify lost domain invariants, diagnose root causes of real-case failures, and propose recovery strategy

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Legacy Architecture](#2-legacy-architecture)
3. [Legacy Game Discovery — Detailed](#3-legacy-game-discovery)
4. [Legacy Cover Search — Detailed](#4-legacy-cover-search)
5. [ATP Architecture](#5-atp-architecture)
6. [ATP Discovery — Detailed](#6-atp-discovery)
7. [ATP Cover Engine — Detailed](#7-atp-cover-engine)
8. [Comparative Responsibility Matrix](#8-comparative-responsibility-matrix)
9. [Lost Domain Invariants](#9-lost-domain-invariants)
10. [Discovery Diagnosis](#10-discovery-diagnosis)
11. [Cover Discovery Diagnosis](#11-cover-discovery-diagnosis)
12. [CatalogEligibility Assessment](#12-catalogeligibility-assessment)
13. [AssetEligibility Assessment](#13-asseteligibility-assessment)
14. [Wikipedia Adapter Assessment](#14-wikipedia-adapter-assessment)
15. [Ranking Assessment](#15-ranking-assessment)
16. [Rate Limiting and Cost](#16-rate-limiting-and-cost)
17. [Real-Case Analysis](#17-real-case-analysis)
18. [Preserve / Adapt / Replace / Discard](#18-preserve-adapt-replace-discard)
19. [Architectural Delta](#19-architectural-delta)
20. [Implementation Sequence](#20-implementation-sequence)
21. [Required Regression Tests](#21-required-regression-tests)
22. [Risks](#22-risks)
23. [Open Questions](#23-open-questions)
24. [Feature Freeze Compliance](#24-feature-freeze-compliance)
25. [Quality Gates](#25-quality-gates)
26. [Conclusion](#26-conclusion)
27. [Appendix — File Reference](#27-appendix)

---

## 1. Executive Summary

### The Core Problem

The ATP Engine attempted to replace two **specialized subsystems** — Game Scraper and Cover Search — with a **generic Entity Discovery and Image Extraction** architecture. In doing so, five critical domain invariants were lost:

| # | Lost Invariant | Impact |
|---|---------------|--------|
| 1 | Page-level game validation | False positives (non-games enter catalog) |
| 2 | Query expansion for game context | Low recall for ambiguous queries |
| 3 | Cheap semantic filtering | Expensive operations wasted on non-game entities |
| 4 | Cover semantic validation | Unrelated images returned as covers |
| 5 | Source consensus ranking | Weaker ranking accuracy |

These invariants are **not artifacts of legacy code** — they encode **domain knowledge** about how to distinguish games from non-games in noisy search results.

### Verdict

**NOT READY FOR IMPLEMENTATION** — 3 architectural questions require resolution before any code changes.

---

## 2. Legacy Architecture

### 2.1 Directory Structure

```
legacy/
├── src/
│   ├── app/api/scraper/
│   │   ├── game-search/route.ts        # Game search API endpoint
│   │   └── cover-search/route.ts       # Cover search API endpoint
│   └── lib/scrapers/
│       ├── core/
│       │   ├── engine.ts               # Game search pipeline orchestrator
│       │   ├── ranker.ts               # Result ranking (title sim + metadata + consensus)
│       │   ├── dedupe.ts               # Deduplication (normalize + containment)
│       │   ├── registry.ts             # Source registry
│       │   └── types.ts                # Core types
│       ├── query/
│       │   ├── builder.ts              # Query construction
│       │   └── match.ts                # Query matching
│       ├── sources/
│       │   ├── wikipedia/
│       │   │   ├── index.ts
│       │   │   ├── search.ts           # Wikipedia search (query expansion + cheap filter)
│       │   │   ├── scraper.ts          # Page-level validation (scoreGameSignals)
│       │   │   ├── fetch-page.ts       # HTML fetch
│       │   │   ├── parse-infobox.ts    # Infobox extraction
│       │   │   └── parse-summary.ts    # Summary extraction
│       │   └── steam/
│       │       ├── index.ts
│       │       ├── search.ts           # Steam search (blacklist: soundtrack, dlc, bundle)
│       │       └── scraper.ts          # Steam detail scraping
│       └── cover-search/
│           ├── index.ts                # Cover search orchestration
│           ├── ranker.ts               # Cover ranking (exact match, year, disambiguation penalty)
│           ├── types.ts                # Cover-specific types
│           ├── client.ts               # Cover HTTP client
│           └── providers/
│               └── wikipedia-provider.ts  # Wikipedia cover provider (semantic validation)
```

### 2.2 Pipeline Summary

**Game Search:**
```
Query → Source Search (Wikipedia: "${query} video game", Steam: exact)
      → Dedupe (normalize + containment check)
      → Rank (title similarity ≥ 0.5, metadata score, source weight, consensus)
      → Validate (Wikipedia page: scoreGameSignals ≥ 2 of {dev,pub,genre,platform,date})
      → Enrich (extract metadata from validated page)
      → Output
```

**Cover Search:**
```
Query → Wikipedia Cover Provider.search(query)
      → Title token validation (tokens must appear in result title)
      → Semantic blacklist (soundtrack, album, awards, ceremony, poster, film)
      → Fetch page HTML
      → Require .infobox presence
      → Require game evidence (developer, publisher, OR platform in infobox)
      → Extract infobox image URL
      → Rank (exact match, year bonus, VR penalty, disambiguation penalty)
      → Output
```

---

## 3. Legacy Game Discovery

### 3.1 Query Expansion

**File**: `legacy/src/lib/scrapers/sources/wikipedia/search.ts`

```typescript
// Wikipedia search appends "video game" to bias results toward game pages
const searchQuery = `${query} video game`;
```

**Effect**: Searching "Zelda" produces results about Zelda video games, not Zelda Fitzgerald or The Legend of Zelda franchise overview pages.

**ATP Equivalent**: None. ATP passes the raw query to `WikipediaAdapter.search()`.

### 3.2 Cheap Semantic Filtering

**File**: `legacy/src/lib/scrapers/sources/wikipedia/search.ts`

```typescript
function isLikelyGame(title: string): boolean {
  const t = title.toLowerCase();
  if (/\b(list of|disambiguation)\b/.test(t)) return false;
  if (/\((band|film|album|song|novel)\)/i.test(t)) return false;
  if (/video games in\b/.test(t)) return false;
  if (/\b(history of|company|publisher)\b/.test(t)) return false;
  return true;
}
```

**Effect**: Before any expensive page fetch, results about "List of Zelda games", "Zelda (film)", "Zelda (band)" are discarded.

**ATP Equivalent**: None.

### 3.3 Page-Level Game Validation

**File**: `legacy/src/lib/scrapers/sources/wikipedia/scraper.ts`

```typescript
function scoreGameSignals(infobox: ParsedInfobox): number {
  let score = 0;
  if (infobox.developer) score++;
  if (infobox.publisher) score++;
  if (infobox.genre) score++;
  if (infobox.platforms?.length) score++;
  if (infobox.release_date) score++;
  return score;
}

function isGamePage(infobox: ParsedInfobox): boolean {
  return scoreGameSignals(infobox) >= 2;
}
```

**Effect**: Even if a Wikipedia page appears in search results, it is only accepted if the page itself contains at least 2 structured game signals in its infobox. This catches:
- Film pages that mention video games
- Book pages about video games
- Overview/franchise pages without specific game data
- Disambiguation pages that survived cheap filtering

**ATP Equivalent**: None. The `DeterministicClassifier` examines title/description/genre/hints text patterns, but never fetches and validates the Wikipedia page content itself.

### 3.4 Metadata Enrichment from Validated Page

**File**: `legacy/src/lib/scrapers/sources/wikipedia/scraper.ts`

After `isGamePage()` passes, the scraper extracts:
- `developer` from infobox
- `publisher` from infobox
- `genre` from infobox
- `platforms` from infobox
- `release_date` from infobox
- `description` from first paragraph
- `image_url` from infobox image

**Effect**: The output is enriched with structured metadata extracted from a validated game page.

**ATP Equivalent**: `WikipediaAdapter.getById()` does extract infobox data, but only after the candidate has already passed through classification and aggregation. The classification decision is made on the **search result metadata** (title + description snippet), not the **full page content**.

### 3.5 Ranking

**File**: `legacy/src/lib/scrapers/core/ranker.ts`

```typescript
// Title similarity ≥ 0.5 required
const titleSim = similarity(result.title, query);
if (titleSim < 0.5) continue;

// Metadata completeness score
const metadataScore = computeMetadataScore(result);

// Source weight (Wikipedia = 1.0, Steam = 1.2)
const sourceWeight = getSourceWeight(result.source);

// Consensus bonus (multiple sources confirming same result)
const consensusBonus = computeConsensus(result, allResults);

// Final score
result.score = titleSim * 0.4 + metadataScore * 0.3 + sourceWeight * 0.2 + consensusBonus * 0.1;
```

**ATP Equivalent**: `DiscoveryAggregation.computeRankScore()` uses identity confidence, metadata completeness, and recency. No title similarity threshold. No explicit consensus bonus (though UnionFind implicitly groups by external ID).

---

## 4. Legacy Cover Search

### 4.1 Separate Subsystem

Legacy Cover Search is a **completely separate subsystem** from Game Search:

- Separate API route (`/api/scraper/cover-search`)
- Separate orchestration (`cover-search/index.ts`)
- Separate provider (`wikipedia-provider.ts`)
- Separate ranking (`cover-search/ranker.ts`)
- Separate types (`cover-search/types.ts`)

**ATP Equivalent**: Covers are searched via `CoverEngine.searchCovers()` which uses the **same** `WikipediaAdapter` as game discovery, calling `searchCovers()` which internally calls `MediaWiki search`. There is no separate cover-specific provider or validation pipeline.

### 4.2 Wikipedia Cover Provider Validation

**File**: `legacy/src/lib/scrapers/cover-search/providers/wikipedia-provider.ts`

The legacy provider performs a **multi-step validation** before accepting an image:

**Step 1 — Title Token Validation:**
```typescript
const queryTokens = tokenize(query);
const titleTokens = tokenize(result.title);
const hasTokenMatch = queryTokens.some(t => titleTokens.includes(t));
if (!hasTokenMatch) continue;
```
Ensures the search result is **topically related** to the query.

**Step 2 — Semantic Blacklist:**
```typescript
const blacklist = ['soundtrack', 'album', 'awards', 'ceremony', 'poster', 'film'];
if (blacklist.some(word => result.title.toLowerCase().includes(word))) continue;
```
Rejects results that are clearly not game covers.

**Step 3 — Infobox Presence:**
```typescript
const page = await fetchPage(result.pageid);
const infobox = parseInfobox(page.wikitext);
if (!infobox) continue;
```
Requires the page to have a structured infobox.

**Step 4 — Game Evidence:**
```typescript
if (!infobox.developer && !infobox.publisher && !infobox.platforms?.length) continue;
```
Requires at least one game-specific signal in the infobox.

**Step 5 — Image Extraction:**
```typescript
const imageUrl = infobox.image || infobox.image_url;
if (!imageUrl) continue;
```
Extracts the image specifically from the **validated infobox**, not from page thumbnails or search results.

### 4.3 Cover Ranking

**File**: `legacy/src/lib/scrapers/cover-search/ranker.ts`

```typescript
// Exact title match bonus
if (normalizeTitle(result.title) === normalizeTitle(query)) score += 0.5;

// Video game keyword bonus
if (result.title.toLowerCase().includes('video game')) score += 0.2;

// Year recency bonus
const year = extractYear(result.title);
if (year) score += Math.min(0.3, (2024 - year) / 100);

// VR penalty (VR game covers are often wrong aspect ratio)
if (result.title.toLowerCase().includes('vr')) score -= 0.3;

// Disambiguation penalty
if (result.title.includes('(disambiguation)')) score -= 1.0;
```

### 4.4 Key Difference from ATP

The legacy cover system validates **semantic appropriateness** before extracting images. ATP's cover system extracts images from **any Wikipedia search result** that has a thumbnail, then applies dedup and type filtering. The legacy system is more conservative but produces more reliable results.

---

## 5. ATP Architecture

### 5.1 Directory Structure

```
src/
├── application/
│   └── catalog-service.ts          # Orchestrates discovery → eligibility → persistence
├── discovery/
│   ├── discovery-engine.ts         # Multi-source discovery orchestrator
│   ├── aggregation.ts              # UnionFind, identity resolution, ranking
│   └── discovery-types.ts          # Discovery types
├── classification/
│   ├── deterministic-classifier.ts # Text-pattern classifier
│   ├── classification-result.ts    # ClassificationResult type
│   └── classification-signal.ts    # ClassificationSignal type
├── identity/
│   ├── deterministic-identity-resolver.ts  # Identity resolver
│   └── identity-resolution-result.ts       # IdentityResult type
├── cover/
│   ├── cover-engine.ts             # Cover search orchestrator
│   ├── cover-rank.ts               # Cover ranking
│   └── cover-validate.ts           # Cover validation
├── eligibility/
│   ├── catalog-eligibility.ts      # Catalog eligibility policy
│   └── asset-eligibility.ts        # Asset eligibility policy
├── sources/
│   ├── source-adapter.ts           # SourceAdapter interface
│   ├── source-registry.ts          # Central adapter registry
│   ├── base-adapter.ts             # BaseAdapter (HTTP, timeout, errors)
│   ├── source-errors.ts            # SourceError types
│   ├── raw-candidate.ts            # RawCandidate type
│   ├── wikipedia/
│   │   └── wikipedia-adapter.ts    # MediaWiki API adapter
│   └── steam/
│       └── steam-adapter.ts        # Steam Store API adapter
├── normalization/
│   ├── normalize.ts                # normalizeCandidate()
│   └── normalized-candidate.ts     # NormalizedCandidate type
└── index.ts                        # Barrel exports
```

### 5.2 Pipeline Summary

**Discovery:**
```
Query → DiscoveryEngine.discover(query)
      → For each source: adapter.search(query)
      → For each result: adapter.getById(externalId)
      → normalizeCandidate(raw)
      → classify(normalized) → ClassificationResult
      → aggregate(results) → UnionFind → identity resolution → ranking
      → catalogEligibility(game) → ELIGIBLE | INELIGIBLE | DEFERRED
      → persist
```

**Cover Search:**
```
searchCovers(queries, game)
→ For each source: adapter.searchCovers(query)
→ Dedup (source + normalizedUrl)
→ assetEligibility(cover, game) → ELIGIBLE | INELIGIBLE | DEFERRED
→ filterByType(GAME)
→ coverRank(covers) → sorted by score
→ output
```

---

## 6. ATP Discovery — Detailed

### 6.1 DiscoveryEngine

**File**: `src/discovery/discovery-engine.ts`

The `DiscoveryEngine` orchestrates multi-source discovery:
1. Iterates over all registered source adapters
2. Calls `adapter.search(query)` for each
3. Calls `adapter.getById(externalId)` for each search result
4. Returns `RawCandidate[]` with source metadata

**Key observation**: The engine is **source-agnostic**. It does not know or care whether the query is for a game, a movie, or a person. This is by design (ATP is an "entity discovery engine"), but it means there is no game-specific query optimization.

### 6.2 DeterministicClassifier

**File**: `src/classification/deterministic-classifier.ts`

The classifier examines:
- **Title patterns**: "soundtrack", "dlc", "expansion", "movie", "film", etc.
- **Description keywords**: "video game", "playable", "gameplay", "soundtrack", "movie", etc.
- **Genre indicators**: action, adventure, rpg, strategy, etc.
- **Source hints**: From adapter-provided `classificationHints`

**Critical gap**: The classifier has **positive game signals** (description says "video game" → GAME) but **no negative signals** for non-game entities. A person page with no game-related text in title or description returns:
```
UNKNOWN, confidence: 0.0
```

This is correct per ATP's classification design (`UNKNOWN` = insufficient evidence), but it means the classifier **cannot reject** non-game entities at the classification stage. Rejection must happen downstream (eligibility, aggregation ranking).

### 6.3 WikipediaAdapter

**File**: `src/sources/wikipedia/wikipedia-adapter.ts`

**search()**: Calls MediaWiki `action=query&list=search` with the raw query. No query expansion. No game-specific filtering.

**getById()**: Calls MediaWiki `action=parse` to get full page content, then:
- Extracts infobox data (developer, publisher, genre, platforms, release date)
- Generates classification hints from wikitext (e.g., "video game" presence)
- Returns `RawCandidate` with structured metadata

**searchCovers()**: Calls MediaWiki `action=query&list=search` then `action=query&prop=imageinfo` to get thumbnail URLs. No semantic validation.

### 6.4 Aggregation

**File**: `src/discovery/aggregation.ts`

The aggregation module:
1. Groups candidates by external ID using UnionFind
2. Resolves identity (which candidates represent the same entity)
3. Ranks resolved entities by `computeRankScore()`

`computeRankScore()` considers:
- Identity confidence (how strongly candidates agree on identity)
- Metadata completeness (how many fields are filled)
- Recency (newer games ranked higher)

**Missing from legacy**: Title similarity score, source consensus bonus, source weight differentiation.

---

## 7. ATP Cover Engine — Detailed

### 7.1 CoverEngine

**File**: `src/cover/cover-engine.ts`

```typescript
async searchCovers(queries: string[], game: Game | null): Promise<CoverCandidate[]> {
  const allCovers: CoverCandidate[] = [];
  for (const source of this.sources) {
    const covers = await source.searchCovers(queries);
    allCovers.push(...covers);
  }
  // Dedup
  const deduped = dedupCovers(allCovers);
  // Asset eligibility
  const eligible = deduped.filter(c => assetEligibility(c, game) === 'ELIGIBLE');
  // Type filter
  const typed = eligible.filter(c => c.type === 'GAME');
  // Rank
  const ranked = coverRank(typed);
  return ranked;
}
```

### 7.2 Asset Eligibility

**File**: `src/eligibility/asset-eligibility.ts`

The asset eligibility check verifies:
- Cover has a valid URL
- Cover source is valid
- For game covers: game entity is associated (when `game !== null`)
- For game covers: URL is not obviously unrelated

**Key difference from legacy**: Legacy validated that the **Wikipedia page** containing the image was a game page (infobox + game evidence). ATP validates that the **cover URL** is valid and the game entity is associated, but does not validate the **source page** of the image.

### 7.3 Cover Rank

**File**: `src/cover/cover-rank.ts`

```typescript
function computeCoverScore(cover: CoverCandidate): number {
  let score = 0;
  score += SOURCE_RELIABILITY[cover.source] || 0.5;
  score += TYPE_SCORES[cover.type] || 0.0;
  if (cover.quality) score += cover.quality * 0.3;
  if (cover.aspectRatio) score += aspectRatioScore(cover.aspectRatio) * 0.2;
  return score;
}
```

**Missing from legacy**: Exact title match bonus, "video game" keyword bonus, year recency bonus, VR penalty, disambiguation penalty.

---

## 8. Comparative Responsibility Matrix

| Responsibility | Legacy | ATP | Delta |
|---------------|--------|-----|-------|
| **Query construction** | `query + " video game"` | raw `query` | ⚠️ Lost |
| **Cheap semantic filtering** | `isLikelyGame()` blacklist | None | ⚠️ Lost |
| **Source-specific search** | Wikipedia: game-biased query, Steam: exact match | Both: raw query | ⚠️ Lost (Wikipedia) |
| **Page-level game validation** | `scoreGameSignals()` ≥ 2 | None | 🔴 Lost |
| **Classification** | Implicit (page validation) | Explicit `DeterministicClassifier` | ✅ Gained |
| **Identity resolution** | Implicit (dedupe + containment) | Explicit `IdentityResolver` | ✅ Gained |
| **Multi-source aggregation** | Manual (concatenate + dedupe) | `UnionFind` + ranking | ✅ Gained |
| **Cover: page validation** | Infobox + game evidence required | None | 🔴 Lost |
| **Cover: title token match** | Required | None | ⚠️ Lost |
| **Cover: semantic blacklist** | Soundtrack, album, awards, etc. | None | ⚠️ Lost |
| **Cover: image from infobox** | Yes (structured extraction) | Thumbnail from MediaWiki API | ⚠️ Different |
| **Cover: exact match ranking** | Yes (+ 0.5 score) | None | ⚠️ Lost |
| **Cover: year/recency bonus** | Yes | None | ⚠️ Lost |
| **Cover: disambiguation penalty** | Yes (- 1.0 score) | None | ⚠️ Lost |
| **Cover: VR penalty** | Yes (- 0.3 score) | None | ⚠️ Lost |
| **Title similarity threshold** | ≥ 0.5 required | None | ⚠️ Lost |
| **Source consensus ranking** | Explicit bonus | Implicit (UnionFind) | ⚠️ Weaker |
| **Metadata enrichment** | After page validation | After classification | ✅ Preserved |
| **Catalog eligibility gate** | None | `CatalogEligibility` | ✅ Gained |
| **Asset eligibility gate** | None | `AssetEligibility` | ✅ Gained |
| **Deterministic-first** | Yes | Yes | ✅ Preserved |
| **AI-optional** | N/A (no AI) | Yes | ✅ Gained |

### Legend
- ✅ Gained — New capability in ATP
- ⚠️ Lost/Different — Legacy capability missing or changed in ATP
- 🔴 Lost — Critical capability missing, causing real failures

---

## 9. Lost Domain Invariants

### Invariant 1: Game Page Must Have Structured Game Evidence

**Legacy**: `scoreGameSignals(infobox) >= 2` — a Wikipedia page is only accepted as a game if it has at least 2 of {developer, publisher, genre, platform, release_date} in its infobox.

**ATP**: No equivalent. The classifier examines text patterns in title/description but never validates the page itself.

**Impact**: Non-game pages (films, books, people, events) that happen to appear in search results are not rejected.

### Invariant 2: Queries Must Be Biased Toward Game Context

**Legacy**: `${query} video game` — Wikipedia search returns game-related results.

**ATP**: Raw `query` — Wikipedia returns all entities matching the query.

**Impact**: Ambiguous queries (e.g., "Zelda", "Doom", "Halo") return non-game results (people, films, events).

### Invariant 3: Non-Game Results Must Be Cheaply Filtered

**Legacy**: `isLikelyGame()` blacklist rejects "list of", "disambiguation", "(band)", "(film)", etc. before any expensive page fetch.

**ATP**: No filtering. All search results proceed to classification and normalization.

**Impact**: Expensive operations (HTTP fetch, normalize, classify) are wasted on obviously non-game entities.

### Invariant 4: Cover Images Must Come From Semantically Validated Pages

**Legacy**: Cover provider fetches the Wikipedia page, validates infobox presence, validates game evidence, then extracts the image from the infobox.

**ATP**: Cover engine extracts thumbnail URLs from MediaWiki search results. No page-level validation.

**Impact**: Images from film pages, soundtrack pages, award pages, etc. may be returned as game covers.

### Invariant 5: Cover Search Results Must Match Query Tokens

**Legacy**: Cover provider validates that at least one query token appears in the result title.

**ATP**: No token matching. Any search result with a thumbnail is accepted.

**Impact**: Unrelated results with similar titles but different topics may be returned.

### Invariant 6: Title Similarity Must Exceed Minimum Threshold

**Legacy**: `similarity(result.title, query) >= 0.5` — results with low title similarity are discarded.

**ATP**: No minimum similarity threshold.

**Impact**: Loosely related results may rank highly.

### Invariant 7: Source Consensus Must Boost Ranking

**Legacy**: Results confirmed by multiple sources receive a ranking bonus.

**ATP**: UnionFind groups by external ID but does not explicitly boost ranking for multi-source confirmation.

**Impact**: Weaker ranking for results that are confirmed by multiple sources.

---

## 10. Discovery Diagnosis

### 10.1 Why False Positives Occur

**Root cause**: The ATP classifier can only produce **positive signals** (evidence that something IS a game). It cannot produce **negative signals** (evidence that something IS NOT a game).

When a non-game entity (e.g., "Barry Gjerde") is searched:
1. Wikipedia returns the person's page
2. The page has no game-related text in title or description
3. Classification returns `UNKNOWN` with confidence 0.0
4. `CatalogEligibility` checks: classification is UNKNOWN, identity confidence is 0.0, source count is 1
5. With `identityConfidence: 0.0 < 0.7` AND `sourceCount: 1 < 2`, eligibility returns `INELIGIBLE`
6. The entity is rejected

**But**: If the same entity appears in a Wikipedia search with a game-related description snippet (e.g., "Barry Gjerde is a video game composer"), the classifier may produce a weak GAME signal, and if multiple Wikipedia pages mention this person in game contexts, identity confidence and source count may exceed thresholds.

**The fundamental problem**: The classifier was designed for a world where search results are pre-filtered to be game-related. Without that pre-filtering, the classifier is overwhelmed by non-game entities.

### 10.2 Why Low Recall Occurs

**Root cause**: Without query expansion, Wikipedia search for "Hollow Knight" may return:
- "Hollow Knight" (the game) ✓
- "Hollow Knight: Silksong" (sequel) ✓
- "Team Cherry" (developer) — no game signals → UNKNOWN
- "Hollow Knight (franchise)" — no game signals → UNKNOWN

With query expansion (`"Hollow Knight" video game`), Wikipedia is more likely to return game-specific pages and less likely to return developer or franchise pages.

### 10.3 Why Some Games Return Empty Covers

**Root cause**: The cover engine searches Wikipedia for game titles and extracts thumbnails. If:
- The game has a small Wikipedia page without an infobox image
- The game is primarily known by a different title than the search query
- The MediaWiki API does not return a thumbnail for the page

...then no covers are found. The legacy system had the same limitation for the Wikipedia source, but it could fall back to other providers (e.g., Steam covers). ATP's cover engine searches all registered sources, but if only Wikipedia is registered, it has the same limitation.

---

## 11. Cover Discovery Diagnosis

### 11.1 Why Unrelated Images Appear

**Root cause**: The cover engine searches Wikipedia for game titles and accepts any result with a thumbnail. The legacy system validated:
1. Token matching (query tokens in result title)
2. Semantic blacklist (soundtrack, album, etc.)
3. Infobox presence
4. Game evidence in infobox

ATP has none of these validations. A search for "Doom" might return:
- "Doom (1993 video game)" — correct ✓
- "Doom (film)" — incorrect (has thumbnail) ✗
- "Doom (board game)" — incorrect (has thumbnail) ✗
- "Doom (soundtrack)" — incorrect (has thumbnail) ✗

### 11.2 Why Some Covers Are Missing

**Root cause**: The legacy cover provider extracted images from the **infobox** of validated game pages. This guaranteed the image was the game's primary cover art. ATP extracts **thumbnails** from MediaWiki search results, which may be:
- Page thumbnails (not necessarily cover art)
- Images from the page body (not the infobox)
- Low-resolution thumbnails

Additionally, the legacy system had a **year recency bonus** in cover ranking, which prioritized newer game covers. ATP has no such signal.

---

## 12. CatalogEligibility Assessment

### 12.1 What Was Implemented

`CatalogEligibility` is a pure deterministic policy function with three states:
- `ELIGIBLE` — Candidate may enter catalog
- `INELIGIBLE` — Candidate rejected
- `DEFERRED` — Candidate held for AI review

### 12.2 Current Behavior

```typescript
function catalogEligibility(game: Game, options: EligibilityOptions): EligibilityResult {
  // 1. Check classification
  if (game.classification === 'GAME') return ELIGIBLE;
  if (game.classification === 'INELIGIBLE') return INELIGIBLE;

  // 2. UNKNOWN with identity confidence + source count
  if (game.classification === 'UNKNOWN') {
    if (game.identityConfidence >= 0.7 && game.sourceCount >= 2) return ELIGIBLE;
    if (game.identityConfidence >= 0.5 || game.sourceCount >= 2) return DEFERRED;
    return INELIGIBLE;
  }

  // 3. Non-game categories → INELIGIBLE
  return INELIGIBLE;
}
```

### 12.3 Assessment

**Strengths**:
- Clean, deterministic, testable
- UNKNOWN path correctly requires multiple signals (confidence + source count)
- Non-game categories correctly rejected

**Weaknesses**:
- The UNKNOWN path with `identityConfidence >= 0.7` does NOT check `classificationConfidence` — this is correct (UNKNOWN has no classification confidence) but was initially flagged as a bug during code review
- The `game === null` case (cover search with no game entity) is handled by `AssetEligibility`, not `CatalogEligibility`
- The policy relies on upstream classifier and identity resolver producing reasonable values — if those produce inflated values, the policy cannot compensate

**Verdict**: The implementation is correct. The policy is sound. The problem is upstream (classifier produces UNKNOWN for non-games, which is correct behavior, but the policy should handle this more aggressively).

---

## 13. AssetEligibility Assessment

### 13.1 What Was Implemented

`AssetEligibility` validates covers/images:
- Checks URL validity
- Checks source validity
- For game covers with a game entity: checks association
- For game covers without a game entity (`game === null`): validates URL pattern

### 13.2 Current Behavior

```typescript
function assetEligibility(cover: CoverCandidate, game: Game | null): EligibilityResult {
  // 1. URL validation
  if (!cover.url || !isValidUrl(cover.url)) return INELIGIBLE;

  // 2. Source validation
  if (!cover.source) return INELIGIBLE;

  // 3. Game association (when game entity exists)
  if (game !== null) {
    if (!coverIsAssociated(cover, game)) return INELIGIBLE;
  }

  return ELIGIBLE;
}
```

### 13.3 Assessment

**Strengths**:
- Handles `game === null` case (cover search without game entity)
- Validates URL and source
- Association check prevents unrelated covers

**Weaknesses**:
- No semantic validation of the cover's source page (legacy validated infobox + game evidence)
- No token matching (legacy validated query tokens in result title)
- No blacklist (legacy rejected soundtrack, album, awards, etc.)
- `coverIsAssociated()` checks if the cover URL is "related to" the game, but this is a URL-level check, not a page-level semantic check

**Verdict**: The implementation is correct for what it does, but it is doing **less** than the legacy cover validation. The missing semantic validation is a significant gap.

---

## 14. Wikipedia Adapter Assessment

### 14.1 What Was Implemented

`WikipediaAdapter` implements `SourceAdapter` with:
- `search(query)` — MediaWiki search API
- `getById(externalId)` — MediaWiki parse API with infobox extraction
- `searchCovers(query)` — MediaWiki search + imageinfo API

### 14.2 Assessment

**Strengths**:
- Clean adapter pattern
- Proper error handling via `BaseAdapter`
- Infobox extraction works correctly
- Classification hints generated from wikitext

**Weaknesses**:
- `search()` uses raw query — no game-specific optimization
- `searchCovers()` extracts thumbnails — no semantic validation
- No `isLikelyGame()` filtering
- No query expansion

**Verdict**: The adapter is architecturally sound but functionally incomplete for game-specific use cases. The adapter pattern is correct (source-specific logic in adapter), but the adapter is implementing **generic** Wikipedia access rather than **game-optimized** Wikipedia access.

---

## 15. Ranking Assessment

### 15.1 Discovery Ranking

**Legacy**: `titleSim * 0.4 + metadataScore * 0.3 + sourceWeight * 0.2 + consensusBonus * 0.1`
- Title similarity ≥ 0.5 required
- Source weight: Wikipedia = 1.0, Steam = 1.2
- Consensus bonus: +0.1 per additional source confirming

**ATP**: `identityConfidence * 0.4 + metadataCompleteness * 0.3 + recency * 0.2 + sourceQuality * 0.1`
- No title similarity threshold
- Source quality: generic reliability score
- No explicit consensus bonus

**Missing**: Title similarity threshold (prevents loosely related results from ranking highly), source weight differentiation, explicit consensus bonus.

### 15.2 Cover Ranking

**Legacy**: `exactMatch * 0.5 + videoGameBonus * 0.2 + yearBonus * 0.3 - vrPenalty * 0.3 - disambigPenalty * 1.0`
- Exact title match: +0.5
- "video game" in title: +0.2
- Year recency: up to +0.3
- VR in title: -0.3
- Disambiguation: -1.0

**ATP**: `sourceReliability + typeScore + quality * 0.3 + aspectRatioScore * 0.2`
- Source reliability: generic
- Type score: GAME = higher
- Quality: image quality metric
- Aspect ratio: preferred ratio bonus

**Missing**: Exact title match, video game keyword, year recency, VR penalty, disambiguation penalty.

---

## 16. Rate Limiting and Cost

### 16.1 Legacy

- Wikipedia: 1 request per search + 1 request per page validation + 1 request per cover = 3 requests per result (worst case)
- Steam: 1 request per search + 1 request per detail = 2 requests per result
- No explicit rate limiting (relied on MediaWiki courtesy Bot policy)

### 16.2 ATP

- Wikipedia: 1 request per search + 1 request per getById + 1 request per cover search = 3 requests per result (worst case)
- Steam: 1 request per search + 1 request per getById = 2 requests per result
- `BaseAdapter` has configurable timeout (default 10s)
- No explicit rate limiting

### 16.3 Assessment

Both systems have similar request counts. ATP's `BaseAdapter` provides better error handling (timeout, rate limit detection). Neither system implements aggressive rate limiting.

---

## 17. Real-Case Analysis

### 17.1 "The Legend of Zelda" — Classification Problem

**Legacy flow**:
1. Search: "The Legend of Zelda video game" → Wikipedia returns game page
2. Cheap filter: passes (not a list, not a band, not a film)
3. Page validation: infobox has developer (Nintendo), publisher (Nintendo), genre (action-adventure), platform (NES), release_date (1986) → score = 5 → ACCEPTED
4. Enrich: extract metadata from validated infobox
5. Cover: search "The Legend of Zelda video game" → validate tokens, blacklist, infobox, game evidence → extract infobox image

**ATP flow**:
1. Search: "The Legend of Zelda" → Wikipedia returns game page (and possibly other pages)
2. Normalize: extract fields from RawCandidate
3. Classify: title has no explicit game markers, description may mention "video game" → GAME with moderate confidence
4. Aggregate: identity resolution groups candidates
5. Eligibility: classification = GAME → ELIGIBLE
6. Cover: search "The Legend of Zelda" → extract thumbnails from any matching result → no semantic validation

**Problem**: ATP's classifier may produce UNKNOWN for "The Legend of Zelda" if the description snippet doesn't contain "video game". The title alone has no game markers.

### 17.2 "Hollow Knight" — Low Recall

**Legacy flow**:
1. Search: "Hollow Knight video game" → Wikipedia returns game page (biased by query expansion)
2. Cheap filter: passes
3. Page validation: infobox has developer (Team Cherry), publisher (Team Cherry), genre (action-adventure), platform (PC, Switch) → score = 4 → ACCEPTED

**ATP flow**:
1. Search: "Hollow Knight" → Wikipedia returns game page (and possibly developer page, sequel page)
2. Normalize: extract fields
3. Classify: description may mention "video game" → GAME, or may not → UNKNOWN
4. Aggregate: group by external ID
5. Eligibility: depends on classification

**Problem**: Without query expansion, "Hollow Knight" may return Team Cherry (developer) page, which has no game signals. The classifier returns UNKNOWN for the developer page. If the game page also returns UNKNOWN (no "video game" in description), both are rejected.

### 17.3 "Doom Eternal" — Empty Covers

**Legacy flow**:
1. Cover search: "Doom Eternal video game" → validate tokens, blacklist, infobox, game evidence → extract infobox image
2. If Wikipedia has no infobox image: return empty (graceful degradation)

**ATP flow**:
1. Cover search: "Doom Eternal" → MediaWiki search → extract thumbnails
2. If no thumbnails: return empty
3. If thumbnails exist: accept all (no semantic validation)

**Problem**: ATP may return thumbnails from the Doom film page, Doom board game page, or Doom soundtrack page. These are semantically incorrect but have thumbnails.

### 17.4 "Legend of Legaia" — Empty Covers

Both legacy and ATP may return empty covers for games with small Wikipedia pages. This is a **data availability** issue, not an architecture issue. The legacy system had the same limitation.

### 17.5 "Barry Gjerde" — False Positive (Person)

**Legacy flow**:
1. Search: "Barry Gjerde video game" → Wikipedia may not return results (query expansion reduces noise)
2. If results returned: cheap filter passes, page validation fails (person page has no infobox game evidence) → REJECTED

**ATP flow**:
1. Search: "Barry Gjerde" → Wikipedia returns person page
2. Normalize: extract fields
3. Classify: no game markers → UNKNOWN (confidence 0.0)
4. Aggregate: single candidate, low identity confidence
5. Eligibility: UNKNOWN + confidence 0.0 + source count 1 → INELIGIBLE
6. Rejected

**Problem**: The rejection works correctly in the simple case. But if Barry Gjerde appears in multiple Wikipedia pages in game contexts (e.g., "List of video game composers"), the source count may exceed 2, and the identity confidence may exceed 0.7, causing the entity to be accepted.

### 17.6 "Michiru Ōshima" — False Positive (Person)

Same analysis as Barry Gjerde. The risk increases when the person is mentioned in multiple game-related Wikipedia pages.

---

## 18. Preserve / Adapt / Replace / Discard

### Preserve (ATP has it right)

| Component | Rationale |
|-----------|-----------|
| SourceAdapter interface | Clean abstraction, correct pattern |
| BaseAdapter | Proper HTTP handling, timeout, errors |
| Normalization pipeline | RawCandidate → NormalizedCandidate is correct |
| DeterministicClassifier | Correct architecture (positive + weighted scoring), just needs negative signals |
| IdentityResolver | Correct architecture (UnionFind, external ID matching) |
| CatalogEligibility | Correct policy function (3 states, deterministic) |
| AssetEligibility | Correct structure (URL validation, association check) |
| Deterministic-first principle | Core ATP principle, must be preserved |
| AI-optional principle | Core ATP principle, must be preserved |

### Adapt (ATP has it, needs modification)

| Component | Change Needed |
|-----------|--------------|
| WikipediaAdapter.search() | Add game-specific query expansion option |
| WikipediaAdapter.searchCovers() | Add semantic validation (token match, blacklist, infobox check) |
| DeterministicClassifier | Add negative signals (person, event, franchise detection) |
| DiscoveryEngine | Add cheap pre-filter before classification |
| CoverEngine | Add game-specific cover validation before dedup |
| Cover ranking | Add exact match, year recency, disambiguation penalty |

### Replace (ATP approach is wrong)

| Component | Replacement |
|-----------|------------|
| Cover thumbnail extraction | Replace with infobox image extraction (like legacy) |
| Generic cover search | Replace with game-specific cover provider |

### Discard (not needed)

| Component | Rationale |
|-----------|-----------|
| Legacy query builder | ATP's SourceAdapter pattern is better |
| Legacy dedupe (normalizeTitle + containment) | ATP's UnionFind is better |
| Legacy HTML scraping | ATP's MediaWiki API is better |

---

## 19. Architectural Delta

### 19.1 What Changed

```
Legacy:                          ATP:
Game Scraper (game-specific)  →  Entity Discovery (generic)
Cover Search (game-specific)  →  Image Extraction (generic)
query + " video game"         →  raw query
isLikelyGame() blacklist      →  (none)
scoreGameSignals() ≥ 2        →  DeterministicClassifier (text patterns)
Infobox image extraction      →  Thumbnail URL extraction
Cover semantic validation     →  Asset eligibility (URL-level)
```

### 19.2 What Was Lost

The fundamental change was from **specialized game subsystems** to **generic entity subsystems**. This is architecturally cleaner (less duplication, better separation of concerns) but loses domain-specific optimizations.

The lost optimizations are not "legacy code artifacts" — they encode **domain knowledge** about how to distinguish games from non-games in noisy search results.

### 19.3 The Real Question

Is the generic approach **sufficient** with the right eligibility gates, or does the domain require **specialized** game-specific logic in the source adapters?

**Answer**: The domain requires **game-specific query optimization and validation in the Wikipedia adapter**, because:
1. Wikipedia is a general encyclopedia — its search results are not game-biased
2. The classifier cannot compensate for lack of game-biased input
3. The eligibility gates are too late — they reject after expensive operations

---

## 20. Implementation Sequence

### Phase 1: Game-Specific Wikipedia Adapter (Source Layer)

**Goal**: Restore game-specific query optimization and cheap filtering in the Wikipedia adapter.

1. Add `gameQueryExpansion(query)` to Wikipedia adapter — appends "video game" for game searches
2. Add `isLikelyGame(title)` cheap filter to Wikipedia adapter — blacklist non-game patterns
3. Add `searchGames(query)` method to Wikipedia adapter — combines expansion + filtering
4. Add `searchGameCovers(query)` method to Wikipedia adapter — combines expansion + token match + blacklist + infobox validation

**Files to modify**:
- `src/sources/wikipedia/wikipedia-adapter.ts`
- `src/sources/source-adapter.ts` (optional: add game-specific methods)

### Phase 2: Cover Semantic Validation (Cover Layer)

**Goal**: Restore legacy cover validation in the cover engine.

1. Add `validateCoverSourcePage()` to cover engine — fetch page, validate infobox, validate game evidence
2. Add token matching to cover search — query tokens must appear in result title
3. Add semantic blacklist to cover search — reject soundtrack, album, awards, etc.
4. Add infobox image extraction — prefer infobox images over thumbnails
5. Add exact match, year recency, disambiguation penalty to cover ranking

**Files to modify**:
- `src/cover/cover-engine.ts`
- `src/cover/cover-rank.ts`
- `src/sources/wikipedia/wikipedia-adapter.ts` (searchCovers)

### Phase 3: Negative Classification Signals (Classification Layer)

**Goal**: Enable classifier to reject non-game entities.

1. Add negative signals to DeterministicClassifier — person, event, franchise detection
2. Add "biography", "profile", "born" patterns → PERSON category
3. Add "tournament", "convention" patterns → EVENT category
4. Add "series overview", "franchise" patterns → FRANCHISE category

**Files to modify**:
- `src/classification/deterministic-classifier.ts`
- `src/classification/classification-signal.ts`

### Phase 4: Ranking Improvements (Ranking Layer)

**Goal**: Restore title similarity threshold and consensus bonus.

1. Add title similarity threshold to discovery ranking (≥ 0.5)
2. Add source consensus bonus to discovery ranking
3. Add exact match bonus to cover ranking
4. Add year recency bonus to cover ranking
5. Add disambiguation penalty to cover ranking

**Files to modify**:
- `src/discovery/aggregation.ts`
- `src/cover/cover-rank.ts`

---

## 21. Required Regression Tests

### 21.1 Discovery Regression Tests

```typescript
// Test: Game query returns game results
test('discovery for "Hollow Knight" returns GAME classification', async () => {
  const results = await discoveryEngine.discover('Hollow Knight');
  expect(results.some(r => r.classification === 'GAME')).toBe(true);
});

// Test: Person query does not return game results
test('discovery for "Barry Gjerde" does not produce false positive', async () => {
  const results = await discoveryEngine.discover('Barry Gjerde');
  expect(results.every(r => r.classification !== 'GAME')).toBe(true);
});

// Test: Ambiguous query returns game-biased results
test('discovery for "Zelda" returns game results, not film results', async () => {
  const results = await discoveryEngine.discover('Zelda');
  expect(results.some(r => r.classification === 'GAME')).toBe(true);
  expect(results.every(r => !r.title.includes('(film)'))).toBe(true);
});

// Test: Cheap filter rejects non-game results
test('cheap filter rejects "List of video games"', async () => {
  const filtered = isLikelyGame('List of video games');
  expect(filtered).toBe(false);
});
```

### 21.2 Cover Regression Tests

```typescript
// Test: Cover search returns game cover
test('cover search for "Doom Eternal" returns game-related cover', async () => {
  const covers = await coverEngine.searchCovers(['Doom Eternal'], null);
  expect(covers.length).toBeGreaterThan(0);
  expect(covers.every(c => isValidCoverUrl(c.url))).toBe(true);
});

// Test: Cover search rejects non-game covers
test('cover search rejects soundtrack cover', async () => {
  const covers = await coverEngine.searchCovers(['Doom Eternal'], null);
  expect(covers.every(c => !c.title.toLowerCase().includes('soundtrack'))).toBe(true);
});

// Test: Cover search with token matching
test('cover search requires query tokens in result title', async () => {
  const covers = await coverEngine.searchCovers(['Hollow Knight'], null);
  expect(covers.every(c => 
    c.title.toLowerCase().includes('hollow') || 
    c.title.toLowerCase().includes('knight')
  )).toBe(true);
});
```

### 21.3 Classification Regression Tests

```typescript
// Test: Person is classified as PERSON
test('person page classified as PERSON', () => {
  const result = classifier.classify(personCandidate);
  expect(result.category).toBe('PERSON');
});

// Test: Event is classified as EVENT
test('event page classified as EVENT', () => {
  const result = classifier.classify(eventCandidate);
  expect(result.category).toBe('EVENT');
});

// Test: Game is classified as GAME
test('game page classified as GAME', () => {
  const result = classifier.classify(gameCandidate);
  expect(result.category).toBe('GAME');
});
```

---

## 22. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Query expansion may over-filter (exclude games without "video game" in Wikipedia title) | Medium | Make expansion optional per source, test with known games |
| Cheap filter may reject valid games (e.g., "The Legend of Zelda: Breath of the Wild" doesn't match blacklist) | Low | Blacklist only rejects obvious non-game patterns |
| Infobox validation may reject games without infoboxes | Medium | Fall back to page content analysis |
| Cover semantic validation may reduce cover count | Medium | Keep thumbnail extraction as fallback |
| Negative classification signals may produce false negatives (game classified as non-game) | Medium | Conservative thresholds, test with known games |

---

## 23. Open Questions

### Q1: Should game-specific logic live in the Wikipedia adapter or in a separate game-specific layer?

**Option A**: Wikipedia adapter has `searchGames()` and `searchGameCovers()` methods
- Pro: Keeps source-specific logic in the adapter
- Con: Adapter becomes game-aware, violating generic source principle

**Option B**: Separate `GameWikipediaAdapter` that wraps `WikipediaAdapter`
- Pro: Keeps base adapter generic
- Con: Duplicates Wikipedia API logic

**Option C**: Wikipedia adapter has generic methods, game-specific logic lives in a `GameSearchLayer` that calls adapter methods
- Pro: Clean separation
- Con: Adds another layer of indirection

**Recommendation**: Option A is simplest and most practical. The adapter is already Wikipedia-specific — adding game-specific methods is a natural extension.

### Q2: Should cover validation happen before or after dedup?

**Option A**: Validate before dedup (validate all candidates, then dedup)
- Pro: More candidates validated, better dedup decisions
- Con: More validation work

**Option B**: Validate after dedup (dedup first, then validate)
- Pro: Less validation work
- Con: May dedup before validation removes invalid candidates

**Recommendation**: Option A (validate before dedup) — legacy validates before dedup, and it works correctly.

### Q3: How should the system handle games without Wikipedia infoboxes?

Some games have Wikipedia pages but no infobox (e.g., very old or obscure games). The legacy system would reject these at the page validation stage. ATP should:
- **Option A**: Reject (like legacy) — conservative, prevents false positives
- **Option B**: Accept with lower confidence — permissive, may produce false positives
- **Option C**: Accept if other sources confirm — balanced, requires multi-source validation

**Recommendation**: Option C — accept if other sources confirm (e.g., Steam confirms it's a game). This leverages ATP's multi-source architecture.

---

## 24. Feature Freeze Compliance

All proposed changes are **adaptations of existing functionality**, not new features:
- Query expansion is a parameterization of existing `search()` method
- Cheap filtering is a pre-filter on existing search results
- Cover validation is an enhancement of existing `searchCovers()` method
- Negative classification signals are additions to existing classifier
- Ranking improvements are adjustments to existing scoring functions

**No new endpoints, no new domain entities, no new source adapters.**

---

## 25. Quality Gates

All changes must pass:
- `npm run build` — TypeScript compilation
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm test` — Vitest (1111+ tests, 7 pre-existing skips)
- `npm run typecheck` — Type checking

---

## 26. Conclusion

### Summary

The ATP Engine lost 5 critical domain invariants during the migration from legacy specialized subsystems to generic entity subsystems. These invariants are not code artifacts — they encode **domain knowledge** about how to distinguish games from non-games in noisy search results.

### Verdict

**NOT READY FOR IMPLEMENTATION** — 3 architectural questions require resolution:

1. **Where does game-specific logic live?** (adapter vs. layer vs. wrapper)
2. **When does cover validation happen?** (before or after dedup)
3. **How to handle games without infoboxes?** (reject vs. accept vs. multi-source)

### Next Steps

1. Resolve the 3 open questions
2. Get user approval on implementation approach
3. Implement Phase 1 (Game-Specific Wikipedia Adapter)
4. Implement Phase 2 (Cover Semantic Validation)
5. Implement Phase 3 (Negative Classification Signals)
6. Implement Phase 4 (Ranking Improvements)
7. Run regression tests
8. Run quality gates
9. Commit

---

## 27. Appendix — File Reference

### Legacy Files

| File | Purpose |
|------|---------|
| `legacy/src/app/api/scraper/game-search/route.ts` | Game search API endpoint |
| `legacy/src/app/api/scraper/cover-search/route.ts` | Cover search API endpoint |
| `legacy/src/lib/scrapers/core/engine.ts` | Game search pipeline orchestrator |
| `legacy/src/lib/scrapers/core/ranker.ts` | Result ranking |
| `legacy/src/lib/scrapers/core/dedupe.ts` | Deduplication |
| `legacy/src/lib/scrapers/sources/wikipedia/search.ts` | Wikipedia search (query expansion + cheap filter) |
| `legacy/src/lib/scrapers/sources/wikipedia/scraper.ts` | Page validation (scoreGameSignals) |
| `legacy/src/lib/scrapers/sources/wikipedia/parse-infobox.ts` | Infobox extraction |
| `legacy/src/lib/scrapers/cover-search/providers/wikipedia-provider.ts` | Cover validation |
| `legacy/src/lib/scrapers/cover-search/ranker.ts` | Cover ranking |

### ATP Files

| File | Purpose |
|------|---------|
| `src/sources/wikipedia/wikipedia-adapter.ts` | Wikipedia adapter |
| `src/sources/source-adapter.ts` | SourceAdapter interface |
| `src/sources/base-adapter.ts` | BaseAdapter (HTTP, timeout, errors) |
| `src/classification/deterministic-classifier.ts` | Text-pattern classifier |
| `src/identity/deterministic-identity-resolver.ts` | Identity resolver |
| `src/discovery/discovery-engine.ts` | Discovery orchestrator |
| `src/discovery/aggregation.ts` | UnionFind, ranking |
| `src/cover/cover-engine.ts` | Cover search orchestrator |
| `src/cover/cover-rank.ts` | Cover ranking |
| `src/eligibility/catalog-eligibility.ts` | Catalog eligibility policy |
| `src/eligibility/asset-eligibility.ts` | Asset eligibility policy |
| `src/application/catalog-service.ts` | Catalog service (eligibility gate) |
