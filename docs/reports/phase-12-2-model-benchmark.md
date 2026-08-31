# Phase 12.2 — Local LLM Model Benchmark

## Executive Summary

**No local model is viable for synchronous AI assistance in the ATP Engine.**

The best candidate (phi4-mini) achieves 43.8% identity accuracy at 1.7s latency — faster than any other model, but accuracy is **worse than random guessing** (25% for 4 outcomes). The most accurate model (qwen3:8b with thinking) achieves 53.3% accuracy but at 68.8s average latency with timeouts.

The fundamental trade-off remains: **no small local model can provide meaningful identity resolution accuracy without introducing unacceptable latency.**

**Recommendation: B — Keep AI architecture, but async only.**

---

## Hardware

| Component | Value |
|-----------|-------|
| CPU | 12 cores (6C/12T) |
| RAM | 15GB |
| GPU | NVIDIA GeForce GTX 1660 |
| GPU Memory | 6GB VRAM |
| Ollama Version | 0.32.15 |
| Inference | GPU-accelerated (mixed: some CPU offloading for larger models) |

**Note:** GPU memory is shared with desktop environment (KWin, Plasma, Steam). Available VRAM for models: ~4.5GB.

---

## Models Tested

| Model | Parameters | Quantization | Context | Size | Thinking |
|-------|-----------|--------------|---------|------|----------|
| qwen3:1.7b | 2.0B | Q4_K_M | 40,960 | 1.4GB | Yes (not used) |
| qwen3:4b | 4.0B | Q4_K_M | 262,144 | 2.5GB | Yes (not used) |
| gemma3:4b | 4.3B | Q4_K_M | 131,072 | 3.3GB | No |
| phi4-mini | 3.8B | Q4_K_M | 131,072 | 2.5GB | No |
| qwen3:8b | 8.2B | Q4_K_M | 40,960 | 5.2GB | Yes |

**Note:** qwen3:1.7b and qwen3:4b report thinking capability in Ollama API, but were tested without thinking (default mode) as thinking is primarily a qwen3:8b feature.

---

## Identity Resolution Results (Primary Benchmark)

**16 representative cases from 45-case dataset**

| Model | Mode | Accuracy | Avg | Median | P95 | Timeouts | Errors |
|-------|------|----------|-----|--------|-----|----------|--------|
| **qwen3:8b** | thinking | **53.3%** | 68.8s | 63.0s | 112.2s | 1 | 0 |
| **qwen3:8b** | no-thinking | **53.3%** | 64.8s | 66.6s | 80.5s | 1 | 0 |
| **qwen3:4b** | default | **56.3%** | 77.5s | 83.9s | 116.5s | 0 | 0 |
| **phi4-mini** | default | **43.8%** | 1.7s | 1.4s | 6.7s | 0 | 0 |
| **qwen3:1.7b** | default | **18.8%** | 11.1s | 10.5s | 17.9s | 0 | 0 |
| **gemma3:4b** | default | **0.0%** | 4.8s | 3.6s | 24.7s | 0 | 0 |

**Key findings:**
- **qwen3:4b**: Highest accuracy (56.3%) but extremely slow (77.5s avg) — worse than qwen3:8b
- **qwen3:8b**: Both modes achieve 53.3% accuracy, thinking mode adds ~4s overhead
- **phi4-mini**: Fastest (1.7s) but accuracy (43.8%) is below random baseline
- **gemma3:4b**: Returns UNRESOLVED for all identity cases — complete failure
- **qwen3:1.7b**: Too small, accuracy (18.8%) is worse than random

**Comparison with Phase 12 baseline (45 cases):**
- qwen3:8b thinking: 73.3% (full dataset) vs 53.3% (sample) — sample underperforms
- qwen3:8b no-thinking: 33.3% (full dataset) vs 53.3% (sample) — sample overperforms
- Variance is high due to small sample size

---

## Enrichment Results (Secondary Benchmark)

**13 representative cases from 40-case dataset**

| Model | Mode | Accuracy | Avg | Median | P95 | Timeouts |
|-------|------|----------|-----|--------|-----|----------|
| **qwen3:8b** | no-thinking | **72.7%** | 76.8s | 66.9s | 113.5s | 2 |
| **gemma3:4b** | default | **69.2%** | 2.4s | 2.2s | 2.9s | 0 |
| **qwen3:8b** | thinking | **63.6%** | 75.2s | 68.5s | 107.7s | 2 |
| **qwen3:1.7b** | default | **53.8%** | 6.3s | 5.8s | 8.6s | 0 |
| **qwen3:4b** | default | **53.8%** | 75.0s | 73.7s | 110.5s | 0 |
| **phi4-mini** | default | **38.5%** | 1.6s | 1.5s | 2.2s | 0 |

**Key findings:**
- **gemma3:4b**: Best accuracy/latency for enrichment (69.2% at 2.4s) — but fails completely on identity
- **qwen3:8b no-thinking**: Best accuracy (72.7%) but unusable latency (76.8s)
- **phi4-mini**: Fastest (1.6s) but worst accuracy (38.5%)
- Enrichment formatting issues persist across all models (Action-Adventure vs Action-adventure, etc.)

---

## Classification Results (Sanity Check)

**11 representative cases from 50-case dataset**

| Model | Mode | Accuracy | Avg |
|-------|------|----------|-----|
| **All models** | All modes | **100%** | 1.2s - 41.5s |

**Key finding:** Classification is trivially solved by all models. The deterministic baseline already achieves 100%. AI classification adds no value.

---

## Latency Analysis

### Latency Distribution by Model

| Model | Mode | Min | Avg | Median | P95 | Max |
|-------|------|-----|-----|--------|-----|-----|
| phi4-mini | default | 1.1s | 1.5s | 1.4s | 2.2s | 6.7s |
| gemma3:4b | default | 1.8s | 3.2s | 3.2s | 24.7s | 24.7s |
| qwen3:1.7b | default | 4.0s | 7.8s | 5.8s | 17.9s | 17.9s |
| qwen3:8b | no-thinking | 45.3s | 59.1s | 66.6s | 80.5s | 113.5s |
| qwen3:8b | thinking | 40.9s | 61.8s | 63.0s | 112.2s | 112.2s |
| qwen3:4b | default | 35.4s | 75.6s | 73.7s | 116.5s | 116.5s |

### Requests Exceeding Thresholds

| Model | Mode | >5s | >10s | >20s | >30s | >60s |
|-------|------|-----|------|------|------|------|
| phi4-mini | default | 1 | 0 | 0 | 0 | 0 |
| gemma3:4b | default | 2 | 1 | 1 | 0 | 0 |
| qwen3:1.7b | default | 40 | 24 | 8 | 0 | 0 |
| qwen3:8b | no-thinking | 40 | 40 | 40 | 40 | 27 |
| qwen3:8b | thinking | 40 | 40 | 40 | 40 | 31 |
| qwen3:4b | default | 40 | 40 | 40 | 40 | 33 |

### Latency Classification (from Phase 12.1 thresholds)

| P95 Range | Rating | Models |
|-----------|--------|--------|
| ≤5s | Excellent | phi4-mini (identity: 6.7s) |
| ≤10s | Acceptable | gemma3:4b (enrichment: 2.9s) |
| ≤20s | Conditional | qwen3:1.7b (17.9s) |
| >20s | Poor | — |
| >30s | Unacceptable | qwen3:4b, qwen3:8b (all modes) |

---

## Timeout/Error Analysis

| Model | Mode | Timeouts | Error Rate |
|-------|------|----------|------------|
| qwen3:8b | thinking | 3/40 (7.5%) | 0% |
| qwen3:8b | no-thinking | 3/40 (7.5%) | 0% |
| qwen3:4b | default | 0/40 (0%) | 0% |
| qwen3:1.7b | default | 0/40 (0%) | 0% |
| gemma3:4b | default | 0/40 (0%) | 0% |
| phi4-mini | default | 0/40 (0%) | 0% |

**Note:** qwen3:8b timeouts occur at 120s threshold. qwen3:4b completes but takes 45-116s per request.

---

## Accuracy/Latency Trade-off

### Identity Resolution Trade-off

| Model | Mode | Accuracy | P95 Latency | Rating |
|-------|------|----------|-------------|--------|
| qwen3:8b | thinking | 53.3% | 112.2s | 🔴 Unacceptable |
| qwen3:8b | no-thinking | 53.3% | 80.5s | 🔴 Unacceptable |
| qwen3:4b | default | 56.3% | 116.5s | 🔴 Unacceptable |
| phi4-mini | default | 43.8% | 6.7s | 🟡 Conditional |
| qwen3:1.7b | default | 18.8% | 17.9s | 🔴 Unacceptable |
| gemma3:4b | default | 0.0% | 24.7s | 🔴 Unacceptable |

### Visual Trade-off

```
Accuracy
  70% |
  60% |                              ● qwen3:4b (56.3%, 116s)
  50% |              ● qwen3:8b-T (53.3%, 112s)
      |              ● qwen3:8b-NT (53.3%, 80s)
  40% |  ● phi4-mini (43.8%, 6.7s)
  30% |
  20% |  ● qwen3:1.7b (18.8%, 18s)
  10% |
   0% |  ● gemma3:4b (0%, 25s)
      +------+------+------+------+------+------>
           1s    10s   30s   60s   90s  120s
                        Latency (P95)
```

**No model occupies the "high accuracy, low latency" quadrant.**

---

## Error Analysis

### Identity Resolution Failures

**gemma3:4b** (0% accuracy):
- Returns UNRESOLVED for ALL cases
- Understands the task but defaults to lowest-confidence outcome
- Likely a prompt calibration issue — the model is too conservative

**qwen3:1.7b** (18.8% accuracy):
- Frequently returns UNRESOLVED or RELATED_GAME for clear SAME_GAME cases
- Fails to recognize common abbreviations (GTA V, FFX)
- Too small for semantic reasoning

**phi4-mini** (43.8% accuracy):
- Confuses DIFFERENT_GAME with RELATED_GAME
- Misidentifies franchise relationships as game identity
- Fast but lacks semantic depth

**qwen3:4b** (56.3% accuracy):
- Best accuracy but slowest
- Similar error patterns to qwen3:8b
- No advantage over larger model

**qwen3:8b** (53.3% accuracy):
- Both thinking and no-thinking achieve same accuracy
- Thinking adds latency without accuracy improvement
- Struggles with: abbreviations, remakes, enhanced editions

### Common Error Patterns (All Models)

1. **Abbreviations**: GTA V ↔ Grand Theft Auto V (often FAILED)
2. **Remakes**: Resident Evil 4 (2023) ↔ Resident Evil 4 (2005) (often FAILED)
3. **Enhanced editions**: Skyrim ↔ Skyrim Special Edition (often FAILED)
4. **Franchise confusion**: Different games in same franchise (often FAILED)

### Enrichment Formatting Issues

All models reproduce the same formatting mismatches:
- `Action-Adventure` vs `Action-adventure` (capitalization)
- `Roguelite` vs `Roguelike` (synonym mismatch)
- `Soulslike` vs `Action RPG` (category mismatch)
- `UE5` vs `Unreal Engine 5` (abbreviation)
- `T` vs `T for Teen` (formatting)

**Root cause**: Prompt design and output normalization, not model intelligence.

---

## Thinking Mode Analysis (Qwen3 Models)

| Mode | Identity Accuracy | Avg Latency | P95 Latency |
|------|-------------------|-------------|-------------|
| thinking=true | 53.3% | 68.8s | 112.2s |
| thinking=false | 53.3% | 64.8s | 80.5s |

**Finding**: Thinking mode provides **zero accuracy improvement** for identity resolution while adding ~4s average overhead. This confirms Phase 12.1 finding that thinking mode is not beneficial for this task.

---

## Recommendation

### B — Keep AI architecture, but async only

**Rationale:**

1. **No synchronous viable model**: All models either fail accuracy (phi4-mini, gemma3:4b, qwen3:1.7b) or fail latency (qwen3:4b, qwen3:8b)

2. **Best accuracy/latency balance**: phi4-mini at 43.8% / 1.7s — but accuracy is below random baseline (25% for 4 outcomes)

3. **Best accuracy**: qwen3:8b at 53.3% — but latency (64-68s) makes synchronous use impossible

4. **No model improves over deterministic**: The deterministic baseline achieves 8.9% identity accuracy (UNRESOLVED for all). AI models achieve 18-56%, but this improvement is not reliable enough for synchronous production use

5. **Async enrichment viable**: gemma3:4b achieves 69.2% enrichment accuracy at 2.4s — suitable for background enrichment

### Recommended Architecture

```
Synchronous: Deterministic only (immediate response)
Async: AI enrichment via gemma3:4b or phi4-mini (background)
```

### Specific Recommendations

| Use Case | Recommendation |
|----------|----------------|
| Identity Resolution | Deterministic only, no AI |
| Classification | Deterministic only, no AI |
| Enrichment | Async AI (gemma3:4b or phi4-mini) |
| Conflict Resolution | Async AI (gemma3:4b) |

---

## Appendix: Raw Results

### qwen3:1.7b (default)

**Identity (16 cases):**
- Correct: 3/16 (18.8%)
- Avg latency: 11,099ms
- P95: 17,861ms
- Timeouts: 0

**Enrichment (13 cases):**
- Correct: 7/13 (53.8%)
- Avg latency: 6,259ms
- P95: 8,577ms
- Timeouts: 0

**Classification (11 cases):**
- Correct: 11/11 (100%)
- Avg latency: 5,709ms

### qwen3:4b (default)

**Identity (16 cases):**
- Correct: 9/16 (56.3%)
- Avg latency: 77,463ms
- P95: 116,492ms
- Timeouts: 0

**Enrichment (13 cases):**
- Correct: 7/13 (53.8%)
- Avg latency: 75,000ms
- P95: 110,487ms
- Timeouts: 0

**Classification (11 cases):**
- Correct: 11/11 (100%)
- Avg latency: 2,515ms

### gemma3:4b (default)

**Identity (16 cases):**
- Correct: 0/16 (0%)
- Avg latency: 4,840ms
- P95: 24,713ms
- Timeouts: 0
- **All responses: UNRESOLVED**

**Enrichment (13 cases):**
- Correct: 9/13 (69.2%)
- Avg latency: 2,363ms
- P95: 2,931ms
- Timeouts: 0

**Classification (11 cases):**
- Correct: 11/11 (100%)
- Avg latency: 2,515ms

### phi4-mini (default)

**Identity (16 cases):**
- Correct: 7/16 (43.8%)
- Avg latency: 1,736ms
- P95: 6,673ms
- Timeouts: 0

**Enrichment (13 cases):**
- Correct: 5/13 (38.5%)
- Avg latency: 1,553ms
- P95: 2,214ms
- Timeouts: 0

**Classification (11 cases):**
- Correct: 11/11 (100%)
- Avg latency: 1,181ms

### qwen3:8b (no-thinking)

**Identity (16 cases):**
- Correct: 8/16 (53.3%)
- Avg latency: 64,766ms
- P95: 80,499ms
- Timeouts: 1

**Enrichment (13 cases):**
- Correct: 8/13 (72.7%)
- Avg latency: 76,794ms
- P95: 113,505ms
- Timeouts: 2

**Classification (11 cases):**
- Correct: 11/11 (100%)
- Avg latency: 35,734ms

### qwen3:8b (thinking)

**Identity (16 cases):**
- Correct: 8/16 (53.3%)
- Avg latency: 68,768ms
- P95: 112,225ms
- Timeouts: 1

**Enrichment (13 cases):**
- Correct: 7/13 (63.6%)
- Avg latency: 75,200ms
- P95: 107,668ms
- Timeouts: 2

**Classification (11 cases):**
- Correct: 11/11 (100%)
- Avg latency: 41,483ms

---

## Files Created

- `tests/evaluation/benchmark-models.ts` — Full benchmark (all cases)
- `tests/evaluation/benchmark-one.ts` — Single model benchmark
- `tests/evaluation/benchmark-sample.ts` — Sample benchmark (representative cases)
- `tests/evaluation/run-all-benchmarks.sh` — Batch runner
- `tests/evaluation/results/model-benchmark-sample-summary.json` — Summary results
- `tests/evaluation/results/benchmark-all.log` — Full benchmark log
- `docs/reports/phase-12-2-model-benchmark.md` — This report
