# Reclassification Guard + Remake/Remaster Relationships

Ingestion-correctness phase on the bulk paths (`CatalogSyncService.processGroup`,
`CatalogService.persistDiscoveryGroup`). No worker, scheduler, collection,
AI, or runtime-search changes.

## 1. Reclassification guard

Before an existing canonical game is updated from an ingestion candidate,
`checkReclassification` (`src/eligibility/reclassification-guard.ts`, pure)
compares stored vs incoming `gameType`/`gameStatus`:

- Either side null/missing → compatible (never a conflict). Stored nulls are
  legacy data predating the fields; incoming nulls must never overwrite
  known stored values (the enrichment engine writes no classification, so
  "compatible" means proceed and preserve).
- Same values → compatible, ingestion continues normally.
- `gameType` OR `gameStatus` differing (both are always compared) → conflict.

Conflict outcome: same canonical identity is kept, no duplicate Game is
minted, the stored record is untouched, and the group quarantines as
DEFERRED with reason `RECLASSIFICATION_CONFLICT` (auditable; dry runs
report `rejected` without writing). Port-vs-stored mismatches resolve the
same way, so a port can never become a second canonical identity.

## 2. REMAKE / REMASTER edges

A remake/remaster is its own canonical Game (`atp-igdb-200` stays distinct
from `atp-igdb-100`); only a derivation edge is recorded:

```text
atp-igdb-200 ──REMAKE──> atp-igdb-100
atp-igdb-300 ──REMASTER──> atp-igdb-100
```

- Target resolution is deterministic provider references only
  (`parent_game` precedence, `version_parent` one-hop fallback — same rule
  as ports). No title/fuzzy/similarity/year/AI logic.
- Persistence reuses the existing domain primitives
  (`createGameRelationship`, `gameAddRelationship`) with a
  `gameHasRelationship` pre-check, so re-ingestion never duplicates an
  edge (second run: edge recognized → no write).
- Ordering uses the same transient in-run deferral as ports (per-platform
  arrays, no persistent collection): missing original → deferred → resolved
  in the end-of-platform second pass → still missing → quarantined
  `UNRESOLVED_RELATIONSHIP_TARGET`. The game itself persists regardless
  (valid canonical data; only the edge is unresolved). Single-ingest
  (`?discover=true`) resolves immediately with no second pass.
- Remakes without any provider reference persist edgeless with no
  quarantine; self-references are skipped. No PORT edges are created
  (ports contribute releases only, unchanged).

## 3. Quarantine reasons

| Reason | When |
|---|---|
| `RECLASSIFICATION_CONFLICT` | stored vs incoming `gameType`/`gameStatus` differ |
| `UNRESOLVED_RELATIONSHIP_TARGET` | remake/remaster original unresolvable at end of run |

Both are DEFERRED (auditable, non-destructive). Pre-existing reasons
(`MISSING_STABLE_IDENTITY`, `UNRESOLVED_PORT_PARENT`, eligibility
rejections) are unchanged.

## 4. Validation

Focused suites: `tests/eligibility/reclassification-guard.test.ts` (9),
`tests/api/reclassification-guard.test.ts` (9), 
...[truncated 447 chars]