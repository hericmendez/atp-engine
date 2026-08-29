# ATP Engine — Discovery

## 1. Purpose

Discovery is the process of finding game candidates from external sources.

It is distinct from canonical catalog querying.

Discovery searches the external world for information that may not yet exist in ATP's database.

---

# 2. Discovery vs Catalog

### Catalog

```text
Persistent canonical knowledge
```

### Discovery

```text
Temporary external evidence
```

A discovery result is not automatically a canonical Game.

---

# 3. Discovery Pipeline

The conceptual pipeline is:

```text
Query
 ↓
Source Selection
 ↓
Source Search
 ↓
Candidate Collection
 ↓
Source Filtering
 ↓
Normalization
 ↓
Classification
 ↓
Deduplication
 ↓
Identity Resolution
 ↓
Ranking
 ↓
Pagination
```

Some stages may execute concurrently or in a different technical order as long as their semantic responsibilities remain intact.

---

# 4. Query Types

ATP should support several discovery operations.

## Game search

Example:

```text
"zelda"
```

Expected behavior:

```text
The Legend of Zelda
The Legend of Zelda: Ocarina of Time
The Legend of Zelda: Breath of the Wild
...
```

---

## Individual metadata discovery

Example:

```text
"Resident Evil 4"
```

The engine attempts to identify and retrieve metadata for a specific game.

---

## Cover discovery

Example:

```text
"zelda"
```

The engine searches sources for relevant cover candidates.

Cover discovery is a dedicated capability.

---

# 5. Source Selection

Not every source supports every operation.

A source may expose capabilities such as:

```text
SEARCH_GAMES
GET_GAME
SEARCH_COVERS
SEARCH_METADATA
```

The discovery engine should select sources according to their capabilities.

---

# 6. Multi-Source Discovery

A search may query multiple sources.

Example:

```text
Query
 ├── Wikipedia
 ├── SteamDB
 └── Future Source
```

Results are collected into a unified candidate set.

---

# 7. Source Failure

One source failing should not automatically fail the entire discovery operation.

Example:

```text
Wikipedia ❌
SteamDB ✓
```

The engine should continue where meaningful results remain available.

---

# 8. Candidate Collection

Each source returns source-specific records.

The discovery layer converts them into a common candidate representation.

Conceptually:

```text
Source Record
      ↓
Candidate
```

Candidates may contain:

- source;
- external identifier;
- title;
- description;
- release date;
- platforms;
- developers;
- publishers;
- genres;
- URLs;
- cover information;
- source-specific metadata.

---

# 9. Candidate Filtering

Candidates should be filtered before expensive processing.

Possible filters:

- obvious non-game content;
- irrelevant source results;
- unsupported content types;
- missing minimum identifying information;
- duplicate source records.

---

# 10. Normalization

Normalization should standardize:

- title formatting;
- whitespace;
- punctuation;
- dates;
- platform names;
- regions;
- organization names;
- genres.

Normalization should not destroy the original source representation.

---

# 11. Classification

After normalization, candidates should be classified.

Example:

```text
Candidate
   ↓
GAME
```

or:

```text
Candidate
   ↓
DLC
```

Non-game candidates should not enter the canonical Game pipeline.

---

# 12. Candidate Deduplication

The same external entity may appear:

- multiple times in one source;
- across multiple sources;
- under different titles;
- in different regions.

Obvious duplicates should be reduced before identity resolution.

Deduplication must remain conservative.

---

# 13. Identity Resolution

When candidates may represent the same canonical game, identity resolution is applied.

```text
Candidate A
Candidate B
Candidate C
      ↓
Identity Resolution
      ↓
Canonical identity groups
```

The identity resolver uses a priority-based deterministic approach:

1. Exact external ID match → SAME_GAME
2. External ID mismatch → DIFFERENT_GAME
3. Remake markers → DIFFERENT_GAME with REMAKE relationship
4. Version markers with base title match → RELATED_GAME
5. Score-based → SAME_GAME / DIFFERENT_GAME / UNRESOLVED

See:

```text
docs/identity-resolution.md
```

---

# 14. Ranking

Search results should be ranked using explicit criteria.

Possible signals include:

- title relevance;
- exact match;
- normalized match;
- source confidence;
- metadata completeness;
- identity confidence;
- popularity signals when available.

Ranking must be deterministic unless AI assistance is explicitly used.

---

# 15. AI-Assisted Ranking

AI may assist when semantic relevance is difficult to determine.

However:

```text
candidate reduction
      ↓
AI
      ↓
validated ranking
```

is preferred over sending the complete raw source result set to an LLM.

---

# 16. Pagination

Pagination must happen after the system has established a stable result ordering.

For multi-source discovery, the engine must define whether pagination applies to:

- each source independently;
- the merged candidate set;
- canonical results.

The public API contract must define the final behavior.

---

# 17. Search by Term

Term search is not necessarily an exact title lookup.

For:

```text
zelda
```

the engine should be capable of returning relevant related titles.

Search should support:

- partial matches;
- normalized matches;
- alternate titles;
- source-specific search behavior.

---

# 18. Exact Search

When the query strongly resembles a specific title, exact or near-exact candidates should receive higher ranking.

Example:

```text
Resident Evil 4
```

should prioritize the relevant Resident Evil 4 records before unrelated entries.

---

# 19. Search Ambiguity

Ambiguous queries may return multiple distinct games.

Example:

```text
Mario
```

must not be interpreted as one canonical game.

The engine should return relevant candidates.

---

# 20. Discovery of Unknown Games

A game that does not exist in the database may be discovered externally.

Pipeline:

```text
External Search
     ↓
Candidate
     ↓
Classification
     ↓
Identity Resolution
     ↓
Validation
     ↓
New Canonical Game
     ↓
Persistence
```

---

# 21. Existing Games

If a discovered candidate corresponds to an existing canonical Game:

```text
Candidate
    ↓
Existing identity
    ↓
Enrichment
```

The engine should enrich the existing record instead of creating a duplicate.

---

# 22. Database-First Individual Lookup

Individual game lookup must first query the canonical catalog.

```text
Request
 ↓
Database
 ↓
Sufficient?
 ├── YES → Return
 └── NO → Discovery
```

This is different from broad search, where external discovery may be an intentional operation.

---

# 23. Cover Discovery

Cover discovery is a dedicated capability.

It may return multiple candidates.

The original scraper returned approximately 1–3 filtered cover candidates.

The ATP implementation should preserve the ability to return a small, high-quality candidate set.

Cover selection should consider:

- title relevance;
- game identity;
- platform/version relevance;
- image quality;
- source reliability.

---

# 24. Cover Results Are Not Game Identity

A cover image must not be used as the sole identity proof.

A cover is supporting evidence.

---

# 25. Discovery and AI

AI may assist with:

- candidate classification;
- semantic relevance;
- identity ambiguity;
- metadata normalization;
- source conflicts.

AI must not replace the discovery architecture.

---

# 26. AI Failure

If AI is unavailable:

```text
AI failure
    ↓
Native discovery logic
```

The system should continue whenever deterministic processing can provide a useful result.

---

# 27. Discovery Failure

If all sources fail:

```text
Source A ❌
Source B ❌
Source C ❌
```

the engine should return a meaningful external discovery error.

It must not fabricate metadata.

---

# 28. No Fabricated Metadata

Neither native logic nor AI may invent factual metadata merely to satisfy a response.

If evidence is insufficient:

```text
unknown
```

is preferable to fabricated data.

---

# 29. Discovery Result Contract

Internally, discovery should be capable of distinguishing:

```text
candidate
source
confidence
classification
identity status
evidence
```

The exact implementation belongs to the application/domain model.

---

# 30. Discovery Goal

Discovery should answer:

> What relevant game-related information can ATP find from the available external sources?

It should not automatically assume that every discovered record is a new game.

Discovery finds evidence.

Classification interprets it.

Identity resolution determines what it represents.

Validation determines what may become canonical knowledge.

---

# 31. Implementation Architecture

## Source Types

```text
src/discovery/
├── discovery-types.ts          # DiscoveryRequest, DiscoveryResult, DiscoveryGroupResult
├── discovery-engine.ts         # DiscoveryEngine orchestration
├── aggregation.ts              # aggregateAndDeduplicate, rankGroups
└── index.ts                    # barrel exports
```

## Data Flow

```text
DiscoveryRequest
        ↓
SourceRegistry.selectSources()
        ↓
Promise.allSettled(sourceAdapter.search())
        ↓
normalizeCandidate() per source result
        ↓
DeterministicClassifier.classify() per candidate
        ↓
DiscoverySourceObservation[]
        ↓
aggregateAndDeduplicate()
  ├── pairwise IdentityResolver.resolve()
  ├── group SAME_GAME candidates
  └── calculate ranking scores
        ↓
rankGroups() (deterministic sort)
        ↓
Pagination (limit/offset)
        ↓
DiscoveryResult
```

## DiscoveryEngine

Main orchestrator:

```typescript
const engine = new DiscoveryEngine(registry, classifier, identityResolver);
const result = await engine.discover({ query: 'zelda', limit: 20 });
```

Responsibilities:
- Select sources by capabilities
- Query sources in parallel with failure isolation
- Normalize candidates via existing normalization
- Classify via DeterministicClassifier
- Aggregate and deduplicate via IdentityResolver
- Rank deterministically
- Paginate results

## Aggregation Strategy

Candidates are grouped by pairwise identity resolution:

1. For each unprocessed candidate, compare against all other unprocessed candidates
2. If IdentityResolver returns SAME_GAME, group them together
3. Each group becomes one DiscoveryGroupResult with multiple observations

Group IDs are derived from sorted source:sourceId pairs, ensuring determinism.

## Deduplication Strategy

Uses existing IdentityResolver - NOT title-only matching.

The aggregator creates a temporary Game object from observation A and resolves observation B against it. If outcome is SAME_GAME, they are grouped.

## Ranking Strategy

Deterministic ranking based on weighted signals:

| Signal | Weight |
|--------|--------|
| Identity confidence | 0.3 |
| Classification confidence | 0.2 |
| Source count (capped at 3) | 0.2 |
| Metadata completeness | 0.15 |
| Title relevance | 0.15 |

Title relevance scoring:
- Exact match: 1.0
- Query contained in title: 0.8
- Title contained in query: 0.6
- Partial word match: 0.2 * (matching words / total words)

Tie-breaking: source count > groupId (deterministic).

## Source Failure Behavior

- Each source is queried via `Promise.allSettled`
- Failed sources produce `DiscoverySourceError` entries
- Successful sources continue processing
- If ALL sources fail, empty groups with errors is returned
- Source errors include: source, errorType, message, retryable

## Determinism Guarantees

- Group IDs derived from sorted source:sourceId pairs (not counter)
- Ranking uses deterministic weighted scoring
- Tie-breaking uses deterministic comparisons
- Source execution order does not affect final result
- Same input always produces same output

## Platform Ontology Regression

Discovery explicitly tests that:
- Steam → DistributionChannel (not Platform)
- Google Play → DistributionChannel (not Platform)
- MAME → NOT promoted to Platform
- RetroArch → NOT promoted to Platform
- Unity → NOT promoted to Platform
- PICO-8 → Platform (fantasy-console)
- CPS2 → Platform (arcade)
- Commodore 64 → Platform (computer)
- MS-DOS → Platform (computer)
