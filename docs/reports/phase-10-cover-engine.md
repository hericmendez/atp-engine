## Step-by-Step Implementation

1. Defined `CoverSearchType` const/type in `src/domain/cover/cover-candidate.ts` with values `cover`, `logo`, `all`.
2. Added `type` and `limit` fields to `CoverResult` interface.
3. Exported `CoverSearchType` from `src/domain/cover/index.ts`.
4. Added `filterByType()` function and `COVER_SEARCH_TYPE_MAP` to `src/cover/cover-rank.ts`.
5. Updated `CoverSearchOptions` in `src/cover/cover-engine.ts` with `type?` and `limit?` parameters; applied type filter after dedup, before ranking; applied limit after ranking; returns `type`/`limit` in result.
6. Updated `CoverService.searchCovers()` in `src/application/cover-service.ts` to forward `type`/`limit` options; cached cover response includes `type`/`limit`.
7. Updated `CoverSearchQuerySchema` in `src/interfaces/http/validation/schemas.ts` with `type` (enum, default `cover`) and `limit` (coerce int, min 1, max 9, default 1).
8. Updated HTTP route handler in `src/interfaces/http/routes/cover.ts` to parse `type`/`limit`, pass to service, include in response.
9. Added 8 `filterByType` unit tests to `tests/cover/cover-rank.test.ts`.
10. Added engine tests for type filtering, limit, result structure, discoverCovers to `tests/cover/cover-engine.test.ts`.
11. Added 19 `CoverSearchQuerySchema` validation tests to `tests/api/validation-schemas.test.ts`.
12. Added 11 API tests for type forwarding, validation errors, and response structure to `tests/api/cover-api.test.ts`.
13. Updated `tests/application/cover-service.test.ts` mocks with `type`/`limit` fields.
14. Updated documentation: `docs/covers.md`, `docs/api.md`, `docs/roadmap.md`.

## Architectural Decisions

### CoverSearchType vs CoverType

- **Decision**: `CoverSearchType` (cover|logo|all) is a **filter**, not a classification. `CoverType` (front_cover|box_art|poster|key_art|screenshot|logo|unknown) is the candidate classification.
- **Context**: Conflating the two would break type inference (a candidate's URL-derived type) and filtering (user intent).
- **Alternatives considered**: Single combined type enum; separate filter and classification.
- **Reason**: Clean separation of concerns. Type inference happens first (URL → CoverType), then filter (user intent → accepted types).
- **Trade-off**: Slightly more code, but semantically correct and extensible.

### Filter Before Ranking, Limit After Ranking

- **Decision**: Type filter is applied after dedup but before ranking. Limit is applied after ranking.
- **Context**: "3 best logo candidates" requires ranking all logos first, then taking the top 3.
- **Alternatives considered**: Limit before ranking (faster but wrong semantics).
- **Reason**: Limit means "N best," not "first N returned." Filter eliminates irrelevant types before scoring.
- **Trade-off**: Marginally more computation, but semantically correct.

### Default Behavior

- **Decision**: `type=cover`, `limit=1` is the default.
- **Context**: Backward compatibility with existing `?q=X` consumers.
- **Reason**: Existing API consumers don't break. New parameters are additive.
- **Trade-off**: None. Full backward compatibility.

### MIN_COVER_SELECTION_SCORE

- **Decision**: `selected` is null when no candidates exceed MIN_COVER_SELECTION_SCORE (0.55).
- **Context**: Prevents selecting low-quality or irrelevant covers just because they exist.
- **Alternatives considered**: Always select the top candidate; higher/lower threshold.
- **Reason**: Null selection is better than a bad selection. 0.55 balances precision and recall.
- **Trade-off**: Some legitimate covers with weak evidence won't be selected. Acceptable.

## Domain-to-Persistence Mapping

Not applicable for this phase. Cover candidates are ephemeral — they are discovered, ranked, and presented. No persistence of candidate data.

## Repository Flow

### Search Flow (query-based)

```
GET /api/v1/covers/search?q=Doom&type=cover&limit=3
  ↓
CoverSearchQuerySchema validates q, type, limit
  ↓
CoverService.searchCovers('Doom', { type: 'cover', limit: 3 })
  ↓
CoverEngine.searchCovers('Doom', { type: 'cover', limit: 3 })
  ↓
Source discovery → candidates from all sources
  ↓
URL validation → filterValidCandidates
  ↓
Type inference → inferCoverType for each candidate
  ↓
Type filtering → filterByType('cover') → only cover-like types
  ↓
Deduplication → deduplicateCandidates
  ↓
Ranking → rankCandidates → sorted by totalScore
  ↓
Limit → take top 3
  ↓
selected = candidates[0] if totalScore >= 0.55, else null
  ↓
CoverResult { type: 'cover', limit: 3, selected, candidates, errors }
```

### Game-based Flow

```
GET /api/v1/games/game-1/cover
  ↓
CoverService.getGameCover('game-1')
  ↓
GameRepository.findById → game exists?
  ├── NO → throw NotFoundError
  └── YES
        ↓
      game.cover exists?
      ├── YES → return cached cover
      └── NO
            ↓
          CoverEngine.discoverCovers('game-1', game.title)
            ↓
          (same pipeline as search, with gameId set)
            ↓
          If selected → update game.cover
            ↓
          CoverResult with gameId
```

## Duplicate Protection

Cover deduplication uses `source:sourceId` as primary key and normalized URL as secondary. Same candidate from multiple sources becomes one entry.

## Testing Strategy

- **cover-rank.test.ts**: 40 tests — filterByType (8), franchise disambiguation (6), rankCandidate (12), rankCandidates (14)
- **cover-engine.test.ts**: 38 tests — selectAndPersist (6), searchCovers with real adapters (10), type filtering (5), limit (3), result structure (3), edge cases (3), deduplication (2), discoverCovers (2), filterValidCandidates (3), deduplicateCandidates (2), Wikipedia pageimages (2)
- **validation-schemas.test.ts**: 33 tests — CoverSearchQuerySchema (19), GameCreateSchema (14)
- **cover-api.test.ts**: 22 tests — covers/search (11), games/:id/cover (11)
- **cover-service.test.ts**: 13 tests — searchCovers (3), getGameCover (5), error handling (3)

All tests are mocked/integration — no external network calls.

## Files Changed

| File | Responsibility |
|------|---------------|
| `src/domain/cover/cover-candidate.ts` | CoverSearchType, CoverType, CoverCandidate, CoverResult interfaces |
| `src/domain/cover/index.ts` | Barrel exports (added CoverSearchType) |
| `src/cover/cover-rank.ts` | filterByType, rankCandidate, rankCandidates, TYPE_SCORES |
| `src/cover/cover-engine.ts` | CoverEngine.searchCovers with type/limit pipeline |
| `src/cover/cover-validate.ts` | filterValidCandidates, deduplicateCandidates |
| `src/application/cover-service.ts` | CoverService forwarding, cached cover response |
| `src/interfaces/http/routes/cover.ts` | HTTP route handler, serializeCandidate |
| `src/interfaces/http/validation/schemas.ts` | CoverSearchQuerySchema with type + limit |
| `tests/cover/cover-rank.test.ts` | 40 tests |
| `tests/cover/cover-engine.test.ts` | 38 tests |
| `tests/api/validation-schemas.test.ts` | 33 tests |
| `tests/api/cover-api.test.ts` | 22 tests |
| `tests/application/cover-service.test.ts` | 13 tests |
| `docs/covers.md` | CoverSearchType docs, type semantics, pipeline, API docs |
| `docs/api.md` | Cover search endpoint docs with type/limit |
| `docs/roadmap.md` | Phase 10 tasks and exit criteria updated |

## Validation Results

```
npm run build    ✅ tsc
npm run lint     ✅ eslint
npm run format:check ✅ prettier
npm test         ✅ 30 files, 721 tests passing
```

## Known Limitations

- No cross-type ranking (cover vs logo scores are not comparable within `type=all`).
- `selected` can be null even when candidates exist (below MIN_COVER_SELECTION_SCORE).
- No persistence of candidate data — candidates are ephemeral.
- No sorting of candidates within type filter (natural order from source adapters).

## Next Step

Phase 10 (Cover Engine) is complete with type/limit support. Next phase is **Phase 11 — AI Integration**.
