# AGENTS.md

# ATP Engine — Agent Instructions

## 1. Purpose

This document defines how AI agents and other automated development systems must operate when working on the ATP Engine project.

The ATP Engine is intentionally **agent-agnostic**.

These instructions define project behavior, engineering expectations, architectural boundaries, and development workflow. They do not depend on OpenCode, Codex, Claude Code, Gemini, or any other specific development agent.

Any AI coding agent or human developer working on the repository must follow these instructions.

---

# 2. Project Context

The ATP Engine (Ash Twin Project) is a service for discovering, collecting, classifying, normalizing, resolving, and persisting video game metadata from multiple external sources.

The engine is intended to maintain a reliable global catalog of video games.

The ATP Engine may be consumed by applications such as Save State, but it is an independent system.

The ATP Engine does not own user-specific gameplay information.

It does not manage:

* users;
* authentication;
* personal libraries;
* personal ratings;
* hours played;
* completion state;
* user-created lists;
* personal progress.

The ATP Engine is responsible for knowledge about the games themselves.

---

# 3. Core Principle

The ATP Engine must remain functional without an AI/LLM provider.

AI is an **optional assistant**, not a core dependency.

The fundamental architecture is:

```text
Native Engine
    ↓
Deterministic processing
    ↓
AI assistance when useful
    ↓
Validation
    ↓
Canonical result
```

If AI is:

* disabled;
* unavailable;
* unreachable;
* rate-limited;
* too slow;
* malformed;
* uncertain;
* incompatible with the expected schema;

the native engine must remain capable of completing the operation whenever deterministic logic is sufficient.

The fallback is always the native engine.

---

# 4. Golden Rule

Before changing code, understand the existing system.

Agents MUST NOT:

* rewrite working systems without a documented reason;
* replace technologies without explicit justification;
* introduce architecture solely because it is familiar;
* create speculative abstractions;
* duplicate existing functionality;
* silently change domain semantics;
* treat external source data as authoritative;
* treat AI output as canonical truth;
* perform destructive data merges without strong evidence.

When uncertain, inspect the repository and documentation first.

Prefer the smallest safe change that satisfies the requirement.

---

# 5. Required Reading

Before implementing a non-trivial task, the agent should inspect, when available:

1. `AGENTS.md`
2. `engineering-rules.md`
3. `README.md`
4. relevant documentation under `docs/`
5. the implementation related to the task
6. existing tests related to the task

Do not infer the architecture from filenames alone.

---

# 6. Source of Truth Hierarchy

When determining expected behavior, use the following priority:

1. Explicit project/domain requirements
2. `engineering-rules.md`
3. Domain documentation under `docs/`
4. Existing tests
5. Existing implementation
6. Comments
7. Agent assumptions

Existing implementation is not automatically considered correct.

Documentation and tests may intentionally describe behavior that has not yet been implemented.

---

# 7. Planning Before Implementation

For any non-trivial change, determine:

* which architectural component is affected;
* which domain concepts are involved;
* whether existing behavior may change;
* whether persistence behavior changes;
* whether external source behavior changes;
* whether API contracts change;
* whether AI behavior changes;
* whether tests are required;
* whether documentation must be updated.

For larger changes, create a concise implementation plan before editing.

The plan should identify:

```text
Problem
    ↓
Affected components
    ↓
Required changes
    ↓
Tests
    ↓
Risks
```

Do not expand the scope without a reason.

---

# 8. Preserve Legacy Capabilities

The original Next.js scraper established the initial functional baseline of the ATP project.

It was capable of:

* searching multiple external sources;
* filtering results;
* searching game metadata by term;
* finding game covers;
* returning a small set of filtered cover candidates;
* distinguishing games from unrelated media;
* handling results such as movies, anime, DLC, and promotional content.

The ATP Engine must preserve these capabilities unless the new architecture intentionally changes their behavior.

Migration must not silently remove existing functionality.

---

# 9. Core ATP Responsibilities

The ATP Engine is expected to support:

## Discovery

* querying multiple external sources;
* filtering source results;
* classifying candidates;
* ranking candidates;
* deduplicating candidates;
* paginating results;
* merging results from multiple sources.

## Covers

* dedicated cover search;
* filtered cover candidates;
* multiple source support.

## Individual Game Metadata

* database-first lookup;
* external discovery when required;
* normalization;
* classification;
* identity resolution;
* persistence of newly discovered data;
* enrichment of incomplete records.

## Game Search

Search by terms such as:

```text
Zelda
Final Fantasy
Resident Evil
```

and return relevant game candidates or canonical games.

## Catalog Queries

Support filtering by:

* search terms;
* titles;
* release year/date;
* platforms;
* developers;
* publishers;
* genres.

## Identity Resolution

Distinguish:

* different games with similar names;
* the same game across platforms;
* regional releases;
* ports;
* remasters;
* enhanced versions;
* remakes;
* related games.

## Persistence

Persist validated, normalized game information so future requests can prefer the database over external sources.

---

# 10. Database-First Principle

Individual game retrieval should follow:

```text
Request
  ↓
Database
  ↓
Sufficient information?
 ├── YES → Return
 └── NO
       ↓
     Web
       ↓
   Normalize
       ↓
   Classify
       ↓
 Resolve Identity
       ↓
    Validate
       ↓
    Persist
       ↓
     Return
```

Agents MUST NOT bypass the database merely because querying an external source is easier.

The database represents persistent catalog knowledge.

It is not merely a disposable HTTP cache.

---

# 11. External Sources Are Untrusted

External sources may contain:

* incomplete metadata;
* duplicate records;
* inconsistent names;
* regional naming;
* incorrect information;
* conflicting information;
* unrelated media;
* source-specific representations.

Source data must not be inserted directly into the canonical domain model.

The expected boundary is:

```text
External Source
    ↓
Source Adapter
    ↓
Source Representation
    ↓
Normalization
    ↓
Classification
    ↓
Identity Resolution
    ↓
Validation
    ↓
Canonical Domain
    ↓
Persistence
```

---

# 12. Source Isolation

Each external source should be isolated behind a source-specific adapter.

Source-specific scraping and parsing logic MUST NOT leak into domain services.

Avoid application code such as:

```text
if source === "steamdb"
```

spread throughout the system.

Prefer dedicated adapters such as:

```text
WikipediaAdapter
SteamDBAdapter
OtherSourceAdapter
```

The adapter knows how to communicate with and interpret its source.

It does not own canonical game identity.

---

# 13. AI Boundary

AI/LLM functionality must remain behind explicit interfaces.

The rest of the system should not depend directly on:

* a specific model;
* a specific provider;
* a specific SDK;
* prompt text;
* provider-specific response formats.

Prefer capabilities such as:

```text
GameClassifier
IdentityResolver
ConflictResolver
MetadataNormalizer
```

with AI-backed implementations where useful.

For example:

```text
IdentityResolver
    ├── NativeIdentityResolver
    └── AIIdentityResolver
```

or an equivalent design.

The exact architecture may evolve, but the boundary must remain explicit.

---

# 14. AI Is an Assistant

AI may assist with:

* game classification;
* identity resolution;
* ambiguous search result interpretation;
* metadata normalization;
* source conflict resolution;
* candidate ranking.

AI MUST NOT be treated as the canonical source of factual metadata.

The preferred principle is:

```text
Sources provide facts
Native engine interprets structured evidence
AI assists with ambiguous semantics
Validation determines accepted result
Database stores canonical knowledge
```

---

# 15. Native Fallback

Every AI-assisted operation must have a defined fallback strategy.

If the AI provider fails because of:

* network failure;
* timeout;
* provider outage;
* invalid response;
* malformed structured output;
* unavailable model;
* rate limiting;
* exceeded budget;
* disabled AI;
* insufficient confidence;

the native engine must continue whenever possible.

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
    Success?
    ├── YES → Validate → Result
    └── NO  → Native fallback
```

AI failure must not automatically become ATP failure.

---

# 16. Deterministic-First Principle

Agents should prefer deterministic rules when sufficient evidence exists.

Examples include:

* exact external identifiers;
* normalized titles;
* known release dates;
* platform information;
* known region information;
* explicit remake/remaster markers;
* known source relationships.

Do not invoke an LLM merely because an LLM can solve the same deterministic problem.

---

# 17. Candidate Reduction Before AI

AI should receive the smallest useful candidate set.

Prefer:

```text
Large source result set
        ↓
Source filtering
        ↓
Normalization
        ↓
Deterministic classification
        ↓
Candidate reduction
        ↓
AI
```

Avoid sending hundreds of irrelevant records to an LLM.

This improves:

* cost;
* latency;
* reliability;
* accuracy;
* observability.

---

# 18. Structured AI Output

AI results must use structured, machine-readable contracts.

Avoid relying on free-form natural language.

Prefer responses conceptually similar to:

```json
{
  "decision": "different_game",
  "relationship": "remake",
  "confidence": 0.98
}
```

The exact schema belongs to the relevant domain documentation.

AI output must be validated before entering domain logic.

---

# 19. AI Does Not Override Deterministic Contradictions

AI output is advisory.

If AI produces:

```text
sameGame = true
```

but deterministic evidence proves that the records represent different games, the deterministic evidence takes precedence.

AI confidence does not override hard domain constraints.

---

# 20. Identity Is a First-Class Concern

Game identity is one of the central problems of the ATP Engine.

Agents MUST NOT implement identity resolution using title equality alone.

The system must distinguish cases such as:

```text
Resident Evil 4 (2005)
≠
Resident Evil 4 (2023 Remake)
```

while recognizing:

```text
Breath of the Wild — Wii U
=
Breath of the Wild — Nintendo Switch
```

and:

```text
Resident Evil 3 — NTSC/USA
=
Resident Evil 3 — PAL/EUR
```

when the domain semantics indicate regional releases of the same game.

---

# 21. Relationships Must Be Explicit

When two records are not the same game but are related, represent their relationship rather than forcing a merge.

Possible relationships include:

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

The project documentation defines the authoritative relationship vocabulary.

Do not invent arbitrary relationship strings in isolated features.

---

# 22. No Destructive Identity Decisions

Agents MUST NOT automatically merge or delete canonical game records based solely on:

* similar titles;
* AI confidence;
* one external source;
* fuzzy matching;
* incomplete evidence.

When confidence is insufficient:

```text
Preserve records
    +
Represent uncertainty/relationship
```

False merges are more harmful than temporary duplicates.

---

# 23. Classification

The system must distinguish games from unrelated media and content.

Possible categories include:

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

The authoritative classification vocabulary belongs to the domain documentation.

Classification may use:

```text
Deterministic rules
        ↓
AI assistance when ambiguous
        ↓
Validation
```

---

# 24. Persistence

Persistence must happen after the system has enough confidence that the record represents a valid canonical entity.

Preferred pipeline:

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
    ↓
Persistence
```

Do not persist raw, unclassified source records as canonical games.

---

# 25. Partial Knowledge

A game may exist in the database without complete metadata.

Agents must distinguish:

```text
NOT_FOUND
FOUND_PARTIAL
FOUND_SUFFICIENT
FOUND_COMPLETE
```

where appropriate.

Existing records may require enrichment.

Do not overwrite valid metadata simply because a source returned a different value.

---

# 26. Enrichment

When a canonical game exists but required metadata is missing:

```text
Database
    ↓
Incomplete
    ↓
External discovery
    ↓
Normalize
    ↓
Validate
    ↓
Enrich
    ↓
Persist
```

Enrichment should be additive whenever possible.

---

# 27. API Changes

API contracts are public contracts.

When modifying an endpoint, consider:

* request parameters;
* response shape;
* pagination;
* filtering;
* errors;
* compatibility;
* consumers;
* tests;
* documentation.

Do not casually rename or remove fields.

---

# 28. Pagination

Pagination must be deterministic.

Define:

* page semantics;
* page size;
* maximum page size;
* ordering;
* invalid parameter behavior.

When querying the database, filtering, sorting, and pagination should occur at the database layer whenever practical.

---

# 29. Filtering

Filters must be composable.

The catalog should support combinations such as:

```text
platform = Switch
AND
developer = Nintendo
AND
releaseYear = 2017
AND
genre = Adventure
```

Do not implement filters as unrelated special cases.

---

# 30. Testing

Meaningful domain behavior must have automated tests.

Prioritize tests for:

* classification;
* normalization;
* identity resolution;
* regional releases;
* platform releases;
* remakes;
* remasters;
* ports;
* duplicate detection;
* source merging;
* persistence;
* database-first behavior;
* AI fallback;
* pagination;
* filtering.

AI-assisted functionality must also have tests for AI failure.

---

# 31. AI Tests Must Be Resilient

The normal test suite must not depend on a live LLM provider.

Test at least:

```text
AI disabled
AI succeeds
AI times out
AI returns malformed output
AI provider unavailable
AI returns low confidence
AI contradicts deterministic evidence
```

The ATP must remain correct under these conditions.

---

# 32. External Network Tests

Normal tests must not depend on:

* Wikipedia availability;
* SteamDB availability;
* DNS;
* live scraping;
* external API availability;
* LLM availability.

Use fixtures, mocks, stubs, and deterministic test data.

---

# 33. Error Handling

External failures are expected.

Sources may:

* timeout;
* rate-limit;
* change structure;
* return malformed data;
* return no results;
* become unavailable.

The system should degrade gracefully whenever possible.

Example:

```text
Source A ❌
Source B ✓
Source C ✓

→ Continue processing
```

The same principle applies to AI:

```text
AI ❌
Native engine ✓

→ Continue processing
```

---

# 34. Observability

Important operations should be observable.

Useful events include:

```text
search_started
source_queried
source_failed
candidate_discovered
candidate_rejected
candidate_classified
identity_resolution_started
identity_resolution_completed
ai_requested
ai_failed
ai_fallback_triggered
game_persisted
game_enriched
```

Logs should make it possible to understand:

> Why did ATP accept, reject, merge, separate, or relate two records?

Do not log secrets.

---

# 35. AI Observability

AI operations should expose enough information to diagnose behavior.

Where appropriate, record:

* provider;
* model;
* capability;
* latency;
* success/failure;
* structured decision;
* confidence;
* fallback usage.

Do not store prompts or responses containing sensitive data unless explicitly required and safe.

---

# 36. Agent Autonomy

Agents may:

* inspect the repository;
* create implementation plans;
* implement clearly specified tasks;
* add tests;
* fix local bugs discovered during implementation;
* improve local maintainability;
* update relevant documentation.

Agents must NOT autonomously:

* redefine project scope;
* replace the core stack;
* remove major capabilities;
* redesign domain semantics;
* introduce unrelated infrastructure;
* perform destructive migrations;
* make AI mandatory;
* change identity semantics without documentation.

---

# 37. Dependency Changes

Before introducing a dependency, determine:

* whether existing dependencies already provide the functionality;
* maintenance status;
* compatibility;
* security implications;
* licensing;
* runtime impact;
* whether the dependency is actually necessary.

Do not add dependencies simply to shorten a small implementation.

---

# 38. Refactoring

Refactoring is encouraged when it improves architecture or maintainability.

However, feature work and unrelated refactoring should remain distinguishable.

Do not turn a small feature into a complete architectural rewrite unless the rewrite is genuinely required.

---

# 39. Documentation Requirements

Update documentation when changing:

* architecture;
* domain semantics;
* API contracts;
* persistence;
* source behavior;
* identity resolution;
* classification;
* AI behavior;
* fallback behavior.

Important decisions must not exist only inside source code.

---

# 40. Definition of Done

A meaningful task is complete only when:

```text
Requirement understood
        ↓
Implementation complete
        ↓
Tests added/updated
        ↓
Existing behavior verified
        ↓
AI fallback verified when relevant
        ↓
Documentation updated when necessary
        ↓
Lint/typecheck/build/tests pass
        ↓
No unnecessary changes
```

---

# 41. Final Report Format

When completing a meaningful phase or milestone, agents must produce a structured final report.

The report must be independently reviewable without requiring access to the entire agent conversation.

### Report Structure

```text
## Step-by-Step Implementation

Describe the implementation sequence in order.

## Architectural Decisions

For every meaningful decision, document:

- Decision: What was chosen
- Context: What problem required this decision
- Alternatives considered: What other approaches were evaluated
- Chosen approach: What was selected
- Reason: Why this approach was appropriate
- Trade-off: What was accepted or deferred

## Domain-to-Persistence Mapping (when applicable)

Explain how domain concepts map to infrastructure representations.

## Repository Flow (when applicable)

Explain representative operations step by step.

## Duplicate Protection (when applicable)

Document how invariants are enforced at both application and database levels.

## Testing Strategy

- What is tested purely in memory
- What requires infrastructure
- How test isolation works
- Why the selected approach was chosen

## Important Code Examples

Include small, relevant snippets for the most important decisions.

## Files Changed

List all created, modified, and deleted files with one-line responsibilities.

## Validation Results

Report actual results of:

```text
npm run build
npm test
npm run lint
npm run format:check
```

Do not summarize failures as successes.

## Known Limitations

Document deferred functionality, technical debt, and assumptions.

## Next Step

Confirm what phase comes next. Do not implement it.
```

### Report Principles

* Factual, not narrative
* Concrete examples over abstract descriptions
* Code excerpts where useful but no file dumps
* Decisions explained with context and trade-offs
* Validation results reported honestly

---

# 42. Final Principle

The ATP Engine is a deterministic knowledge system with optional AI assistance.

Its fundamental behavior must remain understandable and reproducible without an LLM.

The preferred architecture is:

```text
External Sources
        ↓
Discovery
        ↓
Normalization
        ↓
Classification
        ↓
Deterministic Resolution
        ↓
AI Assistance when necessary
        ↓
Validation
        ↓
Canonical Knowledge
        ↓
Persistence
```

AI should make ATP better at ambiguous problems.

It must never make ATP dependent on probabilistic behavior for basic operation.

When choosing between:

```text
clever + opaque
```

and:

```text
explicit + deterministic + testable
```

prefer the latter.

The ATP Engine should remain useful even when the AI disappears.
