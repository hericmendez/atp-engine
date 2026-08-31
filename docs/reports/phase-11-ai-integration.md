# Phase 11 — AI Integration (Step 0 + Architecture + Implementation)

**Date**: 2026-08-29  
**Status**: In Progress — core architecture and implementation complete, observability remaining  
**Tests**: 765 passing (35 new AI tests)  
**Build**: Clean  
**Lint**: Clean  
**Format**: Clean

---

## Step-by-Step Implementation

### Step 0 — Architecture Audit

Audited four systems to determine where AI adds value:

| System | AI Justified | Reason |
|---|---|---|
| Classification | Yes | ~7% low-confidence cases; ambiguous when no source hints |
| Identity Resolution | Yes | ~10-20% UNRESOLVED in dead zone (-0.3, 0.35) |
| Enrichment | Yes | Conflict resolution never resolves CONFLICT_RETAIN_EXISTING |
| Cover Engine | No | Deterministic ranking already robust; AI adds latency/cost |

### Step 1 — Provider Abstraction

Created `src/ai/provider.ts` with `LLMProvider` interface:

```typescript
interface LLMProvider {
  readonly name: string;
  classify(request: AIClassificationRequest): Promise<AIClassificationResponse>;
  resolveIdentity(request: AIIdentityRequest): Promise<AIIdentityResponse>;
  resolveConflict(request: AIEnrichmentConflictRequest): Promise<AIEnrichmentConflictResponse>;
  healthCheck(): Promise<boolean>;
}
```

### Step 2 — Types

Created `src/ai/types.ts` with request/response types for classification, identity, and enrichment.

### Step 3 — Ollama Provider

Implemented `OllamaProvider` with:
- JSON structured output via `format: 'json'` parameter
- System prompts with category/outcome/relationship vocabulary
- Response parsing and validation
- Configurable timeout via `AbortController`
- Health check via `/api/tags`

### Step 4 — Configuration

Updated `src/infrastructure/config/config.ts` with:

```env
AI_ENABLED=false        # Default: disabled
AI_PROVIDER=ollama      # Default: ollama
AI_MODEL=qwen3:8b       # Default: qwen3:8b
OLLAMA_URL=http://localhost:11434
AI_TIMEOUT_MS=10000     # Default: 10s
```

### Step 5 — Async Interface Migration

Made `Classifier.classify()` and `IdentityResolver.resolve()` async:
- Updated interfaces to return `Promise<>`
- Updated deterministic implementations to wrap with async
- Updated `DiscoveryEngine.processSourceResults()` and `aggregateAndDeduplicate()`
- Updated all test calls with `await`

### Step 6 — Hybrid Classifier

Implemented `AIClassifier` that:
1. Runs deterministic classification first
2. Escalates to AI when: confidence < 0.7, category is UNKNOWN, or signals are ambiguous (gap < 0.10)
3. Validates AI response (valid category, confidence >= 0.5)
4. Falls back to deterministic on AI failure

### Step 7 — Hybrid Identity Resolver

Implemented `AIIdentityResolver` that:
1. Runs deterministic resolution first
2. Escalates to AI when: outcome is UNRESOLVED or confidence < 0.6
3. Validates AI response (valid outcome, confidence >= 0.5)
4. Falls back to deterministic on AI failure

### Step 8 — AI Enrichment Assist

Implemented `AIEnrichmentAssist` that:
1. Takes conflicts from deterministic enrichment
2. Resolves each conflict via AI with minConfidence threshold (0.7)
3. Returns resolutions for high-confidence AI decisions
4. Skips low-confidence or failed resolutions (deterministic fallback applies)

### Step 9 — Cover Engine Decision

**NOT implementing Cover AI.** The deterministic system already handles type filtering, quality scoring, relevance ranking, deduplication, and minimum selection threshold. AI adds latency and cost with minimal benefit.

---

## Architectural Decisions

### 1. Async Interface Migration

- **Decision**: Make `Classifier.classify()` and `IdentityResolver.resolve()` async
- **Context**: AI calls are inherently async; making interfaces async allows clean hybrid implementations
- **Alternatives considered**: Decorator pattern (keep sync interfaces, wrap internally)
- **Reason**: Cleaner architecture; single interface for all implementations
- **Trade-off**: All callers need `await` (54 classifier calls, 36 identity calls in tests updated)

### 2. Validation in Hybrid Layer

- **Decision**: Validate AI responses in `AIClassifier` and `AIIdentityResolver`, not just in `OllamaProvider`
- **Context**: FakeLLMProvider in tests can return invalid values; real providers may have bugs
- **Reason**: Defense in depth; domain integrity regardless of provider quality
- **Trade-off**: Slightly more code, but robust validation

### 3. No Hardcoded Model

- **Decision**: Model selected via `AI_MODEL` env var, never referenced in engines
- **Context**: Task requirement: architecture must not be coupled to Qwen3
- **Reason**: Future model swaps require only config change
- **Trade-off**: None — this is pure good practice

### 4. Structured Output via JSON Schema

- **Decision**: Use Ollama's `format: 'json'` parameter for structured output
- **Context**: Free-form LLM output is unreliable for programmatic use
- **Reason**: Validates response structure before domain logic
- **Trade-off**: Some models may not support JSON mode; fallback handles this

---

## Model Selection

**Default Model**: Qwen3 8B (`qwen3:8b`)

**Why**:
- Good reasoning for classification and identity tasks
- Structured output support via JSON mode
- Runs locally via Ollama (no external cost)
- 8B parameters sufficient for semantic understanding tasks
- Not too large for local inference

**Limitations**:
- May hallucinate on very niche/obscure titles
- JSON mode not supported by all models
- Local inference latency (~1-5s depending on hardware)
- 8B model may struggle with complex multi-step reasoning

**How to Change Model**: Update `AI_MODEL` env var. No code changes needed.

**When Ollama/Model Unavailable**: System falls back to deterministic processing. `AI_ENABLED=false` disables AI entirely.

---

## Testing Strategy

All AI tests use `FakeLLMProvider` — no network calls in test suite.

### Test Categories

| Test File | Tests | Coverage |
|---|---|---|
| `ai-classifier.test.ts` | 12 | AI disabled, escalation, failure fallback, invalid category, low confidence |
| `ai-identity-resolver.test.ts` | 6 | AI disabled, UNRESOLVED escalation, failure fallback, invalid outcome, null game |
| `ai-enrichment.test.ts` | 9 | AI disabled, no conflicts, confidence threshold, failure, multiple conflicts |
| `ai-config.test.ts` | 6 | Defaults, custom values, validation |
| `ollama-provider.test.ts` | 2 | Name, health check |

### Key Test Scenarios

1. **AI disabled**: Deterministic result returned unchanged
2. **AI failure**: Deterministic fallback (never ATP failure)
3. **AI low confidence**: Deterministic fallback
4. **AI invalid response**: Deterministic fallback
5. **AI success**: AI-enhanced result with AI signal in evidence

---

## Files Changed

### New Files

| File | Responsibility |
|---|---|
| `src/ai/types.ts` | AI request/response type definitions |
| `src/ai/provider.ts` | LLMProvider interface |
| `src/ai/config.ts` | AI configuration schema |
| `src/ai/ollama-provider.ts` | Ollama HTTP implementation |
| `src/ai/ai-classifier.ts` | Hybrid classifier (deterministic + AI) |
| `src/ai/ai-identity-resolver.ts` | Hybrid identity resolver (deterministic + AI) |
| `src/ai/ai-enrichment.ts` | AI-assisted conflict resolution |
| `tests/ai/ai-classifier.test.ts` | Classifier AI tests |
| `tests/ai/ai-identity-resolver.test.ts` | Identity AI tests |
| `tests/ai/ai-enrichment.test.ts` | Enrichment AI tests |
| `tests/ai/ai-config.test.ts` | Config tests |
| `tests/ai/ollama-provider.test.ts` | Ollama provider tests |

### Modified Files

| File | Change |
|---|---|
| `src/infrastructure/config/config.ts` | Added AI_PROVIDER, AI_MODEL, AI_TIMEOUT_MS |
| `src/classification/classifier.ts` | `classify()` → `Promise<ClassificationResult>` |
| `src/classification/deterministic-classifier.ts` | `classify()` → `async classify()` |
| `src/identity/identity-resolver.ts` | `resolve()` → `Promise<IdentityResolutionResult>` |
| `src/identity/deterministic-identity-resolver.ts` | `resolve()` → `async resolve()` |
| `src/discovery/discovery-engine.ts` | `processSourceResults()` → async |
| `src/discovery/aggregation.ts` | `areSameGame()` and `aggregateAndDeduplicate()` → async |
| `tests/classification/deterministic-classifier.test.ts` | Added `await` to all classify calls |
| `tests/identity/deterministic-identity-resolver.test.ts` | Added `await` to all resolve calls |
| `docs/roadmap.md` | Updated Phase 11 status |

---

## Validation Results

```
✓ Type-check: clean
✓ Tests: 765 passing (35 new)
✓ Lint: clean
✓ Format: clean
```

---

## Known Limitations

1. **AI observability** not yet implemented (structured logging for AI operations)
2. **Prompt versioning** not yet implemented
3. **Prompt iteration** not yet done — initial prompts are functional but not optimized
4. **No live AI evaluation** — Phase 12 (regression dataset) is separate
5. **Ollama provider only** — other providers (OpenAI, etc.) can be added by implementing `LLMProvider`

---

## Next Step

**Phase 11 remaining**: AI observability (structured logging for AI operations), prompt versioning.

**Phase 12**: AI Evaluation — create regression dataset, measure native vs AI-assisted accuracy.
