# Catalog Eligibility Policy (ratified)

Status: architecture decision record. No implementation performed here.

## 1. game_type policy — P2 Core + linked derivatives (ratified)

### Included in the canonical game catalog

| IGDB type | Treatment |
|---|---|
| `0 main_game` | Canonical game, always eligible subject to unified gate |
| `4 standalone_expansion` | Canonical game (independently playable) |
| `8 remake` | Separate canonical game, linked `REMAKE` to the original |
| `9 remaster` | Separate canonical game, linked `REMASTER` to the original |
| `10 expanded_game` | Separate canonical game (edition-level decision at ingestion) |
| `2 expansion` | Only when genuinely standalone-playable; case-by-case, never by default |

### Excluded from the canonical game catalog

`1 dlc_addon`, `3 bundle`, `5 mod`, `6 episode`, `7 season`, `12 fork`,
`13 pack`, `14 update`. Excluded records are counted as processed and
retained in quarantine with provider evidence — never silently dropped,
never canonical.

### Ports (`11 port`)

A port MUST NOT create a separate ATP canonical game. It resolves to an
existing canonical game as an additional release/platform. If port-parent
resolution is not deterministic, quarantine the record. Never auto-create
a canonical entity from a port's IGDB ID alone.

### Remakes / remasters / expanded games

Separate catalog entities, independently usable in Save State, linked via
the existing relationship vocabulary (`REMAKE`, `REMASTER`). No
relationship-system redesign in this task.

## 2. game_status policy — released + announced/upcoming (ratified)

Canonical catalog includes released and announced/upcoming titles; release
date is not required for identity. Cancelled/rumored/dead records are
excluded from normal catalog entities. Delisted ≠ nonexistent: a
previously valid released game stays canonical; availability/status is
retained as metadata where supported. Never delete a canonical game
merely because it becomes delisted.

## 3. Regional variants, episodes, bundles (ratified)

Regional releases are release/platform/region data, never separate
canonical identities. `episode` records are excluded (no series ontology
built here; provider evidence retained). `bundle`/`pack` are containers,
not games; constituents may exist independently; no bundle-content
modeling in this task.

## 4. Identity invariant (ratified)

`igdb:<id>` is a stable provider identity, not the canonical identity.
Ports resolve to existing canonical games; remakes/remasters are separate
canonical games. A future provider reclassification MUST NOT silently
create duplicate canonical identities: reclassification detection and
explicit handling is required before any bulk ingestion that could
trigger it (pending implementation, §6).

## 5. Eligibility pipeline (ratified order)

```text
IGDB enumeration
      ↓
provider identity (igdb:<id>)
      ↓
game_type/status evaluation (§1–§2)
      ↓
port-parent resolution when applicable
      ↓
canonical identity resolution
      ↓
eligibility (unified gate)
      ↓
quarantine OR canonical catalog
```

Rejected records remain observable through quarantine/sync accounting.
No new collections are created for this.

## 6. Conflicts with existing code (verified, not fixed here)

- `igdb-adapter.ts:330` hardcodes `where category = 0` in search and
  stamps every result `GAME` — bulk-invisible types never surface, and
  everything surfacing is mislabeled GAME regardless of true type.
- `gameToCandidate` maps no `game_type`/`game_status`; the Game model and
  Mongo schema store neither field, so reclassification detection is
  currently impossible.
- `catalog-service.ts:314` and `catalog-sync-service.ts:472` still
  generate `atp-unknown-*` for identifier-less groups — incompatible
  with the port-resolution and identity-invariant rules above.
- Relationship vocabulary exists (`REMAKE`, `REMASTER`, `PORT`), but no
  ingestion path creates relationships (no `gameAddRelationship` callers
  in application/interface layers).
- `README.md` Game Search section still documents persist-on-miss
  discovery as default behavior (see ingestion-architecture report §7).

## 7. Missing capabilities (verified)

- `game_type`/`game_status` mapping + storage for reclassification
  detection.
- Port-parent resolution procedure.
- Relationship creation on ingestion paths.
- Quarantine-then-delete/migrate procedure for the 17 legacy
  `atp-unknown-*` records (backup → report → explicit approval first).

## 8. Blocking human decisions remaining

None blocking the documented policy itself. Blocking before first bulk
ingestion: (a) legacy-data approval (backup/report/approve sequence);
(b) IGDB credentials provisioning and ownership; (c) confirmation of the
`2 expansion` case-by-case judge (human curatorial call per record, or
narrower rule).
