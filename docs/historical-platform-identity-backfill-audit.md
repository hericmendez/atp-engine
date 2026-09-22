# Historical Platform Identity Backfill Audit

Audit-only, read-only. Game vs Release are measured separately
throughout — a recoverable game never implies recoverable releases.

## Executive Summary

Game-level recovery is nearly total (15,847/15,864 carry `igdb:<id>`;
9/9 re-queried games found with `platforms[]`). Release-level
recovery is nearly empty: 2 of 46 sampled releases are
DETERMINISTIC (both singleton-singleton-igdb-evidence), 43 are
AMBIGUOUS, 1 NOT_RECOVERABLE, 0 already identified. Safe backfill
exists only for the singleton rule; everything else stays untouched.

Final state after execution (see `## Executed Backfill`): 2,062
releases identified, 62,438 without identifier; all other counts
unchanged.

## Game vs Release Model

- Game: canonical identity + `externalIdentifiers[]` + `releases[]`.
  Recovering the IGDB game record answers game-level questions only.
- Release: `{domainId, platform{name,family,type},
  externalIdentifiers[]}`. Each release needs its own structural
  evidence; status never inherits across levels in either direction.

## Game-Level Results

| Resultado | Quantidade |
|---|---:|
| Total games | 15,864 |
| Com `igdb:<gameId>` | 15,847 (`externalIdentifiers` exact match, unique-indexed) |
| Sem IGDB identity | 17 (all legacy `atp-unknown-*`) |
| Encontrados no IGDB | 9/9 re-queried (by stored numeric id, never title) |
| Não encontrados | 0 observed in sample |
| Com `platforms[]` | 9/9 re-queried (population: UNKNOWN — requires full re-query) |
| Sem `platforms[]` | UNKNOWN at population scale |

## Release-Level Results

| Resultado | Quantidade |
|---|---:|
| Total releases analisados (sample) | 46 |
| Com platform | 46 (field required; 13 UNKNOWN-name docs exist in catalog) |
| Sem platform | 0 (schema requires the embedded value) |
| Already identified | 0 (pre-backfill; catalog-wide: 0 releases with ext ids) |
| DETERMINISTIC | 2 |
| AMBIGUOUS | 43 |
| NOT_RECOVERABLE | 1 |

Catalog structure (exact): 64,500 releases, avg 4.07/game;
1:2076 / 2:2840 / 3–5:6459 / 6–10:4356 / >10:133.

## Sample Methodology

Stratified by release count + platform coverage (PS4/3DO/Switch/
Atari/MSX/PC) + edge cases (remake, legacy unknown). Per-release
classification with the singleton rule (1 stored release AND 1 IGDB
platform AND igdb-sourced release evidence → DETERMINISTIC);
everything else needing names/order/dates → AMBIGUOUS; no game id →
NOT_RECOVERABLE. No extrapolation beyond the sample.

## Game-Level Sample

All 9 id-carrying games re-found with `platforms[]` (e.g. Thief id 4:
6 ids; Yooka-Laylee id 10031: 7 ids; Virtuoso id 4247: 2 ids).
GAME_RECOVERABLE 9/9; GAME_NOT_FOUND 0.

```text
GAME — IGDB ID 4 (Thief). Status: GAME_RECOVERABLE.
IGDB platforms: [9, 48, 6, 14, 12, 49] (16 release_date rows).
Releases: PlayStation 3, PlayStation 4, PC, macOS, Xbox 360, Xbox One
→ all 6 AMBIGUOUS (no structural pair rule; names/order banned).
```

## Release-Level Sample

- atp-igdb-100183 (Taz, 1× Atari 2600): DET → 59.
- atp-igdb-100219 (Decathlon, 1× 3DO): DET → 50.
- atp-igdb-4247 / 386396 (2 each): AMB ×4 (N:1 rows: 3×50+1×13).
- atp-igdb-100184 (4), Thief (6), 10031 (7): AMB ×17.
- atp-igdb-83 / 10030 (11 each): AMB ×22 (11–17 rows each).
- atp-unknown-…232 (1× UNKNOWN): NOT_REC ×1.

## Deterministic Mapping Rules

Bijection by cardinality only (singleton × singleton × igdb
evidence). Banned as proof: names, slugs, case, family/type, order,
position, titles, dates, regions, similarity, fuzzy, LLM, inference.

## Multi-Release Analysis

Difficulty is total past 1 release: every multi case is AMBIGUOUS,
including deceptively clean 4-ids/4-rows. Near-miss signals (order,
dates) are context, never proof.

## release_dates Analysis

Numeric per-platform rows exist but are region/edition-level (never
1:1 with ATP's one-release-per-platform); no canonical-row flag
observed. Narrows, never selects. Counts/scope verified live per game.

## Domain ID Analysis

`{gameId}-{platform.name}-{source}-{sourceGameId}` (code-proven):
game id yes, platform id never, release id never.
RELEASE_IDENTITY_SOURCE = NONE.

## Auxiliary Historical Data

Game documents carry no metadata/raw/snapshot/import fields (field
list verified) — only domain data + game-level evidence
(`{source:'igdb', externalId:'<gameId>'}`) + timestamps. No hidden
identity anywhere. Per-release evidence source gates the singleton
rule (igdb-observed releases only).

## Recoverability Matrix

| Releases no Game | Games na amostra | Releases analisados | Deterministic | Ambiguous | Not recoverable |
|---:|---:|---:|---:|---:|---:|
| 1 | 3 | 3 | 2 | 0 | 1 |
| 2 | 2 | 4 | 0 | 4 | 0 |
| 3–5 | 1 | 4 | 0 | 4 | 0 |
| 6–10 | 2 | 13 | 0 | 13 | 0 |
| >10 | 2 | 22 | 0 | 22 | 0 |

## Future Backfill Strategy

- A (deterministic only): singleton rule → `$set` on the matched
  release (idempotent/monotonic/additive/reversible); the only safe
  automatic path.
- B (quarantine/review for ambiguous): compatible (decisions exist),
  no records created here.
- C (leave unrecoverable): 17 legacy docs + unmatched stays id-less.
- D (re-ingest): no-op today (pipeline drops ids); safe only after
  the preservation change (same domainIds, additive ids).

## Risks

1. Order/count coincidence mistaken for proof (explicitly rejected).
2. Evidence staleness across sources.
3. Upstream renames (names never consulted — immune by construction).

## Safety Check

```text
games 15864 / quarantine 7638 / atpplatforms 5 — identical before/after
IGDB: 9 read-only game queries + token | writes: 0 | code changes: 0
```

## Full Population Dry-Run

DRY-RUN ONLY. ZERO WRITES. The 2,062-candidate set was rebuilt from
the documented rule (with-id singletons) and re-verified: game lookup
by unique `igdb:<id>`, release count == 1, IGDB platform count == 1
(fresh batched re-query), igdb release evidence, existing identifiers
classified (empty / same-id / other-source / conflicting-igdb).

### Candidate Validation

| Classification | Releases |
|---|---:|
| READY | 2,062 |
| ALREADY_PRESENT | 0 |
| SAFE_ADDITIVE | 0 |
| DRIFT | 0 |
| CONFLICT | 0 |
| TARGET_AMBIGUOUS | 0 |

### Ready Candidates

Sample `(gameId, gameMongoId, releaseDomainId, platformId)`:
(100183, 6aaee55c…, atp-igdb-100183-Atari 2600-igdb-100183, 59),
(100219, …, 3DO…, 50), (100307, …, 59), (100308, …, 59),
(100319, …-PlayStation 4-…, 48). All targets unique: each game
contributes its sole release, addressable by game `_id` +
`release.domainId` without consulting any name.

### Drift

None observed (no count/evidence/platform drift since the audit).

### Conflicts

None observed (all existing identifier arrays empty).

### Target Validation

TARGET_UNIQUE for all 2,062 (sole release per game — structural, no
name matching involved).

### Simulated Operation

Per candidate, the future operation is an additive, deduplicated
attach of `{source:'igdb', id:String(platformId)}` to the addressed
release element (no array replacement, no removals). Identification
rides the unique game-identity index; re-execution converges to
ALREADY_PRESENT via the existing merge dedup. Never executed here.

### Safety Check

```text
games 15864 / quarantine 7638 / atpplatforms 5 — identical before/after
IGDB: batched read-only re-query + token | writes: 0
```

### Conclusion Addendum

- **A**: 2,062 still valid. **B**: 2,062 READY. **C**: 0 present.
  **D**: 0 additive cases. **E**: 0 drift. **F**: 0 conflicts.
  **G**: 0 ambiguous targets. **H**: YES — unique game lookup +
  sole release per game for every READY row. **I**: additive
  per-release attach as simulated above (not executed).

## Full Population Dry-Run

Method: all 15,847 stored numeric IGDB ids re-queried by id only
(32 batched `fields id,platforms` calls, 500/call, 400ms pacing; one
follow-up batch re-verified the 2,062 DET candidates). Release
evidence sources read from Mongo. No writes anywhere. Rule:
singleton-stored-release AND singleton-IGDB-platform AND
igdb-sourced release evidence → DETERMINISTIC; multi-release →
AMBIGUOUS (no exceptions); no id / not found / empty platforms →
NOT_RECOVERABLE; existing ext ids → ALREADY_IDENTIFIED (0 observed).

### Game Results

| Classification | Games |
|---|---:|
| GAME_NO_IGDB_IDENTITY | 17 |
| GAME_NOT_FOUND | 0 |
| GAME_NO_PLATFORM_DATA | 0 |
| GAME_SINGLE_PLATFORM | 2,066 |
| GAME_MULTI_PLATFORM | 13,781 |

### Release Results

| Classification | Releases |
|---|---:|
| ALREADY_IDENTIFIED | 0 (pre-backfill) |
| DETERMINISTIC | 2,062 |
| AMBIGUOUS | 62,411 |
| NOT_RECOVERABLE | 27 (14 singleton + 13 across 3 multi-release legacy docs) |

### Release Count Matrix

| Stored releases | Games | Deterministic releases | Ambiguous releases | Not recoverable |
|---:|---:|---:|---:|---:|
| 1 | 2,076 | 2,062 | 0 | 14 |
| 2 | 2,840 | 0 | 5,680 | 0 |
| 3–5 | 6,459 | 0 | 25,569 | 0 |
| 6–10 | 4,356 | 0 | 29,342 | 0 |
| >10 | 133 | 0 | 1,820 | 0 |
| legacy multi, no id | 3 | 0 | 0 | 13 |

(64,500 total = 2,062 + 62,411 + 27 ✓ exact. Hypothesis confirmed:
determinism exists only in the singleton row.)

### Deterministic Backfill Candidates

SAFE_BACKFILL_CANDIDATES = **2,062** (3.2% of releases). Sample
`(gameId, releaseDomainId, platformId)`: (117,
atp-igdb-117-PlayStation 4-igdb-117, 48), (1248, …-WonderSwan-…, 57),
(1768, …-WonderSwan Color-…, 123). Full list verified 1:1 twice; kept
out of the repo.

### Ambiguous Population

62,411 releases: any pairing needs banned signals. Includes the 4
single-platform multi-release games (one id, several releases —
still ambiguous per release).

### Non-Recoverable Population

27 releases (17 identity-less docs' 14 singleton + 13 multi releases;
zero IGDB-not-found and zero empty-platforms observed).

### Safety Check

```text
games 15864 / quarantine 7638 / atpplatforms 5 — identical before/after
IGDB: 32 + 1 batched read-only queries + token | writes: 0
```

### Conclusion Addendum

- **A**: 15,847. **B**: 2,066. **C**: 13,781.
- **D**: DET 2,062 / AMB 62,411 / NOT_REC 27 / ALREADY 0.
- **E**: 2,062 (3.2% of 64,500 releases).
- **F**: 3.2%.
- **G**: 13,771 multi-release games (all releases therein) stay
  unrecoverable without heuristics.
- **H**: singleton rule covers everything deterministic found —
  exhaustive over the full population, not extrapolated.

## Executed Backfill

Definitive record of the real execution (after the dry-runs above).

### Execution Summary

```text
TOTAL_CANDIDATES = 2062 | UPDATED = 2062 | ALREADY_PRESENT = 0
SKIPPED = 0 | DRIFT = 0 | CONFLICT = 0 | FAILED = 0
```

2,062 singleton releases that satisfied the documented deterministic
rule; zero divergence from the dry-run prediction.

### Safety / Write Semantics

Per candidate, all 7 rules re-validated live at write time: exact
unique game lookup by `igdb:<gameId>` (unique-indexed, exactly one
game); exactly one persisted release; release is the expected target
(sole release — structural, no name consulted); no conflicting igdb
identifier present; fresh IGDB re-query returns
`platforms == [expectedPlatform]`; release evidence still igdb.
Then one atomic `updateOne` with `$addToSet` on the addressed
`(game, release.domainId)` element: no whole-doc rebuild, no new
repository, no name/platform heuristic anywhere.

### Updated Releases

Each gained exactly `{source:'igdb', id:String(platformId)}`,
e.g. `atp-igdb-100183-Atari 2600-igdb-100183`:
`[] → [{source:'igdb', id:'59'}]`, platform/evidence/region/date
untouched.

### Skipped / Drift / Conflicts

0 / 0 / 0 — every candidate satisfied all rules; nothing masked.
UNRESOLVED dataset rows (152, 120, Switch 2) were never touched;
MobyGames platform ids (141/35/203/28/57) appear here only as prior
identity-application context, not as release mappings.

### Post-Backfill Invariants

```text
games:                  15864 (unchanged)
quarantine:              7638 (unchanged)
atpplatforms:                5 (unchanged)
total releases:          64500 (unchanged)
relationships/edges:        58 (unchanged)
releases with ext ids:       2062 (0 → 2062)
releases without ext ids:   62438
duplicate IGDB ids/release:     0
```

Decomposition holds: `64,500 = 2,062 + 62,438`;
`62,438 = 62,411 + 27`.

### Idempotency Verification

Classify-only rerun: `TOTAL 2062, UPDATED 0,
ALREADY_PRESENT 2062, SKIPPED 0, DRIFT 0, CONFLICT 0, FAILED 0`,
writes 0. Merge dedup + `$addToSet` make repetition a no-op.

### Final Safety Check

Games, quarantine, ATP platforms, total releases and relationships
unchanged by the backfill; only `externalIdentifiers` of the 2,062
addressed releases changed.

### Conclusion

Backfill executed exactly as simulated — dry-run predicted the
outcome with zero divergence — and the catalog is otherwise
untouched.

## Files Changed

- Created: `docs/historical-platform-identity-backfill-audit.md`
  (audit, dry-runs, and this execution record; no code changes).
- Temp scripts under `/tmp/smoke/` — outside the repo.
