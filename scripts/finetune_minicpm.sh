#!/usr/bin/env bash
# Production Orchestration Script for MiniCPM-V 2.6 Technical Code OCR Fine-Tuning
# Freezes SigLIP vision tower, tunes LLM projections, exports GGUF/Ollama artifact.

set -euo pipefail

echo "=========================================================="
echo " Starting MiniCPM-V 2.6 Code OCR Fine-Tuning Pipeline     "
echo " Target Runtime: Intel Core Ultra 9 288V (Series 2)       "
echo "=========================================================="

CONFIG_PATH="./scripts/config_minicpmv_code_ocr.yaml"

# 1. Step 1: Generate or verify dataset
if [ ! -f "./dataset_minicpm_code_ocr/dataset.json" ]; then
    echo "[Data Prep] Generating synthetic code OCR dataset..."
    python ./scripts/generate_synthetic_code_dataset.py
else
    echo "[Data Prep] Existing dataset detected in ./dataset_minicpm_code_ocr"
fi

# 2. Step 2: Launch LLaMA-Factory SFT
echo "[Training] Launching SFT with frozen SigLIP vision tower..."
llamafactory-cli train "${CONFIG_PATH}"

# 3. Step 3: Export Merged Weights
EXPORT_DIR="./output_minicpm_code_ocr_merged"
echo "[Export] Merging LoRA adapters into base weights at ${EXPORT_DIR}..."
llamafactory-cli export \
    --model_name_or_path openbmb/MiniCPM-V-2_6 \
    --adapter_name_or_path ./output_minicpm_code_ocr \
    --template minicpm_v \
    --finetuning_type lora \
    --export_dir "${EXPORT_DIR}" \
    --export_size 4 \
    --export_device cpu \
    --export_legacy_format false

# 4. Step 4: Convert to GGUF for Ollama Runtime
echo "[Quantization] Converting to GGUF Q4_K_M for local Lunar Lake inference..."
python llama.cpp/convert_hf_to_gguf.py "${EXPORT_DIR}" --outfile "${EXPORT_DIR}/minicpm-v-code-ocr-q4_k_m.gguf" --outtype q4_k_m

# 5. Step 5: Build Ollama Model
echo "[Ollama] Packaging into Ollama model minicpm-v-code-ocr..."
ollama create minicpm-v-code-ocr -f ./scripts/Modelfile.minicpm-v-noloop

echo "=========================================================="
echo " Fine-Tuning & Export Complete! Model: minicpm-v-code-ocr "
echo "=========================================================="
