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

# 11. Phase 9 — Search and Catalog API

## Objectives

Expose the engine through REST.

### Tasks

Implement:

```text
GET /api/v1/games
GET /api/v1/games/search
GET /api/v1/games/:id
GET /api/v1/games/:id/cover
```

and required filter/query contracts.

### Supported filters

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

### Exit Criteria

API consumers can:

- search games;
- retrieve individual games;
- filter catalog;
- paginate results;
- retrieve covers.

---

# 12. Phase 10 — Cover Engine

## Objectives

Implement dedicated cover discovery.

### Tasks

- define CoverCandidate;
- source cover adapters;
- cover relevance filtering;
- cover ranking;
- duplicate filtering;
- cover persistence;
- dedicated cover endpoint.

### Exit Criteria

A game query can return a small set of relevant cover candidates rather than arbitrary image results.

---

# 13. Phase 11 — AI Integration

## Objectives

Introduce AI assistance without making it mandatory.

### Tasks

- define AIProvider interface;
- implement Ollama provider;
- implement remote provider adapter;
- implement structured outputs;
- implement Zod validation;
- implement classification assistance;
- implement identity assistance;
- implement fallback behavior;
- implement AI observability;
- implement prompt versioning.

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

---

# 14. Phase 12 — AI Evaluation

## Objectives

Measure whether AI actually improves ATP.

### Tasks

Create a regression dataset containing difficult cases.

Categories should include:

```text
remakes
remasters
ports
regional releases
alternate titles
editions
DLC
movies
anime
franchise entries
```

Measure:

```text
native accuracy
AI-assisted accuracy
fallback accuracy
false merges
false separations
```

### Exit Criteria

AI is retained only where it demonstrates measurable value.

---

# 15. Phase 13 — Reliability

## Objectives

Make the engine resilient to external failures.

### Tasks

- source timeout handling;
- retry policy;
- rate-limit handling;
- source isolation;
- AI timeout handling;
- AI fallback;
- database error handling;
- structured logging;
- request IDs;
- metrics.

### Exit Criteria

Failure of one external dependency does not unnecessarily take down ATP.

---

# 16. Phase 14 — Performance

## Objectives

Optimize only after correctness is established.

### Tasks

- database indexing;
- query optimization;
- candidate retrieval optimization;
- source parallelization;
- caching;
- AI caching;
- connection pooling;
- response optimization.

### Exit Criteria

Performance improvements do not change domain behavior.

---

# 17. Phase 15 — Production Hardening

## Objectives

Prepare ATP for long-term use.

### Tasks

- production Docker configuration;
- configuration validation;
- security review;
- API rate limiting;
- request limits;
- observability;
- backup strategy;
- migration strategy;
- operational documentation.

---

# 18. Recommended Implementation Order

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
