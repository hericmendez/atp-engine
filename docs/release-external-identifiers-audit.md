# Release.externalIdentifiers Contract Audit

Audit-only, read-only. No domain, schema, adapter, pipeline, or Mongo
changes. No ingestion, migration, backfill, or commit.

## Executive Summary

The contract already exists, is already persisted, and is currently
empty everywhere: `ExternalIdentifier { source: string, id: string }[]`
on both `Game` and `Release`, round-tripped by the mapper and stored
by the schema with no index. The future `{source:'igdb', id:'48'}`
fits it with zero contract change. All write paths are additive
(merge-only, never delete), port-fold only appends absent releases,
and re-ingest identification is name-based — so adding identifiers
later preserves `domainId` and creates no new releases. The missing
piece is upstream: nothing feeds platform ids into the pipeline
(adapter drops them; normalize emits `[]`).

## Domain Location

`externalIdentifiers` belongs to **both** `Game` (canonical identity,
unique-indexed at game scope) and `Release`/`NormalizedRelease`
(per-release evidence, no index). Shared value object
`domain/shared/external-identifier.ts`, also used by
`DistributionChannel`-adjacent code paths.

## Type Definition

```ts
interface ExternalIdentifier { readonly source: string; readonly id: string; }
```

Immutable (`readonly`), factory-validated (trimmed, non-empty both
fields; throws otherwise), equality via `externalIdentifierEquals`
(source+id; a second local copy exists in `enrichment-engine.ts`).
Serialization is a plain `{source, id}` pair in both directions
(mapper `toDomain`/`toPersistence` round-trips release arrays).

## Source Semantics

Plain `string`, no enum/union. `"igdb"` is already the established
value at game level (`igdb:<gameId>` + unique compound index) — valid
for releases with no contract change. No new values added here.

## Identifier Semantics

`id` is a bare string. Game-level convention is the raw provider id
(`"4"`, never `"igdb:4"` — the source lives in its own field). A
platform id therefore belongs as `id: "48"` under `source: "igdb"`.

## Cardinality and Uniqueness

Arrays admit zero, one, or many identifiers; nothing forbids two
sources on one release (`igdb:48` + `mobygames:141` coexist
structurally — required for the multi-provider future). No
one-per-source rule exists. Dedup is identical-pair only, at merge
time (`enrichReleaseExternalIdentifiers`). No DB index on release
identifiers; no repository constraint. Cross-document uniqueness is
neither enforced nor needed (identity lives at game scope).

## Mongo Persistence

Release subdocument: `externalIdentifiers: [{source: String,
id: String}]` (array, not required, no default beyond `[]`, **not
indexed**). Fully supported today — verified in schema, mapper, and
by query: **0 releases** in the catalog carry any (expected).

## Release Creation Flow

`normalize` (releases from platform names, `externalIdentifiers: []`)
→ `createReleaseFromNormalized` (copies normalized array) →
`enrichReleaseExternalIdentifiers` (additive merge on re-ingest) →
`persistGame` (whole-doc save). The correct future insertion point is
**before/within normalization**: the adapter must stop dropping the
numeric id (`gameToCandidate` platform mapping) and `RawCandidate` /
normalize must carry per-platform ids into `NormalizedRelease`;
everything downstream already preserves them.

## Merge / Port-Fold Behavior

- Enrichment merges identifiers additively; existing pairs are never
  removed or rewritten.
- Port fold (`mergeCandidateReleases`) only appends releases absent by
  platform+region match; it never touches existing releases.
- No path splices, clears, or replaces a release identifier array.
- persistGame overwrites the whole game document, but always from
  in-memory state that preserved the identifiers.

## Re-ingestion Behavior

Releases are matched by platform+region **name**
(`releasesMatch`) and `domainId` is name-derived — both untouched by
identifier content. Adding `{source:'igdb', id:'48'}` later yields the
same release plus enriched metadata, never a new release. Verified by
construction (no code path keys on release identifiers).

## ATP Platform Compatibility

```text
ATP Platform.externalIdentities: { source: 'igdb', sourcePlatformId: 48 }
Game Release.externalIdentifiers: { source: 'igdb', id: '48' }
```

Same identity, different id types (`number` vs `string`):
conversion is `String(id)` / integer-validated `Number(id)` — trivial
and total. Concepts are compatible; contracts correctly differ (domain
numeric ids vs serialized string ids, mirroring game-level `igdb:4`).

## Existing Tests

`domain/{game,release,fixtures,enums}`, `game-repository`
(scratch-DB), `normalize`, adapter suites (igdb incl. enumeration),
`phase22-port-ingestion`, `reclassification-guard`,
`enumeration-ingest` — covering factories, mapper round-trip,
enrichment merge, port fold, and idempotent re-ingest. No test asserts
release identifiers yet (nothing produces them).

## Recommended Integration Point

`IgdbAdapter.gameToCandidate` platform mapping (keep the numeric id
alongside the name) → `RawCandidate`/`normalize` per-platform id
carriage → `NormalizedRelease.externalIdentifiers`. Downstream needs
no change.

## Risks

1. Until fed, the slot stays empty — no partial credit.
2. Name-based `releasesMatch` remains the merge key (fine for
   additive ids; a future id-based match would be stricter but is out
   of scope).
3. Consumers must treat release identifiers as evidence, not as
   replacement for game-level canonical identity.

## Safety Check

```text
games 15864 / quarantine 7638 / atpplatforms 5 — identical before/after
releases with externalIdentifiers: 0 (confirmed, unchanged)
writes: 0 | code changes: 0
```

## Files Changed

- Created: `docs/release-external-identifiers-audit.md` (this file).
- Temp read-only scripts under `/tmp/smoke/` — outside the repo.

## Conclusion

- **A**: both `Game` and `Release` (plus normalized form).
- **B**: `{readonly source: string, readonly id: string}[]`, validated.
- **C**: YES — `"igdb"` is the established value.
- **D**: bare string (`"48"`, never `"igdb:48"`).
- **E**: YES — zero/one/many, multi-source allowed.
- **F**: identical-pair dedup at merge only; no index/constraint.
- **G**: YES — schema + mapper already persist it (empty today).
- **H**: YES — `domainId` and matching are name-derived, unaffected.
- **I**: NO wipe path exists (additive-only merges; fold appends).
- **J**: adapter platform mapping → `RawCandidate`/normalize
  per-platform carriage; everything downstream already preserves.
