# ATP Engine — Identity Resolution

## 1. Purpose

Identity resolution determines whether discovered records represent:

1. the same canonical game;
2. different games;
3. related versions of games;
4. regional/platform releases of the same game;
5. an unresolved identity.

This is one of the most important components of ATP.

Incorrect identity resolution can permanently pollute the catalog.

---

# 2. Core Principle

Similarity does not imply identity.

The engine must distinguish:

```text
same game
```

from:

```text
similar game
```

and:

```text
related game
```

---

# 3. Identity Outcomes

The resolver should conceptually produce one of:

```text
SAME_GAME
DIFFERENT_GAME
RELATED_GAME
UNRESOLVED
```

`RELATED_GAME` should additionally identify the relationship when possible.

Examples:

```text
REMAKE
REMASTER
PORT
EXPANSION
ENHANCED_VERSION
REGIONAL_RELEASE
ALTERNATE_TITLE
```

---

# 4. Identity Resolution Examples

## Same game — different platforms

```text
The Legend of Zelda:
Breath of the Wild — Wii U

The Legend of Zelda:
Breath of the Wild — Nintendo Switch
```

Result:

```text
SAME_GAME
```

with different releases.

---

## Same game — different distribution channels

```text
Cyberpunk 2077 — PC — Steam

Cyberpunk 2077 — PC — GOG
```

Result:

```text
SAME_GAME
```

with the same release but different distribution channels. Distribution channels do not affect game identity.

---

## Same game — platform family

```text
Resident Evil 4 — Windows

Resident Evil 4 — macOS

Resident Evil 4 — Linux
```

Result:

```text
SAME_GAME
```

All three belong to platform family `PC`. Platform family helps group related releases but does not determine identity.

---

## Different games — remake

```text
Resident Evil 4 (2005)

Resident Evil 4 (2023)
```

Result:

```text
DIFFERENT_GAME
```

with:

```text
REMAKE
```

relationship.

---

## Different versions of a franchise entry

```text
Final Fantasy Tactics

Final Fantasy Tactics:
The War of the Lions
```

must not be merged merely because the titles are similar.

The resolver must determine whether the relationship is:

```text
REMASTER
ENHANCED_VERSION
RELATED_GAME
```

or another appropriate classification.

---

## Same game — regional releases

```text
Resident Evil 3 — NTSC/USA

Resident Evil 3 — PAL/EUR
```

Result:

```text
SAME_GAME
```

with regional releases.

---

## Same game — mobile + desktop

```text
Stardew Valley — PC (Steam)

Stardew Valley — Nintendo Switch

Stardew Valley — Android (Google Play)

Stardew Valley — iOS (App Store)
```

Result:

```text
SAME_GAME
```

with platform releases. Mobile releases do not automatically create different games.

---

## Same game — multiple Android distribution channels

```text
Game A — Android (Google Play)

Game A — Android (F-Droid)

Game A — Android (Direct APK)
```

Result:

```text
SAME_GAME
```

Distribution channel differences do not affect game identity.

---

## Different games — mobile remake

```text
Classic Game (1990)

Classic Game Remake (2023) — Android
```

Result:

```text
DIFFERENT_GAME
```

with:

```text
REMAKE
```

relationship. The platform alone cannot determine this.

---

## Application identifier as evidence

```text
Game A
  └── Android Release
      └── Package ID: com.example.game

Game B
  └── Android Release
      └── Package ID: com.example.game.v2
```

Package identifiers are external identifiers, not automatic game identity. Different packages may represent the same game (developer changed package) or different games (sequel uses new package).

# 5. Evidence Hierarchy

Identity resolution should consider evidence with different strengths.

### Strong evidence

* identical verified external identifiers;
* explicit source relationships;
* canonical source references;
* known regional-release mappings;
* known platform-release mappings.

### Medium evidence

* normalized title;
* alternate title;
* release date;
* developer;
* publisher;
* platform;
* genre.

### Weak evidence

* textual similarity;
* franchise similarity;
* vague descriptions;
* similar artwork.

No weak signal should independently trigger a merge.

---

# 6. External Identifiers

External IDs can provide extremely strong evidence.

Example:

```text
SteamDB ID
Wikipedia entity/page ID
```

However, external IDs are source-specific.

An identifier must not be assumed globally meaningful across sources.

---

# 7. Title Normalization

Titles should be normalized before comparison.

Normalization may address:

* casing;
* whitespace;
* punctuation;
* separators;
* Unicode normalization;
* common regional markers.

Example:

```text
Resident Evil 3
resident evil 3
Resident Evil 3!
```

may normalize to a comparable representation.

Normalization must not erase meaningful version information.

---

# 8. Version Markers

The resolver must detect meaningful markers such as:

```text
Remake
Remastered
HD
Definitive Edition
Director's Cut
Gold Edition
Enhanced Edition
The War of the Lions
The Ivalice Chronicles
```

These markers should trigger deeper analysis rather than automatic merging.

---

# 9. Platform Differences

Platform differences alone should not create a different Game.

Example:

```text
PC
PS5
Xbox Series X
Nintendo Switch
```

may represent releases of the same Game.

Platform belongs primarily to Release.

---

# 10. Region Differences

Region differences alone should not create a different Game.

Examples:

```text
NTSC-USA
PAL-EUR
Japan
```

should normally be represented as regional releases.

---

# 11. Release Date

Release date is useful evidence but is not definitive.

Different dates may represent:

* regional release;
* platform release;
* remake;
* remaster;
* re-release;
* port.

Therefore release date must be interpreted in context.

---

# 12. Developer and Publisher

Developer and publisher similarities are supporting evidence.

They should not independently establish identity.

---

# 13. Identity Scoring

The native resolver may calculate an identity score.

Conceptually:

```text
title match              + strong
external ID match       + very strong
same platform            + supporting
same developer           + supporting
same release window      + supporting
version marker           - strong
remake marker            - very strong
```

The exact scoring system should remain configurable and testable.

---

# 14. Thresholds

The resolver should use conservative thresholds.

Conceptually:

```text
HIGH CONFIDENCE
    → SAME_GAME

HIGH CONFIDENCE DIFFERENCE
    → DIFFERENT_GAME

RELATED
    → RELATED_GAME

INSUFFICIENT EVIDENCE
    → UNRESOLVED
```

The exact numerical thresholds must be determined empirically using test fixtures.

---

# 15. Deterministic Resolver

The native resolver should handle obvious cases without AI.

Examples:

```text
same verified external ID
```

```text
same canonical title + compatible release metadata
```

```text
known regional release
```

```text
explicit remake relationship
```

---

# 16. AI-Assisted Resolution

AI should be invoked when deterministic evidence is insufficient.

Example:

```text
Candidate A
Candidate B
Evidence
    ↓
Native resolver
    ↓
Ambiguous
    ↓
LLM
```

The LLM receives structured evidence rather than uncontrolled raw pages whenever possible.

---

# 17. AI Response

The AI should return structured data such as:

```text
{
  "decision": "SAME_GAME",
  "relationship": null,
  "confidence": 0.91,
  "evidence": [
    "same title",
    "same original release",
    "platform difference only"
  ]
}
```

For related games:

```text
{
  "decision": "RELATED_GAME",
  "relationship": "REMAKE",
  "confidence": 0.98
}
```

---

# 18. AI Validation

AI output must be validated against:

* schema;
* allowed decisions;
* allowed relationships;
* hard evidence;
* domain invariants.

Invalid output must be rejected.

---

# 19. AI Cannot Override Hard Identity

Example:

If two records have verified evidence that they are separate canonical releases representing different games, an LLM cannot merge them solely because the names are similar.

Hard domain evidence always wins.

---

# 20. AI Failure

If AI is unavailable:

```text
LLM failure
   ↓
Native resolver
```

If native resolution remains ambiguous:

```text
UNRESOLVED
```

must be returned.

The engine must not guess.

---

# 21. Destructive Merge Policy

Merging two existing canonical Games is a high-risk operation.

The system must be significantly more conservative when merging persisted entities than when grouping temporary search candidates.

Recommended policy:

```text
Candidate grouping
    → may use moderate confidence

Existing Game merge
    → requires strong evidence
```

AI alone should not silently merge two existing canonical Games.

---

# 22. Identity Groups

Discovery may produce groups:

```text
Candidate A
Candidate B
Candidate C
      ↓
Identity Group
      ↓
Existing Game?
 ├── YES → Enrich
 └── NO → Create Game
```

---

# 23. Unresolved Identity

If evidence is insufficient:

```text
UNRESOLVED
```

The candidates should remain separate.

The system may retain the unresolved relationship for future processing.

---

# 24. Identity Evidence

Identity decisions should retain enough evidence to explain the decision.

Conceptually:

```text
IdentityDecision
 ├── candidates
 ├── decision
 ├── relationship
 ├── confidence
 ├── evidence
 ├── method
 └── timestamp
```

`method` may be:

```text
NATIVE
AI
HYBRID
```

---

# 25. Explainability

AI-assisted identity decisions should be auditable.

ATP should be able to answer:

> Why did these two records get merged?

The explanation should rely on stored evidence, not merely an opaque model response.

---

# 26. Re-evaluation

Identity decisions may need to be reconsidered when:

* new sources are added;
* metadata improves;
* classification changes;
* better AI models become available;
* conflicting evidence appears.

The architecture should allow re-resolution.

---

# 27. Identity Invariants

1. Similar title does not imply identity.
2. Platform difference does not imply different game.
3. Region difference does not imply different game.
4. Remake does not imply same game.
5. Remaster must be evaluated explicitly.
6. Port may represent the same game.
7. AI is advisory.
8. Hard evidence overrides AI.
9. Ambiguity must remain unresolved.
10. Existing canonical entities require stricter merge rules.
11. Identity decisions should preserve evidence.
12. The engine must never invent certainty.
13. Distribution channel differences do not imply different games (Steam vs GOG = same game).
14. Distribution channel is not a platform (Steam is not a platform).
15. Absence of a source result is not negative evidence.
16. `PC` must not auto-convert to `Windows` unless evidence explicitly says so.
17. Android is not Google Play (Android is platform, Google Play is distribution channel).
18. iOS is not App Store (iOS is platform, App Store is distribution channel).
19. Delisted games remain valid historical releases.
20. Application identifiers are external evidence, not automatic game identity.

---

# 28. Goal

The identity resolver should optimize for:

> **catalog integrity over catalog completeness.**

It is better to temporarily maintain two records that may eventually be merged than to incorrectly merge two genuinely different games.
