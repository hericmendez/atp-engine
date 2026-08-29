# ATP Engine — Persistence

## 1. Purpose

Persistence is responsible for storing canonical ATP knowledge.

The database is not merely a cache of scraper responses.

It represents the accumulated knowledge of the engine.

---

# 2. Database-First Principle

For individual metadata requests:

```text
Request
  ↓
Database
  ↓
Sufficient?
 ├── YES → Return
 └── NO → External discovery
```

ATP should avoid external requests when the catalog already contains sufficient information.

---

# 3. Canonical Data

Only validated domain data should become canonical.

The following must not automatically become canonical:

- raw HTML;
- raw API responses;
- unvalidated source records;
- unvalidated LLM output;
- temporary candidates.

---

# 4. Persistence Pipeline

```text
Source Evidence
      ↓
Normalization
      ↓
Classification
      ↓
Identity Resolution
      ↓
Validation
      ↓
Canonical Domain Entity
      ↓
Repository
      ↓
Database
```

---

# 5. Repository Boundary

Application/domain code should depend on repository contracts rather than database-specific implementations.

Conceptually:

```text
GameRepository
```

Infrastructure implements it.

Example:

```text
MongoGameRepository
```

---

# 6. Database Independence

The domain must not depend directly on:

```text
MongoDB
Mongoose
SQL
Prisma
Mongo-specific operators
```

Database implementation details belong to infrastructure.

---

# 7. Canonical Game Storage

A canonical Game should be persisted independently from:

- source records;
- source observations;
- AI decisions;
- discovery sessions.

These concepts may be related but should not be conflated.

---

# 8. External Identifiers

External IDs should be stored as source-scoped references.

Conceptually:

```text
externalIdentifiers:
[
  {
    source: "steamdb",
    id: "..."
  },
  {
    source: "wikipedia",
    id: "..."
  }
]
```

An external ID must never become the primary ATP identity.

---

# 9. Releases

Game releases should be persisted separately from the conceptual Game identity.

A release may contain:

```text
platform
platformFamily
region
releaseDate
version/edition
distributionChannels
launchers
external identifiers
```

This allows:

```text
Game
 ├── Wii U Release
 └── Switch Release
```

without duplicating the Game itself.

### Distribution Channels

Distribution channels describe how a release is obtained:

```text
release.distributionChannels:
[
  { name: "Steam" },
  { name: "GOG" },
  { name: "Epic Games Store" }
]
```

Distribution channels are metadata about the release, not the game identity. A game on Steam and GOG is the same game.

### Mobile Distribution

For mobile platforms, distribution channels are equally important:

```text
// Android release
release.distributionChannels:
[
  { name: "Google Play" },
  { name: "F-Droid" },
  { name: "Direct APK" }
]

// iOS release
release.distributionChannels:
[
  { name: "Apple App Store" }
]
```

**Critical**: Google Play is NOT the Android platform. It is a distribution channel. The platform is Android.

### Application Identifiers

Mobile platforms may have application identifiers stored as external identifiers:

```text
release.externalIdentifiers:
[
  { source: "google-play", id: "com.example.game" },
  { source: "apple-app-store", id: "123456789" }
]
```

These are evidence for identity/release, not automatic game identity.

### Launchers

Launchers describe what software runs the game:

```text
release.launchers:
[
  { name: "Steam Client" },
  { name: "GOG Galaxy" }
]
```

Console games typically have no launcher. PC games may have launcher metadata.

---

# 10. Regions

Regional differences should normally be represented at the release level.

Example:

```text
Game
 ├── NTSC-USA Release
 └── PAL-EUR Release
```

This prevents regional duplicates.

---

# 11. Related Games

Relationships such as:

```text
REMAKE
REMASTER
PORT
EXPANSION
ENHANCED_VERSION
```

must be persisted explicitly.

A relationship should not be represented solely through title conventions.

---

# 12. Source Evidence Storage

ATP should retain source evidence sufficiently to support:

- provenance;
- enrichment;
- conflict resolution;
- debugging;
- reprocessing.

Source evidence may be stored separately from canonical entities.

---

# 13. Enrichment

When an existing Game is discovered again, ATP should enrich missing or incomplete metadata.

Example:

```text
Existing Game
 ├── title ✓
 ├── platforms ✓
 ├── genres ✗
 └── developer ✗
```

A new source may provide:

```text
genres
developer
```

The engine may enrich the existing record.

---

# 14. Non-Destructive Enrichment

New source information should not blindly overwrite existing canonical values.

The merge process should consider:

- provenance;
- source reliability;
- existing confidence;
- completeness;
- conflicts.

---

# 15. Conflicting Metadata

When existing data conflicts with newly discovered data:

```text
Existing canonical value
        +
New source observation
        ↓
Conflict resolution
```

Possible outcomes:

```text
keep existing
replace existing
merge
retain both observations
mark unresolved
```

AI may assist when deterministic rules are insufficient.

---

# 16. AI Must Not Write Directly

An AI provider must never directly execute database mutations such as:

```text
UPDATE games ...
```

The AI returns a proposal.

The application validates and applies the proposal.

---

# 17. New Game Creation

A new canonical Game may be created only after:

1. candidate classification;
2. identity resolution;
3. domain validation.

Conceptually:

```text
Candidate
   ↓
GAME
   ↓
No existing identity
   ↓
Validation
   ↓
Create Game
```

---

# 18. Existing Game Matching

Before creating a new Game, ATP should attempt to identify an existing canonical entity.

```text
Candidate
   ↓
Search existing catalog
   ↓
Potential matches
   ↓
Identity resolution
```

This is essential for preventing duplicates.

---

# 19. Duplicate Prevention

Duplicate prevention should use multiple signals.

Potential lookup keys:

- external IDs;
- normalized titles;
- alternate titles;
- release metadata;
- platform;
- developer;
- known relationships.

No single fuzzy title query should be sufficient for destructive deduplication.

---

# 20. Merge Safety

Merging canonical Games is potentially destructive.

The system should prefer:

```text
do not merge
```

when identity remains ambiguous.

If future administrative tooling supports manual merges, the operation should be explicit and auditable.

---

# 21. Persistence Idempotency

Repeated discovery of the same source record should not create duplicate canonical entities.

Example:

```text
Search
Search again
Search again
```

should converge on the same canonical identity.

---

# 22. Upsert Semantics

Source observations may be safely upserted by:

```text
source + externalId
```

when the source guarantees identifier stability.

Canonical Game upserts require identity resolution and must not be reduced to:

```text
title = ...
```

---

# 23. Transactions

Where the selected database supports transactions, operations that would otherwise leave inconsistent canonical state should use transactional semantics.

Examples:

```text
create Game
+
create Releases
+
create Source references
```

The exact transaction strategy depends on the persistence implementation.

---

# 24. Data Integrity

The persistence layer must enforce appropriate constraints such as:

- unique internal identifiers;
- unique source/external-ID combinations;
- valid relationship references;
- valid release references;
- required fields.

Database constraints complement domain validation.

They do not replace it.

---

# 25. Soft Deletion

Canonical Games should not be physically deleted automatically because a source no longer returns them.

External availability changes do not necessarily mean the game ceased to exist.

If deletion is ever required, it should be an explicit domain operation.

---

# 26. Historical Information

Where useful, ATP may preserve historical source observations.

This allows the engine to understand how canonical information was derived.

Historical data should not unnecessarily duplicate the entire external dataset.

---

# 27. Catalog Completeness

Persistence should support identifying incomplete games.

Example:

```text
Game
 ├── title ✓
 ├── releaseDate ✓
 ├── platforms ✓
 ├── developers ✗
 ├── publishers ✗
 └── genres ✗
```

This allows future enrichment.

---

# 28. Enrichment Priority

Future enrichment may prioritize fields based on:

- missingness;
- importance;
- source availability;
- source reliability;
- confidence.

This should be implemented deliberately rather than causing unrestricted scraping.

---

# 29. Persistence and AI Evolution

AI decisions may improve over time.

Canonical data should therefore retain enough provenance to allow:

```text
re-evaluation
```

without requiring complete re-scraping whenever possible.

---

# 30. Persistence Failure

A database failure must not be mistaken for an external discovery failure.

The application should distinguish:

```text
SOURCE_ERROR
AI_ERROR
VALIDATION_ERROR
PERSISTENCE_ERROR
```

This improves observability and recovery.

---

# 31. Cache vs Catalog

A cache answers:

> What did we retrieve recently?

The ATP catalog answers:

> What does ATP currently know?

These are different concepts.

The catalog must have explicit canonical semantics.

---

# 32. Persistence Invariants

1. Canonical data is validated before persistence.
2. Source records are not canonical Games.
3. AI output is not canonical truth.
4. External IDs are source-scoped.
5. Repeated discovery must converge rather than duplicate.
6. Platform differences belong to releases when appropriate.
7. Regional differences belong to releases when appropriate.
8. Related games are represented explicitly.
9. Ambiguous identities are not destructively merged.
10. Existing canonical data is enriched non-destructively.
11. Provenance should be preserved.
12. Database constraints complement domain rules.
13. Source disappearance does not automatically delete canonical data.
14. AI cannot directly mutate persistence.
15. Distribution channels do not define game identity.
16. Distribution channels belong to releases, not the game.
17. Platform family is stored alongside platform for querying.

---

# 33. Persistence Goal

The database should become a progressively richer canonical catalog.

The desired lifecycle is:

```text
First discovery
      ↓
Partial Game
      ↓
Enrichment
      ↓
Higher confidence
      ↓
Richer canonical record
```

ATP should get better as it learns from repeated discoveries, without turning every external request into an uncontrolled scraping operation.
