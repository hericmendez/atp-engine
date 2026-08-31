# Phase 12.1: AI Performance & Qwen3 Benchmark

**Date**: 2026-08-30  
**Model**: qwen3:8b (Ollama 0.32.15, Q4_K_M)  
**Status**: Complete

## Executive Summary

**Qwen3:8B's thinking mode is the primary cause of latency.** Disabling thinking reduces latency by 5-6x (80s → 9s) but drops identity resolution accuracy from 73.3% to 33.3%. Classification is unaffected. **Local synchronous AI is NOT viable for identity resolution in its current form.**

---

## 1. Architecture Audit

### Execution Path

```text
AIClassifier / AIIdentityResolver / AIEnrichmentAssist
    ↓
OllamaProvider.chat()
    ↓
HTTP POST → http://localhost:11434/api/chat
    ↓
Ollama → Qwen3:8B (Q4_K_M)
    ↓
JSON response
    ↓
Parse & validate
```

### Latency Sources Identified

| Source | Impact | Notes |
|--------|--------|-------|
| HTTP overhead | ~1ms | Negligible |
| Model loading | 0ms | Model stays in memory |
| Prompt construction | <1ms | Trivial string ops |
| Prompt size | Negligible | 130-348 chars |
| **Thinking mode** | **40-120s** | **Primary bottleneck** |
| JSON parsing | <1ms | Trivial |
| Response size | Negligible | 200-500 chars |

### Key Finding

Qwen3:8B has **thinking capability** enabled by default. When `think: true` (default), the model generates internal reasoning before the response. Even with `format: 'json'`, the model spends 40-120s on internal reasoning.

---

## 2. Qwen3/Ollama Runtime Analysis

### Model Configuration

```text
Model: qwen3:8b
Architecture: qwen3
Parameters: 8.2B
Context length: 40960
Quantization: Q4_K_M
Capabilities: completion, tools, thinking
Default temperature: 0.6
```

### Thinking Mode Impact

| Mode | Latency (avg) | Accuracy | Timeouts |
|------|---------------|----------|----------|
| think: true (default) | 80s | 81.5% | 8/135 (5.9%) |
| think: false | 9.3s | 68.9% | 0/135 (0%) |

### Speedup from Disabling Thinking

| Operation | Speedup |
|-----------|---------|
| Classification | 5.0x |
| Identity | 4.8x |
| Enrichment | 6.2x |

---

## 3. Detailed Latency Measurements

### Thinking Enabled (Phase 12 Results)

| Operation | Cases | Correct | Accuracy | Avg | Median | P95 | Max |
|-----------|-------|---------|----------|-----|--------|-----|-----|
| Classification | 50 | 48 | 96.0% | 43.7s | 38.5s | 85.1s | 127.9s |
| Identity | 45 | 33 | 73.3% | 94.8s | 82.4s | 177.8s | 180.0s |
| Enrichment | 40 | 29 | 72.5% | 108.7s | 101.5s | 167.9s | 180.0s |

### Thinking Disabled (New Benchmark)

| Operation | Cases | Correct | Accuracy | Avg | Median | P95 | Max |
|-----------|-------|---------|----------|-----|--------|-----|-----|
| Classification | 50 | 48 | 96.0% | 8.9s | 9.0s | 10.4s | 11.2s |
| Identity | 45 | 15 | 33.3% | 10.5s | 10.7s | 14.5s | 15.7s |
| Enrichment | 40 | 30 | 75.0% | 10.5s | 10.4s | 13.8s | 15.9s |

---

## 4. Timeout Analysis

### 8 Timeouts from Phase 12 (thinking enabled, 180s timeout)

| Case | Operation | Input | Difficulty | Probable Cause |
|------|-----------|-------|------------|----------------|
| id-002 | identity | "CoD: Modern Warfare" vs "Call of Duty 4: Modern Warfare" | medium | Abbreviation + reasoning loop |
| id-015 | identity | "Metal Gear Solid" vs "Metal Gear Solid: The Twin Snakes" | hard | Complex relationship reasoning |
| id-030 | identity | "NieR: Automata" vs "NieR Replicant ver.1.22474487139..." | hard | Long title + reasoning loop |
| id-031 | identity | "Prince of Persia: The Sands of Time" vs "...Remake" | medium | Reasoning loop |
| id-035 | identity | "Donkey Kong Country" vs "Donkey Kong Country: Tropical Freeze" | medium | Reasoning loop |
| id-040 | identity | "Yakuza 0" vs "Like a Dragon: Yakuza" | hard | Rebrand reasoning |
| enr-004 | enrichment | "Action-Adventure" vs "Action-adventure" (genre) | easy | Case-sensitivity reasoning |
| enr-008 | enrichment | "2022-02-25" vs "February 25, 2022" (date) | easy | Format reasoning |

### Timeout Pattern

- **6/8 timeouts** are identity resolution cases
- **All timeouts** occur with thinking enabled
- **No timeouts** with thinking disabled (60s timeout)
- **Correlation**: Timeouts correlate with complex reasoning tasks, NOT prompt size

---

## 5. Accuracy Comparison

### Deterministic vs AI (Thinking Enabled)

| Operation | Deterministic | AI (thinking) | AI (no thinking) | Delta (thinking) | Delta (no thinking) |
|-----------|---------------|---------------|------------------|------------------|---------------------|
| Classification | 100% | 96% | 96% | -4% | -4% |
| Identity | 8.9% | 73.3% | 33.3% | +64.4% | +24.4% |
| Enrichment | 57.5% | 72.5% | 75.0% | +15% | +17.5% |
| **Overall** | **57.0%** | **81.5%** | **68.9%** | **+24.5%** | **+11.9%** |

### Key Observations

1. **Classification**: AI adds no value (deterministic already 100%)
2. **Identity**: Thinking mode is critical (73.3% vs 33.3%)
3. **Enrichment**: Thinking mode slightly hurts (72.5% vs 75.0%)
4. **Overall**: Thinking mode provides +12.6% accuracy but costs 8.6x latency

---

## 6. Latency Comparison

### Per-Operation Latency

| Operation | Thinking (avg) | No Thinking (avg) | Speedup |
|-----------|----------------|-------------------|---------|
| Classification | 43.7s | 8.9s | 4.9x |
| Identity | 94.8s | 10.5s | 9.0x |
| Enrichment | 108.7s | 10.5s | 10.4x |

### Latency Distribution (No Thinking)

| Percentile | Classification | Identity | Enrichment |
|------------|----------------|----------|------------|
| P50 | 9.0s | 10.7s | 10.4s |
| P95 | 10.4s | 14.5s | 13.8s |
| P99 | 11.0s | 15.5s | 15.5s |

---

## 7. Reliability Comparison

| Metric | Thinking Enabled | Thinking Disabled |
|--------|------------------|-------------------|
| Total calls | 135 | 135 |
| Successful | 127 (94.1%) | 135 (100%) |
| Timeouts | 8 (5.9%) | 0 (0%) |
| Parse errors | 0 | 0 |
| Invalid responses | 0 | 0 |

---

## 8. Optimization Opportunities

### Prompt Optimization

- Current prompts are already minimal (130-348 chars)
- No significant optimization possible
- Prompt size is NOT the bottleneck

### Context Optimization

- No unnecessary context being sent
- Deterministic result is included but minimal
- No optimization needed

### Output Constraints

- Output is already constrained to JSON via `format: 'json'`
- Response size is minimal (200-500 chars)
- No optimization needed

### Call Reduction

- Deterministic-first architecture is working correctly
- AI only called when escalation conditions are met
- No unnecessary calls

---

## 9. Decision Threshold Analysis

### 🟢 Viable (≤5-10s typical)

**Classification with think: false**: 8.9s avg, 96% accuracy
- But deterministic is already 100%, so AI is unnecessary

### 🟡 Conditional (10-30s)

**Enrichment with think: false**: 10.5s avg, 75% accuracy
- 17.5% improvement over deterministic
- Could work for async/background processing

**Identity with think: false**: 10.5s avg, 33.3% accuracy
- Only 24.4% improvement over deterministic
- Not sufficient for synchronous use

### 🔴 Not Viable (>30s)

**Identity with think: true**: 94.8s avg, 73.3% accuracy
- 64.4% improvement but 94.8s latency
- 5.9% timeout rate
- **NOT viable for synchronous runtime**

**Enrichment with think: true**: 108.7s avg, 72.5% accuracy
- 15% improvement but 108.7s latency
- **NOT viable for synchronous runtime**

---

## 10. Recommendation

### Verdict: Local Synchronous AI is NOT Viable

**Qwen3:8B through Ollama cannot provide acceptable latency for synchronous ATP operations.**

The core problem:
- **With thinking**: Too slow (80-108s avg) + timeouts
- **Without thinking**: Too inaccurate for identity (33.3%)

### Recommended Next Steps

1. **Disable AI for classification** (deterministic is already 100%)
2. **Keep AI for enrichment as async background** (10.5s acceptable for batch)
3. **Evaluate alternatives for identity resolution**:
   - Smaller/faster model (qwen3:1.7b, phi-3, gemma-2)
   - Different provider (cloud API with <2s latency)
   - Improved deterministic rules
   - Hybrid approach (deterministic + AI for specific cases only)

4. **Do NOT remove AI architecture** - it's correct, just needs faster inference

### Architecture Recommendation

```text
Synchronous Path (user request):
    ↓
Deterministic classification
    ↓
Deterministic identity resolution
    ↓
Deterministic enrichment
    ↓
Response immediately

Async Background:
    ↓
AI enrichment (when confidence < threshold)
    ↓
Persist improved result
```

---

## 11. Files Created

- `tests/evaluation/diagnostic.ts` - Runtime diagnostic tool
- `tests/evaluation/benchmark.ts` - Think vs no-think benchmark
- `tests/evaluation/eval-think-false.ts` - Full evaluation with thinking disabled
- `tests/evaluation/results/benchmark-results.json` - Benchmark results
- `tests/evaluation/results/eval-think-false.json` - Full eval results

## 12. How to Reproduce

```bash
# Diagnostic
npx tsx tests/evaluation/diagnostic.ts

# Benchmark (thinking vs no-thinking)
npx tsx tests/evaluation/benchmark.ts

# Full evaluation (thinking disabled)
npx tsx tests/evaluation/eval-think-false.ts

# Analysis
npx tsx tests/evaluation/analyze.ts
```
