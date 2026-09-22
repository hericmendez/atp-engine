# Catalog Implementation Readiness

Status: implementation-readiness audit. No code, schema, database, or
behavior changes performed here.

## A. Executive summary

The system is NOT READY for bulk ingestion, but the gap is bounded and
fully enumerated below. Reusable foundation exists (frozen reads,
unified eligibility + quarantine, derived identity confidence,
deterministic sorting, `CatalogSource` + IGDB enumerate/count
primitives, sync-state model). Blocking gaps: (1) the adapter never
requests `game_type`/`game_status`/parent-link fields, so the ratified
policy cannot be evaluated on real records; (2) no port-parent
resolution exists anywhere; (3) no relationship creation on any
ingestion path; (4) `atp-unknown-*` generation still active on both
persist paths; (5) no reclassification detection (nothing stores prior
type). None requires redesign — all are additive, ordered in §L.

## B. Existing capabilities

- Frozen search default + explicit `?discover=true` (`routes/games.ts`,
  `catalog-service.ts`).
- Unified `catalogEligibility` gate on search-persist
  (`catalog-service.ts:296`) and sync `processGroup`
  (`catalog-sync-service.ts:424`), with quarantine recording on both.
- Quarantine collection: groupId-upserted records with source, reason,
  classification/confidences, titles (`quarantine-*`).
- Derived identity confidence in aggregation (weakest pairwise, self
  resolution for singles).
- Deterministic `domainId` secondary sort in `buildSort`.
- `CatalogSource` (`enumerateByPlatform`, `countByPlatform`) implemented
  only by `IgdbAdapter`; shared field list + platform predicate builders
  already factored.
- Truthful IGDB company roles via `/involved_companies`; corrected
  platform map + `platforms.name` expansion preference.
- `igdb:<id>` external identity preserved end-to-end (tested).
- Sync-state model + repository (unique scope key), unwired.
- Relationship vocabulary (`REMAKE`, `REMASTER`, `PORT`, …) exists in
  domain.

## C. Blocking gaps

1. **No `game_type`/`game_status` in the ingestion inputs.** The
   adapter requests neither field (`igdb-adapter.ts` field list,
   line ~285); `gameToCandidate` cannot see them; the Game model and
   Mongo schema store neither. Policy evaluation is therefore
   impossible on real records.
2. **No port-parent resolution.** Nothing maps a port record to an
   existing canonical game; no caller of `gameAddRelationship` exists
   in application/interface layers (domain function + tests only).
3. **No relationship creation on ingestion.** REMAKE/REMASTER links
   required by policy have no write path.
4. **`atp-unknown-*` still generated** at `catalog-service.ts:314` and
   `catalog-sync-service.ts:472` for identifier-less groups — directly
   incompatible with the identity invariant for bulk paths.
5. **No reclassification detection.** Without stored prior type, a
   `main_game → port` change cannot be detected, let alone handled.

## D. Required changes (smallest first)

1. Request `game_type` (+ `status` equivalent) in IGDB field lists;
   map to candidate metadata (no schema change yet).
2. Gate `enumerateByPlatform` results through game_type/status
   evaluation before identity (pure function, unit-tested).
3. Port-parent resolution: same-title (+platform-family/year evidence)
   lookup against canonical games by `igdb` extId graph first
   (`parent_game`/`version_parent` must be requested too), quarantine
   on ambiguity — never auto-create.
4. Persist `gameType`/`gameStatus` on Game + schema (enables §G).
5. Wire relationship creation for remakes/remasters at persist time.
6. Ban identifier-less `save()` on bulk paths (route to quarantine);
   keep search-`discover` behavior unchanged.
7. Reclassification guard: compare incoming type against stored type;
   on change, quarantine + flag instead of upserting a duplicate.
8. Legacy 17-record disposition (backup → report → approval) before
   first sync pollutes counts.

## E. Identity flow

Current: `IGDB response → provider identity (igdb:<id> in
externalIdentifiers) → candidate → identity resolution (pairwise/title
score) → canonical Game with domainId atp-igdb-<id> → persistence`.
Required: identical, plus (a) game_type/status evaluated before
resolution, (b) ports diverted to parent resolution instead of new
`domainId` minting, (c) stored prior type compared on re-ingest.
`domainId`, `_id`, and slug are assigned only at canonical-Game
creation; provider identity lives in `externalIdentifiers` + evidence
and must never be overwritten by reclassification.

## F. Port resolution

Available data today: none sufficient — adapter fetches no
`parent_game`/`version_parent`/`ports` fields, and candidate titles
alone are explicitly unacceptable as deterministic identity.
Missing data: `parent_game`, `version_parent`, `ports`/`remakes` arrays
(all exist upstream). Technically possible strategy once fetched:
resolve parent IGDB id → `findByExternalIdentifier(igdb, parentId)` →
existing canonical game → append release/platform data; no match →
quarantine (never title-guess). Deterministic when the parent link
exists; heuristic otherwise — hence quarantine, not creation.

## G. Reclassification

Detection requires storing `gameType` (+ `gameStatus`) as canonical
domain fields (preferred over provider-metadata-only, because
eligibility, counting, and Save State display all branch on it;
provider evidence retains the raw upstream value for audit).
On mismatch between stored and incoming type: do not upsert, do not
duplicate — quarantine with reason `reclassification` and surface in
sync accounting. New behavior, no existing code to reuse.

## H. Relationship integration

Exact points: (1) `discoveryGroupToGame` (or its bulk successor) must
attach `REMAKE`/`REMASTER` links when the source record declares a
parent; (2) persist via `gameAddRelationship` (domain, tested) followed
by repository `update()`; (3) read path already supports
`relationships[]` in DTOs. Gaps: no caller today; no transaction
(Mongo single-doc writes are atomic per game — update parent and child
in sequence, tolerating partial completion via idempotent re-run);
duplicates prevented by checking existing relationships before append
(new guard needed).

## I. Quarantine integration

Already integrated at both rejection points
(`catalog-service.ts`, `catalog-sync-service.ts` dry-run-excluded).
Sufficient for policy accounting (processed/accepted/rejected) with no
new collection. Reclassification and port-ambiguity rejections reuse
the same `recordRejection` path with distinct reasons.

## J. `atp-unknown-*` disposition

Born at exactly two sites: `catalog-service.ts:314` and
`catalog-sync-service.ts:472` (fallback `unknown` + `Date.now()` when
the group carries no external identifiers). Both are legacy/runtime
discovery contexts today. Required changes: bulk paths must prohibit
identifier-less persistence (quarantine instead); the two existing
sites may remain temporarily for explicit `?discover=true` flows only.
The 17 stored records: backup → report → explicit human approval →
delete/migrate. Not touched here.

## K. Working-tree findings

Reviewed `git diff --stat` + full `git diff` (16 tracked files, ~665
insertions). All changes belong to the ratified foundation/Phase-A
work: frozen search + `discover` flag, IGDB map/expansion/companies
corrections, derived identity confidence, unified eligibility +
quarantine wiring, sync-state model, deterministic sorting, and their
tests. No sync worker, claim/lease, scheduler, enumeration loop, bulk
code, AI change, Save State change, or unrelated refactor found.
No revert performed. Assessment: legitimate, in-scope, no premature
implementation to flag.

## L. Implementation sequence

1. Model/provider metadata (`game_type`, `game_status`, parent-link
   fields through adapter → candidate).
2. Eligibility mapping (policy evaluation on real fields, unit-tested).
3. Port resolution (deterministic parent lookup, quarantine fallback).
4. Canonical identity handling (persist prior type; ban bulk
   identifier-less saves).
5. Relationship creation (remake/remaster links at persist time).
6. Reclassification guard (detect-and-quarantine on type change).
7. Legacy-data disposition (backup/report/approval, then clean).
8. Bulk-ingestion readiness (resumable job per the sync-state audit —
   only after 1–7).
