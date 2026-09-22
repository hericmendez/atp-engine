# ATP ENGINE — ARCHITECTURE RECONCILIATION REPORT

> **Generated**: 2026-09-02
> **Mode**: READ-ONLY — No code changes
> **Scope**: Full architectural reconciliation of Legacy domain knowledge into ATP architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current ATP Architecture](#2-current-atp-architecture)
3. [Legacy Domain Knowledge](#3-legacy-domain-knowledge)
4. [Lost Invariants](#4-lost-invariants)
5. [Responsibility Analysis](#5-responsibility-analysis)
6. [Game Discovery Architecture](#6-game-discovery-architecture)
7. [Cover Discovery Architecture](#7-cover-discovery-architecture)
8. [CatalogEligibility Assessment](#8-catalogeligibility-assessment)
9. [AssetEligibility Assessment](#9-asseteligibility-assessment)
10. [Classification Assessment](#10-classification-assessment)
11. [Ranking Assessment](#11-ranking-assessment)
12. [Generic vs Specialized Boundaries](#12-generic-vs-specialized-boundaries)
13. [Proposed Architecture](#13-proposed-architecture)
14. [Component Contracts](#14-component-contracts)
15. [Implementation Sequence](#15-implementation-sequence)
16. [Test Strategy](#16-test-strategy)
17. [Risks](#17-risks)
18. [Open Questions](#18-open-questions)
19. [Feature Freeze Compliance](#19-feature-freeze-compliance)
20. [Final Recommendation](#20-final-recommendation)
21. [GO / NO-GO](#21-go--no-go)

---

## 1. Executive Summary

### Core Finding

ATP replaced two **domain-specialized subsystems** (Legacy Game Scraper + Cover Search) with a **generic entity discovery + image extraction** architecture. This is architecturally cleaner but lost 7 domain invariants that encode **how to distinguish games from non-games in noisy search results**.

### The 7 Lost Invariants

| # | Invariant | Where Lost | Impact |
|---|-----------|-----------|--------|
| 1 | Query expansion for game context | WikipediaAdapter.search() | Low recall for ambiguous queries |
| 2 | Cheap semantic filtering | WikipediaAdapter.search() | Expensive operations wasted on non-games |
| 3 | Page-level game validation | DeterministicClassifier (text-only) | False positives (non-games enter catalog) |
| 4 | Cover token matching | CoverEngine / WikipediaAdapter.searchCovers() | Unrelated images returned |
| 5 | Cover semantic blacklist | CoverEngine / WikipediaAdapter.searchCovers() | Soundtracks, films, etc. returned as covers |
| 6 | Cover page validation (infobox + game evidence) | CoverEngine (thumbnail-only) | Images from non-game pages accepted |
| 7 | Exact title match in cover ranking | cover-rank.ts | Weaker cover ranking |

### Architectural Diagnosis

The problem is **not** that ATP's layers are wrong. The problem is that the **Wikipedia adapter is implementing generic Wikipedia access** when it should implement **game-optimized Wikipedia access**. The adapter is the correct place for source-specific optimization — this does not violate the generic adapter principle, because the adapter is already Wikipedia-specific.

### Verdict

**GO** — The proposed architecture is achievable within existing layers, without new endpoints, without new domain entities, and without breaking the generic adapter pattern. 3 minor open questions remain but do not block implementation.

---

## 2. Current ATP Architecture

### 2.1 Current Discovery Flow

```
DiscoveryRequest { query }
  │
  ▼
DiscoveryEngine.discover()
  │
  ├── selectSources() ───────────────────── SourceRegistry
  │
  ├── querySources() ────────────────────── For each adapter:
  │   │                                      adapter.search(query) → RawCandidate[]
  │   │                                      adapter.getById(id) → RawCandidate (detailed)
  │   │                                      mergeCandidates(search, detailed)
  │   │                                      normalizeCandidate(raw) → NormalizedCandidate
  │   │                                      classifier.classify(normalized) → ClassificationResult
  │   │                                      → DiscoverySourceObservation[]
  │
  ├── aggregateAndDeduplicate() ──────────── preGroupByExternalId() → UnionFind
  │   │                                      areSameGame() → IdentityResolver.resolve()
  │   │                                      calculateRankingScore()
  │   │                                      → DiscoveryGroupResult[]
  │
  └── rankGroups() ──────────────────────── Sort by rankingScore
                                             → DiscoveryResult
```

### 2.2 Current Cover Flow

```
CoverEngine.searchCovers(query, options)
  │
  ├── selectCoverSources() ──────────────── SourceRegistry (searchCovers=true)
  │
  ├── querySources() ────────────────────── adapter.search(query) ← BUG: should be searchCovers
  │   │                                      normalizeCandidate(raw) → NormalizedCandidate
  │   │                                      candidatesFromObservation() → CoverCandidate[]
  │
  ├── filterValidCandidates() ───────────── URL + source validation
  │
  ├── deduplicateCandidates() ───────────── source:sourceId + normalizedUrl
  │
  ├── assetEligibility(c, null) ─────────── ELIGIBLE (game=null, limited validation)
  │
  ├── filterByType(GAME) ────────────────── Type filtering
  │
  ├── rankCandidates(query) ─────────────── source reliability + type + quality + aspect ratio + relevance
  │
  └── select best ───────────────────────── totalScore ≥ 0.55
```

### 2.3 Current Persistence Flow

```
CatalogService.discoverAndPersist(query)
  │
  ├── discoveryEngine.discover(query) ───── DiscoveryResult
  │
  └── For each group:
      ├── catalogEligibility(group) ─────── ELIGIBLE | INELIGIBLE | DEFERRED
      ├── discoveryGroupToGame(group) ───── Game
      └── gameRepository.save(game)
```

### 2.4 Key Component Files

| Component | File | Lines |
|-----------|------|-------|
| DiscoveryEngine | `src/discovery/discovery-engine.ts` | 185 |
| Aggregation | `src/discovery/aggregation.ts` | 283 |
| DeterministicClassifier | `src/classification/deterministic-classifier.ts` | 345 |
| IdentityResolver | `src/identity/deterministic-identity-resolver.ts` | 501 |
| CatalogEligibility | `src/eligibility/catalog-eligibility.ts` | 287 |
| AssetEligibility | `src/eligibility/asset-eligibility.ts` | 191 |
| CoverEngine | `src/cover/cover-engine.ts` | 261 |
| CoverRank | `src/cover/cover-rank.ts` | 212 |
| CoverValidate | `src/cover/cover-validate.ts` | 82 |
| WikipediaAdapter | `src/sources/wikipedia/wikipedia-adapter.ts` | 542 |
| SteamAdapter | `src/sources/steam/steam-adapter.ts` | — |
| IGDBAdapter | `src/sources/igdb/igdb-adapter.ts` | 560 |
| SourceAdapter interface | `src/sources/source-adapter.ts` | 27 |
| Normalization | `src/normalization/normalize.ts` | 368 |
| CatalogService | `src/application/catalog-service.ts` | 286 |

---

## 3. Legacy Domain Knowledge

### 3.1 Legacy Game Search Pipeline

```
query
  │
  ├── "${query} video game" ─────────────── Query expansion (Wikipedia)
  │
  ├── isLikelyGame(title) ───────────────── Cheap blacklist filter
  │   "list of", "disambiguation", "(band)",
  │   "(film)", "video games in", "history of",
  │   "company", "publisher"
  │
  ├── source.search() ───────────────────── Wikipedia search
  │
  ├── dedupeResults() ───────────────────── normalizeTitle + containment
  │
  ├── rankResults() ─────────────────────── titleSimilarity ≥ 0.5
  │   │                                      metadataScore
  │   │                                      sourceWeight
  │   │                                      consensusBonus
  │
  ├── scrapeWikipediaGames(url) ─────────── Fetch page HTML
  │   │                                      parseInfobox()
  │   │                                      scoreGameSignals(infobox)
  │   │                                      isGamePage(infobox) → score ≥ 2
  │   │                                      Extract: dev, pub, genre, platform, date
  │
  └── getCoverForGame(title) ────────────── Separate subsystem
```

### 3.2 Legacy Cover Search Pipeline

```
query
  │
  ├── "${query} video game" ─────────────── Query expansion
  │
  ├── WikipediaProvider.search(query) ───── Search Wikipedia
  │   │
  │   ├── Token matching ────────────────── query tokens must appear in title
  │   │
  │   ├── Semantic blacklist ────────────── soundtrack, album, awards,
  │   │                                    ceremony, poster, film
  │   │
  │   ├── Fetch page HTML ──────────────── getActualPageContent()
  │   │
  │   ├── parseInfobox() ───────────────── Require infobox presence
  │   │
  │   ├── Game evidence ────────────────── developer OR publisher OR platforms
  │   │                                    must exist in infobox
  │   │
  │   └── Extract infobox image ────────── imageUrl = infobox.image
  │
  ├── Rank covers ──────────────────────── exactMatch + 0.5
  │   │                                    videoGameBonus + 0.2
  │   │                                    yearBonus (recency)
  │   │                                    vrPenalty - 0.3
  │   │                                    disambiguationPenalty - 1.0
  │
  └── Output ──────────────────────────── validated cover images
```

### 3.3 Legacy Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `isLikelyGame(title)` | `legacy/src/lib/scrapers/sources/wikipedia/search.ts` | Cheap blacklist filter |
| `scoreGameSignals(infobox)` | `legacy/src/lib/scrapers/sources/wikipedia/scraper.ts` | Count dev/pub/genre/platform/date |
| `isGamePage(infobox)` | `legacy/src/lib/scrapers/sources/wikipedia/scraper.ts` | score ≥ 2 |
| `getActualPageContent(pageId)` | `legacy/src/lib/scrapers/cover-search/providers/wikipedia-provider.ts` | Fetch + parse page |
| `tokenize(query)` | `legacy/src/lib/scrapers/cover-search/providers/wikipedia-provider.ts` | Split query into tokens |
| `extractImage(infobox)` | `legacy/src/lib/scrapers/cover-search/providers/wikipedia-provider.ts` | Get image from infobox |

---

## 4. Lost Invariants

### Invariant 1: Query Expansion

**Legacy**: `${query} video game` — biases Wikipedia results toward game pages.
**ATP**: Raw `query` — returns all matching entities.
**Where to recover**: WikipediaAdapter.search() — add optional `querySuffix` parameter.

### Invariant 2: Cheap Semantic Filtering

**Legacy**: `isLikelyGame(title)` — rejects "list of", "disambiguation", "(band)", "(film)" before any expensive operation.
**ATP**: No filtering. All search results proceed to getById() and classification.
**Where to recover**: WikipediaAdapter.search() — add `filterNonGameResults()` after search.

### Invariant 3: Page-Level Game Validation

**Legacy**: `scoreGameSignals(infobox) ≥ 2` — validates the Wikipedia page itself contains structured game evidence (developer, publisher, genre, platform, release date).
**ATP**: `DeterministicClassifier` examines text patterns in title/description. No page-level validation.
**Where to recover**: WikipediaAdapter.getById() — add `validateGamePage(wikitext)` that generates stronger classification hints when infobox has ≥2 game signals.

### Invariant 4: Cover Token Matching

**Legacy**: Query tokens must appear in result title.
**ATP**: No token matching. Any search result with a thumbnail is accepted.
**Where to recover**: WikipediaAdapter.searchCovers() — add `filterByTokenMatch(query, results)`.

### Invariant 5: Cover Semantic Blacklist

**Legacy**: Rejects "soundtrack", "album", "awards", "ceremony", "poster", "film".
**ATP**: No blacklist.
**Where to recover**: WikipediaAdapter.searchCovers() — add `filterByBlacklist(results)`.

### Invariant 6: Cover Page Validation

**Legacy**: Fetches page, validates infobox presence, validates game evidence (developer/publisher/platform), extracts image from validated infobox.
**ATP**: Extracts thumbnail URLs from MediaWiki search. No page validation.
**Where to recover**: WikipediaAdapter.searchCovers() — add `validateCoverSourcePage(pageId)` that fetches page, checks infobox, checks game evidence, extracts infobox image.

### Invariant 7: Exact Title Match in Cover Ranking

**Legacy**: `exactMatch + 0.5` score bonus.
**ATP**: `computeRelevanceScore()` has exact match (returns 1.0) but it's one of many signals.
**Where to recover**: cover-rank.ts — add explicit `exactMatchBonus` signal.

---

## 5. Responsibility Analysis

### 5.1 Component Responsibility Map

| Component | Must Answer Only | Must NOT Own |
|-----------|-----------------|-------------|
| **SourceAdapter** | How to communicate with external source | Domain rules about what is a game |
| **WikipediaAdapter** | How to query MediaWiki API, parse responses | Whether a result is a game (but CAN provide evidence) |
| **DiscoveryEngine** | How to orchestrate multi-source discovery | Domain rules about games |
| **DeterministicClassifier** | What kind of entity this is | Whether to persist |
| **IdentityResolver** | Which canonical entity this represents | Whether to persist |
| **Aggregation** | How to group and rank candidates | Whether to persist |
| **CatalogEligibility** | Whether a group enters the catalog | Classification or identity resolution |
| **AssetEligibility** | Whether a cover is associated with a game | Classification of the game |
| **CoverEngine** | How to find and rank cover images | Whether the source page is a game page |
| **CoverRank** | How to order cover candidates | Whether a cover is valid |
| **CatalogService** | How to orchestrate persistence | Domain rules |

### 5.2 Responsibility Overlap Analysis

**Overlap 1: Classification vs CatalogEligibility**
- Classification: "What kind of entity is this?" → GAME, PERSON, UNKNOWN, etc.
- CatalogEligibility: "Should this enter the catalog?" → ELIGIBLE, INELIGIBLE, DEFERRED
- **No overlap.** Classification is evidence; eligibility is policy. Correct.

**Overlap 2: IdentityResolver vs Aggregation**
- IdentityResolver: "Is this the same game as that?" → SAME_GAME, DIFFERENT_GAME, etc.
- Aggregation: "How to group candidates?" → UnionFind + ranking
- **No overlap.** Identity is comparison; aggregation is grouping. Correct.

**Overlap 3: Classification vs WikipediaAdapter hints**
- Classification: Text pattern matching on title/description/genres
- WikipediaAdapter hints: Generated from wikitext content (e.g., "video game" → GAME)
- **Potential overlap.** The adapter generates hints that the classifier consumes. This is correct — the adapter provides source-specific evidence, the classifier interprets it. But the adapter currently generates weak hints (search snippet only) and the classifier has no way to request page-level validation.

**Overlap 4: CoverEngine vs AssetEligibility**
- CoverEngine: Finds and ranks cover images
- AssetEligibility: Validates cover association with game
- **No overlap.** CoverEngine finds; AssetEligibility validates. Correct.

**Overlap 5: Discovery ranking vs CatalogEligibility**
- Discovery ranking: Orders groups by relevance
- CatalogEligibility: Gates groups for catalog entry
- **No overlap.** Ranking orders; eligibility gates. Correct.

### 5.3 Key Insight

The current responsibility separation is **correct**. The problem is not overlap — it's **insufficiency**. The adapter provides weak evidence, the classifier interprets it, but neither has the capability to perform page-level validation. This is a **gap**, not an **overlap**.

---

## 6. Game Discovery Architecture

### 6.1 Where Each Mechanism Enters

| Mechanism | Layer | Before/After External Call | Input | Output |
|-----------|-------|---------------------------|-------|--------|
| Query expansion | Adapter | Before search | query | expandedQuery |
| Cheap filtering | Adapter | After search, before getById | RawCandidate[] | filtered RawCandidate[] |
| Page validation | Adapter | During getById | pageId | Enhanced classification hints |
| Normalization | Normalization | After getById | RawCandidate | NormalizedCandidate |
| Classification | Classifier | After normalization | NormalizedCandidate | ClassificationResult |
| Identity resolution | IdentityResolver | After classification | NormalizedCandidate + Game | IdentityResolutionResult |
| Aggregation | Aggregator | After all sources | DiscoverySourceObservation[] | DiscoveryGroupResult[] |
| Eligibility | CatalogEligibility | After aggregation | DiscoveryGroupResult | EligibilityDecision |
| Ranking | Aggregator | After grouping | DiscoveryGroupResult[] | sorted DiscoveryGroupResult[] |
| Persistence | CatalogService | After eligibility | Game | saved Game |

### 6.2 What Must Happen Before External Call

**Query specialization** — The query must be optimized for the specific source BEFORE calling the external API. For Wikipedia: append "video game". This is cheap (string concatenation) and dramatically improves result quality.

### 6.3 What Must Happen After Normalization

**Classification** — After the candidate is normalized, the classifier examines title/description/genres/hints. This is correct.

### 6.4 What Belongs to the Source

- Query expansion (Wikipedia-specific: "video game")
- Cheap filtering (Wikipedia-specific: "list of", "disambiguation")
- Page validation (Wikipedia-specific: infobox game signals)
- Cover token matching (Wikipedia-specific)
- Cover blacklist (Wikipedia-specific)
- Cover page validation (Wikipedia-specific: infobox + game evidence)

### 6.5 What Belongs to the Domain

- Classification (entity type determination)
- Identity resolution (same-entity determination)
- Catalog eligibility (catalog entry policy)
- Asset eligibility (cover association validation)

### 6.6 What Belongs to Aggregation

- Grouping by external ID (UnionFind)
- Ranking by multiple signals
- Source consensus (implicit in grouping)

### 6.7 What Belongs to Eligibility

- Final gate before persistence
- Policy decisions (ELIGIBLE/INELIGIBLE/DEFERRED)
- NOT compensation for upstream failures

### 6.8 Ranking: Candidates or Validity?

**Ranking must order candidates, NOT decide validity.**

Validation happens at:
1. Adapter level (cheap filtering, page validation)
2. Classification level (entity type)
3. Eligibility level (catalog entry policy)

Ranking only orders already-validated candidates. If ranking is used to decide validity (e.g., "only persist if score > X"), it becomes a de facto eligibility gate and violates separation of concerns.

**Current ATP**: Ranking is pure ordering. Eligibility is separate. ✓
**Legacy**: Ranking included a `titleSimilarity ≥ 0.5` threshold that acted as a validity gate. ✗

**Decision**: Keep ranking as pure ordering. Move the title similarity threshold to the adapter or eligibility layer.

---

## 7. Cover Discovery Architecture

### 7.1 Three Conceptual Questions

| Question | Responsible Component | Current ATP | Legacy |
|----------|----------------------|-------------|--------|
| "Is this page about a game?" | Discovery layer (upstream) | Classifier (text-only) | Page validation (infobox) |
| "Does this image belong to the correct entity?" | AssetEligibility | URL + source ID matching | Infobox image extraction from validated page |
| "Is this image a good visual representation?" | CoverRank | Source reliability + type + quality + aspect ratio | Exact match + year + disambiguation penalty |

### 7.2 Current Cover Flow vs Legacy

**Current ATP**:
```
query → adapter.search(query) → thumbnails → dedup → assetEligibility → rank
```

**Legacy**:
```
query → search → token match → blacklist → fetch page → validate infobox → game evidence → infobox image → rank
```

### 7.3 How to Recover Legacy Behavior

The legacy cover validation must be recovered in the **Wikipedia adapter**, not in the CoverEngine. Reasons:

1. The adapter is the correct place for source-specific behavior
2. The adapter can make the extra HTTP request to fetch the page (it already does this in `getById()`)
3. The CoverEngine should remain source-agnostic

**Proposed flow**:
```
query
  → WikipediaAdapter.searchCovers(query):
      1. MediaWiki search (existing)
      2. Filter by token match (NEW)
      3. Filter by semantic blacklist (NEW)
      4. For each remaining result:
         a. Fetch page (existing getById pattern)
         b. Parse infobox (existing)
         c. Validate game evidence ≥ 2 signals (NEW)
         d. Extract infobox image (NEW)
      5. Return CoverCandidate[] with page validation metadata
  → CoverEngine:
      dedup → assetEligibility → rank (existing, unchanged)
```

### 7.4 Breaking Changes Required

| Component | Change | Breaking? |
|-----------|--------|-----------|
| WikipediaAdapter.searchCovers() | Add token match, blacklist, page validation | No (internal) |
| SourceAdapter interface | No change needed | No |
| CoverEngine | No change needed (already source-agnostic) | No |
| AssetEligibility | No change needed | No |
| CoverRank | Add exact match bonus | No (additive) |

---

## 8. CatalogEligibility Assessment

### 8.1 Current Implementation

**File**: `src/eligibility/catalog-eligibility.ts:64-146`

```typescript
export function catalogEligibility(group: DiscoveryGroupResult): CatalogEligibilityDecision {
  // Check 1: empty group → INELIGIBLE
  // Check 2: missing title → DEFERRED
  // Check 3: INELIGIBLE_CATEGORIES → INELIGIBLE (PERSON, FRANCHISE, BOOK, SOUNDTRACK, etc.)
  // Check 4: game-like categories (GAME, DLC, EXPANSION) → check confidence threshold
  // Check 5: UNKNOWN → evaluateUnknown() → ELIGIBLE if strong identity + multiple sources
  // Fallback → DEFERRED
}
```

### 8.2 Assessment

**Is CatalogEligibility compensating for upstream failures?**

**Partially, yes.** The UNKNOWN path (Check 5) accepts candidates with `identityConfidence ≥ 0.7` AND `sourceCount ≥ 2` despite being UNKNOWN. This is a valid policy decision for cases where classification is uncertain but identity is strong (e.g., a game known by multiple names across sources).

However, the UNKNOWN path does NOT check `classificationConfidence` — this is correct because UNKNOWN has no classification confidence to check.

**Should CatalogEligibility be more aggressive?**

**No.** CatalogEligibility is a policy gate. It should not become a second classifier. The problem is upstream — the classifier should produce stronger signals, not the eligibility gate should compensate.

**Recommendation**: CatalogEligibility is correct as implemented. No changes needed. The fix belongs in the adapter (stronger evidence) and classifier (better interpretation of evidence).

### 8.3 Current Behavior for Problem Cases

| Case | Classification | Identity Conf | Source Count | Eligibility |
|------|---------------|---------------|--------------|-------------|
| Zelda (game) | GAME (if "video game" in description) | varies | varies | ELIGIBLE |
| Zelda Fitzgerald | UNKNOWN (0.0) | 0.0 | 1 | DEFERRED |
| Barry Gjerde | UNKNOWN (0.0) | 0.0 | 1 | DEFERRED |
| Doom Eternal | GAME (if "video game" in description) | varies | varies | ELIGIBLE |

**Note**: UNKNOWN + low signals → DEFERRED, not INELIGIBLE. This is correct — DEFERRED allows for AI review or future re-evaluation.

---

## 9. AssetEligibility Assessment

### 9.1 Current Implementation

**File**: `src/eligibility/asset-eligibility.ts:30-70`

```typescript
export function assetEligibility(
  candidate: CoverCandidate,
  game: Game | null,
  searchType: CoverSearchType,
): AssetEligibilityDecision {
  // Check 1: missing source → INELIGIBLE
  // Check 2: missing sourceId → INELIGIBLE
  // Check 3: type appropriateness → based on searchType
  // Check 4: if game !== null → checkEntityAssociation()
  // Check 5: if game === null → accept with warning
}
```

### 9.2 What AssetEligibility CAN Prove

- The cover has a valid URL
- The cover has a valid source and sourceId
- The cover type matches the search type
- When `game !== null`: the cover's source entity matches the game's external identifier

### 9.3 What AssetEligibility CANNOT Prove

- Whether the source page of the image is a game page
- Whether the image is semantically appropriate for the game
- Whether the image is the game's primary cover art
- When `game === null`: anything about entity association

### 9.4 The `game === null` Case

**Current behavior**: Accept with warning "No canonical game provided — entity association cannot be validated".

**Is this correct?** Yes. When searching covers by query (no game entity), AssetEligibility cannot validate association. The warning documents this limitation. The CoverEngine's ranking and MIN_COVER_SELECTION_SCORE (0.55) provide the actual quality gate.

**Should this change?** No. The `game === null` path is architecturally correct. The problem is that the upstream adapter returns too many unrelated results. Fix the adapter, not the eligibility.

---

## 10. Classification Assessment

### 10.1 Current Signal Sources

| Source | Signals Generated | Limitation |
|--------|------------------|------------|
| Source hints (adapter) | GAME, FILM, TV_SERIES, SOUNDTRACK, BOOK | Wikipedia adapter generates from search snippet only |
| Title patterns | GAME, SOUNDTRACK, DLC, EXPANSION, MOVIE, TV_SHOW, ANIME, BOOK, HARDWARE, PROMOTIONAL, CHARACTER, FRANCHISE, PERSON, EVENT | Requires explicit markers in title |
| Genre indicators | GAME (weak, 0.3 weight) | Only game genres, no non-game genres |
| Description keywords | GAME, SOUNDTRACK, MOVIE, TV_SHOW, ANIME, BOOK | Requires explicit terms in description |

### 10.2 What Classification CAN Do

- Classify entities with explicit game markers ("video game", "gameplay") → GAME
- Classify entities with explicit non-game markers ("soundtrack", "film") → appropriate category
- Return UNKNOWN when no signals found

### 10.3 What Classification CANNOT Do

- Detect non-game entities that have no explicit markers (e.g., "Zelda Fitzgerald" has no PERSON marker in title)
- Validate page-level game evidence (infobox signals)
- Compensate for weak adapter hints

### 10.4 Does Classification Need New Signals?

**Yes, but only from the adapter.** The classifier's signal collection is correct. The problem is that the adapter provides weak signals. If the adapter provides stronger signals (from page validation), the classifier will interpret them correctly.

**Specifically**: The Wikipedia adapter should generate a strong GAME signal when `scoreGameSignals(infobox) ≥ 2` in `getById()`. This signal would have weight 1.0 (source-type) and confidence 0.9, making the classifier produce GAME with high confidence.

### 10.5 Should Negative Classification Exist?

**Not as a separate mechanism.** Negative classification (detecting non-games) should emerge from:
1. Adapter providing negative hints (e.g., "this page has no infobox" → weak signal)
2. Classifier interpreting absence of positive signals as UNKNOWN
3. Eligibility rejecting UNKNOWN with low confidence

This is already the current behavior. The issue is that the adapter doesn't provide enough negative evidence.

### 10.6 Where Classification Fits

Classification should be the **second** barrier (after adapter-level filtering):

```
Query → Adapter (expansion + cheap filter + page validation) → Classification (text patterns) → Identity (same-entity) → Aggregation (grouping + ranking) → Eligibility (gate)
```

---

## 11. Ranking Assessment

### 11.1 Discovery Ranking Signals

**Current ATP** (`src/discovery/aggregation.ts:144-179`):
- `identityConfidence × 0.3`
- `classificationConfidence × 0.2`
- `min(sourceCount / 3, 1) × 0.2`
- `metadataCompleteness × 0.15`
- `titleRelevance × 0.15`

**Legacy** (`legacy/src/lib/scrapers/core/ranker.ts`):
- `titleSimilarity × 0.4` (≥ 0.5 required)
- `metadataScore × 0.3`
- `sourceWeight × 0.2`
- `consensusBonus × 0.1`

### 11.2 Missing Signals

| Signal | Legacy | ATP | Importance |
|--------|--------|-----|-----------|
| Title similarity threshold | ≥ 0.5 required | None (titleRelevance exists but no threshold) | High — prevents loosely related results |
| Source consensus bonus | Explicit +0.1 per source | Implicit (sourceCount / 3) | Medium — already covered |
| Source weight | Wikipedia = 1.0, Steam = 1.2 | Generic reliability | Low — already covered |

### 11.3 Cover Ranking Signals

**Current ATP** (`src/cover/cover-rank.ts:24-30`):
- `relevance × 0.35` (includes exact match)
- `source × 0.25`
- `type × 0.25`
- `quality × 0.08`
- `aspectRatio × 0.07`

**Legacy** (`legacy/src/lib/scrapers/cover-search/ranker.ts`):
- `exactMatch + 0.5`
- `videoGameBonus + 0.2`
- `yearBonus (recency)`
- `vrPenalty - 0.3`
- `disambiguationPenalty - 1.0`

### 11.4 Missing Cover Signals

| Signal | Legacy | ATP | Importance |
|--------|--------|-----|-----------|
| Video game keyword | +0.2 | None | Medium |
| Year recency | Yes | None | Low (quality + aspect ratio cover this) |
| VR penalty | -0.3 | None | Low |
| Disambiguation penalty | -1.0 | None | High — disambiguation pages should rank last |

### 11.5 Ranking Must Not Replace Validation

Ranking orders candidates. It does not decide validity. The `titleSimilarity ≥ 0.5` threshold in legacy was a validity gate disguised as ranking. In ATP, this should be an adapter-level filter or eligibility threshold.

---

## 12. Generic vs Specialized Boundaries

### 12.1 What Must Remain Generic

| Component | Reason |
|-----------|--------|
| SourceAdapter interface | All sources implement the same interface |
| BaseAdapter | Shared HTTP, timeout, error handling |
| Normalization | Converts any RawCandidate to NormalizedCandidate |
| IdentityResolver | Compares any two entities |
| Aggregation | Groups any set of candidates |
| CatalogEligibility | Policy gate for any catalog entry |
| AssetEligibility | Policy gate for any asset |
| CoverEngine | Orchestrates cover search across sources |

### 12.2 What Can Be Specialized

| Component | Specialization | How |
|-----------|---------------|-----|
| WikipediaAdapter | Game discovery | Query expansion, cheap filtering, page validation |
| WikipediaAdapter | Cover discovery | Token matching, blacklist, page validation, infobox image |
| SteamAdapter | Game discovery | Already game-specific (Steam is a game store) |
| IGDBAdapter | Game discovery | Already game-specific (IGDB is a game database) |

### 12.3 Specialization Mechanism

**Adapter-specific methods** — not wrappers, not policies, not services.

The adapter is already Wikipedia-specific. Adding game-specific methods to the adapter is a natural extension. The adapter remains generic in its interface (`SourceAdapter`) but implements source-specific optimization internally.

**Concrete approach**: The Wikipedia adapter gains optional parameters on `search()` and `searchCovers()`:

```typescript
interface WikipediaSearchOptions extends SearchOptions {
  readonly gameMode?: boolean;      // enables query expansion + cheap filtering
  readonly coverMode?: boolean;     // enables token matching + blacklist + page validation
}
```

This preserves the `SourceAdapter` interface while allowing Wikipedia-specific optimization.

### 12.4 Why Not Wrappers?

Wrappers add indirection without benefit. The adapter is already Wikipedia-specific — wrapping it in a `WikipediaGameDiscovery` class just moves code around.

### 12.5 Why Not Services?

Services would duplicate adapter logic. The adapter already knows how to query Wikipedia, parse responses, and extract data. Adding a service that does the same thing but with game-specific logic creates duplication.

### 12.6 Why Not Policies?

Policies are for eligibility decisions (ELIGIBLE/INELIGIBLE). Game discovery optimization is not a policy — it's a source-specific implementation detail.

---

## 13. Proposed Architecture

### 13.1 Directory Structure

```
src/
├── sources/
│   ├── wikipedia/
│   │   ├── wikipedia-adapter.ts          # MODIFIED: add gameMode, coverMode
│   │   ├── wikipedia-query.ts            # NEW: query expansion + cheap filter
│   │   ├── wikipedia-page-validation.ts  # NEW: infobox game signal scoring
│   │   └── wikipedia-cover.ts            # NEW: token match + blacklist + page validation
│   ├── steam/
│   │   └── steam-adapter.ts              # UNCHANGED
│   ├── igdb/
│   │   └── igdb-adapter.ts               # UNCHANGED
│   ├── source-adapter.ts                 # UNCHANGED
│   ├── base-adapter.ts                   # UNCHANGED
│   └── source-registry.ts               # UNCHANGED
├── discovery/
│   ├── discovery-engine.ts               # UNCHANGED
│   ├── aggregation.ts                    # MINOR: add title similarity threshold
│   └── discovery-types.ts               # UNCHANGED
├── classification/
│   ├── deterministic-classifier.ts       # UNCHANGED
│   ├── classification-result.ts          # UNCHANGED
│   └── classification-signal.ts          # UNCHANGED
├── identity/
│   ├── deterministic-identity-resolver.ts # UNCHANGED
│   └── identity-resolution-result.ts     # UNCHANGED
├── eligibility/
│   ├── catalog-eligibility.ts            # UNCHANGED
│   └── asset-eligibility.ts              # UNCHANGED
├── cover/
│   ├── cover-engine.ts                   # FIX: use searchCovers instead of search
│   ├── cover-rank.ts                     # MINOR: add exact match bonus, disambiguation penalty
│   └── cover-validate.ts                 # UNCHANGED
├── normalization/
│   ├── normalize.ts                      # UNCHANGED
│   └── normalized-candidate.ts           # UNCHANGED
├── application/
│   └── catalog-service.ts                # UNCHANGED
└── domain/
    └── (all files unchanged)
```

### 13.2 New Files

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src/sources/wikipedia/wikipedia-query.ts` | Query expansion + cheap semantic filtering | ~60 |
| `src/sources/wikipedia/wikipedia-page-validation.ts` | Infobox game signal scoring | ~50 |
| `src/sources/wikipedia/wikipedia-cover.ts` | Token match + blacklist + page validation for covers | ~80 |

### 13.3 Modified Files

| File | Change | Scope |
|------|--------|-------|
| `src/sources/wikipedia/wikipedia-adapter.ts` | Add gameMode/coverMode to search/searchCovers | ~50 lines added |
| `src/cover/cover-engine.ts` | Fix searchCovers call (bug fix) | ~5 lines changed |
| `src/cover/cover-rank.ts` | Add exact match bonus, disambiguation penalty | ~20 lines added |
| `src/discovery/aggregation.ts` | Add title similarity threshold parameter | ~10 lines added |

### 13.4 Unchanged Files

All other files remain unchanged:
- `src/classification/deterministic-classifier.ts`
- `src/identity/deterministic-identity-resolver.ts`
- `src/eligibility/catalog-eligibility.ts`
- `src/eligibility/asset-eligibility.ts`
- `src/sources/source-adapter.ts`
- `src/sources/base-adapter.ts`
- `src/normalization/normalize.ts`
- `src/application/catalog-service.ts`
- All domain files

---

## 14. Component Contracts

### 14.1 WikipediaQuery

**File**: `src/sources/wikipedia/wikipedia-query.ts`

```
Component:    WikipediaQuery
Responsibility: Query construction and cheap filtering for Wikipedia
Input:        query: string, options: { gameMode: boolean }
Output:       { expandedQuery: string, preFiltered: boolean }
Depends on:   None (pure function)
Does NOT own: Page validation, classification, eligibility
```

**Functions**:
- `expandGameQuery(query: string): string` — returns `${query} video game`
- `isLikelyGameTitle(title: string): boolean` — blacklist filter
- `filterNonGameResults(results: WikipediaSearchResult[]): WikipediaSearchResult[]`

### 14.2 WikipediaPageValidation

**File**: `src/sources/wikipedia/wikipedia-page-validation.ts`

```
Component:    WikipediaPageValidation
Responsibility: Validate Wikipedia page contains game evidence
Input:        wikitext: string
Output:       { isGamePage: boolean, score: number, signals: string[] }
Depends on:   None (pure function)
Does NOT own: Classification, eligibility
```

**Functions**:
- `scoreGameSignals(wikitext: string): number` — count dev/pub/genre/platform/date
- `isGamePage(wikitext: string): boolean` — score ≥ 2
- `extractGameHints(wikitext: string): ClassificationHint[]` — generate strong GAME hints

### 14.3 WikipediaCover

**File**: `src/sources/wikipedia/wikipedia-cover.ts`

```
Component:    WikipediaCover
Responsibility: Validate and extract cover images from Wikipedia
Input:        query: string, searchResults: WikipediaSearchResult[]
Output:       CoverCandidate[] with validated images
Depends on:   WikipediaPageValidation
Does NOT own: Cover ranking, asset eligibility
```

**Functions**:
- `filterByTokenMatch(query: string, results: Result[]): Result[]`
- `filterBySemanticBlacklist(results: Result[]): Result[]`
- `validateCoverPage(pageId: number): Promise<{ imageUrl: string | null, isGamePage: boolean }>`
- `extractInfoboxImage(wikitext: string): string | null`

### 14.4 DiscoveryEngine (unchanged)

```
Component:    DiscoveryEngine
Responsibility: Orchestrate multi-source discovery
Input:        DiscoveryRequest { query, sourceFilter, limit, offset }
Output:       DiscoveryResult { groups, totalGroups, sourceErrors }
Depends on:   SourceRegistry, Classifier, IdentityResolver
Does NOT own: Classification, identity, eligibility
```

### 14.5 Normalizer (unchanged)

```
Component:    normalizeCandidate
Responsibility: Convert RawCandidate to NormalizedCandidate
Input:        RawCandidateInput, source, sourceId
Output:       NormalizedCandidate
Depends on:   Platform aliases, region aliases
Does NOT own: Classification, eligibility
```

### 14.6 Classifier (unchanged)

```
Component:    DeterministicClassifier
Responsibility: Determine entity type from signals
Input:        NormalizedCandidate
Output:       ClassificationResult { category, confidence, signals, reason }
Depends on:   None (pure function)
Does NOT own: Eligibility, persistence
```

### 14.7 IdentityResolver (unchanged)

```
Component:    DeterministicIdentityResolver
Responsibility: Determine if candidate matches existing game
Input:        NormalizedCandidate, Game | null
Output:       IdentityResolutionResult { outcome, confidence, signals }
Depends on:   None (pure function)
Does NOT own: Classification, eligibility
```

### 14.8 Aggregator (minor change)

```
Component:    aggregateAndDeduplicate
Responsibility: Group candidates and rank groups
Input:        DiscoverySourceObservation[], IdentityResolver, query
Output:       DiscoveryGroupResult[]
Depends on:   IdentityResolver
Does NOT own: Classification, eligibility
Change:       Add optional titleSimilarityThreshold parameter
```

### 14.9 CatalogEligibility (unchanged)

```
Component:    catalogEligibility
Responsibility: Decide if group enters catalog
Input:        DiscoveryGroupResult
Output:       CatalogEligibilityDecision { status, eligible, confidence, reason }
Depends on:   None (pure function)
Does NOT own: Classification, identity resolution
```

### 14.10 CatalogService (unchanged)

```
Component:    CatalogService
Responsibility: Orchestrate discovery → eligibility → persistence
Input:        searchQuery, options
Output:       CatalogResult<PaginatedResult<Game>>
Depends on:   GameRepository, DiscoveryEngine, EnrichmentService
Does NOT own: Classification, eligibility
```

### 14.11 CoverEngine (minor fix)

```
Component:    CoverEngine
Responsibility: Orchestrate cover search across sources
Input:        query, CoverSearchOptions
Output:       CoverResult { selected, candidates, errors }
Depends on:   SourceRegistry
Does NOT own: Cover validation, ranking
Change:       Fix querySources to call searchCovers instead of search
```

### 14.12 CoverRank (minor addition)

```
Component:    rankCandidates
Responsibility: Order cover candidates by quality
Input:        CoverCandidate[], query
Output:       RankedCoverCandidate[]
Depends on:   None (pure function)
Does NOT own: Cover validation, eligibility
Change:       Add exact match bonus, disambiguation penalty
```

### 14.13 AssetEligibility (unchanged)

```
Component:    assetEligibility
Responsibility: Validate cover association with game
Input:        CoverCandidate, Game | null, CoverSearchType
Output:       AssetEligibilityDecision { eligible, confidence, reason }
Depends on:   None (pure function)
Does NOT own: Cover ranking, classification
```

---

## 15. Implementation Sequence

### Phase 1: Wikipedia Game Discovery Specialization

**What changes?** Wikipedia adapter gains game-specific query optimization.

**Why?** Restores Invariants 1 (query expansion) and 2 (cheap filtering). These are the cheapest, highest-impact changes.

**What existing code remains?** Everything. New files only.

**What tests are added?**
- Unit: `expandGameQuery()`, `isLikelyGameTitle()`, `filterNonGameResults()`
- Integration: Wikipedia adapter with gameMode produces game-biased results
- Regression: "Zelda" → game results, "Zelda Fitzgerald" → filtered out

**What behavior changes?** Wikipedia search for games returns more relevant results.

| Step | File | Change | Est. Lines |
|------|------|--------|-----------|
| 1.1 | `src/sources/wikipedia/wikipedia-query.ts` | NEW: query expansion + cheap filter | ~60 |
| 1.2 | `src/sources/wikipedia/wikipedia-adapter.ts` | Add gameMode to search() | ~20 |
| 1.3 | `tests/sources/wikipedia/wikipedia-query.test.ts` | NEW: unit tests | ~80 |

### Phase 2: Wikipedia Page Validation

**What changes?** Wikipedia adapter validates page-level game evidence in getById().

**Why?** Restores Invariant 3 (page-level validation). This is the highest-impact change for reducing false positives.

**What existing code remains?** Everything. New file + adapter modification.

**What tests are added?**
- Unit: `scoreGameSignals()`, `isGamePage()`, `extractGameHints()`
- Integration: getById() with gameMode generates strong GAME hints from infobox
- Regression: Game pages → strong GAME hints, person pages → no GAME hints

**What behavior changes?** Wikipedia pages with infobox game evidence produce strong classification hints.

| Step | File | Change | Est. Lines |
|------|------|--------|-----------|
| 2.1 | `src/sources/wikipedia/wikipedia-page-validation.ts` | NEW: infobox game signal scoring | ~50 |
| 2.2 | `src/sources/wikipedia/wikipedia-adapter.ts` | Use page validation in getById() | ~15 |
| 2.3 | `tests/sources/wikipedia/wikipedia-page-validation.test.ts` | NEW: unit tests | ~60 |

### Phase 3: Wikipedia Cover Specialization

**What changes?** Wikipedia adapter validates cover source pages.

**Why?** Restores Invariants 4 (token matching), 5 (blacklist), and 6 (page validation). Critical for cover quality.

**What existing code remains?** Everything. New file + adapter modification.

**What tests are added?**
- Unit: `filterByTokenMatch()`, `filterBySemanticBlacklist()`, `validateCoverPage()`, `extractInfoboxImage()`
- Integration: searchCovers() with coverMode validates pages
- Regression: "Doom Eternal" → game cover, "Doom Eternal soundtrack" → filtered

**What behavior changes?** Cover search returns images from validated game pages.

| Step | File | Change | Est. Lines |
|------|------|--------|-----------|
| 3.1 | `src/sources/wikipedia/wikipedia-cover.ts` | NEW: token match + blacklist + page validation | ~80 |
| 3.2 | `src/sources/wikipedia/wikipedia-adapter.ts` | Add coverMode to searchCovers() | ~25 |
| 3.3 | `tests/sources/wikipedia/wikipedia-cover.test.ts` | NEW: unit tests | ~100 |

### Phase 4: Cover Engine Fix + Ranking

**What changes?** Fix CoverEngine bug + improve cover ranking.

**Why?** Bug fix (searchCovers uses wrong adapter method) + restores Invariant 7 (exact match bonus).

**What existing code remains?** Everything. Modifications only.

**What tests are added?**
- Integration: CoverEngine uses searchCovers adapter method
- Unit: exact match bonus, disambiguation penalty

**What behavior changes?** Cover search uses correct adapter method + better ranking.

| Step | File | Change | Est. Lines |
|------|------|--------|-----------|
| 4.1 | `src/cover/cover-engine.ts` | Fix querySources to use searchCovers | ~5 |
| 4.2 | `src/cover/cover-rank.ts` | Add exact match bonus, disambiguation penalty | ~20 |
| 4.3 | `tests/cover/cover-engine.test.ts` | Add test for searchCovers usage | ~15 |

### Phase 5: Aggregation Improvement

**What changes?** Add title similarity threshold to aggregation ranking.

**Why?** Prevents loosely related results from ranking highly.

**What existing code remains?** Everything. Minor modification.

**What tests are added?**
- Unit: title similarity threshold behavior

**What behavior changes?** Results with low title similarity rank lower.

| Step | File | Change | Est. Lines |
|------|------|--------|-----------|
| 5.1 | `src/discovery/aggregation.ts` | Add titleSimilarityThreshold parameter | ~10 |
| 5.2 | `tests/discovery/aggregation.test.ts` | Add threshold tests | ~20 |

---

## 16. Test Strategy

### 16.1 Unit Tests

| Component | Test File | Key Tests |
|-----------|-----------|-----------|
| WikipediaQuery | `tests/sources/wikipedia/wikipedia-query.test.ts` | expandGameQuery, isLikelyGameTitle, filterNonGameResults |
| WikipediaPageValidation | `tests/sources/wikipedia/wikipedia-page-validation.test.ts` | scoreGameSignals, isGamePage, extractGameHints |
| WikipediaCover | `tests/sources/wikipedia/wikipedia-cover.test.ts` | filterByTokenMatch, filterBySemanticBlacklist, validateCoverPage, extractInfoboxImage |
| CoverRank | `tests/cover/cover-rank.test.ts` | exact match bonus, disambiguation penalty |
| Aggregation | `tests/discovery/aggregation.test.ts` | title similarity threshold |

### 16.2 Integration Tests

| Scenario | Test File | Key Assertions |
|----------|-----------|----------------|
| Game search with gameMode | `tests/integration/discovery-game-search.test.ts` | Wikipedia returns game-biased results |
| Cover search with coverMode | `tests/integration/cover-search-wikipedia.test.ts` | Wikipedia returns validated cover images |
| Full pipeline: game discovery | `tests/integration/full-game-discovery.test.ts` | Query → Discovery → Classification → Eligibility → Persistence |
| Full pipeline: cover discovery | `tests/integration/full-cover-discovery.test.ts` | Query → Cover Search → Validation → Ranking |

### 16.3 Regression Tests (Mandatory)

| Case | Expected Behavior |
|------|-------------------|
| Zelda | GAME classification, game cover returned |
| Zelda Fitzgerald | Filtered out by cheap filter or classified as non-game |
| Doom Eternal | GAME classification, game cover returned |
| Hollow Knight | GAME classification, game cover returned |
| William Pellen | Classified as PERSON or filtered out |
| Barry Gjerde | Classified as PERSON or filtered out |
| Michiru Ōshima | Classified as PERSON or filtered out |
| Legend of Legaia | GAME classification, cover returned if available |

### 16.4 Fixture Strategy

Use captured Wikipedia responses (HTML + wikitext) as fixtures to avoid CI dependency on live Wikipedia.

**Fixture sources**:
- Game page: "Hollow Knight" wikitext with infobox
- Person page: "Zelda Fitzgerald" wikitext without game infobox
- Soundtrack page: "Doom Eternal Soundtrack" wikitext
- Disambiguation page: "Zelda (disambiguation)" wikitext
- Cover-bearing game page: "Doom Eternal" with infobox image

---

## 17. Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|-----------|
| Query expansion may over-filter (exclude games without "video game" in Wikipedia title) | Medium | Low | Make expansion configurable, test with known games |
| Page validation may reject games without infoboxes | Medium | Medium | Fall back to search snippet hints when no infobox |
| Cover page validation may reduce cover count | Low | Medium | Keep thumbnail extraction as fallback |
| Cover token matching may reject valid covers (abbreviated titles) | Low | Low | Use partial token matching |
| Cover blacklist may reject valid covers (e.g., "film" in game title) | Low | Low | Use word boundary matching |
| Adapter changes may break existing tests | Medium | Low | Run full test suite after each phase |

---

## 18. Open Questions

### Q1: Should gameMode be a parameter or a separate adapter method?

**Option A**: `adapter.search(query, { gameMode: true })` — parameter on existing method
**Option B**: `adapter.searchGames(query)` — separate method

**Recommendation**: Option A. Preserves the SourceAdapter interface. The adapter internally routes to game-specific logic when gameMode is true.

### Q2: Should cover validation happen before or after dedup?

**Current**: dedup → validation
**Legacy**: validation → dedup

**Recommendation**: validation → dedup (like legacy). Validate before dedup to make better dedup decisions.

### Q3: How to handle games without Wikipedia infoboxes?

Some games have Wikipedia pages but no infobox. The adapter should:
- Generate weaker hints from search snippet (existing behavior)
- Not generate strong GAME hints (no infobox to validate)
- Rely on other sources (Steam, IGDB) for strong classification

**Recommendation**: Accept this limitation. Wikipedia is one source among many. Games without infoboxes will be classified by other sources.

---

## 19. Feature Freeze Compliance

| Constraint | Compliance |
|-----------|-----------|
| No new endpoints | ✓ No API changes |
| No new features | ✓ Recovering lost functionality, not adding new |
| No new domain entities | ✓ No new types needed |
| No public contract changes | ✓ SourceAdapter interface unchanged |
| No title-specific hacks | ✓ All changes are generalizable |
| No removal of existing architecture | ✓ All changes are additive |

**All proposed changes are adaptations of existing functionality, not new features.**

---

## 20. Final Recommendation

### Architecture Quality

The proposed architecture is **minimal** and **focused**:
- 3 new files (all in Wikipedia adapter directory)
- 4 modified files (all minor changes)
- 0 new endpoints
- 0 new domain entities
- 0 changes to core layers (classification, identity, eligibility)

### Separation of Concerns

The proposed architecture **strengthens** separation of concerns:
- Adapter owns source-specific optimization (query expansion, page validation)
- Classifier owns entity type determination
- Eligibility owns catalog entry policy
- Ranking owns candidate ordering

### Legacy Knowledge Recovery

The proposed architecture recovers all 7 lost invariants:
1. ✓ Query expansion → WikipediaQuery
2. ✓ Cheap filtering → WikipediaQuery
3. ✓ Page validation → WikipediaPageValidation
4. ✓ Cover token matching → WikipediaCover
5. ✓ Cover blacklist → WikipediaCover
6. ✓ Cover page validation → WikipediaCover
7. ✓ Exact title match → CoverRank

### Implementation Risk

Low. All changes are:
- Additive (new files + minor modifications)
- Testable (new unit + integration + regression tests)
- Reversible (can remove gameMode/coverMode without breaking generic adapter)

---

## 21. GO / NO-GO

# **GO**

The proposed architecture is achievable, minimal, and preserves all existing layers. Implementation can proceed in 5 phases, each independently testable and committable.

**Blocking issues**: None.
**Non-blocking questions**: Q1 (parameter vs method), Q2 (validation order), Q3 (no-infobox games) — all have recommended answers.

---

*End of Architecture Reconciliation Report*
