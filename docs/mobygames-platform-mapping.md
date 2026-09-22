# MobyGames Platform Mapping

Deterministic, auditable linkage between MobyGames provider identities
and canonical ATP Platforms. No inference anywhere in this layer.

## Snapshot

`data/mobygames/platforms.json`: 7 entries of shape
`{source, sourcePlatformId, name}` — a photograph of the provider, not
an ATP construct. No `atpPlatformId`, no counts, no metadata.

Provenance: ids corroborated by ROMM's API-derived
`MOBYGAMES_PLATFORM_LIST` against the official `/platforms`
`{platform_id, platform_name}` contract (see
`docs/mobygames-platform-identity-research.md`). No id was invented;
platforms without corroborated ids are simply absent. To update: append
entries with documented evidence, never derive ids from names.

## Mapping

`data/mobygames/platform-mapping.json`: rows keyed by
`mobygamesPlatformId`, validated by
`src/platform-manifest/mobygames-mapping.ts`.

- `MAPPED` requires: snapshot-backed id, known `atpPlatformId` (from
  `data/atp/platforms.json`, 5 curated entries justified by ATP catalog
  reality — the ingested platforms — never by MobyGames names), and a
  non-empty `evidence` string. Name fields are forbidden on these rows.
- `UNRESOLVED` requires: exactly one of `mobygamesPlatformId`
  (→ `NO_ATP_PLATFORM`) or `manifestName` (→ `NO_MOBYGAMES_PLATFORM_ID`,
  must exist in the manifest), a `reason`, and no `atpPlatformId`.
- One provider id maps to at most one ATP platform (both directions
  checked regardless of row order); duplicates rejected.

## Aliases

Several manifest names may share one provider id (e.g. SNES +
Super Famicom → MobyGames 15). This is a manifest-layer fact and needs
no mapping rows: the validator constrains id → platform cardinality
only, so shared identities are structurally permitted, never merged.

## Unresolved cases

- Snapshot id without curated ATP platform (Pokémon Mini 152, SAM
  Coupé 120): `UNRESOLVED` / `NO_ATP_PLATFORM`.
- Manifest name without confirmed provider id (Nintendo Switch 2):
  `UNRESOLVED` / `NO_MOBYGAMES_PLATFORM_ID`, pointer by manifest name
  only — still no inference.

## Snapshot ≠ runtime dependency

The ATP never calls MobyGames at runtime. The snapshot enables
reproduction and audit; the future flow is `MobyGames API → discovery
adapter → versioned snapshot → validation → mapping → ATP Platform`.
Counts differ per source by methodology (IGDB PS4 20498 vs MobyGames
PS4 12190) — expected, not an error.

## Next step

After review of this dataset: apply `mobygames:<platform_id>` to
`ATPPlatform.externalIdentities` in a controlled step (out of scope
here; nothing was persisted).

## Application status

The 5 MAPPED rows were applied to `atpplatforms` via
`ApplyPlatformExternalIdentities` (dry-run first, then apply, then a
verifying rerun — all `ALREADY_PRESENT`, zero additional writes).
UNRESOLVED rows were never touched. `igdb:*` identities were not
altered: this step only adds `mobygames:<id>`.
