#!/usr/bin/env bash
# Start everything Kavach needs on this laptop:
#   - Ollama (for the optional Qwen3 deep scan)
#   - the Kavach engine on http://127.0.0.1:8000
# First run installs Python packages and downloads the face model.
set -euo pipefail
cd "$(dirname "$0")/engine"

if [ ! -d .venv ]; then
  echo "› Creating Python environment…"
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi

if [ ! -f models/face_detection_yunet_2023mar.onnx ]; then
  echo "› Downloading YuNet face detector (MIT)…"
  mkdir -p models
  curl -sfL -o models/face_detection_yunet_2023mar.onnx \
    https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
    || echo "  (skipped: no internet; face blurring stays off)"
fi

command -v tesseract >/dev/null || echo "⚠ Tesseract not found: brew install tesseract tesseract-lang (needed for images and scanned PDFs)"

if command -v ollama >/dev/null; then
  if ! curl -s http://127.0.0.1:11434/api/tags >/dev/null; then
    echo "› Starting Ollama…"
    (ollama serve >/tmp/kavach-ollama.log 2>&1 &)
    sleep 2
  fi
  ollama list 2>/dev/null | grep -q "^${KAVACH_LLM_MODEL:-qwen3:4b}" || echo "  Tip: ollama pull ${KAVACH_LLM_MODEL:-qwen3:4b}   (for deep scan)"
else
  echo "  Ollama not installed: deep scan stays off (brew install ollama)"
fi

echo "› Kavach engine on http://127.0.0.1:8000  (test page: http://127.0.0.1:8000/test)"
exec .venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000
