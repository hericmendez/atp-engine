## Step-by-Step Implementation

### Technical Debt — Regex Injection

1. Created `src/infrastructure/persistence/mongodb/escape-regex.ts` with `escapeRegex()` function.
2. Updated `buildFilter()` in `mongo-game-repository.ts` to escape all user-provided regex inputs (search, title, platform, developer, publisher, genre).
3. Added 14 unit tests in `tests/infrastructure/escape-regex.test.ts` covering all regex metacharacters and the ReDoS payload.
4. Added 3 integration tests in `tests/infrastructure/game-repository.test.ts` verifying repository treats regex metacharacters as literal text.

### Technical Debt — Race Condition

5. Removed `existsById()` check from `save()` method in `mongo-game-repository.ts`.
6. `save()` now relies on MongoDB's atomic unique constraint on `domainId`.
7. Added `extractDuplicateKeyPattern()` to distinguish domainId vs externalIdentifier duplicate key errors.
8. Added 2 integration tests verifying duplicate domainId is caught by the atomic constraint.

### Phase 13.2 — Structured Operational Logging

9. Added structured logging to `DiscoveryEngine.discover()` — logs `discovery.started` and `discovery.completed` with query, source count, candidate count, group count, error count, duration.
10. Added structured logging to `DeterministicClassifier.classify()` — logs `classification.completed` with category, confidence, signal count, duration.
11. Added structured logging to `DeterministicIdentityResolver.resolve()` — logs `identity_resolution.completed` with outcome, relationship, confidence, signal count, duration.
12. Added structured logging to `enrichGame()` — logs `enrichment.completed` with gameId, observation count, change count, conflict count, completeness, duration.
13. Added structured logging to `BaseAdapter.fetchJson()` — logs `source.request.completed` / `source.request.failed` with source, operation, URL, status, error type, duration.
14. Updated `requestLoggerMiddleware` to use structured event name `http.request.completed`.

### Phase 13.1 — Request/Correlation IDs

15. Created `src/infrastructure/request-context.ts` with `AsyncLocalStorage`-based request context.
16. Updated `requestIdMiddleware` to run `next()` inside `runWithContext()` — requestId propagates automatically to all async operations.
17. Updated logger to automatically include `requestId` from async context in all log entries — no explicit parameter passing required.
18. Added `MAX_HEADER_LENGTH` validation (128 chars) — oversized headers are rejected and a new UUID is generated.
19. Added 5 unit tests for request context (context propagation, nesting, empty context).
20. Added 3 middleware tests for request-id (oversized header, AsyncLocalStorage propagation, different IDs).

## Architectural Decisions

### AsyncLocalStorage for Request ID Propagation

- **Decision**: Use Node.js `AsyncLocalStorage` to propagate requestId through the async call stack.
- **Context**: The requestId must reach Discovery, Classification, Identity Resolution, Enrichment, and Source adapters without modifying any domain or application interfaces.
- **Alternatives considered**: Explicit parameter passing through all layers; CLS (continuation-local storage) packages.
- **Reason**: AsyncLocalStorage is built into Node.js, requires no domain interface changes, and the logger automatically picks up the context. Zero pollution of domain contracts.
- **Trade-off**: Requires the middleware to wrap `next()` in `runWithContext()`. Slight coupling to async context mechanism in the HTTP layer only.

### Logger Auto-Includes requestId

- **Decision**: The logger reads requestId from AsyncLocalStorage automatically.
- **Context**: Every log call would need `{ requestId }` passed explicitly if the logger didn't read from context.
- **Alternatives**: Pass requestId explicitly in every log call.
- **Reason**: Eliminates boilerplate, ensures consistency, impossible to forget.
- **Trade-off**: Logger depends on request-context module. Acceptable since logger is infrastructure.

### Atomic save() Without existsById()

- **Decision**: Remove the `existsById()` check from `save()` and rely on MongoDB's unique constraint.
- **Context**: The check-then-insert pattern had a race condition window. The schema already had `unique: true` on `domainId`.
- **Alternatives**: MongoDB transactions;findOneAndUpdate with upsert.
- **Reason**: Simplest correct solution. The unique constraint is atomic. Duplicate key error (code 11000) is caught and converted to `ValidationError`.
- **Trade-off**: Error message for duplicate domainId vs duplicate externalIdentifier requires inspecting `keyPattern`. Slightly more complex error handling, but correct.

### escapeRegex as Separate Utility

- **Decision**: Create `escapeRegex` in `src/infrastructure/persistence/mongodb/escape-regex.ts`.
- **Context**: Multiple filter fields in `buildFilter()` needed the same escaping.
- **Alternatives**: Inline escaping; shared utility in a different location.
- **Reason**: Dedicated file makes the security concern explicit and testable. Co-located with the MongoDB infrastructure where it's used.
- **Trade-off**: None. Small, focused, well-tested utility.

## Files Changed

| File | Responsibility |
|------|---------------|
| `src/infrastructure/persistence/mongodb/escape-regex.ts` | Regex metacharacter escaping for safe MongoDB queries |
| `src/infrastructure/persistence/mongodb/mongo-game-repository.ts` | Applied escapeRegex to all filter fields; removed existsById from save(); added extractDuplicateKeyPattern |
| `src/infrastructure/request-context.ts` | AsyncLocalStorage-based request context with requestId propagation |
| `src/infrastructure/logger/logger.ts` | Auto-includes requestId from async context in all log entries |
| `src/interfaces/http/middleware/request-id.ts` | Runs next() inside runWithContext(); validates header length |
| `src/interfaces/http/middleware/request-logger.ts` | Uses structured event name `http.request.completed` |
| `src/discovery/discovery-engine.ts` | Added discovery.started/completed structured logging |
| `src/classification/deterministic-classifier.ts` | Added classification.completed structured logging |
| `src/identity/deterministic-identity-resolver.ts` | Added identity_resolution.completed structured logging |
| `src/enrichment/enrichment-engine.ts` | Added enrichment.completed structured logging |
| `src/sources/base-adapter.ts` | Added source.request.completed/failed structured logging |
| `tests/infrastructure/escape-regex.test.ts` | 14 unit tests for escapeRegex |
| `tests/infrastructure/request-context.test.ts` | 5 unit tests for AsyncLocalStorage context |
| `tests/infrastructure/middleware.test.ts` | Updated request-id tests (oversized header, context propagation, different IDs) |
| `tests/infrastructure/game-repository.test.ts` | Added regex-safe filter tests and duplicate domainId tests |
| `docs/roadmap.md` | Updated Phase 13 status |

## Validation Results

```text
pnpm test           — 817 passed, 0 failed (39 test files)
pnpm build          — pass (tsc clean)
pnpm lint           — pass (0 errors)
pnpm format:check   — pass
```

## Known Limitations

- **Retry not integrated into source adapters**: The `withRetry` utility exists but is not yet used by source adapters.
- **No circuit breaker**: Repeated failures from an external source still trigger full timeout waits.
- **No metrics/counters**: No Prometheus or OpenTelemetry. Logging only.
- **No per-route timeout overrides**: Global 30s timeout applies to all routes.
- **BaseAdapter logging only covers fetchJson**: search() and getById() calls in concrete adapters are not directly instrumented (they go through fetchJson).

## Next Step

Phase 13.3 — Timeout Abstraction (per-operation configurable timeouts).
