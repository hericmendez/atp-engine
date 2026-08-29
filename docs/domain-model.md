# ATP Engine — Domain Model

## 1. Purpose

This document defines the conceptual domain model of the ATP Engine.

The domain represents knowledge about video games independently of:

- external sources;
- scraping implementations;
- databases;
- HTTP;
- AI providers.

---

# 2. Core Entity

## Game

A `Game` represents a canonical video game identity.

A Game is not a platform release.

A Game is not a regional release.

A Game is not a source record.

A Game is not a user's copy of a game.

Conceptually:

```text
Game
 ├── identity
 ├── titles
 ├── releases
 ├── relationships
 ├── metadata
 └── provenance
```

---

# 3. Game Identity

A canonical game should have a stable internal identifier.

This identifier must remain independent of external source identifiers.

Example:

```text
ATP Game ID
    ≠
SteamDB ID
    ≠
Wikipedia page ID
```

External identifiers should be stored as references/provenance.

---

# 4. Titles

A game may have multiple titles.

Examples:

```text
primary title
alternate title
localized title
regional title
abbreviated title
```

Title equality alone must not determine game identity.

---

# 5. Release

A Release represents a specific manifestation of a game.

A release may be associated with:

- platform;
- region;
- release date;
- version;
- edition;
- distribution channels;
- launchers;
- external identifiers.

**Distribution channels** describe how a release is obtained (e.g., Steam, GOG, PlayStation Store, Physical).

**Launchers** describe what software runs the game (e.g., Steam Client, GOG Galaxy, no launcher for console games).

Distribution channels and launchers are metadata about the release, not the game identity. A game available on Steam and GOG is the same game distributed through different channels.

Example:

```text
Game
└── Breath of the Wild
     ├── Wii U Release
     └── Switch Release
```

And:

```text
Game
└── Cyberpunk 2077
     ├── PC Release
     │    ├── Distribution Channel: Steam
     │    ├── Distribution Channel: GOG
     │    ├── Distribution Channel: Epic Games Store
     │    ├── Launcher: Steam Client (for Steam channel)
     │    └── Launcher: GOG Galaxy (for GOG channel)
     └── PlayStation 5 Release
          └── Distribution Channel: PlayStation Store
```

---

# 6. Platform

Platform represents an **execution environment** — the hardware or software environment in which a game release is intended or historically designed to execute as playable software.

The important question is:

> "On what execution environment does this release run?"

NOT:

> "Where was this game obtained?"

The second question belongs to `DistributionChannel`.

## 6.1 Platform Dimensions

Each platform has three dimensions:

```text
Platform
 ├── name: the concrete platform name (e.g., "PlayStation 5", "Windows", "PICO-8")
 ├── family: broad ecosystem grouping (e.g., "PlayStation", "PC", "Other")
 └── type: kind of execution environment (e.g., "console", "computer", "fantasy-console")
```

### Platform Family

**Platform Family** answers: "What ecosystem does this belong to?"

```text
Platform Family: PlayStation
  └── PlayStation, PlayStation 2, PlayStation 3, PlayStation 4, PlayStation 5, PSP, PS Vita

Platform Family: Xbox
  └── Xbox, Xbox 360, Xbox One, Xbox Series X, Xbox Series S

Platform Family: Nintendo
  └── NES, SNES, Nintendo 64, GameCube, Game Boy, DS, 3DS, Wii, Wii U, Nintendo Switch

Platform Family: PC
  └── Windows, macOS, Linux, MS-DOS

Platform Family: Mobile
  └── Android, iOS, Windows Phone

Platform Family: Sega
  └── Sega Genesis, Sega Saturn, Sega Dreamcast

Platform Family: Other
  └── Arcade, CPS2, Commodore 64, PICO-8, etc.
```

### Platform Type

**Platform Type** answers: "What kind of execution environment is this?"

```text
console     → PlayStation 5, Xbox Series X, Nintendo Switch, Sega Genesis
handheld    → PSP, Game Boy Advance, Nintendo DS, PlayStation Vita
arcade      → CPS2, Neo Geo, Naomi
computer    → Windows, macOS, Linux, MS-DOS, Commodore 64
mobile      → Android, iOS
fantasy-console → PICO-8, TIC-80, WASM-4
web         → (future)
other       → unknown or unclassified
```

### Platform Examples

```text
PlayStation 5
  family = PlayStation
  type   = console

PSP
  family = PlayStation
  type   = handheld

Game Boy Advance
  family = Nintendo
  type   = handheld

CPS2
  family = Other
  type   = arcade

Commodore 64
  family = Other
  type   = computer

MS-DOS
  family = PC
  type   = computer

Windows
  family = PC
  type   = computer

Android
  family = Mobile
  type   = mobile

PICO-8
  family = Other
  type   = fantasy-console
```

## 6.2 Critical Distinctions

**A Distribution Channel is NOT a Platform.** Distribution channels describe how a game is obtained, not what hardware runs it.

```text
Steam           → DistributionChannel (NOT a platform)
Epic Games Store → DistributionChannel (NOT a platform)
GOG             → DistributionChannel (NOT a platform)
Google Play     → DistributionChannel (NOT a platform)
App Store       → DistributionChannel (NOT a platform)
```

**A Launcher is NOT a Platform.** A launcher is software used to start/manage the game.

```text
Steam Client    → Launcher (NOT a platform)
EA App          → Launcher (NOT a platform)
```

**A Runtime/Emulator is NOT the original Platform.** Runtimes execute software but are not the original execution environment.

```text
ScummVM         → Runtime/CompatibilityLayer (NOT the original platform)
DOSBox           → Runtime/CompatibilityLayer (NOT the original platform)
MAME             → Runtime/Emulator (NOT the original platform)
```

**An Engine is NOT a Platform.** An engine is technology used to create games.

```text
Unity           → Engine (NOT a platform)
Unreal Engine   → Engine (NOT a platform)
```

### Mobile Platforms

Mobile platforms follow the same distinction:

```text
Platform: Android (family: Mobile, type: mobile)
Platform: iOS (family: Mobile, type: mobile)

Distribution: Google Play (NOT a platform)
Distribution: Apple App Store (NOT a platform)
Distribution: F-Droid (NOT a platform)
Distribution: Direct APK (NOT a platform)
```

**Android ≠ Google Play**: Google Play is a distribution channel, not an execution platform. Android games may be distributed through:

- Google Play
- Amazon Appstore
- Samsung Galaxy Store
- Huawei AppGallery
- F-Droid
- Direct APK / Sideload

**iOS ≠ App Store**: The App Store is a distribution channel, not an execution platform. iOS games may be distributed through:

- Apple App Store
- TestFlight
- Enterprise distribution
- Ad-hoc distribution

A game being absent from a store does not mean it doesn't exist on the platform. Delisted games remain valid historical releases.

## 6.3 Invariants

```text
Platform ≠ DistributionChannel ≠ Launcher
```

Examples:

- `Steam` is a distribution channel, not a platform
- `GOG` is a distribution channel, not a platform
- `Windows` is a platform (family: PC, type: computer)
- `PlayStation 4` is a platform (family: PlayStation, type: console)
- `PICO-8` is a platform (family: Other, type: fantasy-console)

The platform family allows grouping queries (e.g., "all PlayStation releases") without conflating platform identity.

The platform type allows distinguishing execution environments (e.g., "all handhelds") within a family.

Platform identity should be normalized. Source-specific platform strings must not become canonical platform names automatically.

## 6.4 Retro Computers

Retro computers are execution platforms. They should not be forced into a generic `PC` platform.

```text
Commodore 64    → family: Other, type: computer
Amiga           → family: Other, type: computer
MSX             → family: Other, type: computer
ZX Spectrum     → family: Other, type: computer
Apple II        → family: Other, type: computer
```

## 6.5 Fantasy Consoles

Fantasy consoles are actual execution platforms. They define constrained virtual execution environments for games.

```text
PICO-8          → family: Other, type: fantasy-console
TIC-80          → family: Other, type: fantasy-console
WASM-4         → family: Other, type: fantasy-console
```

## 6.6 Arcade

Arcade systems are execution platforms. An arcade board/system can be the historical execution environment of a game.

```text
CPS1            → family: Other, type: arcade
CPS2            → family: Other, type: arcade
Neo Geo         → family: Other, type: arcade
```

---

# 7. Region

Region identifies a geographical or market-specific release.

Examples:

```text
NTSC/USA
PAL/EUR
Japan
North America
Europe
```

Regional differences do not automatically create separate games.

---

# 8. Developer

Developer represents an organization or entity responsible for development.

A game may have multiple developers.

---

# 9. Publisher

Publisher represents an organization responsible for publishing/distribution.

A game may have multiple publishers across regions.

Developer and publisher must remain distinct concepts.

---

# 10. Genre

Genre represents the canonical genre classification of a game.

A game may have multiple genres.

Genre normalization should prevent source-specific duplicates such as:

```text
Action-Adventure
Action Adventure
Action & Adventure
```

from being treated as unrelated concepts when they represent the same canonical category.

---

# 11. External Source

A Source represents an external system from which evidence was obtained.

Examples:

```text
Wikipedia
SteamDB
Future sources
```

A Source is not a canonical authority.

---

# 12. Source Record

A source may represent the same game differently.

Conceptually:

```text
SourceRecord
 ├── source
 ├── externalId
 ├── raw title
 ├── raw metadata
 └── retrieved information
```

Source records should remain distinguishable from canonical Games.

---

# 13. Provenance

Provenance describes where canonical information originated.

Conceptually:

```text
Canonical field
    ↓
Source evidence
    ↓
Source
    ↓
External identifier
```

Provenance becomes especially important when sources disagree.

---

# 14. Candidate

A Candidate is a temporary representation discovered during search/discovery.

It may not yet correspond to a canonical Game.

```text
Candidate
   ↓
Classification
   ↓
Identity Resolution
   ↓
Canonical Game
```

Candidates should not automatically be persisted as canonical games.

---

# 15. Classification

Candidates have a content classification.

Possible classifications:

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

The exact vocabulary is defined by `docs/classification.md`.

---

# 16. Game Relationships

Two records may be related without being identical.

Supported conceptual relationships include:

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

Relationships must not be confused with identity.

---

# 17. Identity vs Relationship

This distinction is fundamental.

Example:

```text
Resident Evil 4 (2005)
Resident Evil 4 (2023)
```

Identity:

```text
different games
```

Relationship:

```text
remake
```

Whereas:

```text
Resident Evil 3 NTSC
Resident Evil 3 PAL
```

may be:

```text
same game
+
regional releases
```

---

# 18. Game vs User Game

ATP does not represent user ownership or personal gameplay state.

This distinction is intentional.

ATP:

```text
Game
```

Consumer application:

```text
UserGame
```

User-specific information belongs outside ATP.

---

# 19. Metadata Completeness

A Game may have incomplete metadata.

Conceptual states include:

```text
NOT_FOUND
FOUND_PARTIAL
FOUND_SUFFICIENT
FOUND_COMPLETE
```

These states represent knowledge completeness, not necessarily data validity.

---

# 20. Canonicalization

Canonicalization transforms source observations into stable ATP concepts.

Example:

```text
"Nintendo Co., Ltd."
"Nintendo"
```

may need to resolve to the same canonical organization.

Canonicalization must use evidence and deterministic rules where possible.

AI may assist when ambiguity exists.

---

# 21. Identity Evidence

Identity resolution may consider:

```text
title
alternate titles
external IDs
release dates
platforms
platform families
developers
publishers
genres
regions
edition markers
version markers
distribution channels
launchers
source relationships
```

No single field should automatically dominate all others unless explicitly defined as a hard identity key.

Distribution channels and launchers are weak identity signals — they help identify a specific release but should not drive game-level identity decisions.

---

# 22. Hard Identity Evidence

Some evidence may be considered authoritative within the domain.

Examples may include:

- verified identical external identifiers;
- explicit regional-release relationships;
- canonical internal identifiers.

Hard evidence must be defined explicitly.

AI cannot override hard identity evidence.

---

# 23. Soft Identity Evidence

Other evidence contributes to a confidence assessment.

Examples:

```text
similar title
same developer
similar release date
same platform
same publisher
matching metadata
```

Soft evidence should be combined rather than treated as absolute.

---

# 24. Ambiguous Identity

When available evidence cannot safely determine identity:

```text
UNRESOLVED
```

is preferable to a destructive merge.

The engine should preserve candidates and evidence for future resolution.

---

# 25. Domain Invariants

The domain must preserve at least these invariants:

1. A Game represents one canonical game identity.
2. Platform releases do not automatically create different Games.
3. Regional releases do not automatically create different Games.
4. Remakes are not automatically the same Game.
5. Remasters are not automatically the same Game.
6. Ports are not automatically different Games.
7. Similar titles do not imply identity.
8. AI decisions do not override hard evidence.
9. Uncertainty must not cause destructive merges.
10. Source records are not canonical Games.
11. Distribution channels do not define game identity (Steam vs GOG ≠ different games).
12. A Distribution Channel is not a Platform (Steam is not a platform).
13. Absence of a source result is not negative evidence.
14. `PC` must not auto-convert to `Windows` unless evidence explicitly says so.

---

# 26. Example Model

Conceptually:

```text
GAME
└── Resident Evil 3
    │
    ├── TITLE
    │   └── Resident Evil 3
    │
    ├── RELEASE
    │   ├── PlayStation / NTSC-USA
    │   └── PlayStation / PAL-EUR
    │
    └── RELATIONSHIP
        └── related to Resident Evil 3 Remake
```

And:

```text
GAME
└── The Legend of Zelda:
    Breath of the Wild
    │
    ├── RELEASE
    │   ├── Wii U
    │   └── Nintendo Switch
    │
    └── ...
```

And with distribution channels:

```text
GAME
└── Cyberpunk 2077
    │
    ├── TITLE
    │   └── Cyberpunk 2077
    │
    ├── RELEASE (PC / Windows)
    │   ├── Distribution Channel: Steam
    │   ├── Distribution Channel: GOG
    │   └── Distribution Channel: Epic Games Store
    │
    ├── RELEASE (PC / Linux)
    │   └── Distribution Channel: Steam
    │
    ├── RELEASE (PlayStation 5)
    │   └── Distribution Channel: PlayStation Store
    │
    └── RELEASE (Xbox Series X)
        └── Distribution Channel: Microsoft Store
```

---

# 27. Domain Boundary

The domain must not contain:

```text
HTTP request objects
HTML nodes
CSS selectors
database queries
MongoDB documents
LLM prompts
provider SDK objects
```

These belong to outer layers.

---

# 28. AI and the Domain

AI may provide a proposed domain decision.

Example:

```text
AI:
relationship = remake
confidence = 0.97
```

The domain/application layer decides whether that proposal is valid.

The AI itself does not mutate canonical domain state.

---

# 29. Domain Goal

The domain model should allow ATP to answer:

> What game is this?

> What releases does this game have?

> Which platforms does it exist on?

> Which distribution channels offer this game?

> Which launchers are required to run this game?

> Which versions are related?

> Is this candidate actually a game?

> Where did this information come from?

> How confident is ATP about this identity?

without knowing how the information was acquired.
