# ATP Engine — Roadmap

## 1. Purpose

This roadmap defines the implementation sequence for the ATP Engine.

The roadmap prioritizes:

1. architectural foundations;
2. deterministic correctness;
3. source integration;
4. persistence;
5. search and filtering;
6. AI assistance;
7. optimization.

AI must not be used as a shortcut around incomplete domain architecture.

---

# 2. Phase 0 — Project Foundation

## Objectives

Create the project skeleton and development environment.

### Tasks

- initialize TypeScript project;
- configure Node.js;
- configure Express;
- configure Zod;
- configure ESLint;
- configure Prettier;
- configure Vitest;
- configure Docker;
- establish environment configuration;
- establish project structure;
- establish logging;
- establish error handling;
- establish health endpoint.

### Exit Criteria

```text
Application starts
Express responds
TypeScript compiles
Lint passes
Tests execute
Docker environment works
```

---

# 3. Phase 1 — Domain Model

## Objectives

Define the canonical game domain.

### Tasks

Define concepts such as:

```text
Game
Release
Platform
PlatformFamily
DistributionChannel
Launcher
Region
Developer
Publisher
Genre
ExternalIdentifier
SourceEvidence
GameRelationship
```

Define:

- identifiers;
- invariants;
- value objects where justified;
- relationships;
- validation rules.

### Exit Criteria

Domain models are independent of:

```text
Express
MongoDB
Mongoose
Ollama
HTTP
```

---

# 4. Phase 2 — Repository and Persistence

## Objectives

Implement canonical persistence.

### Tasks

- define repository interfaces;
- choose Mongoose or official MongoDB driver;
- implement MongoDB infrastructure;
- implement Game repository;
- persist canonical Games;
- persist Releases;
- persist source identifiers;
- persist provenance;
- implement duplicate-safe operations.

### Exit Criteria

The engine can:

```text
create Game
retrieve Game
update Game
find candidate Games
persist releases
persist source references
```

without coupling application logic to MongoDB.

---

# 5. Phase 3 — Normalization

## Objectives

Create a consistent internal representation for external data.

### Tasks

Implement:

- title normalization;
- platform normalization;
- region normalization;
- developer normalization;
- publisher normalization;
- genre normalization;
- release-date normalization;
- edition/version normalization.

### Exit Criteria

Equivalent source representations converge on the same normalized representation.

---

# 6. Phase 4 — Source Infrastructure ✅

## Objectives

Implement the external source architecture.

### Initial Sources

```text
Wikipedia (MediaWiki API)
Steam (Store API)
```

### Tasks

- define SourceAdapter contract;
- implement source registry;
- implement Wikipedia adapter;
- implement Steam adapter;
- implement source-specific parsing;
- implement source timeouts;
- implement retry rules;
- implement source error handling;
- implement rate limiting where required.

### Exit Criteria

Sources can independently return normalized candidate records.

### Status

**Complete.** All adapters, registry, error handling, base adapter, and tests implemented.

---

# 7. Phase 5 — Classification ✅

## Objectives

Prevent non-game entities from entering the Game catalog.

### Tasks

- implement deterministic classifier;
- implement classification categories;
- implement classification confidence;
- implement AI classifier interface;
- implement native fallback;
- add classification tests.

### Exit Criteria

The engine can distinguish common:

```text
games
DLC
movies
anime
TV shows
soundtracks
promotional content
```

without requiring an LLM.

### Status

**Complete.** DeterministicClassifier with weighted scoring, 54 tests covering all categories, platform/distribution independence, edge cases, and explainability.

---

# 8. Phase 6 — Identity Resolution ✅

## Objectives

Prevent duplicate and incorrect Game identities.

### Tasks

- implement title comparison;
- implement external-ID matching;
- implement release comparison;
- implement platform handling;
- implement region handling;
- implement remake detection;
- implement remaster detection;
- implement port relationships;
- implement related-game relationships;
- implement native identity scoring;
- implement unresolved state.

### Exit Criteria

The engine correctly handles fixtures such as:

```text
Resident Evil 4 (2005)
≠
Resident Evil 4 (2023)
```

```text
Breath of the Wild Wii U
=
Breath of the Wild Switch
```

```text
Resident Evil 3 NTSC-USA
=
Resident Evil 3 PAL-EUR
```

and can represent:

```text
Final Fantasy Tactics
↔
The War of the Lions
```

as a relationship without blindly merging them.

### Status

**Complete.** DeterministicIdentityResolver with priority-based resolution, 36 tests covering all identity scenarios, external ID matching, title comparison, remake/remaster detection, and explainability.

---

# 9. Phase 7 — Discovery Engine ✅

## Objectives

Combine multiple sources into a unified candidate pipeline.

### Pipeline

```text
Query
 ↓
Source Registry
 ↓
Parallel Source Search (with failure isolation)
 ↓
Candidate Collection
 ↓
Normalization
 ↓
Classification
 ↓
Identity Resolution
 ↓
Aggregation & Deduplication
 ↓
Ranking
 ↓
Pagination
```

### Tasks

- implement discovery use case;
- aggregate source results;
- deduplicate candidates;
- classify;
- resolve identity;
- rank;
- paginate.

### Exit Criteria

A query such as:

```text
Zelda
```

returns relevant game candidates from multiple sources without obvious non-game contamination.

### Status

**Complete.** DiscoveryEngine with multi-source orchestration, deterministic deduplication via IdentityResolver, deterministic ranking, source failure isolation, pagination, and 31 comprehensive tests covering basic discovery, multi-source, source failures, classification, identity resolution, ranking, pagination, source filtering, platform ontology regression, and determinism guarantees.

---

# 10. Phase 8 — Canonical Enrichment ✅

## Objectives

Turn discovered candidates into progressively richer canonical records.

### Tasks

- database-first retrieval;
- missing-field detection;
- source enrichment;
- provenance;
- conflict detection;
- non-destructive updates;
- persistence after enrichment.

### Exit Criteria

Repeated searches improve existing records rather than creating duplicates.

### Status

**Complete.** EnrichmentEngine with deterministic additive enrichment, conservative conflict resolution, release enrichment with date precision improvement, organization name normalization with suffix detection, platform ontology preservation, idempotence, determinism, and 32 comprehensive tests covering basic enrichment, conflict handling, release enrichment, completeness calculation, platform ontology regression, determinism, identity safety, and classification safety.

---

# 11. Phase 9 — Search and Catalog API ✅

## Objectives

Expose the engine through REST.

### Tasks

Implement:

```text
GET /api/v1/games
GET /api/v1/games/search
GET /api/v1/games/:id
```

and required filter/query contracts.

### Supported filters

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

### Exit Criteria

API consumers can:

- search games;
- retrieve individual games;
- filter catalog;
- paginate results.

### Status

**Complete.** REST API with catalog listing, search, and single game retrieval. CatalogService application layer, Zod validation, GameRepository.findMany extension, MongoGameRepository implementation, comprehensive API tests covering filtering, pagination, platform ontology, and response structure. Database-first/scraper-fallback for search endpoints, explicit `origin` field in all API responses, DiscoveryEngine integration for search fallback, comprehensive fallback tests. 730 tests passing.

---

# 12. Phase 10 — Cover Engine ✅

## Objectives

Implement dedicated cover discovery with two modes: query-based (no Game required) and game-based (for existing canonical Games). Support `type` (cover|logo|all) and `limit` (1–9) query parameters with type filtering, deterministic ranking, backward compatibility, and comprehensive tests.

### Tasks

- define CoverCandidate and cover types (CoverType, Cover, CoverEvidence, CoverResult);
- define CoverSearchType (cover|logo|all) as a filter distinct from CoverType;
- CoverResult supports both query-based and game-based flows (`query`, `gameId: string | null`, `type`, `limit`);
- add coverUrls to NormalizedCandidate;
- extend SourceCapabilities with searchCovers;
- enhance Wikipedia adapter with pageimages extraction during search (batch pageids → pageimages);
- implement cover validation (URL + candidate);
- implement cover deduplication (source:sourceId + normalized URL);
- implement relevance-aware deterministic ranking (relevance 0.35, source 0.25, type 0.25, quality 0.08, aspectRatio 0.07);
- implement LOGO CoverType with typeScore 0.1;
- implement filterByType function for type filtering;
- implement CoverEngine with `searchCovers(query, options?)` as primary method;
- type filter applied after dedup, before ranking; limit applied after ranking;
- `discoverCovers(gameId, query)` delegates to `searchCovers` and sets gameId;
- add cover field to Game domain and persistence layer;
- create CoverService with `searchCovers(query, options?)` and `getGameCover(gameId)`;
- implement GET /api/v1/covers/search?q=... endpoint (independent cover search);
- implement GET /api/v1/games/:id/cover endpoint (game-based cover);
- CoverSearchQuerySchema validation (required, 1–200 chars, trimmed, type enum default 'cover', limit int 1–9 default 1);
- title field on CoverCandidate for relevance scoring;
- franchise vs game relevance scoring (title match 0.95, franchise 0.55, index 0.3);
- MIN_COVER_SELECTION_SCORE = 0.55 threshold;
- logo/icon/symbol URL rejection in inferCoverType;
- Steam 403 graceful handling;
- comprehensive test coverage (cover-validate, cover-rank, cover-engine, cover-service, cover-api, validation-schemas).

### Exit Criteria

✅ Query-based cover discovery works without any Game in the database.
✅ Game-based cover discovery continues working for existing Games.
✅ Both modes share the same multi-source → validation → dedup → type filter → ranking → limit infrastructure.
✅ `type=cover` returns only cover-like types (front_cover, box_art, poster, key_art, unknown).
✅ `type=logo` returns only logo candidates.
✅ `type=all` returns all valid candidates.
✅ `limit=N` returns the N highest-ranked candidates.
✅ Default behavior (`type=cover`, `limit=1`) is backward-compatible with existing consumers.
✅ `selected` is null when no candidates meet MIN_COVER_SELECTION_SCORE.
✅ Database-first/scraper-fallback for search endpoints.
✅ Explicit `origin` field in all API responses.
✅ Catalog listing is DB-only (no unrestricted scraping on failure).
✅ Single game retrieval is identity-safe (DB-only).
✅ Cover search remains source-based with scraper origin.
✅ 730 tests passing, build/lint/format clean.

---

# 13. Phase 11 — AI Integration (Complete)

## Objectives

Introduce AI assistance without making it mandatory.

### Tasks Completed

- define AIProvider interface;
- implement Ollama provider with structured output (JSON Schema);
- implement classification assistance (AI for low-confidence/UNKNOWN/ambiguous);
- implement identity resolution assistance (AI for UNRESOLVED/low-confidence);
- implement enrichment conflict assistance;
- implement AI configuration (AI_ENABLED, AI_PROVIDER, AI_MODEL, OLLAMA_URL, AI_TIMEOUT_MS);
- implement deterministic-first fallback on all AI paths;
- implement comprehensive tests with FakeAIProvider (no network in test suite);
- make Classifier and IdentityResolver interfaces async;
- validate AI responses before entering domain logic;
- implement AI observability (structured logging);
- implement prompt versioning (classification-v1, identity-v1, enrichment-v1);
- harden prompts for programmatic use;
- centralized constants (categories, outcomes, thresholds);
- deterministic vs AI safety tests;
- model independence tests;
- regression tests.

### Exit Criteria

The same engine works with:

```text
AI enabled
```

and:

```text
AI disabled
```

with graceful degradation.

Default model: Qwen3 8B (`qwen3:8b`) via Ollama.

---

# 14. Phase 12 — AI Evaluation (Complete)

## Objectives

Measure whether AI actually improves ATP.

### Tasks Completed

- created evaluation dataset (135 cases: 50 classification, 45 identity, 40 enrichment);
- implemented evaluation harness with ground truth comparison;
- implemented deterministic baseline evaluator;
- ran full AI evaluation with qwen3:8b via Ollama;
- generated regression matrix and analysis;
- documented findings and recommendations.

### Results

| Metric | Deterministic | AI-Assisted | Delta |
|--------|--------------|-------------|-------|
| Classification | 100% | 96% | -4% |
| Identity | 8.9% | 73.3% | +64.4% |
| Enrichment | 57.5% | 72.5% | +15% |
| Overall | 57.0% | 81.5% | +24.5% |

### Key Findings

- AI adds massive value for identity resolution (+64.4%)
- AI adds meaningful value for enrichment conflicts (+15%)
- AI adds no value for classification (deterministic already 100%)
- AI latency: avg 80s, min 28s, max 180s (timeouts)
- 8 timeouts across identity and enrichment

### Exit Criteria

AI is retained only where it demonstrates measurable value.

**Verdict**: Keep AI for identity and enrichment. Disable for classification.

---

# 14.5. Phase 12.1 — AI Performance Benchmark (Complete)

## Objectives

Determine whether local AI is viable for synchronous ATP operations.

### Tasks Completed

- audited complete AI execution path;
- identified thinking mode as primary latency source;
- benchmarked thinking enabled vs disabled;
- ran full evaluation with think: false;
- analyzed 8 timeout cases;
- measured latency percentiles;
- evaluated optimization opportunities.

### Key Findings

| Mode | Latency | Accuracy | Timeouts |
|------|---------|----------|----------|
| think: true (default) | 80s avg | 81.5% | 8/135 (5.9%) |
| think: false | 9.3s avg | 68.9% | 0/135 (0%) |

- Thinking mode causes 5-6x latency increase
- Disabling thinking drops identity accuracy from 73.3% to 33.3%
- Classification unaffected (deterministic already 100%)
- Enrichment slightly improves without thinking (72.5% → 75%)

### Verdict

**Local synchronous AI is NOT viable for identity resolution.**

Qwen3:8B cannot provide acceptable latency for synchronous operations:
- With thinking: too slow (80-108s) + timeouts
- Without thinking: too inaccurate for identity (33.3%)

### Recommended Architecture

```text
Synchronous: Deterministic only
Async: AI enrichment for low-confidence cases
```

---

# 14.6. Phase 12.2 — Local LLM Model Benchmark (Complete)

## Objectives

Evaluate alternative local LLMs to determine if any model provides useful identity resolution accuracy at acceptable latency.

### Tasks Completed

- pulled 5 candidate models (qwen3:1.7b, qwen3:4b, gemma3:4b, phi4-mini, qwen3:8b);
- created sample benchmark tooling (representative cases);
- ran identity, enrichment, and classification benchmarks;
- measured latency percentiles (avg, median, P95, P99, max);
- analyzed error patterns per model;
- evaluated thinking mode impact.

### Models Tested

| Model | Parameters | Quantization | Thinking |
|-------|-----------|--------------|----------|
| qwen3:1.7b | 2.0B | Q4_K_M | Yes (not used) |
| qwen3:4b | 4.0B | Q4_K_M | Yes (not used) |
| gemma3:4b | 4.3B | Q4_K_M | No |
| phi4-mini | 3.8B | Q4_K_M | No |
| qwen3:8b | 8.2B | Q4_K_M | Yes |

### Identity Results (16 representative cases)

| Model | Mode | Accuracy | Avg | P95 | Timeouts |
|-------|------|----------|-----|-----|----------|
| qwen3:4b | default | 56.3% | 77.5s | 116.5s | 0 |
| qwen3:8b | thinking | 53.3% | 68.8s | 112.2s | 1 |
| qwen3:8b | no-thinking | 53.3% | 64.8s | 80.5s | 1 |
| phi4-mini | default | 43.8% | 1.7s | 6.7s | 0 |
| qwen3:1.7b | default | 18.8% | 11.1s | 17.9s | 0 |
| gemma3:4b | default | 0.0% | 4.8s | 24.7s | 0 |

### Key Findings

- **No model occupies the "high accuracy, low latency" quadrant**
- qwen3:4b achieves best accuracy (56.3%) but slowest (77.5s avg)
- phi4-mini fastest (1.7s) but accuracy (43.8%) below random baseline
- gemma3:4b returns UNRESOLVED for all identity cases (0% accuracy)
- qwen3:1.7b too small (18.8% accuracy)
- Thinking mode provides zero accuracy improvement for identity

### Verdict

**No local model is viable for synchronous AI assistance.**

### Recommendation

**B — Keep AI architecture, but async only.**

```text
Synchronous: Deterministic only
Async: AI enrichment via gemma3:4b or phi4-mini (background)
```

---

# 15. Phase 13 — Reliability

## Objectives

Make the engine resilient to external failures.

### Tasks Completed

- [x] structured logging;
- [x] request IDs;
- [x] source timeout handling;
- [x] retry policy;
- [x] rate-limit handling (HTTP);
- [x] failure-mode tests.

### Deferred (not blocking)

- [ ] source-level rate limiting — sources handle their own limits; low traffic does not justify duplication.
- [ ] circuit breaker — retry + timeout sufficient for current traffic.
- [ ] dedicated metrics platform — covered by structured logging; premature.

### Status

**Complete.** Core reliability infrastructure implemented and validated.

### Exit Criteria

Failure of one external dependency does not unnecessarily take down ATP.

---

# 16. Phase 14 — Performance ✅

## Objectives

Optimize only after correctness is established.

### Tasks Completed

- [x] Database indexes: `(classification, completeness)`, `(updatedAt: -1)`, `(releases.releaseDate.year: 1)`;
- [x] MongoDB connection pool config: `maxPoolSize: 10`, `maxIdleTimeMS: 30_000`;
- [x] Steam search parallelization: bounded concurrency (limit 5) via `parallelMap`;
- [x] Wikipedia page image cache: LRU cache (500 entries, 5min TTL);
- [x] Aggregation pre-grouping: Union-Find by exact external ID to skip redundant identity resolution.

### Exit Criteria

Performance improvements do not change domain behavior.

### Status

**Complete.** All 833 tests passing. Behavior-preserving optimizations across database, sources, and aggregation layers.

---

# 17. Phase 15 — Production Hardening ✅

## Objectives

Prepare ATP for long-term use.

### Tasks Completed

- [x] Rate limiter resource lifecycle fix (lazy cleanup, no setInterval leak);
- [x] Production Docker configuration (.dockerignore, NODE_ENV, HEALTHCHECK, --omit=dev).

### Validated (no changes required)

- Configuration validation: Zod-based, fail-fast, defaults, formatted errors ✅
- Request limits: pagination max 100, cover limit max 9, cover query max 200 chars, JSON body default 100kb ✅
- Observability: structured JSON logging, requestId, HTTP/discovery/classification/identity/enrichment/source/AI events, health endpoint ✅
- Security: input validation via Zod, regex injection protection, error handler generic messages, no secrets in code ✅

### Deferred (valid architectural decisions, not blocking)

- Helmet security headers — needs deployment model discussion
- CORS — not needed for backend-to-backend usage
- Backup strategy — cannot define without deployment target
- Migration tooling — MongoDB flexible schema sufficient
- API authentication — internal service, not public-facing
- Circuit breaker — retry + timeout sufficient
- Dedicated metrics platform — structured logging sufficient
- DB projection optimization — needs measurement
- Enrichment RegExp memoization — needs measurement

### Status

**Complete.** Rate limiter fixed, Docker production-hardened, all remaining items deferred with valid justification.

---

# 18. Phase 16 — Enrichment Integration (Proposed)

## Objectives

Wire the existing EnrichmentEngine into the application layer and persist discovery results.

### Candidate Subtasks

- EnrichmentService — wire EnrichmentEngine into application layer
- Persist discovery results — stop making every search a full external API call
- Integration tests for enrichment and persistence flows

### Status

**Reconnaissance complete.** Awaiting scope approval.

See `docs/reports/phase-16-reconnaissance.md` for full analysis.

---

# 19. Recommended Implementation Order

The preferred sequence is:

```text
Foundation
   ↓
Domain
   ↓
Persistence
   ↓
Normalization
   ↓
Sources
   ↓
Classification
   ↓
Identity
   ↓
Discovery
   ↓
Enrichment
   ↓
API
   ↓
Covers
   ↓
AI
   ↓
Evaluation
   ↓
Reliability
   ↓
Performance
   ↓
Production
```

Do not invert this order merely to reach a visible feature faster.

---

# 19. AI Implementation Rule

AI must not be implemented before the native pipeline is capable of producing a valid result.

The native system is the baseline.

AI exists to improve ambiguous cases.

---

# 20. MVP Definition

The first meaningful MVP should be capable of:

```text
1. Search multiple sources
2. Normalize results
3. Filter non-game entities
4. Resolve obvious duplicate identities
5. Handle platforms, platform families, and regions
6. Distinguish obvious remakes
7. Track distribution channels and launchers
8. Handle mobile platforms (Android, iOS) correctly
9. Distinguish platform from distribution (Android ≠ Google Play)
10. Persist canonical Games
11. Retrieve from database first
12. Search by term
13. Filter catalog
14. Paginate
15. Retrieve covers
16. Operate without AI
```

AI may be added after these capabilities are stable.

---

# 21. Post-MVP AI

After the deterministic MVP is stable, AI should initially target only ambiguous cases.

Recommended priority:

```text
1. Identity resolution
2. Classification
3. Metadata conflict resolution
4. Search ranking
```

Identity resolution should receive the highest priority because incorrect merges have the greatest potential impact on catalog integrity.

---

# 22. Future Features

Possible future capabilities include:

```text
scheduled enrichment
source synchronization
catalog health reports
administrative merge tools
manual identity correction
source confidence analytics
AI evaluation dashboards
additional external sources
background workers
job queues
event-driven enrichment
```

These are not required for the initial implementation.

---

# 23. Scope Control

A feature should not be implemented merely because it could be useful.

Before adding functionality, verify:

1. Is it required by the current domain?
2. Does it improve catalog quality?
3. Does it introduce unnecessary complexity?
4. Can it be postponed without architectural damage?

---

# 24. Roadmap Invariants

1. Correctness precedes optimization.
2. Native logic precedes AI.
3. Persistence precedes advanced enrichment.
4. Identity resolution precedes large-scale catalog ingestion.
5. AI cannot compensate for poor domain modeling.
6. External sources must remain replaceable.
7. The engine must remain operational without AI.
8. Every phase must have testable exit criteria.

---

# 25. Final Goal

ATP should evolve from:

```text
scraper
```

into:

```text
canonical game knowledge engine
```

The progression is:

```text
External Sources
       ↓
Discovery
       ↓
Normalization
       ↓
Classification
       ↓
Identity Resolution
       ↓
Canonical Catalog
       ↓
Enrichment
       ↓
AI-assisted Intelligence
```

The final system should not merely retrieve information.

It should determine **what information represents the same thing, what does not, and what ATP can confidently consider canonical knowledge.**
