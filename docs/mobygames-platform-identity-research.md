# MobyGames Platform Identity Research

Research-only. No code, domain, Mongo, or pipeline changes were made for
this document. No matching of any kind was performed.

## Executive Summary

MobyGames **does** have a stable numeric platform identity:
`platform_id`, exposed by its official API (`/platforms`,
`/games/{game_id}/platforms`). Website pages locate platforms by slug
(`.../platform/playstation-4/`); games and groups use numeric ids in
URLs (`.../game/107419/...`). Direct website-HTML inspection was
blocked (HTTP 403 bot protection) and no API key was available, so live
API verification remains open — but the identity model itself is
confirmed by official documentation plus an independent API-derived
implementation (ROMM). Recommended representation:
`mobygames:<platform_id>` (numeric), fully compatible with the current
ATP `sourcePlatformId: number` model. **Estado 1.**

## Sources Investigated

1. Official MobyGames API documentation
   (`https://www.mobygames.com/info/api/`, via search excerpts —
   direct fetch returns 403).
2. MobyGames website URL patterns (via search excerpts).
3. ROMM `backend/handler/metadata/moby_handler.py`
   (raw source fetched 2026-09-19) — third-party client built on the
   official API, containing `MOBYGAMES_PLATFORM_LIST` with numeric ids.
4. MobyGames database statistics page (platforms/games counts).
5. Our `platforms.csv` (347 rows; header
   `platform,gamesCount,peopleCount,companiesCount,startYear,endYear`).

## Platform Evidence

| Platform | URL | Candidate Identity | Type | Evidence | Confidence |
|---|---|---|---|---|---|
| PlayStation 4 | `https://www.mobygames.com/platform/playstation-4/` | `141` | numeric `platform_id` | ROMM `UPS.PS4: {"id": 141, ...}` (API-derived); API `/platforms` contract `{platform_id, platform_name}` | corroborated |
| 3DO | `https://www.mobygames.com/platform/3do/` (pattern-inferred, unverified live) | `35` | numeric `platform_id` | ROMM `UPS._3DO: {"id": 35, ...}` | corroborated |
| Nintendo Switch | `https://www.mobygames.com/platform/switch/` (pattern-inferred, unverified live) | `203` | numeric `platform_id` | ROMM `UPS.SWITCH: {"id": 203, ...}` (+ `PS1_MOBY_ID=6`, `PSP=46` constants in same file) | corroborated |
| Atari 2600 | pattern-inferred, unverified live | `28` | numeric `platform_id` | ROMM `UPS.ATARI2600: {"id": 28, ...}` | corroborated |
| MSX | pattern-inferred, unverified live | `57` | numeric `platform_id` | ROMM `UPS.MSX: {"id": 57, ...}` | corroborated |
| Pokémon Mini | pattern-inferred, unverified live | `152` | numeric `platform_id` | ROMM `UPS.POKEMON_MINI: {"id": 152, ...}` | corroborated |
| SAM Coupé | pattern-inferred, unverified live | `120` | numeric `platform_id` | ROMM `UPS.SAM_COUPE: {"id": 120, ...}` | corroborated |

"Corroborated" means: stated in ROMM's API-derived table, consistent
with the official `/platforms` contract, but not yet confirmed by our
own authenticated API call. No value above was guessed from names.

## PlayStation 4 Deep Dive

- **Name**: `PlayStation 4` (website heading, API `platform_name`).
- **Slug**: `playstation-4` (website URL segment + game-browser
  filter `platform:playstation-4`). Locator, human-readable, not the
  identity — slugs can in principle change; numeric ids are the stable
  key used for filtering (`platform={id}`) and per-game platform
  records.
- **URL**: `https://www.mobygames.com/platform/playstation-4/`
  (confirmed via search excerpts; page lists "11,276 video games on
  PlayStation 4").
- **Internal/external identity**: numeric `platform_id` = **141**
  (ROMM table; same id is passed as `platform_ids=[141]` filter and
  returned as `platforms[].platform_id` in game responses).
- **Why persistent**: the id is the API's join key — game↔platform
  relations (`/games/{game_id}/platforms`, `/games?...&platform={id}`,
  `/games/{game_id}/platforms/{platform_id}`) are addressed by it, and
  third-party integrations persist it (ROMM `moby_id` fields). Slugs
  are presentation locators on top of it.

## API Findings

Official API (`https://api.mobygames.com/v1`, non-commercial access on
request, key required — no key was available, so nothing was called):

- `GET /platforms` → `{ "platforms": [{ "platform_id": 1,
  "platform_name": "Linux" }, ...] }`. Purpose: "list of platforms
  which may be used for filtering games".
- `GET /games/{game_id}/platforms` → per-game platforms including
  `platform_id` (e.g. `{"platform_id": 5,
  "platform_name": "Windows 3.x", ...}`).
- `GET /games/{game_id}/platforms/{platform_id}` → per-game-per-
  platform details.
- Website HTML/data-attribute evidence: **UNCONFIRMED** (403 on direct
  fetch; no OpenGraph/JSON-LD/`data-*` inspection was possible).

## CSV Findings

Our `platforms.csv` is name/statistics only — no id column, no URL
column, no stable reference. Provenance signal: MobyGames' public
database statistics report **347 platforms**, exactly our row count
(347), with game totals close (335,358 vs CSV sum 335,333 — live-DB
drift). The CSV is therefore plausibly a snapshot export of the
platform table, but it cannot alone yield `platform_id`. MobyPlus
offers per-platform game CSV/JSON exports (game data, not platform
ids). **Do not modify `platforms.csv`.**

## Identity Model

- **Name** (`PlayStation 4`): display metadata.
- **Slug** (`playstation-4`): URL locator, human-readable, secondary.
- **URL** (`.../platform/playstation-4/`): locator built on the slug.
- **Internal identity**: numeric `platform_id` (e.g. 141).
- **External identity (ATP view)**: `mobygames:141` — stable,
  numeric, provider-scoped, join-key grade.

## Can MobyGames Be Mapped Deterministically?

Yes — once numeric ids are obtained from a deterministic source (the
official `/platforms` endpoint or a pinned snapshot of it). The mapping
`ATP Platform ↔ mobygames:<platform_id>` requires no name inference:
exact id equality only. The ROMM table is usable as cross-check input,
not as authority (it is third-party and contains alias rows sharing
ids, e.g. SNES/SFAM → 15, which must not be misread as distinct
platforms).

## Recommended Representation

`PlatformExternalIdentity { source: 'mobygames', sourcePlatformId: 141 }`,
i.e. `mobygames:141`. No model change needed.

## Open Questions

1. Live `/platforms` confirmation with our own API key (ids above are
   corroborated, not directly verified).
2. Website-HTML identity traces (blocked by bot protection).
3. Alias rows sharing one numeric id (e.g. 15 → SNES + Super Famicom):
   one ATP Platform with one identity, or distinct platforms sharing
   provider identity? Needs a product decision, not inference.
4. Switch 2 (`id: -1` in ROMM = "id unknown yet") shows numeric ids
   are assigned over time — snapshots must be versioned/dated.

## Conclusion

- **A**: YES — stable numeric `platform_id` exists.
- **B**: numeric `platform_id` (PS4 = 141 per corroborated sources).
- **C**: official API responses (`/platforms`,
  `/games/{game_id}/platforms`); slug URLs as locators; ROMM's
  API-derived table as corroboration.
- **D**: YES — exact numeric ids, no inference required (pending key
  access for direct confirmation).
- **E**: YES — `sourcePlatformId: number` fits exactly.

**Estado 1**: stable platform identity confirmed →
next step is deterministic mapping creation (out of scope here).
