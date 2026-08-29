# ATP Engine — Classification

## 1. Purpose

Classification determines what a discovered external record represents.

The classification system exists primarily to prevent unrelated media and non-game entities from entering the game catalog.

Examples of content that may appear in external search results:

* games;
* remakes;
* remasters;
* DLC;
* expansions;
* movies;
* television series;
* anime;
* books;
* soundtracks;
* promotional material;
* hardware;
* characters;
* franchises;
* people;
* events.

ATP must distinguish these entities before attempting canonical game identity resolution.

---

# 2. Classification Is Not Identity

Classification answers:

> What kind of entity is this?

Identity resolution answers:

> Which canonical entity does this represent?

These are separate operations.

Example:

```text
Resident Evil 4 (2005)
```

Classification:

```text
GAME
```

Identity resolution:

```text
Game A
```

while:

```text
Resident Evil 4 (2023)
```

is also:

```text
GAME
```

but resolves to:

```text
Game B
```

---

# 3. Classification Categories

The minimum supported categories are:

```text
GAME
DLC
EXPANSION
MOVIE
TV_SHOW
ANIME
SOUNDTRACK
BOOK
HARDWARE
PROMOTIONAL
CHARACTER
FRANCHISE
PERSON
EVENT
UNKNOWN
```

The taxonomy may evolve.

New categories must be added deliberately rather than introducing arbitrary source-specific labels.

---

# 4. GAME

A candidate should be classified as `GAME` when available evidence indicates that it represents a playable video game product or title.

Examples:

```text
The Legend of Zelda: Breath of the Wild
Resident Evil 4
Final Fantasy Tactics
```

### Mobile Games

An Android or iOS application is NOT automatically classified as `GAME`.

Platform alone does not determine classification. Evidence must indicate the application is a game.

```text
Android application + GAME evidence → GAME
Android application + UTILITY evidence → UTILITY
iOS application + GAME evidence → GAME
iOS application + MEDIA evidence → MEDIA
```

The classification layer must evaluate available evidence (title, description, metadata, screenshots, store category) regardless of platform.

---

# 5. DLC

Downloadable content that depends on another game should normally be classified as:

```text
DLC
```

unless domain rules explicitly determine that it should be represented as an independent game.

Examples may include:

```text
costume packs
story DLC
character packs
downloadable missions
```

---

# 6. EXPANSION

A substantial expansion may be classified separately from ordinary DLC.

The distinction should be based on explicit domain rules and available evidence.

An expansion must not automatically become a separate canonical Game.

---

# 7. Remake and Remaster

Remakes and remasters are normally still classified as:

```text
GAME
```

Their distinction belongs primarily to identity/relationship resolution.

Example:

```text
Resident Evil 4 (2005)
GAME

Resident Evil 4 (2023)
GAME
```

They are separate Games with a relationship.

---

# 8. Port

A port is normally classified as:

```text
GAME
```

if it represents the same underlying game released on another platform.

The port/platform distinction is handled by the release model.

---

# 9. Regional Release

A regional release is normally:

```text
GAME
```

with regional release information.

For example:

```text
Resident Evil 3 — NTSC/USA
Resident Evil 3 — PAL/EUR
```

should not become separate Games solely because of region.

---

# 10. Classification Signals

Classification may consider:

* source type;
* source metadata;
* title;
* description;
* URL structure;
* category metadata;
* structured source fields;
* platform information;
* platform family;
* release information;
* known media markers;
* relationships;
* external identifiers.

Distribution channels (Steam, GOG, Epic) and launchers are NOT classification signals. A game on Steam is still a game; a movie on Steam is still a movie.

---

# 11. Deterministic Classification

Deterministic rules should be attempted first.

Examples:

```text
explicit source type = movie
    → MOVIE
```

```text
known DLC marker
    → DLC
```

```text
known game database entity
    → GAME
```

The rule system must be conservative.

---

# 12. Classification Confidence

Classification may internally produce a confidence level.

Conceptually:

```text
classification = GAME
confidence = HIGH
```

or:

```text
classification = UNKNOWN
confidence = LOW
```

Confidence should not be confused with factual certainty.

---

# 13. Ambiguous Classification

If deterministic rules cannot confidently classify a candidate:

```text
UNKNOWN
```

may be returned.

The system may then invoke AI assistance.

---

# 14. AI-Assisted Classification

AI may be used when deterministic classification is insufficient.

Input should contain only the evidence required for classification.

For example:

```text
title
description
source metadata
source category
URL
platforms
release information
```

The LLM should return a structured classification proposal.

Example:

```text
{
  "classification": "GAME",
  "confidence": 0.94,
  "reason": "..."
}
```

The exact schema should be strictly validated.

---

# 15. AI Is Advisory

AI classification is a proposal.

It does not directly mutate the catalog.

The application/domain layer must validate the proposal.

---

# 16. Hard Rules Override AI

If deterministic evidence establishes:

```text
source_type = MOVIE
```

AI must not override it merely because the title resembles a known game.

Hard evidence has priority.

---

# 17. AI Failure

If the LLM:

* times out;
* returns invalid JSON;
* violates the schema;
* exceeds limits;
* becomes unavailable;
* produces an unsupported category;

the system must fall back to native classification.

---

# 18. Native Fallback

The native classifier should remain capable of making useful classifications without AI.

At minimum:

```text
GAME
DLC
MOVIE
TV_SHOW
ANIME
UNKNOWN
```

should be distinguishable through deterministic signals where possible.

---

# 19. Classification Pipeline

```text
Candidate
   ↓
Normalize
   ↓
Deterministic classification
   ↓
Confident?
 ├── YES → Result
 └── NO
       ↓
      AI
       ↓
   Validate result
       ↓
   Accept proposal
       ↓
     Result
```

If AI fails:

```text
AI failure
   ↓
Native fallback
```

---

# 20. Classification and Persistence

Only candidates classified as appropriate catalog entities may enter the canonical Game pipeline.

For example:

```text
MOVIE
   ↓
discard from Game pipeline
```

while:

```text
GAME
   ↓
identity resolution
```

---

# 21. Unknown Candidates

`UNKNOWN` should not automatically mean "not a game".

It means:

> ATP currently lacks sufficient evidence to classify this candidate.

Unknown candidates may be retained as temporary discovery evidence.

---

# 22. Classification Cache

AI classification results may be cached where useful.

Cached AI results must remain distinguishable from canonical domain facts.

The cache must not prevent reclassification when rules or models change.

---

# 23. Reclassification

ATP should allow previously classified candidates to be re-evaluated.

This is important because:

* classification rules may improve;
* source data may change;
* AI models may improve;
* new evidence may become available.

---

# 24. Classification Invariants

1. Classification and identity are separate.
2. Remakes remain `GAME`.
3. Remasters remain `GAME`.
4. Ports remain `GAME` when representing playable game releases.
5. Regional releases remain `GAME`.
6. AI cannot override hard deterministic evidence.
7. AI failure cannot break the classification pipeline.
8. Invalid AI output must be rejected.
9. Unknown is preferable to fabricated certainty.
10. Classification does not directly create canonical entities.

---

# 25. Goal

Classification exists to keep the catalog clean.

The system should prefer:

```text
UNKNOWN
```

over incorrectly inserting:

```text
MOVIE
DLC
CHARACTER
```

as a Game.

False positives are more damaging than temporary uncertainty.
