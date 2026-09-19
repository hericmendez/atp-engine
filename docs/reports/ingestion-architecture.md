# Ingestion Architecture — Ratified Direction

Status: architecture decision record. No implementation performed here.

## 1. Core invariant (ratified)

ATP owns the canonical runtime catalog consumed by Save State. External
providers are upstream ingestion/enrichment sources. Production runtime
search MUST NOT depend on external providers:

```text
Save State → ATP API → ATP MongoDB
```

This restates — and narrows — the existing documented direction
(`docs/AGENTS.md` §2, §10; `README.md` "Design Principles";
`docs/architecture.md` §7, §13): the database-first principle now means
*catalog-backed reads*, with live discovery removed from the normal read
path rather than merely attempted after a miss.

## 2. Ingestion boundary (ratified)

```text
External providers → ingestion pipeline → ATP MongoDB
  (normalize → classify → deterministic identity → validate → persist)
```

versus:

```text
Save State → ATP API → ATP MongoDB
  (no external-provider dependency)
```

Ingestion writes canonical records; runtime only reads them. The
`?discover=true` escape hatch is a transitional administrative mechanism
and MUST NOT become a production dependency of normal catalog search.

## 3. Source roles (ratified)

- **IGDB**: candidate primary enumeration source; structured metadata
  source; identity source (`igdb:<id>` stable external key); optional
  enrichment source. Explicitly NOT the runtime search backend and NOT
  the only ATP source.
- **Wikipedia**: discovery, enrichment, gap filling, supplementary
  evidence. No bulk enumeration will be built on it.
- **Steam**: PC-specific enrichment, supplementary metadata, cover/source
  evidence. No console-catalog enumeration will be built on it.

## 4. CatalogSource (ratified)

`CatalogSource` (`enumerateByPlatform`, `countByPlatform`) stays
provider-agnostic: it abstracts "an external source capable of catalog
enumeration", not "IGDB". `IgdbAdapter` may implement it; Wikipedia/Steam
adapters must not be forced to. No enumeration methods belong on
`SourceAdapter` (text search ≠ enumeration).

## 5. Sync architecture (standing by)

`CatalogSyncState` (NOT_STARTED/RUNNING/PARTIAL/COMPLETED/FAILED, per
scope) remains preparation for platform-scoped ingestion. No
claim/lease/worker/scheduler behavior is ratified or implemented here.

## 6. Pending domain decisions (NOT decided here)

- **game_type allowlist**: proposal is type 0 by default, linked 8/9/11
  where appropriate, case-by-case 2/4/10. Requires explicit product
  approval before any ingestion job encodes it.
- **game_status scope**: whether unreleased/cancelled/regional records
  are included. No filter invented here.
- **Legacy catalog**: the existing `atp-unknown-*` contaminated records
  are disposable development data. Before any deletion/quarantine: (1)
  create a backup, (2) report the exact records, (3) await explicit
  approval. No automatic migration.
- **Covers**: intended direction is ingestion-time snapshotting so
  normal game requests avoid live providers. Migration NOT implemented;
  live `CoverEngine` remains the current fallback.
- **Revalidation**: scheduled full re-enumeration vs checksum/change
  detection vs explicit administrative re-sync — open choice, no
  scheduler implemented.

## 7. Contradictions with current documentation

The following documented statements conflict with the ratified direction
and need revision before implementation continues (not revised here):

- `README.md` "Game Search" (§"Database-first with discovery fallback",
  origin table, "Dependencies: MongoDB (read+write). Wikipedia, Steam
  (on empty DB). Writes discovered games") describes implicit
  persist-on-miss as default behavior.
- `docs/AGENTS.md` §9 ("external discovery when required",
  "persistence of newly discovered data") and §10 (database-first
  diagram ending in "Web → … → Persist → Return") describe the same
  default.
- `docs/discovery.md:447` carves broad search out of database-first
  ("external discovery may be an intentional operation").
- `docs/covers.md:83-87,137,391` mandates live cover discovery
  ("no persisted cover database", always `origin: "scraper"`).
- `docs/architecture.md` §7 previously restated the discovery-fallback
  retrieval diagram (now superseded by §13 for runtime reads).

## 8. Implementation readiness

Decided: invariant (§1), boundary (§2), source roles (§3), `CatalogSource`
semantics (§4), sync-state as preparation (§5).
Pending product/domain input: §6 in full.
Already aligned code: frozen search default, explicit `discover` flag,
unified eligibility + quarantine, derived identity confidence,
deterministic sorting, `CatalogSource` + IGDB enumeration/count
primitives, sync-state model/repository.
Transitional code: `?discover=true` path, live `CoverEngine` fallback,
`CatalogSyncService` single-query sync, schedulers.
Next implementation (when authorized): credentials-gated IGDB pilot
(`count` + one small platform page, no persistence beyond quarantine
accounting) — then, and only then, the resumable job per the lifecycle
in `docs/reports/` (see sync-state audit).
