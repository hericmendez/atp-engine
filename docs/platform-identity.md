# Platform Identity

Four distinct concepts. Do not collapse them.

## ATP Platform — canonical platform identity

The ATP's own identity for a platform: internal `id`
(`atp-platform-playstation-4`), deterministic `slug`, canonical `name`.
Never a provider value.

## Platform External Identity — provider identity

A platform's identity inside one provider: `source + sourcePlatformId`
(e.g. `igdb:48`). Globally unique per pair. Never inferred from names —
no fuzzy matching, no similarity, no LLM. An `ATP Platform` holds zero
or more of these; each pair belongs to at most one platform (unique
index + repository check).

## Platform Manifest — discovery reference

The MobyGames CSV universe (`source: 'mobygames'`, name,
`expectedGames`). It carries no provider ids, so manifest entries link
to nothing by themselves. Future deterministic mapping consumes the
manifest; it never auto-links.

## expectedGames — source metadata

Belongs to the manifest reference, never to `ATP Platform`:

```text
ATP Platform
└── PlayStation 4 (atp-platform-playstation-4)

External identities
├── IGDB:48
└── MobyGames:????   ← unresolved, never invented

Source metadata
├── IGDB expectedGames: 20498
└── MobyGames expectedGames: 12190
```

Different counts per source are expected (different catalogs, different
methodologies), not necessarily an error.

## Future: Game → ATP Platform

Releases currently carry platform as an embedded name value
(`Platform { name, family, type }`). The intended direction is:

```text
ATP Game
   └── release
         └── platform → ATP Platform id (canonical)
```

Provider names resolve to canonical platforms only through linked
external identities, never by string matching. That migration is
explicitly out of scope until cross-source platform mapping exists.
