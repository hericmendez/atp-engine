# ATP Engine — Enrichment

## 1. Purpose

Enrichment is the process of improving canonical game metadata using additional source evidence.

It is distinct from:
- **Discovery**: finding new observations
- **Classification**: determining what entity type something is
- **Identity Resolution**: determining which game/entity something represents
- **Persistence**: storing canonical knowledge

Enrichment improves metadata about an identified entity; it does not redefine the entity.

---

# 2. What Enrichment Means

Enrichment takes:
- An existing canonical Game
- A set of DiscoverySourceObservations

And produces:
- An improved Game with additional metadata
- A record of changes made
- A record of conflicts detected
- An updated completeness assessment

---

# 3. Canonical vs Observational Data

### Observation

Information obtained from a specific source.

Example:
```text
Steam:
  title = "Doom Eternal"
  platform = Windows
  developer = id Software
  releaseDate = 2020-03-20
```

### Canonical Metadata

The ATP Engine's current best representation of the underlying game.

Example:
```text
Game:
  primaryTitle = "Doom Eternal"
  developers = [id Software]
  releases = [...]
```

### Evidence

Why the engine believes a canonical value exists.

---

# 4. Enrichment Rules

## Title Enrichment

- Add new alternate/localized/abbreviated titles
- Never change the existing primary title
- Skip titles that are equivalent (case-insensitive, normalized)

## Organization Enrichment

- Add new developers/publishers
- Detect name variations (suffix removal: Inc., Ltd., LLC, etc.)
- Skip organizations that are equivalent

## Genre Enrichment

- Add new genres
- Skip genres that are equivalent (case-insensitive, normalized)

## External Identifier Enrichment

- Add new external identifiers
- Skip duplicates (same source + same id)
- Record conflicts when same source has different ids

## Evidence Enrichment

- Always additive
- Skip evidence from same source+sourceId combination

## Release Enrichment

- Match releases by platform name + region
- Enrich existing releases with new data
- Add new releases for new platform/region combinations

## Release Date Enrichment

- Improve precision (year → month → day)
- Never downgrade precision
- Record conflicts when dates disagree
- Never change year

## Distribution Channel / Launcher Enrichment

- Always additive
- Skip duplicates (case-insensitive)

---

# 5. Conflict Resolution

When sources disagree:

```text
Source A → release date = 2024-03-20
Source B → release date = 2024-03-21
```

The engine:
1. Retains the existing canonical value
2. Records the conflict with both values
3. Does NOT arbitrarily overwrite

Possible outcomes:
- `conflict_retained_existing`: existing value kept, conflict recorded
- `conflict_new_value_skipped`: new value discarded, conflict recorded

---

# 6. Metadata Completeness

After enrichment, completeness is recalculated:

```text
NOT_FOUND    → no metadata
FOUND_PARTIAL → some metadata
FOUND_SUFFICIENT → enough for basic identification
FOUND_COMPLETE → comprehensive metadata
```

Completeness is based on:
- Primary title existence
- Release existence
- Release date existence
- Developer existence
- Publisher existence
- Genre existence
- External identifier existence
- Evidence existence

---

# 7. Platform Ontology

Enrichment strictly preserves the Platform ontology:

```text
Steam → DistributionChannel (NOT Platform)
Google Play → DistributionChannel (NOT Platform)
App Store → DistributionChannel (NOT Platform)
Epic Games Store → DistributionChannel (NOT Platform)

Android → Platform (type: mobile)
iOS → Platform (type: mobile)
Windows → Platform (type: computer)

PICO-8 → Platform (type: fantasy-console)
TIC-80 → Platform (type: fantasy-console)
WASM-4 → Platform (type: fantasy-console)

CPS1 → Platform (type: arcade)
CPS2 → Platform (type: arcade)
Neo Geo → Platform (type: arcade)

Commodore 64 → Platform (type: computer)
Amiga → Platform (type: computer)
MS-DOS → Platform (type: computer)
```

---

# 8. Determinism

Enrichment is deterministic:

- Same inputs always produce same outputs
- Source execution order does not affect results
- Duplicate observations are handled idempotently

---

# 9. Idempotence

Running enrichment twice with the same observations produces the same result:

```text
E(E(game, observations), observations) = E(game, observations)
```

---

# 10. Identity Safety

Enrichment does NOT:
- Merge two different games
- Split one game into multiple
- Reinterpret a remake as the original
- Convert a port into a new game
- Convert a store into a platform

Enrichment preserves the existing game identity and only adds metadata.

---

# 11. Classification Safety

Enrichment does NOT:
- Change the classification of a game
- Force UNKNOWN into GAME
- Bypass the classifier

Classification remains the responsibility of the Classification Engine.

---

# 12. Implementation Architecture

```text
src/enrichment/
├── enrichment-types.ts      # EnrichmentResult, EnrichmentChange, EnrichmentConflict
├── enrichment-engine.ts     # enrichGame() function
└── index.ts                 # barrel exports
```

## Data Flow

```text
Game + DiscoverySourceObservation[]
            ↓
enrichGame()
  ├── enrichTitles()
  ├── enrichOrganizations(developer)
  ├── enrichOrganizations(publisher)
  ├── enrichGenres()
  ├── enrichExternalIdentifiers()
  ├── enrichEvidence()
  └── enrichReleases()
            ↓
EnrichmentResult
  ├── game (improved)
  ├── changes (what was added)
  ├── conflicts (what was disputed)
  └── completeness (updated assessment)
```
