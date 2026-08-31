## Step-by-Step Implementation

1. Created `src/infrastructure/retry.ts` — retry utility with configurable exponential backoff, jitter, max attempts, and `retryOn` predicate.
2. Created `src/interfaces/http/middleware/request-id.ts` — generates or reads `x-request-id` header, attaches to `req.requestId`.
3. Created `src/interfaces/http/middleware/request-logger.ts` — logs HTTP method, path, status code, duration, and requestId on response finish.
4. Created `src/interfaces/http/middleware/request-timeout.ts` — returns 408 after configurable timeout (default 30s).
5. Created `src/interfaces/http/middleware/rate-limiter.ts` — in-memory sliding window rate limiter per IP (default 100 req/min), returns 429 with X-RateLimit headers.
6. Updated `src/interfaces/http/routes/health.ts` — now reports database connection, AI configuration, uptime, and version. Returns 200 with status `ok`/`degraded` (resilient to missing config).
7. Updated `src/interfaces/http/middleware/error-handler.ts` — includes `requestId` in all error responses.
8. Updated `src/interfaces/http/app.ts` — wired all middleware: requestId → requestLogger → requestTimeout → rateLimiter → routes → errorHandler.
9. Created `src/types/express.d.ts` — augments Express Request type with `requestId`.
10. Created `tests/infrastructure/retry.test.ts` — 5 tests covering success, retry, max attempts, retryOn predicate.
11. Created `tests/infrastructure/middleware.test.ts` — 6 tests covering requestId, requestTimeout, and rateLimiter.
12. Updated `tests/app.test.ts` — health check test accepts `degraded` status when DB is not connected.

## Architectural Decisions

### Retry as a Standalone Utility (Not Middleware)

- **Decision**: `withRetry` is a generic async retry function, not Express middleware.
- **Context**: Retry is needed in source adapters, AI providers, and potentially other async operations — not just HTTP requests.
- **Alternatives considered**: Express retry middleware; retry wrapper around adapters.
- **Reason**: Maximum reuse. Any async operation can use `withRetry` without coupling to Express.
- **Trade-off**: Callers must opt-in explicitly. No automatic retry on all HTTP requests.

### In-Memory Rate Limiter (No External Dependencies)

- **Decision**: Built a simple in-memory sliding window rate limiter instead of adding `express-rate-limit`.
- **Context**: ATP is single-instance for now. External store (Redis) is premature.
- **Alternatives considered**: `express-rate-limit` package; Redis-backed limiter.
- **Reason**: Zero new dependencies. Sufficient for single-instance deployment. Can be swapped later.
- **Trade-off**: Rate limit state is lost on restart. Not shared across instances. Acceptable for current scope.

### Health Check Returns 200 Even When Degraded

- **Decision**: `/health` always returns HTTP 200, using `status: "degraded"` instead of HTTP 503.
- **Context**: Load balancers may remove instances returning 503. A degraded instance still serves traffic.
- **Alternatives considered**: 503 when database is disconnected.
- **Reason**: Degraded ≠ down. The app can still serve cached/discovery data without a database connection.
- **Trade-off**: Operators must check `status` field, not just HTTP code. Clear in the response schema.

### Request-Level Timeout vs Per-Route

- **Decision**: Global 30s timeout applied to all routes.
- **Context**: Currently no route takes longer than a few seconds. A global timeout prevents hung requests.
- **Alternatives considered**: Per-route timeouts; no timeout (rely on upstream).
- **Reason**: Simplest protection. Per-route can be added later if needed.
- **Trade-off**: If a legitimate endpoint needs >30s (e.g., bulk operations), it would need a custom override.

## Files Changed

| File | Responsibility |
|------|---------------|
| `src/infrastructure/retry.ts` | Generic async retry with exponential backoff |
| `src/interfaces/http/middleware/request-id.ts` | Correlation ID generation and propagation |
| `src/interfaces/http/middleware/request-logger.ts` | Structured HTTP request/response logging |
| `src/interfaces/http/middleware/request-timeout.ts` | Request-level timeout (408) |
| `src/interfaces/http/middleware/rate-limiter.ts` | Sliding window rate limiting per IP |
| `src/interfaces/http/routes/health.ts` | Health check with dependency status |
| `src/interfaces/http/middleware/error-handler.ts` | Added requestId to error responses |
| `src/interfaces/http/app.ts` | Wired new middleware into Express pipeline |
| `src/types/express.d.ts` | Express Request type augmentation |
| `tests/infrastructure/retry.test.ts` | Retry utility tests |
| `tests/infrastructure/middleware.test.ts` | Middleware tests (requestId, timeout, rateLimiter) |
| `tests/app.test.ts` | Updated health check test for degraded status |

## Validation Results

```text
pnpm build          — pass (tsc clean)
pnpm test           — 817 passed, 0 failed (39 test files)
pnpm lint           — pass (0 errors)
pnpm format:check   — pass
```

## Known Limitations

- **Retry not integrated into source adapters yet**: The `withRetry` utility exists but source adapters still don't use it. Integration requires wrapping `fetchJson` calls.
- **No circuit breaker**: Repeated failures from an external source still trigger full timeout waits. Circuit breaker would fail fast after N failures.
- **In-memory rate limiter state lost on restart**: Acceptable for single-instance; would need Redis for multi-instance.
- **No structured metrics/counters**: Logging exists but no aggregation (Prometheus, OpenTelemetry). Deferred to Phase 15.
- **No request body logging**: Request logger only logs metadata, not bodies. Intentional for privacy.

## Next Step

Phase 14 — Performance (database indexing, query optimization, caching, connection pooling).
