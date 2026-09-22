# GameRelease Platform Origin Audit

Audit-only, read-only. No code, domain, Mongo, pipeline, or catalog
changes were made. No ingestion, no migration, no commit.

## Executive Summary

The `IGDB platform_id` is born in the IGDB response, carried one step
into the adapter, and **discarded at adapter mapping**. Every
downstream stage — `RawCandidate`, normalization, domain `Game`,
`GameRelease`, Mongo document — carries only
`platform: { name, family, type }`. This is **Scenario C**: the id is
lost and only the name remains. A future migration cannot join on
exact identity today; the smallest deterministic fix is to preserve
the provider platform id at ingestion time (existing
`Release.externalIdentifiers`, currently always empty, is the natural
slot), not to match by name afterwards.

## Current Domain Model

- `Game { id, titles, releases: Release[], ..., gameType, gameStatus }`
  persisted with `domainId` (unique) + compound unique
  `(externalIdentifiers.source, externalIdentifiers.id)`.
- `Release { id: ReleaseId, gameId, platform: Platform, region,
  releaseDate, version, edition, distributionChannels, launchers,
  externalIdentifiers: [], evidence }`.
- `Platform { name, family: PlatformFamily | null, type }` — embedded
  value object, no identity field. `release.platform` required.
- Release ids are name-derived (`atp-igdb-4-PlayStation 4-igdb-4`):
  the platform NAME is baked in, never a numeric id.
- `release.externalIdentifiers` is **always empty** (0 documents in the
  whole catalog carry any). Release `evidence` is game-level only:
  `{source: 'igdb', externalId: '<gameId>', retrievedAt, rawTitle}`.

## IGDB Adapter

`IgdbGame.platforms: Array<number | { id, name? }>` — the raw response
does carry the id (bare numeric ids, or expanded `{id, name}` objects
since the query requests `platforms, platforms.name`). Mapping in
`gameToCandidate`: object form keeps only `name` (the `id` is
dropped); numeric form goes through `IGDB_PLATFORM_MAP` (name only).
`RawCandidate.platforms` is `string[]`, and `metadata` keeps
`igdbId/slug/themes/url/game_type/status` — **no platform ids
anywhere**. The adapter is the single loss point.

## Origin Trace

| Stage | Platform ID preserved? | Field | Evidence |
|---|---|---|---|
| IGDB response | YES | `platforms[]: number \| {id, name}` | `igdb-adapter.ts` `IgdbGame` interface + `platforms.name` in field list |
| RawCandidate | NO | `platforms: string[]` | mapping keeps name only (`gameToCandidate`); `metadata` has no platform ids |
| normalization | NO | `platform: {name, family, type}` | `normalizePlatform(name)` derives family/type from name lists |
| domain Game | NO | `Release.platform` as above | `release.ts`; `externalIdentifiers: []` at creation |
| GameRelease | NO | same embedded value | `createRelease` input has no id slot filled |
| Mongo document | NO | `platform: {name, family, type}` | schema; release domainIds embed names |

## Mongo Evidence

150 distinct `platform.platform.name` values (upstream naming quirks
preserved: `AY-3-8606`, `DUPLICATE Stadia`, `Atari ST/STE`);
8,705 multi-release games; 13 `UNKNOWN`-platform games (all legacy
`atp-unknown-*` docs with no game identity at all); 0 releases with
`externalIdentifiers`.

| Game | Release | Platform | IGDB Platform ID | Status | Evidence |
|---|---|---|---:|---|---|
| atp-igdb-4 (Thief, igdb:4) | 6 releases | PlayStation 4, … | — | INFERRED only | name coincides with IGDB 48; no id stored |
| atp-igdb-14404 (igdb:14404) | 10 releases | PS4/PS5/Switch/… | — | INFERRED only | same as above |
| atp-igdb-79 (igdb:79) | incl. Switch | Nintendo Switch | — | INFERRED only | same as above |
| atp-unknown-1789413865232 | 1 release | UNKNOWN | — | UNKNOWN | legacy doc, no identity at all |

Every persisted release is INFERRED-at-best: name coincidence is
contextual evidence only and **must not ground a migration**.

## Provider Game Identity

Every canonical game carries `igdb:<gameId>` (`externalIdentifiers`,
unique-indexed). A future re-query of `GET /games/{id}` (or
enumeration) returns current `platforms: [{id, name}]`. That path
exists but was not executed here.

## Multiple Platform Releases

`Game → Release → Platform` preserves per-release distinction (each
release has its own `{name, family, type}` + name-derived domainId),
so platforms are distinguishable — but only by string, never by
identity.

## Ports / Relationships

No persisted game has `gameType: 'port'` (policy: ports never become
canonical). REMAKE/REMASTER edges use the identical release/platform
model; no extra origin data. A port release's platform is a plain name
like any other — linkable to ATP Platform only after identity is
preserved.

## Data Loss Point

`IgdbAdapter.gameToCandidate`, platform mapping: numeric id dropped
for both response shapes (object `id` ignored; bare id resolved to a
name and discarded). Single smallest fix location.

## Migration Scenarios

**C (actual)**: id lost, name only — direct deterministic migration is
impossible today. **B (recovery path)**: game-level `igdb:<gameId>`
allows re-query, but correlating fresh platform entries back to stored
releases still requires name matching, and upstream names drift
(`DUPLICATE Stadia`, map corrections like id 50) — best-effort, not
deterministic. **A**: achievable only after the normalizer preserves
ids going forward. **D**: no cross-structure conflicts found
(uniform `{name, family, type}` everywhere; 13 UNKNOWNs are legacy
docs, not corruption).

## Risks

1. Name drift between stored names and any future id source silently
   mislinks (e.g. corrected maps, duplicate/upstream renames).
2. 150 name variants (incl. verbatim upstream quirks) make any
   name-based join inherently fuzzy.
3. Alias tables (`resolvePlatformAlias`) normalize names but carry no
   ids — they cannot serve as identity bridge.

## Recommended Migration Strategy

1. Preserve first: carry provider platform id through
   `RawCandidate → NormalizedRelease → Release.externalIdentifiers`
   (`{source:'igdb', id:'<platformId>'}`), using the existing always-
   empty slot — no schema migration for new data, smallest change.
2. Only then migrate `release.platform → ATPPlatform.id` by exact
   `(source, id)` equality against linked external identities.
3. For the 15k+ legacy games: re-query by stored `igdb:<gameId>` and
   backfill ids where the name correlation is exact; quarantine the
   remainder for curatorial review instead of guessing.
4. Never match by name as identity.

## Safety Check

```text
games 15864 / quarantine 7638 / atpplatforms 5 — identical before/after
writes: 0 | ingestion: none | code changes: none
```

## Files Changed

- Created: `docs/game-release-platform-origin-audit.md` (this file).
- Temp scripts under `/tmp/smoke/` (`audit*.js`) — outside the repo,
  read-only (`findOne`, `countDocuments`, `distinct`, `aggregate`
  without `$out`/`$merge`).

## Conclusion

- **A** (born): IGDB `platforms[]` (`number | {id, name}`).
- **B** (preserved): nowhere past the raw response object.
- **C** (lost): `IgdbAdapter.gameToCandidate` platform mapping.
- **D** (deterministic recovery for stored releases): NO — only
  INFERRED-by-name or UNKNOWN.
- **E** (migrate without name matching): **NO** → **PARTIALLY**
  (YES only after ids are preserved at ingestion; legacy needs the
  re-query + quarantine path above).
- **F** (smallest change): populate `Release.externalIdentifiers`
  with the provider platform id at ingestion time.
