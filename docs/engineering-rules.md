# ATP Engine — Engineering Rules

## 1. Purpose

This document defines the engineering rules for the ATP Engine.

These rules are independent of the development environment, coding agent, AI provider, framework, or specific implementation technology.

The goal is to preserve:

- correctness;
- data integrity;
- deterministic behavior;
- modularity;
- testability;
- source independence;
- AI provider independence;
- maintainability;
- observability;
- extensibility.

---

# 2. Architectural Philosophy

The ATP Engine is a **deterministic-first knowledge system with optional AI assistance**.

The system must function without AI.

AI exists to improve the engine's ability to interpret ambiguous information.

The fundamental architecture is:

```text
External Data
      ↓
Discovery
      ↓
Normalization
      ↓
Classification
      ↓
Deterministic Processing
      ↓
AI Assistance when useful
      ↓
Validation
      ↓
Canonical Knowledge
      ↓
Persistence
```

The exact implementation may evolve, but this principle must remain.

---

# 3. Layered Architecture

The preferred dependency direction is:

```text
Interface / API
       ↓
Application
       ↓
Domain
       ↓
Infrastructure
```

Dependencies should point inward.

The domain must not depend directly on:

- HTTP;
- HTML;
- scraping libraries;
- database drivers;
- ORM/ODM implementations;
- LLM SDKs;
- AI providers;
- framework-specific controllers.

---

# 4. Conceptual Architecture

The ATP Engine should evolve toward a structure conceptually similar to:

```text
┌──────────────────────────────────────────────┐
│                    API                       │
│                                              │
│ Games / Search / Covers / Catalog            │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│               APPLICATION                    │
│                                              │
│ Search                                       │
│ Discovery                                    │
│ Catalog Query                                │
│ Classification                              │
│ Identity Resolution                          │
│ Persistence Orchestration                    │
└──────────────┬────────────────┬──────────────┘
               │                │
               ↓                ↓
       ┌──────────────┐   ┌──────────────┐
       │    DOMAIN    │   │ AI BOUNDARY  │
       │              │   │              │
       │ Game         │   │ Classifier   │
       │ Release      │   │ Resolver     │
       │ Platform     │   │ Conflict     │
       │ Source       │   │ Normalizer   │
       │ Relationship │   │              │
       └──────┬───────┘   └──────┬───────┘
              │                  │
              └────────┬─────────┘
                       ↓
┌──────────────────────────────────────────────┐
│                INFRASTRUCTURE                │
│                                              │
│ Database                                     │
│ Source adapters                              │
│ HTTP clients                                 │
│ AI providers                                 │
│ Scrapers                                     │
└──────────────────────────────────────────────┘
```

This is a conceptual model.

Do not create unnecessary layers, interfaces, or packages merely to reproduce the diagram.

---

# 5. Domain Independence

The domain represents canonical video game knowledge.

It must not know whether data came from:

- Wikipedia;
- SteamDB;
- another website;
- an API;
- an LLM;
- a local model;
- manual input.

The domain should operate on normalized concepts.

---

# 6. Core Domain Concepts

The domain should be capable of representing, as appropriate:

```text
Game
Release
Platform
Region
Developer
Publisher
Genre
Source
GameRelationship
```

The exact schema is defined by `docs/domain-model.md`.

Do not duplicate domain definitions in multiple places.

---

# 7. Game vs Release

A game and its releases are conceptually distinct.

Example:

```text
The Legend of Zelda:
Breath of the Wild

Game
 ├── Wii U release
 └── Nintendo Switch release
```

Different platforms do not automatically imply different games.

Release-level information may include:

- platform;
- region;
- release date;
- version;
- edition.

---

# 8. Game Identity

Game identity must never rely solely on title equality.

The engine should consider available evidence such as:

- normalized title;
- alternate titles;
- external identifiers;
- release dates;
- platforms;
- developers;
- publishers;
- regions;
- edition markers;
- version markers;
- known relationships.

Identity resolution must be treated as a domain capability.

---

# 9. Identity Examples

The following behaviors are required.

### Different games

```text
Resident Evil 4 (2005)
≠
Resident Evil 4 (2023 Remake)
```

### Same game, different platforms

```text
Breath of the Wild — Wii U
=
Breath of the Wild — Nintendo Switch
```

### Regional releases

```text
Resident Evil 3 — NTSC/USA
=
Resident Evil 3 — PAL/EUR
```

### Related but distinct versions

```text
Final Fantasy Tactics
Final Fantasy Tactics: The War of the Lions
Final Fantasy Tactics: The Ivalice Chronicles
```

These must not be blindly merged.

The system must be able to represent relationships between them.

---

# 10. Relationship Vocabulary

Relationships must be explicitly modeled.

Possible values include:

```text
remake
remaster
enhanced_version
port
expansion
regional_release
alternate_title
related_game
```

The canonical relationship vocabulary must be maintained centrally.

Do not create ad-hoc relationship values inside individual features.

---

# 11. Source Architecture

External data sources must be isolated behind adapters.

Conceptually:

```text
SourceAdapter
 ├── search()
 ├── getGame()
 ├── getCover()
 └── capabilities
```

A source does not need to support every operation.

Capabilities should be explicit.

---

# 12. Source-Specific Logic

Source-specific parsing must remain inside the source adapter.

Do not leak:

- CSS selectors;
- HTML structure;
- source-specific field names;
- source-specific assumptions;
- scraping logic;

into domain services.

Bad:

```text
GameService
 ├── Wikipedia parser
 ├── SteamDB parser
 └── domain logic
```

Preferred:

```text
GameService
      ↓
Discovery
      ↓
Source adapters
 ├── WikipediaAdapter
 ├── SteamDBAdapter
 └── OtherAdapter
```

---

# 13. Source Data Is Not Canonical

Source data is an observation.

Canonical data is the ATP's validated representation.

Conceptually:

```text
Source A ─┐
Source B ─┼──→ Processing ──→ Canonical Game
Source C ─┘
```

Source records must not automatically overwrite canonical data.

---

# 14. Provenance

Where practical, canonical metadata should retain provenance.

For important fields such as:

```text
title
release date
developer
publisher
platform
genre
cover
```

the system should eventually be able to determine where the information originated.

This becomes important when sources disagree.

---

# 15. Discovery Pipeline

Discovery should follow the conceptual pipeline:

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

Not every operation must occur in exactly this order in every implementation.

The domain semantics must remain consistent.

---

# 16. Classification

The system must distinguish games from unrelated media.

Examples include:

```text
GAME
DLC
EXPANSION
MOVIE
TV_SHOW
ANIME
SOUNDTRACK
PROMOTIONAL
HARDWARE
BOOK
UNKNOWN
```

Classification may combine deterministic rules and AI assistance.

The final classification must be validated before canonical persistence.

---

# 17. Deterministic-First Processing

Whenever sufficient evidence exists, deterministic logic must be preferred.

Examples:

```text
Exact external ID
→ same entity

Known region variation
→ same game / regional release

Explicit "remake" marker + incompatible release
→ different game / remake

Exact known platform release
→ same game
```

The exact rule set belongs to the domain documentation.

---

# 18. AI Architecture

AI is an optional subsystem.

It should be exposed through capability-oriented interfaces.

Examples:

```text
GameClassifier
IdentityResolver
ConflictResolver
MetadataNormalizer
```

Avoid exposing provider-specific implementations to the domain.

The domain must not know whether AI comes from:

```text
Ollama
Gemini
OpenAI-compatible API
another provider
```

---

# 19. AI Provider Boundary

Provider-specific code belongs to infrastructure.

Conceptually:

```text
AI Capability
      ↓
Provider-independent interface
      ↓
Infrastructure
 ├── Local provider
 ├── Remote provider
 └── Other provider
```

Changing the AI provider must not require rewriting domain logic.

---

# 20. AI Is Optional

The system must support:

```text
AI_ENABLED=false
```

or an equivalent configuration.

With AI disabled, the ATP Engine must remain operational.

The native engine is the fundamental implementation.

---

# 21. Native Fallback

The native engine is always the fallback.

AI failure must not unnecessarily fail the request.

Conceptually:

```text
Operation
    ↓
Native processing
    ↓
AI useful?
 ├── NO → Native result
 └── YES
       ↓
      AI
       ↓
   Valid result?
    ├── YES → Validate
    └── NO  → Native fallback
```

AI failure includes:

- timeout;
- network failure;
- provider outage;
- rate limiting;
- malformed response;
- invalid schema;
- model unavailable;
- low confidence;
- disabled AI.

---

# 22. AI Invocation Policy

AI should be invoked only when it provides meaningful value.

Avoid LLM calls for deterministic cases.

Preferred:

```text
Cheap rules
    ↓
Candidate reduction
    ↓
Ambiguity detected
    ↓
AI
```

Not:

```text
Every record
    ↓
LLM
```

---

# 23. Candidate Reduction

Before invoking AI:

1. filter irrelevant records;
2. normalize titles;
3. remove obvious non-games;
4. compare known identifiers;
5. use deterministic matching;
6. reduce the candidate set.

The LLM should operate on a constrained candidate set.

---

# 24. AI Structured Output

AI outputs must be structured.

Conceptually:

```json
{
  "decision": "different_game",
  "relationship": "remake",
  "confidence": 0.98
}
```

Structured output must be validated against an explicit schema.

Invalid output is treated as AI failure.

Do not parse arbitrary natural-language answers as canonical domain decisions.

---

# 25. AI Confidence

AI decisions should expose confidence where meaningful.

Confidence must not be interpreted as truth.

A high confidence AI result may still be rejected when deterministic evidence contradicts it.

Confidence thresholds must be defined centrally.

Do not scatter magic thresholds throughout the codebase.

---

# 26. AI and Deterministic Contradictions

Deterministic domain constraints take precedence over AI suggestions.

Example:

```text
AI:
sameGame = true

Known identifiers:
different canonical IDs

→ AI decision rejected
```

The system must not allow probabilistic output to violate hard domain constraints.

---

# 27. AI Classification

AI may assist when deterministic classification is ambiguous.

Example:

```text
Candidate
   ↓
Rule-based classification
   ↓
Ambiguous?
 ├── NO → classify
 └── YES
       ↓
      AI
       ↓
    validate
       ↓
    classify
```

---

# 28. AI Identity Resolution

AI is particularly appropriate for semantic ambiguity.

Examples:

```text
Resident Evil 4 (2005)
vs
Resident Evil 4 Remake
```

```text
Final Fantasy Tactics
vs
Final Fantasy Tactics: The War of the Lions
```

The AI should determine:

- same game or different;
- relationship when different;
- confidence;
- optionally reason codes/evidence.

The result must be validated by the native engine.

---

# 29. AI Metadata Normalization

AI may assist in normalizing inconsistent representations.

Example:

```text
Nintendo Co., Ltd.
Nintendo
Nintendo EAD
```

AI may suggest a canonical relationship.

However, AI must not invent organizations, releases, developers, publishers, or other factual entities.

External evidence remains the source of facts.

---

# 30. AI Conflict Resolution

When external sources disagree, the system should first use deterministic policies such as:

- source priority;
- corroboration;
- known identifiers;
- field-specific rules.

AI may assist when deterministic resolution is insufficient.

AI must not silently overwrite canonical information.

---

# 31. Canonical Knowledge

Canonical data is the result of:

```text
Source Evidence
+
Native Processing
+
Optional AI Assistance
+
Validation
```

Only validated canonical data should be persisted as the authoritative catalog representation.

---

# 32. Persistence

Persistence must occur after:

```text
Discovery
 ↓
Normalization
 ↓
Classification
 ↓
Identity Resolution
 ↓
Validation
```

Do not persist raw source records as canonical games.

---

# 33. Database-First Retrieval

Individual game retrieval must prefer the database.

Conceptually:

```text
Request
 ↓
Database
 ↓
Sufficient?
 ├── YES → Return
 └── NO
       ↓
    External Discovery
       ↓
     Process
       ↓
     Persist
       ↓
      Return
```

External sources should not be queried unnecessarily for sufficiently complete canonical records.

---

# 34. Partial Records

The database must support incomplete knowledge.

A record may be:

```text
FOUND_PARTIAL
```

without being invalid.

The system should be capable of enrichment.

Existing valid fields should not be overwritten merely because another source provides a different representation.

---

# 35. Enrichment

Enrichment should fill missing information.

Example:

```text
Database
 ├── title ✓
 ├── releaseDate ✓
 ├── developer ✓
 ├── publisher ✗
 ├── genres ✓
 └── cover ✗

       ↓

External discovery

       ↓

publisher + cover

       ↓

Persist enrichment
```

---

# 36. Catalog Queries

The canonical catalog must support filtering by:

```text
search terms
title
release year/date
platform
developer
publisher
genre
```

Filters must be composable.

Example:

```text
platform = Switch
AND
developer = Nintendo
AND
releaseYear = 2017
AND
genre = Adventure
```

---

# 37. Search Semantics

Search should support partial terms.

Example:

```text
zelda
```

may match:

```text
The Legend of Zelda
The Legend of Zelda: Ocarina of Time
The Legend of Zelda: Breath of the Wild
The Legend of Zelda: Tears of the Kingdom
```

Search semantics must be documented and tested.

---

# 38. Discovery Search vs Catalog Search

The system should distinguish between:

### Catalog search

Searches canonical persisted knowledge.

```text
Database
```

### Discovery search

Searches external sources to find previously unknown information.

```text
External Sources
```

A higher-level operation may combine both, but their semantics must remain clear.

---

# 39. Pagination

Pagination must be deterministic.

Define:

- page;
- limit;
- maximum limit;
- ordering;
- invalid parameter behavior.

Database queries should perform filtering and pagination at the database layer whenever practical.

Do not load the entire catalog into application memory just to paginate it.

---

# 40. Stable Ordering

Every paginated query must have deterministic ordering.

Do not depend on unspecified database order.

---

# 41. Repository Boundary

Application and domain logic must not depend directly on database-specific query syntax.

Prefer repository contracts such as:

```text
GameRepository
```

with database-specific implementations in infrastructure.

---

# 42. Idempotency

Discovery and persistence should be idempotent whenever practical.

Repeated processing of the same source record should converge rather than continuously create duplicates.

---

# 43. No Destructive Deduplication

Duplicate handling must be conservative.

Never merge records merely because:

- titles are similar;
- fuzzy matching is high;
- an LLM says so;
- one source claims they are identical.

Identity operations should favor preserving information over destructive merging.

---

# 44. External Source Resilience

One failed source should not necessarily fail discovery.

Example:

```text
Wikipedia ❌
SteamDB ✓
Source C ✓

→ Continue
```

The same principle applies to AI:

```text
AI ❌
Native Engine ✓

→ Continue
```

---

# 45. Network Timeouts

Every external request must have an explicit timeout.

No source or AI request should be able to hang indefinitely.

---

# 46. Retries

Retries should be limited and targeted.

Retry transient failures.

Do not retry deterministic failures indefinitely.

---

# 47. Rate Limiting

Source adapters must be designed so rate limiting can be implemented without changing domain logic.

Do not create uncontrolled scraping loops.

---

# 48. Error Categories

Use meaningful error categories.

Possible categories include:

```text
INVALID_INPUT
NOT_FOUND
SOURCE_UNAVAILABLE
SOURCE_RATE_LIMITED
SOURCE_PARSE_ERROR
IDENTITY_UNRESOLVED
AI_UNAVAILABLE
AI_INVALID_RESPONSE
AI_LOW_CONFIDENCE
PERSISTENCE_ERROR
INTERNAL_ERROR
```

The exact taxonomy belongs to the application/API documentation.

---

# 49. Observability

Important operations should produce structured logs/events.

At minimum, the system should eventually be able to trace:

```text
search
source selection
source request
candidate discovery
classification
identity resolution
AI invocation
AI failure
fallback
persistence
enrichment
```

The objective is to answer:

> Why did ATP produce this result?

---

# 50. AI Observability

AI calls should be observable independently from the native engine.

Useful information includes:

```text
provider
model
capability
latency
success/failure
fallback triggered
decision
confidence
```

Do not log secrets or sensitive information.

---

# 51. AI Evaluation

AI must be evaluated against deterministic test cases before being considered useful.

Maintain a representative dataset containing cases such as:

```text
Resident Evil 4 (2005)
vs
Resident Evil 4 (2023)

Breath of the Wild Wii U
vs
Breath of the Wild Switch

Resident Evil 3 NTSC/USA
vs
Resident Evil 3 PAL/EUR

Final Fantasy Tactics
vs
War of the Lions
```

Measure the behavior of:

```text
Native rules
AI
Native + AI
```

Do not assume AI improves the system simply because it produces plausible answers.

---

# 52. AI Quality Requirement

AI should be adopted only when it provides measurable value.

If a deterministic solution is:

- more accurate;
- cheaper;
- faster;
- easier to test;
- easier to maintain;

then prefer the deterministic solution.

AI is justified when it meaningfully improves semantic interpretation.

---

# 53. AI Cost Control

Minimize AI calls.

Use:

```text
Deterministic filtering
        ↓
Candidate reduction
        ↓
AI only when necessary
```

Do not invoke AI independently for every source result when a batch or deterministic solution is sufficient.

---

# 54. AI Provider Independence

The application must not depend on a specific AI provider.

The architecture must allow providers to be replaced.

Changing from:

```text
Provider A
```

to:

```text
Provider B
```

must not require domain changes.

---

# 55. Local AI

Local models may be used as an AI provider.

The architecture should permit a local provider without changing domain logic.

The existence of a local model must never be required for basic ATP operation.

---

# 56. Framework Independence

Application logic must not be tightly coupled to the HTTP framework.

Controllers/routes should translate transport-level requests into application operations.

Business rules must remain outside controllers.

---

# 57. Configuration

Configuration belongs outside the domain.

Examples:

```text
database connection
source configuration
timeouts
rate limits
AI enabled/disabled
AI provider
AI model
AI confidence thresholds
pagination limits
```

Avoid reading environment variables directly from domain entities or domain services.

---

# 58. Secrets

Never commit:

- API keys;
- tokens;
- passwords;
- cookies;
- credentials;
- private authentication data.

Use the designated configuration/secret mechanism.

---

# 59. Schema Evolution

Persistent schema changes require consideration of existing data.

Before changing:

```text
field names
field types
relationships
indexes
identity structure
```

determine:

- migration requirements;
- existing records;
- backward compatibility;
- API implications.

---

# 60. Testing Strategy

Testing should exist at multiple levels.

### Unit tests

For:

- normalization;
- classification;
- deterministic identity rules;
- scoring;
- filtering;
- source parsing.

### Integration tests

For:

- repositories;
- persistence;
- application orchestration.

### Source tests

For:

- source adapters;
- fixtures;
- parsing behavior.

### AI integration tests

For:

- provider adapters;
- structured output;
- failure handling;
- fallback behavior.

### End-to-end tests

For critical user-facing flows.

---

# 61. No Live Dependencies in Normal Tests

The standard test suite must not require:

- live websites;
- external APIs;
- LLM providers;
- internet access.

Use fixtures and mocks.

Live tests should be explicitly categorized as integration or external validation tests.

---

# 62. Performance

Do not optimize before measuring.

The preferred sequence is:

```text
Correctness
    ↓
Tests
    ↓
Measurement
    ↓
Optimization
```

Likely future bottlenecks include:

- catalog queries;
- external discovery;
- scraping;
- identity resolution;
- AI calls;
- database indexes.

---

# 63. Comments

Comments should explain why something exists.

Avoid comments that merely restate code.

Good:

```text
// Preserve source ranking because candidate ranking contributes
// to deterministic discovery ordering.
```

Bad:

```text
// Sort candidates
sort(candidates)
```

---

# 64. Naming

Prefer precise domain terminology.

Use:

```text
Game
Release
Platform
Region
Source
Developer
Publisher
Genre
Relationship
Identity
Candidate
```

Avoid generic names when a precise domain concept exists.

---

# 65. No Hidden Magic

Avoid unexplained constants.

Instead of:

```text
0.82
```

prefer a named configuration or constant such as:

```text
HIGH_IDENTITY_CONFIDENCE
```

The same applies to:

- AI thresholds;
- pagination limits;
- source weights;
- retry counts;
- timeouts;
- ranking weights.

---

# 66. Documentation

Architecture and domain behavior must be documented outside source code.

Documentation is required when changing:

- domain semantics;
- identity rules;
- source contracts;
- persistence;
- API behavior;
- classification;
- AI capabilities;
- AI fallback;
- canonicalization.

---

# 67. Backward Compatibility

The original scraper is a functional baseline.

New architecture should preserve its capabilities:

```text
multi-source search
filtering
cover discovery
metadata search
media classification
```

unless a deliberate contract change is documented.

---

# 68. Engineering Priorities

When trade-offs exist, prioritize:

```text
1. Data correctness
2. Domain integrity
3. Deterministic behavior
4. Testability
5. Maintainability
6. Observability
7. Resilience
8. Performance
9. Convenience
```

The catalog's correctness is more valuable than implementation cleverness.

---

# 69. AI-Specific Priority

When choosing between AI and native logic:

```text
If deterministic logic is sufficient:
    use deterministic logic.

If ambiguity remains:
    consider AI.

If AI fails:
    use native fallback.

If AI contradicts hard evidence:
    reject AI.

If AI does not measurably improve quality:
    do not use AI.
```

---

# 70. Final Engineering Principle

The ATP Engine must remain a useful and reliable system even when every AI provider is unavailable.

The desired relationship is:

```text
                ATP ENGINE
                    │
          ┌─────────┴─────────┐
          │                   │
      Native Core         AI Assistant
          │                   │
      deterministic       probabilistic
          │                   │
          └─────────┬─────────┘
                    ↓
                Validation
                    ↓
             Canonical Catalog
```

The native engine is the foundation.

AI is an intelligence multiplier.

AI must improve the system's ability to deal with ambiguity without becoming responsible for the system's basic correctness.

**The ATP Engine should never need to trust an LLM blindly.**
