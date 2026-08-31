# Phase 11 — AI Validation, Observability & Prompt Hardening

**Date**: 2026-08-29
**Status**: Complete — ready for Phase 12
**Tests**: 817 passing (52 new AI tests)
**Build**: Clean
**Lint**: Clean
**Format**: Clean

---

## 1. Audit Findings

| Check | Status | Notes |
|---|---|---|
| AI optional | ✓ | `AI_ENABLED=false` default; all services check `enabled` |
| `AI_ENABLED=false` preserves deterministic | ✓ | AIClassifier/AIIdentityResolver return deterministic result |
| Ollama failures never crash pipeline | ✓ | All AI calls wrapped in try/catch with fallback |
| No hardcoded model | ✓ | Model configurable via `AI_MODEL` env var; constants centralized |
| `LLMProvider` replaceable | ✓ | Interface-based; tests use FakeLLMProvider; model independence test proves interchangeability |
| AI responses validated | ✓ | Categories, outcomes, confidence all validated in both provider and hybrid layer |
| Thresholds centralized | ✓ | All thresholds in `src/ai/constants.ts` |
| No invalid LLM response persisted | ✓ | All responses validated before entering domain logic |

### Issues Found & Fixed

1. **Valid categories/outcomes duplicated** — centralized in `src/ai/constants.ts`
2. **Thresholds hardcoded** in 3 files — centralized in `src/ai/constants.ts`
3. **No observability** — implemented `src/ai/observability.ts` with structured logging
4. **Prompts inline** — extracted to `src/ai/prompts/` with versioning
5. **No logging on fallback** — added `logAIOperation` calls in all hybrid services

---

## 2. Observability Implementation

Created `src/ai/observability.ts` with structured logging for all AI operations.

Every operation logs:

```json
{
  "event": "ai.operation",
  "operation": "classification",
  "provider": "ollama",
  "model": "qwen3:8b",
  "promptVersion": "classification-v1",
  "durationMs": 1842,
  "success": true,
  "fallback": false,
  "confidence": 0.91,
  "escalationReason": "low_confidence"
}
```

On failure:

```json
{
  "event": "ai.operation",
  "operation": "identity_resolution",
  "provider": "ollama",
  "model": "qwen3:8b",
  "promptVersion": "identity-v1",
  "durationMs": 10002,
  "success": false,
  "fallback": true,
  "fallbackReason": "ai_timeout",
  "escalationReason": "unresolved"
}
```

Operations tracked: `classification`, `identity_resolution`, `enrichment_conflict`.
Escalation reasons: `low_confidence`, `unknown_category`, `ambiguous_signals`, `unresolved`.
Fallback reasons: `ai_disabled`, `ai_failure`, `ai_timeout`, `ai_low_confidence`, `ai_invalid_response`.

**Observability never breaks the pipeline** — logger failures are silently caught.

---

## 3. Prompt Versioning

Prompts extracted to `src/ai/prompts/`:

| File | Version | Purpose |
|---|---|---|
| `src/ai/prompts/classification.ts` | `classification-v1` | Classification system prompt |
| `src/ai/prompts/identity.ts` | `identity-v1` | Identity resolution system prompt |
| `src/ai/prompts/enrichment.ts` | `enrichment-v1` | Enrichment conflict system prompt |

Versions are exported and logged in observability. Changing a prompt significantly requires incrementing the version (e.g., `classification-v2`).

---

## 4. Prompt Hardening

### Classification Prompt
- Lists all 15 valid categories with definitions
- Explicitly forbids inventing categories
- Requires real confidence, not invented certainty
- UNKNOWN for insufficient information

### Identity Prompt
- Lists all 4 valid outcomes with definitions
- Lists all 8 relationship types with examples
- Explicitly explains SAME_GAME vs DIFFERENT_GAME vs RELATED_GAME
- Prefers UNRESOLVED over guessing
- Same game on different platforms = SAME_GAME

### Enrichment Prompt
- Explicitly states: choose between provided values only
- Do NOT invent values
- Low confidence = preserve existing
- Honest about uncertainty

---

## 5. Runtime Validation

```
Ollama: AVAILABLE (http://localhost:11434)
Models installed: 0
AI_ENABLED: false (default)
```

Ollama is reachable but no models are installed. This is expected — `AI_ENABLED=false` means the system works deterministically without any model. To enable AI: `ollama pull qwen3:8b && AI_ENABLED=true`.

---

## 6. Smoke Tests

Real Ollama smoke tests were **not executed** because no models are installed. This is the correct behavior — the system degrades gracefully to deterministic processing. Smoke tests will be executed in Phase 12 when a model is available.

---

## 7. Threshold Audit

| Threshold | Value | Where | Purpose | Effect of Increase | Effect of Decrease |
|---|---|---|---|---|---|
| `CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD` | 0.7 | `ai-classifier.ts` | Escalate to AI when deterministic confidence < threshold | More cases sent to AI | Fewer cases sent to AI |
| `CLASSIFICATION_AMBIGUITY_THRESHOLD` | 0.1 | `ai-classifier.ts` | Escalate when top-two signal gap < threshold | More ambiguous cases sent to AI | Fewer ambiguous cases sent to AI |
| `AI_MIN_CONFIDENCE` | 0.5 | `ai-classifier.ts`, `ai-identity-resolver.ts` | Minimum AI confidence to override deterministic | AI results used less often | AI results used more often |
| `IDENTITY_LOW_CONFIDENCE_THRESHOLD` | 0.6 | `ai-identity-resolver.ts` | Escalate to AI when deterministic confidence < threshold | More identity cases sent to AI | Fewer identity cases sent to AI |
| `ENRICHMENT_MIN_CONFIDENCE` | 0.7 | `ai-enrichment.ts` | Minimum AI confidence to resolve conflict | Fewer conflicts resolved | More conflicts resolved |

All thresholds centralized in `src/ai/constants.ts`.

---

## 8. Tests Added

| Test File | Tests | Coverage |
|---|---|---|
| `deterministic-vs-ai-safety.test.ts` | 14 | AI disabled, AI available, AI unavailable (timeout, HTTP 500, invalid JSON, invalid category, invalid outcome, low confidence) |
| `model-independence.test.ts` | 5 | Any provider works, no model names in business logic, FakeLLMProvider interchangeability |
| `regression.test.ts` | 12 | Classification (confident→no AI, low→AI, UNKNOWN→AI, failure→deterministic, invalid→deterministic), Identity (resolved→no AI, UNRESOLVED→AI, low→AI, failure→deterministic, invalid→deterministic), Enrichment (no conflict→no AI, conflict→AI, high conf→resolution, low conf→preserve, failure→preserve) |
| `observability.test.ts` | 8 | Success logging, failure logging, enrichment logging, escalation reason, logger failure resilience, timer, prompt version |
| `ai-config.test.ts` | 15 | Config defaults, custom values, validation, constants (thresholds, categories, outcomes, relationships), prompt versions |

**Total new tests: 52** (817 total, up from 765)

---

## 9. Files Changed

### New Files

| File | Responsibility |
|---|---|
| `src/ai/constants.ts` | Centralized vocabularies and thresholds |
| `src/ai/observability.ts` | Structured logging for AI operations |
| `src/ai/prompts/classification.ts` | Classification prompt + version |
| `src/ai/prompts/identity.ts` | Identity prompt + version |
| `src/ai/prompts/enrichment.ts` | Enrichment prompt + version |
| `tests/ai/deterministic-vs-ai-safety.test.ts` | Safety tests |
| `tests/ai/model-independence.test.ts` | Provider independence tests |
| `tests/ai/regression.test.ts` | Regression tests |
| `tests/ai/observability.test.ts` | Observability tests |

### Modified Files

| File | Change |
|---|---|
| `src/ai/ollama-provider.ts` | Use centralized constants and prompts; export prompt versions |
| `src/ai/ai-classifier.ts` | Use centralized thresholds; add observability logging |
| `src/ai/ai-identity-resolver.ts` | Use centralized thresholds; add observability logging |
| `src/ai/ai-enrichment.ts` | Use centralized thresholds; add observability logging |
| `tests/ai/ai-config.test.ts` | Add constants, thresholds, and prompt version tests |
| `docs/roadmap.md` | Mark Phase 11 complete |

---

## 10. Validation Results

```
✓ Type-check: clean
✓ Tests: 817 passing (52 new)
✓ Lint: clean
✓ Format: clean
```

---

## 11. Known Limitations

1. **No real Ollama smoke tests** — no models installed; will execute in Phase 12
2. **Prompt iteration not done** — initial prompts are functional but not optimized against real model outputs
3. **No A/B prompt comparison** — Phase 12 will evaluate prompt effectiveness
4. **Ollama provider only** — other providers (OpenAI, etc.) can be added by implementing `LLMProvider`

---

## 12. Recommendation for Phase 12

**Phase 11 is complete.** All exit criteria met:

- AI continues optional (`AI_ENABLED=false` default)
- Deterministic fallback is proven (14 safety tests)
- Provider is replaceable (5 independence tests)
- Model is not hardcoded (config-based)
- AI responses are validated (dual-layer validation)
- Observability is implemented (8 tests)
- Prompts have versions (classification-v1, identity-v1, enrichment-v1)
- Prompts are hardened for programmatic use
- All 817 tests pass
- Build/lint/format clean

**Ready for Phase 12 — AI Evaluation.**

---

## 13. Final Status

```
AI Runtime:      AVAILABLE (no models installed)
Model:           qwen3:8b (config default, not installed)
Classification:  PASS
Identity:        PASS
Enrichment:      PASS
Fallback:        PASS
Observability:   PASS
Prompt versioning: PASS
Provider independence: PASS
```
