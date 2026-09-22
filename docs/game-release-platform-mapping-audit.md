# GameRelease → IGDB Platform Mapping Audit

Audit-only, read-only. No code, domain, Mongo, pipeline, or catalog
changes. No ingestion, migration, backfill, or commit. All IGDB access
was read-only (`GET`-equivalent POST queries + one OAuth token).

## Executive Summary

The IGDB payload uses **Model A**: `Game.platforms[]` (bare numeric
ids, no names, no release linkage). A separate `release_dates[]`
array carries per-platform rows, but N:1 (regions/editions) against
ATP's one-release-per-platform model — it does **not** map 1:1 onto
persisted `GameRelease`s. The persisted release carries no id, its
`domainId` embeds only the platform name, and
`Release.externalIdentifiers` is empty on 100% of documents.
Reconstruction for the 8,705 multi-release games is therefore
**INFERRED ONLY** via names. Deterministic backfill is impossible
without preserving ids at ingestion; the smallest safe step is
populating the existing (empty) release identifier slot going forward.

## Release.externalIdentifiers Contract

- Type: `ExternalIdentifier { source: string, id: string }[]`
  (string ids; no numeric slot, but numeric ids stringify cleanly —
  cf. game-level `igdb:<gameId>`).
- Cardinality: 0..n per release. Uniqueness: none at release scope
  (only game-level compound unique exists).
- Persistence: embedded array in the release subdocument.
- Current state: **always empty** (normalize emits `[]`; enrichment
  only copies from the equally-empty normalized field).
- Adequacy for `{source:'igdb', id:'48'}`: structurally YES.

## IGDB Payload Structure

Live query `fields name,platforms,release_dates,release_dates.platform;
where id = 4` (Thief) returned:

```json
{ "id": 4, "name": "Thief",
  "platforms": [9, 48, 6, 14, 12, 49],
  "release_dates": [
    { "id": 106370, "platform": 48 },
    { "id": 106371, "platform": 48 },
    { "id": 136391, "platform": 49 },
    { "id": 591525, "platform": 14 },
    ...
  ] }
```

The adapter never requests `release_dates` (field list ends at
`version_parent`); it requests `platforms, platforms.name` and keeps
names only. `platforms` has no per-entry names without expansion.

## GameRelease Construction

Single creation path: `createReleaseFromNormalized` (enrichment)
plus `mergeCandidateReleases` (port fold, same constructor).
`normalize.ts` builds **one NormalizedRelease per platform name**
(`externalIdentifiers: []`). Enrichment `enrichSingleRelease` can copy
normalized ext ids — always empty in practice. Port fold appends by
platform+region match, never adds identity.

## Release Domain ID

`createReleaseId(`${gameId}-${platform.name}-${source}-${sourceGameId}`)`
— e.g. `atp-igdb-4-PlayStation 4-igdb-4`. Segments: game domainId,
platform NAME, source name, source GAME id. Contains the IGDB game id,
**not** a platform id, not a release id. Stable and deterministic, but
carries zero platform identity. No collision risk beyond name
collisions (same hazard class as the names themselves).

## release_dates Analysis

`release_dates[].platform` is numeric and real, but each entry is a
region/edition row (Thief: 11+ rows for 6 platforms), while ATP keeps
exactly one release per platform name. There is no structural rule
selecting "the" row per platform (no canonical flag observed), so
`release_dates` narrows candidates but cannot deterministically pick
the persisted release's counterpart. Fetching it would add evidence,
never proof.

## Historical Mongo Evidence

- atp-igdb-4 (igdb:4): 6 releases (PS3/PS4/PC/macOS/Xbox360/XboxOne),
  all `externalIdentifiers: []`, game-level evidence only.
- atp-igdb-14404 (igdb:14404): 10 releases, same shape.
- atp-igdb-79 (igdb:79): includes Nintendo Switch release, same shape.
- atp-unknown-1789413865232: single UNKNOWN release, no identity at
  all (legacy, out of scope for mapping).
- Whole catalog: 0 releases with ext ids; 150 platform names;
  13 UNKNOWN-platform games (all legacy unknown docs).

## Multi-Platform Analysis

For a game on platforms 48/6/49 with releases named accordingly,
**no persisted proof** links each name to its id. The only exact
records of the correspondence lived in the transient ingestion
mapping (numeric id → resolved name) and were discarded. Verdict for
all such cases: INFERRED ONLY.

## Deterministic Mapping Assessment

| Strategy | Deterministic? | Historical? | Future? | Notes |
|---|---|---|---|---|
| A: game id → query → platform ids → release | NO | NO | PARTIAL | ids recoverable per game, but release↔id join still needs names |
| B: release name → platform mapping | NO | NO | NO | heuristic (drift: `DUPLICATE Stadia`, map corrections) |
| C: existing structural relation | NO | N/A | N/A | none exists (empty ext ids, name-only domainIds) |
| D: no safe reconstruction | — | — | — | current state for all 8,705 multi-release games |

## Data Risks

1. Name drift between stored names and any id source (observed
   upstream quirks + corrected maps).
2. `release_dates` N:1 ambiguity (regions/editions) — fetching more
   data does not resolve it.
3. 150 name variants make name-joins inherently fuzzy.

## Recommended Next Step

1. Preserve provider platform id at ingestion into the existing
   `Release.externalIdentifiers` slot (`{source:'igdb', id}`).
2. Migrate `release.platform → ATPPlatform.id` by exact
   `(source, id)` equality only.
3. Legacy: re-query by stored `igdb:<gameId>`; backfill exact
   single-candidate cases; quarantine the rest for review.
4. No new endpoint, migration, or backfill in this task.

## Safety Check

```text
games 15864 / quarantine 7638 / atpplatforms 5 — identical before/after
IGDB calls: read-only game/platform queries + OAuth (no mutations exist)
writes: 0 | code changes: 0
```

## Files Changed

- Created: `docs/game-release-platform-mapping-audit.md` (this file).
- Temp scripts under `/tmp/smoke/` (`audit*.js`, `igdbraw.ts`) —
  outside the repo, read-only.

## Conclusion

- **A**: YES — `Game.platforms[]` numeric ids (no names w/o expansion).
- **B**: NO explicit per-release relation (one release per name is a
  pipeline convention, not an IGDB relation).
- **C**: helps narrow, never 1:1 (N region/edition rows per platform).
- **D**: NO — name-only segments, zero identity content.
- **E**: no other field/endpoint resolves it (`/release_dates`
  suffers the same N:1 gap).
- **F**: NO deterministic backfill for multi-release games today.
- **G**: populate `Release.externalIdentifiers` at ingestion going
  forward; exact-equality migration after.
