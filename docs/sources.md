# ATP Engine — Sources

## 1. Purpose

This document defines how ATP integrates external data sources.

External sources provide evidence used to discover and enrich game metadata.

They are not canonical authorities.

---

# 2. Source Abstraction

Each external source must be implemented behind a source adapter.

Conceptually:

```text
SourceAdapter
```

Examples:

```text
WikipediaAdapter
SteamDBAdapter
FutureSourceAdapter
```

---

# 3. Source Capabilities

A source may support one or more capabilities:

```text
SEARCH_GAMES
GET_GAME
SEARCH_METADATA
SEARCH_COVERS
```

The source registry should expose supported capabilities.

---

# 4. Source Adapter Responsibilities

A source adapter is responsible for:

* communicating with the source;
* handling source-specific requests;
* parsing source-specific responses;
* extracting relevant fields;
* exposing source identifiers;
* converting source data into ATP source representations.

It should not perform canonical identity resolution.

---

# 5. Source Adapter Must Not Own Domain Rules

Avoid placing logic such as:

```text
"this is definitely the same game"
```

inside a SteamDB adapter.

The adapter should report evidence.

The identity resolver makes the decision.

---

# 6. Source Result

A normalized source result should conceptually contain:

```text
SourceRecord
 ├── source
 ├── externalId
 ├── title
 ├── description
 ├── releaseDate
 ├── platforms
 ├── developers
 ├── publishers
 ├── genres
 ├── regions
 ├── URLs
 └── raw/source metadata
```

Not every source needs to provide every field.

---

# 7. Missing Data

Missing source data is normal.

A source should return:

```text
null
```

or an equivalent absence representation when information is unavailable.

It should not invent missing values.

---

# 8. Raw Data

Raw source data may be retained where useful for:

* debugging;
* provenance;
* reprocessing;
* parser development;
* dispute resolution.

Raw data should not automatically become part of the canonical Game model.

---

# 9. Provenance

Canonical fields should be traceable to source evidence where practical.

Example:

```text
Game.title
    ← Wikipedia
    ← external ID
```

or:

```text
Game.releaseDate
    ← SteamDB
```

When multiple sources provide conflicting information, provenance enables later resolution.

---

# 10. Source Priority

ATP may define source-specific priority for certain fields.

Example:

```text
release date:
Source A > Source B
```

However, source priority must be field-specific where necessary.

One source should not automatically be considered superior for every field.

---

# 11. Source Conflicts

If two sources disagree:

```text
Wikipedia
releaseDate = X

SteamDB
releaseDate = Y
```

the engine should:

1. retain both observations;
2. evaluate source reliability;
3. apply deterministic rules;
4. optionally invoke AI;
5. choose a canonical value only when sufficiently supported.

---

# 12. AI and Source Conflicts

AI may assist with interpreting conflicting evidence.

Example:

```text
Source A
Source B
Source C
   ↓
Conflict resolver
   ↓
AI assistance
```

AI should not fabricate a third value.

It must choose among supported evidence or return uncertainty.

---

# 13. Source Failure

A source failure should be isolated.

Possible failures:

* timeout;
* HTTP error;
* rate limiting;
* malformed response;
* parser failure;
* authentication failure;
* temporary unavailability.

A multi-source search should continue when other sources remain available.

---

# 14. Source Health

The application may track source health metrics:

```text
success rate
latency
error rate
availability
rate-limit events
```

These metrics may influence source selection.

---

# 15. Rate Limiting

Each source adapter must respect source-specific:

* rate limits;
* request policies;
* retry rules;
* caching policies;
* terms of service.

Do not implement aggressive scraping by default.

---

# 16. Retry Policy

Retries should be limited and classified by error type.

Transient failures may be retried.

Permanent failures should not be retried indefinitely.

---

# 17. Timeouts

Every external source request must have an explicit timeout.

ATP should never allow an unavailable source to block the entire request indefinitely.

---

# 18. Parallel Discovery

Independent sources may be queried in parallel when:

* source policies allow it;
* request budget allows it;
* latency benefits justify it.

Example:

```text
             Query
          /         \
         ↓           ↓
   Wikipedia       SteamDB
         \           /
          ↓         ↓
          Candidate Set
```

---

# 19. Source Registry

Sources should be registered through a central mechanism.

Conceptually:

```text
SourceRegistry
 ├── wikipedia
 ├── steamdb
 └── future-source
```

The discovery layer requests capabilities from the registry rather than directly instantiating adapters.

---

# 20. Adding a Source

Adding a source should generally require:

1. adapter implementation;
2. source-specific parser;
3. normalization mapping;
4. capability declaration;
5. tests;
6. source configuration.

It should not require changes to identity resolution logic merely because the source was added.

---

# 21. Source-Specific Metadata

Sources may expose information unavailable elsewhere.

Such metadata may be retained as source-specific evidence.

It should not leak into the core domain unless it represents a meaningful canonical concept.

---

# 22. Source URLs

Source URLs should be preserved where useful for:

* provenance;
* debugging;
* user-facing navigation;
* auditability.

---

# 23. Source Ranking

Source quality may contribute to candidate ranking.

Possible signals:

```text
source reliability
metadata completeness
historical accuracy
query relevance
```

Source ranking must remain configurable.

---

# 24. Source Independence

No single source should become a hidden hard dependency unless the domain explicitly requires it.

The system should degrade gracefully when a source disappears.

---

# 25. Source Replacement

If a source becomes unavailable permanently, ATP should be able to replace it with another source without rewriting:

* domain entities;
* identity logic;
* classification logic;
* persistence;
* API contracts.

---

# 26. Source Data Is Evidence

This principle is mandatory:

```text
SOURCE ≠ TRUTH
```

A source reports an observation.

ATP interprets observations and constructs canonical knowledge.

---

# 27. Source Invariants

1. Adapters isolate source-specific behavior.
2. Sources provide evidence, not canonical truth.
3. Missing data must not be fabricated.
4. Source failures must be isolated.
5. Source policies and rate limits must be respected.
6. Source-specific logic must not leak into the domain.
7. External identifiers remain source-scoped.
8. Conflicting observations must remain traceable.
9. New sources should be addable without rewriting core domain logic.
10. No single source should silently become a universal authority.
11. Absence of a source result is not negative evidence — a source not mentioning a field does not mean the field is empty or false.

---

# 28. Current Initial Sources

The initial architecture is expected to support:

```text
Wikipedia
SteamDB
```

Additional sources may be introduced later.

The adapter boundary must exist from the beginning so that the architecture does not become coupled to these initial sources.
