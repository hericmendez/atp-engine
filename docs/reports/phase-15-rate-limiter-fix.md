# Phase 15 — Rate Limiter Resource Lifecycle Fix

**Date**: 2026-08-31
**Status**: Complete

---

## 1. Problem

The HTTP rate limiter middleware (`src/interfaces/http/middleware/rate-limiter.ts:27`) created a `setInterval` timer per middleware instance that was never cleared. This caused:

- A resource leak per middleware instance (one timer per `rateLimiterMiddleware()` call)
- No cleanup on application shutdown
- Accumulation of timers if middleware was recreated

---

## 2. Solution

Replace the background `setInterval` with lazy cleanup. On each incoming request, before evaluating the rate limit counter, purge all expired entries from the in-memory store.

### Before

```typescript
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}, windowMs);

return (req, res, next) => { ... };
```

### After

```typescript
function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}

return (req, res, next) => {
  purgeExpired();
  // ... rest of rate limit logic
};
```

---

## 3. Behavioral Invariants Preserved

| Invariant | Status |
|-----------|--------|
| Independent per-IP tracking | ✅ Unchanged |
| Same request limits | ✅ Unchanged |
| Same time windows | ✅ Unchanged |
| 429 with `RATE_LIMIT_EXCEEDED` | ✅ Unchanged |
| `X-RateLimit-*` headers | ✅ Unchanged |
| Custom key generator | ✅ Unchanged |
| Custom message | ✅ Unchanged |
| Expired entries don't count | ✅ Fixed (now cleaned on access) |
| Window reset after expiry | ✅ Unchanged |
| Client independence | ✅ Unchanged |
| Middleware contract in `app.ts` | ✅ Unchanged (line 24) |

---

## 4. Trade-offs

**Accepted**: Expired entries from other clients linger until their next request (or until any client triggers a purge). This is acceptable because:

- The store is small (one entry per unique client IP)
- Entries are cleaned on any request, not just the client's own
- The original `setInterval` also only cleaned entries periodically, not instantly

**Benefit**: No background timer, no resource leak, no shutdown hook needed.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `src/interfaces/http/middleware/rate-limiter.ts` | Replaced `setInterval` with lazy `purgeExpired()` function called on each request |
| `tests/infrastructure/middleware.test.ts` | Added 4 tests: lazy expiry removal, window reset, client independence, fake timer isolation |

---

## 6. Testing

### New Tests

1. **Lazy expiry removal**: Exhaust limit, advance time past window, verify next request is allowed (expired entry purged)
2. **Window reset**: Hit limit, advance time, verify new window starts fresh
3. **Client independence**: Two clients, expire one, verify the other is unaffected
4. **Timer isolation**: Each test uses `vi.useFakeTimers()` / `vi.useRealTimers()` to prevent cross-test timer pollution

### Validation

```text
Tests: 833 passed (middleware tests excluded from default suite but verified separately: 12 passed)
Build: PASS
Lint: PASS
Format: PASS
```

---

## 7. Deferred Items

Phase 15 reconnaissance identified additional items. All deferred:

| Item | Reason |
|------|--------|
| Circuit breaker | Retry + timeout sufficient for current traffic |
| Metrics platform | Structured logging provides sufficient visibility |
| Enrichment RegExp memoization | Needs profiling data to justify |
| DB projection optimization | Document sizes manageable |
| AI error propagation | Catch-fallback-log pattern is intentional |
| LRU proactive expiry | TTL-based expiry on read is sufficient |

---

## 8. Next Step

Phase 15 remaining items (production Docker, config validation, security review, etc.) or next phase per roadmap.
