#!/bin/bash
set -e

cd "/home/revi/Documentos/Projects/The Save State Project/AGORA_VAI/atp-engine"

# Clear previous results
rm -f tests/evaluation/results/model-benchmark-sample-results.json tests/evaluation/results/model-benchmark-sample-summary.json

echo "=== Running all model benchmarks ==="
echo ""

# Run each model
for model in qwen3:1.7b qwen3:4b gemma3:4b phi4-mini; do
  echo "--- $model ---"
  npx tsx tests/evaluation/benchmark-sample.ts --model=$model 2>&1 || echo "FAILED: $model"
  echo ""
done

# qwen3:8b without thinking
echo "--- qwen3:8b (no-thinking) ---"
npx tsx tests/evaluation/benchmark-sample.ts --model=qwen3:8b --think=false 2>&1 || echo "FAILED: qwen3:8b no-thinking"
echo ""

# qwen3:8b with thinking
echo "--- qwen3:8b (thinking) ---"
npx tsx tests/evaluation/benchmark-sample.ts --model=qwen3:8b --think=true 2>&1 || echo "FAILED: qwen3:8b thinking"
echo ""

echo "=== All benchmarks complete ==="
