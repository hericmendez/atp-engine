# ATP Engine — Classification

## 1. Purpose

Classification determines what a discovered external record represents.

The classification system exists primarily to prevent unrelated media and non-game entities from entering the game catalog.

Examples of content that may appear in external search results:

- games;
- remakes;
- remasters;
- DLC;
- expansions;
- movies;
- television series;
- anime;
- books;
- soundtracks;
- promotional material;
- hardware;
- characters;
- franchises;
- people;
- events.

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

- source type;
- source metadata;
- title;
- description;
- URL structure;
- category metadata;
- structured source fields;
- platform information;
- platform family;
- release information;
- known media markers;
- relationships;
- external identifiers.

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

- times out;
- returns invalid JSON;
- violates the schema;
- exceeds limits;
- becomes unavailable;
- produces an unsupported category;

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

- classification rules may improve;
- source data may change;
- AI models may improve;
- new evidence may become available.

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

---

# 26. Implementation Architecture

## Source Types

```text
src/classification/
├── classification-signal.ts     # ClassificationSignal type
├── classification-result.ts     # ClassificationResult type
├── classifier.ts                # Classifier interface
├── deterministic-classifier.ts  # DeterministicClassifier implementation
└── index.ts                     # barrel exports
```

## Data Flow

```text
NormalizedCandidate
        ↓
DeterministicClassifier.classify()
        ↓
ClassificationResult
├── category: ClassificationCategory
├── confidence: number (0.0 - 1.0)
├── signals: ClassificationSignal[]
└── reason: string (human-readable explanation)
```

## Classifier Interface

```typescript
interface Classifier {
  classify(candidate: NormalizedCandidate): ClassificationResult;
}
```

The `Classifier` interface enables future AI-backed implementations without changing the classification pipeline. The `DeterministicClassifier` is the primary implementation.

## ClassificationSignal

Every signal used for classification is recorded:

```typescript
interface ClassificationSignal {
  source: SignalSource; // Where the signal came from
  category: ClassificationCategory;
  weight: number; // Signal strength (0.0 - 1.0)
  confidence: number; // Signal reliability (0.0 - 1.0)
  evidence: string; // Human-readable explanation
}
```

Signal sources:

- `source-type` — explicit type from source (Steam type, etc.)
- `source-category` — category hint from source (Wikipedia categories)
- `title-pattern` — pattern match in the title
- `infobox-type` — Wikipedia infobox type
- `category-list` — Wikipedia category list
- `genre-indicator` — game-specific genre terms
- `metadata-field` — structured metadata
- `description-keyword` — keyword match in description

## Weighted Scoring

Classification uses weighted scoring to resolve signals:

```text
totalWeight = sum(signal.weight × signal.confidence) per category
```

The category with the highest `totalWeight` wins, provided it exceeds the confidence threshold (0.3).

If no category exceeds the threshold, the result is `UNKNOWN`.

## Confidence Model

| Score Range | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| 0.8 - 1.0   | Strong evidence: explicit source type or multiple concordant signals |
| 0.5 - 0.7   | Moderate evidence: title pattern or single strong signal             |
| 0.3 - 0.4   | Weak evidence: below reliable threshold                              |
| 0.0 - 0.2   | Insufficient evidence: classified as UNKNOWN                         |

The confidence score is `min(1.0, totalWeight)` for the winning category.

## Conflict Resolution

When multiple categories have competing signals:

1. All signals are collected
2. Weighted scores are computed per category
3. The highest-scoring category wins
4. If the winner does not exceed the threshold, `UNKNOWN` is returned
5. The reason field documents the conflict and resolution

Example:

```text
Steam type: game → GAME (weight: 1.0, confidence: 0.9) → score: 0.90
Title contains "Soundtrack" → SOUNDTRACK (weight: 0.7, confidence: 0.6) → score: 0.42

Winner: GAME (0.90 > 0.42)
```

## Signal Weights

| Source                | Weight | Rationale                                         |
| --------------------- | ------ | ------------------------------------------------- |
| `source-type`         | 1.0    | Direct type declaration from authoritative source |
| `source-category`     | 0.8    | Category hint from structured source data         |
| `title-pattern`       | 0.7    | Meaningful pattern but may have exceptions        |
| `description-keyword` | 0.6    | Descriptive text may be ambiguous                 |
| `genre-indicator`     | 0.4    | Supporting evidence, not decisive alone           |

---

# 27. Classification Signals in Detail

## Source Type Signals

Source adapters provide classification hints as part of `RawCandidate`. These are normalized into `NormalizedClassificationHint` and flow through the normalization pipeline.

Example from Steam adapter:

```typescript
classificationHints: [
  {
    category: 'GAME',
    confidence: 0.9,
    evidence: 'Steam type: game',
  },
];
```

Example from Wikipedia adapter:

```typescript
classificationHints: [
  {
    category: 'GAME',
    confidence: 0.7,
    evidence: 'Wikitext contains "video game"',
  },
];
```

## Title Pattern Signals

Title patterns detect known entity types:

| Pattern                                       | Category    | Notes                        |
| --------------------------------------------- | ----------- | ---------------------------- |
| `soundtrack`, `ost`, `original score`         | SOUNDTRACK  | Music collections            |
| `dlc`                                         | DLC         | Downloadable content markers |
| `expansion pack`, `expansion`                 | EXPANSION   | Substantial additions        |
| `movie`, `film`                               | MOVIE       | Film adaptations             |
| `tv series`, `television`, `tv show`          | TV_SHOW     | Television productions       |
| `anime`                                       | ANIME       | Japanese animation           |
| `guide`, `strategy guide`, `walkthrough`      | BOOK        | Published guides             |
| `hardware`, `console`, `controller`           | HARDWARE    | Physical hardware            |
| `promotional`, `promo`, `bonus content`       | PROMOTIONAL | Marketing materials          |
| `character design`, `art book`, `concept art` | CHARACTER   | Character-focused content    |
| `franchise`, `series overview`                | FRANCHISE   | Franchise-level content      |
| `profile`, `biography`, `pedia`               | PERSON      | Individual profiles          |
| `event`, `tournament`, `convention`           | EVENT       | Events and competitions      |

**Important**: Title patterns are heuristics. They may produce false positives when words appear in game titles (e.g., "Doom Eternal" contains neither "dlc" nor "expansion"). Source type signals have higher priority.

## Description Keyword Signals

Description text is analyzed for entity-type keywords:

| Pattern                                            | Category   |
| -------------------------------------------------- | ---------- |
| `video game`, `playable`, `gameplay`, `in-game`    | GAME       |
| `soundtrack`, `original score`, `features...music` | SOUNDTRACK |
| `movie`, `film`, `feature film`                    | MOVIE      |
| `television`, `tv series`, `animated series`       | TV_SHOW    |
| `anime`, `animated`                                | ANIME      |
| `book`, `novel`, `guide book`                      | BOOK       |

## Genre Indicator Signals

Game-specific genres provide supporting evidence for GAME classification:

```text
action, adventure, rpg, role-playing, strategy, puzzle,
simulation, racing, sports, fighting, platformer, shooter,
stealth, survival, horror, mmorpg, roguelike, indie
```

Genre signals have lower weight (0.4) and serve as supporting evidence rather than primary classification.

---

# 28. Platform and Distribution Independence

## Platforms Are Not Classification Signals

The classifier does NOT use platform information for classification:

```text
Android + GAME evidence → GAME
Android + no evidence → UNKNOWN
Windows + GAME evidence → GAME
Windows + no evidence → UNKNOWN
PlayStation + GAME evidence → GAME
```

Platform determines **where** a game runs, not **what** it is.

## Distribution Channels Are Not Classification Signals

The classifier does NOT use distribution channel information:

```text
Steam + GAME evidence → GAME
Steam + DLC evidence → DLC
Google Play + GAME evidence → GAME
Google Play + no evidence → UNKNOWN
```

A game on Steam is still a game. A movie on Steam is still a movie.

## Store Listing ≠ Game

The existence of a page in a store does not automatically make it a game. Evidence must indicate the entity is a game.

---

# 29. UNKNOWN Policy

`UNKNOWN` is returned when:

1. No classification signals are available
2. Available signals do not exceed the confidence threshold (0.3)
3. Conflicting signals cannot be resolved with confidence

`UNKNOWN` does NOT mean:

- "This is not a game"
- "This should be discarded"
- "This is an error"

`UNKNOWN` means:

- "ATP currently lacks sufficient evidence to classify this candidate"
- "Additional evidence or AI assistance may improve classification"

Unknown candidates may be:

- Retained as temporary discovery evidence
- Re-evaluated when new evidence becomes available
- Classified by AI when deterministic rules are insufficient

---

# 30. Future AI Integration

The `Classifier` interface enables AI-backed implementations:

```typescript
class AIClassifier implements Classifier {
  classify(candidate: NormalizedCandidate): ClassificationResult {
    // Call LLM with candidate evidence
    // Validate structured output
    // Return ClassificationResult
  }
}
```

AI classification will:

- Receive only the evidence required for classification
- Return a structured `ClassificationResult`
- Be validated before entering domain logic
- Never override hard deterministic evidence
- Fall back to native classification on failure

The deterministic layer remains the primary classifier. AI is an optional enhancement for ambiguous cases.
