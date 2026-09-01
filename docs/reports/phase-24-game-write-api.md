# Phase 24 — Game Write API (Admin)

## Step-by-Step Implementation

1. **Reconnaissance** — Read AGENTS.md, roadmap, post-mvp-roadmap.md; audited Game domain type, GameRepository (save/update/deleteById already exist), CatalogService, games routes, validation schemas, error types, createApp, server.ts, existing test patterns
2. **ConflictError** — Added `ConflictError` (409) to `src/shared/errors/errors.ts`
3. **GameAdminService** — Created `src/application/game-admin-service.ts` with `createGame`, `updateGame`, `deleteGame` methods
4. **Validation schemas** — Added `CreateGameBodySchema`, `UpdateGameBodySchema` to `src/interfaces/http/validation/schemas.ts`
5. **Admin routes** — Created `src/interfaces/http/routes/admin-games.ts` with POST/PATCH/DELETE endpoints
6. **App wiring** — Added `AdminGamesRouterDependencies` to `AppDependencies`, mounted `adminGamesRouter` on `apiV1`
7. **Server wiring** — Instantiated `GameAdminService` in `server.ts`, wired into `createApp`
8. **Tests** — Created `tests/api/phase24-game-admin.test.ts` with 23 tests covering create, update, delete, validation, error handling, route boundary

## Architectural Decisions

### Separate GameAdminService (not extending CatalogService)

- **Decision**: Create a new `GameAdminService` rather than adding write methods to `CatalogService`
- **Context**: `CatalogService` handles read operations and discovery-based writes. Admin writes have different validation, duplicate checking, and audit needs.
- **Alternatives considered**: Add methods to CatalogService (would mix concerns); separate service per operation (overkill for 3 methods)
- **Chosen approach**: Single `GameAdminService` in application layer
- **Reason**: Clean separation of concerns. CatalogService stays read-focused. Admin service owns all write orchestration.
- **Trade-off**: Two services share GameRepository — but this is intentional (read vs write paths)

### Hard Delete (not Soft Delete)

- **Decision**: Use hard delete via existing `gameRepository.deleteById()`
- **Context**: The domain model has no `deletedAt` field. Soft delete would require schema changes, query filtering changes, and new domain concepts — beyond Phase 24 scope.
- **Alternatives considered**: Soft delete with `deletedAt` field (requires domain + schema + query changes)
- **Chosen approach**: Hard delete reusing existing repository method
- **Reason**: Minimal change. `deleteById` already exists on `GameRepository` and `MongoGameRepository`.
- **Trade-off**: No undo capability. Documented as known limitation.

### External Identifiers: Full Replacement on PATCH

- **Decision**: When `externalIdentifiers` is provided in PATCH, it replaces the entire array
- **Context**: The domain uses `readonly ExternalIdentifier[]`. Immutable arrays naturally support replacement semantics. Merge semantics would require complex diffing logic.
- **Alternatives considered**: Merge semantics (add new, keep existing); diff-based updates
- **Chosen approach**: Full replacement when field is provided
- **Reason**: Simple, predictable, matches domain immutability pattern. Client sends the complete desired state.
- **Trade-off**: Client must send all identifiers, not just new ones. Documented behavior.

### Server-Generated IDs

- **Decision**: IDs are server-generated using `admin-{timestamp}-{random}` format
- **Context**: Discovery uses `atp-{source}-{id}`. Admin-created games need a different prefix to distinguish origin.
- **Alternatives considered**: UUID; client-supplied IDs; sequential
- **Chosen approach**: `admin-{timestamp}-{random}` via `createGameId()`
- **Reason**: Unique, timestamp-ordered, distinguishable from discovery-created games.
- **Trade-off**: IDs are not globally unique UUIDs — but sufficient for single-process deployment

### Duplicate External Identifier Protection

- **Decision**: Check for duplicate external identifiers before create/update, return 409 ConflictError
- **Context**: MongoDB has a unique compound index on `(source, id)`. But the MongoDB error message is not user-friendly. Pre-check provides clear error messages.
- **Alternatives considered**: Rely solely on MongoDB unique constraint (less readable errors); skip check (allows duplicates until DB rejects)
- **Chosen approach**: Pre-check in service layer + DB constraint as safety net
- **Reason**: Better error messages. Clear conflict identification. Defense in depth.
- **Trade-off**: Extra DB query per write — acceptable for admin operations

### Admin Route Prefix (`/api/v1/admin/`)

- **Decision**: Routes under `/api/v1/admin/games`
- **Context**: Phase 24 does not implement auth. But the `/admin/` prefix creates a clear boundary for future auth middleware attachment.
- **Alternatives considered**: `/api/v1/games` with POST/PATCH/DELETE (mixes read and write); separate port
- **Chosen approach**: `/api/v1/admin/games`
- **Reason**: Clean separation. Future auth middleware can be attached to `/admin/` prefix without affecting public read routes.
- **Trade-off**: Two route prefixes for games — but this is intentional for the auth boundary

## API Endpoints

### `POST /api/v1/admin/games`

Create a new game.

**Request body**:
```json
{
  "titles": [{ "value": "Game Name", "type": "primary" }],
  "developers": [{ "name": "Studio Name" }],
  "publishers": [{ "name": "Publisher Name" }],
  "genres": [{ "name": "Action" }],
  "externalIdentifiers": [{ "source": "igdb", "id": "12345" }],
  "classification": "GAME",
  "completeness": "FOUND_PARTIAL"
}
```

**Response** (201):
```json
{
  "data": {
    "id": "admin-1725187200000-abc123",
    "titles": [{ "value": "Game Name", "type": "primary" }],
    ...
  }
}
```

### `PATCH /api/v1/admin/games/:id`

Update an existing game. Only supplied fields are updated.

**Request body** (all fields optional):
```json
{
  "titles": [{ "value": "Updated Name", "type": "primary" }],
  "classification": "DLC"
}
```

**Response** (200): Updated game object.

### `DELETE /api/v1/admin/games/:id`

Delete a game.

**Response** (204): Empty body.

## Validation Rules

| Field | Rules |
|-------|-------|
| `titles` | Required (create), min 1 item, each `value` non-empty, max 500 chars |
| `titles[].type` | Optional enum: `primary`, `alternate`, `localized`, `abbreviated` |
| `developers` | Optional array, each `name` non-empty, max 200 chars |
| `publishers` | Optional array, each `name` non-empty, max 200 chars |
| `genres` | Optional array, each `name` non-empty, max 100 chars |
| `externalIdentifiers` | Optional array, each `source` non-empty (max 50), `id` non-empty (max 200) |
| `classification` | Optional enum: 15 valid values (GAME, DLC, etc.) |
| `completeness` | Optional enum: NOT_FOUND, FOUND_PARTIAL, FOUND_SUFFICIENT, FOUND_COMPLETE |

## Duplicate/Identity Behavior

- Before create: checks each external identifier against `gameRepository.findByExternalIdentifier()`
- Before update: checks each external identifier, excluding the current game's ID
- On conflict: returns `409 ConflictError` with message identifying the conflicting game
- MongoDB unique index on `(externalIdentifiers.source, externalIdentifiers.id)` provides safety net

## Repository Changes

None. `GameRepository` already has `save()`, `update()`, `deleteById()`, `findByExternalIdentifier()`, `existsByExternalIdentifier()`.

## Testing Strategy

- 23 tests covering: create (valid, invalid payloads, empty titles, invalid enums, external identifiers, duplicates, response shape, malformed JSON), update (fields, preservation, 404, invalid body, identifier collision, type enum), delete (success, 404, isolation), route boundary (admin mounted, public routes unaffected), error handling (repository failure, ID param)
- Uses mock `GameAdminService` with `vi.fn()` for isolated HTTP testing
- Follows existing test patterns from `games-api.test.ts`

## Validation Results

```text
pnpm test          — 1039 passed (50 test files)
pnpm build         — clean (tsc)
pnpm lint          — clean
pnpm format:check  — clean
```

Live validation blocked by pre-existing MongoDB auth issue (same as Phase 23).

## Files Changed

| File | Change |
|------|--------|
| `src/shared/errors/errors.ts` | Added `ConflictError` (409) |
| `src/application/game-admin-service.ts` | **NEW** — Admin game write service |
| `src/interfaces/http/validation/schemas.ts` | Added `CreateGameBodySchema`, `UpdateGameBodySchema` |
| `src/interfaces/http/routes/admin-games.ts` | **NEW** — Admin game routes (POST/PATCH/DELETE) |
| `src/interfaces/http/app.ts` | Added `admin` to `AppDependencies`, mounted admin router |
| `src/server.ts` | Instantiated `GameAdminService`, wired into `createApp` |
| `tests/api/phase24-game-admin.test.ts` | **NEW** — 23 tests |
| 8 existing test files | Added `admin` dependency to `createApp` calls |

## Known Limitations

- Hard delete only — no soft delete or undo
- No authentication/authorization (intentionally deferred to Phase 25)
- External identifiers are replaced entirely on PATCH (not merged)
- No bulk create/update/delete endpoints
- No audit log beyond application-level logger
- Live validation blocked by pre-existing MongoDB auth issue

## Next Phase

Phase 25 — Authentication & API Keys per `docs/reports/post-mvp-roadmap.md`.
