#!/usr/bin/env bash
# Kavach one-step installer (macOS, Linux).
#
#   ./install.sh               install everything, start the engine at every login
#   ./install.sh --with-llm    also install Ollama + Qwen3-4B for "Deep scan" (~2.5 GB)
#   ./install.sh --no-autostart  don't register the engine to start at login
#
# After it finishes, the only step left is loading the extension in Chrome.
# Undo the autostart with ./uninstall.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENGINE="$ROOT/engine"
EXT="$ROOT/extension"
DIST="$ROOT/dist"
LABEL="com.kavach.engine"
PORT=8000
WITH_LLM=0
AUTOSTART=1
for arg in "$@"; do
  case "$arg" in
    --with-llm) WITH_LLM=1 ;;
    --no-autostart) AUTOSTART=0 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }

OS="$(uname -s)"
[ "$OS" = "Darwin" ] || [ "$OS" = "Linux" ] || die "Kavach's installer supports macOS and Linux (on Windows, use WSL)."

# ---------- 1. system tools ----------
bold "1/5  System tools"
if [ "$OS" = "Darwin" ]; then
  command -v brew >/dev/null || die "Homebrew is needed: https://brew.sh  (then run this again)"
  for pkg in tesseract tesseract-lang; do
    brew list "$pkg" >/dev/null 2>&1 || { echo "  installing $pkg…"; brew install "$pkg" >/dev/null; }
  done
  command -v node >/dev/null || { echo "  installing node…"; brew install node >/dev/null; }
  if [ "$WITH_LLM" = 1 ]; then
    command -v ollama >/dev/null || { echo "  installing ollama…"; brew install ollama >/dev/null; }
  fi
else
  if ! command -v tesseract >/dev/null; then
    command -v apt-get >/dev/null || die "Install Tesseract OCR with your package manager, then run this again."
    echo "  installing tesseract (needs sudo)…"
    sudo apt-get update -qq && sudo apt-get install -y -qq tesseract-ocr tesseract-ocr-hin tesseract-ocr-mar >/dev/null
  fi
  command -v node >/dev/null || die "Node.js 18+ is needed: https://nodejs.org (then run this again)"
  if [ "$WITH_LLM" = 1 ] && ! command -v ollama >/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
  fi
fi
PY="$(command -v python3 || true)"
[ -n "$PY" ] || die "Python 3.10+ is needed."
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || die "Python 3.10+ is needed (found $("$PY" --version))."
ok "Tesseract $(tesseract --version 2>&1 | head -1 | awk '{print $2}'), $("$PY" --version), Node $(node --version)"

# ---------- 2. engine ----------
bold "2/5  Engine (Python packages + AI models)"
if [ ! -x "$ENGINE/.venv/bin/python" ]; then
  "$PY" -m venv "$ENGINE/.venv"
fi
"$ENGINE/.venv/bin/pip" install -q --upgrade pip
echo "  installing Python packages (first time takes a few minutes)…"
"$ENGINE/.venv/bin/pip" install -q -r "$ENGINE/requirements.txt"
ok "Python packages"

mkdir -p "$ENGINE/models"
YUNET="$ENGINE/models/face_detection_yunet_2023mar.onnx"
if [ ! -f "$YUNET" ]; then
  curl -sfL -o "$YUNET" https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
    && ok "Face detector (YuNet)" || warn "Couldn't download the face detector; face blurring stays off"
else
  ok "Face detector (YuNet)"
fi

echo "  downloading the name-detection model (once)…"
(cd "$ENGINE" && .venv/bin/python -c "
import logging; logging.disable(logging.WARNING)
from detect import ner
ok = ner.load()
print('  model:', ner.model_name() if ok else 'FAILED')
" 2>/dev/null) || warn "Name model not downloaded yet; it will download on first use"

if [ "$WITH_LLM" = 1 ]; then
  # Start Ollama now and at every login (Homebrew service on macOS; the Linux installer sets up its own service).
  if [ "$OS" = "Darwin" ]; then brew services start ollama >/dev/null 2>&1 || true; fi
  curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1 || (ollama serve >/dev/null 2>&1 &)
  sleep 2
  ollama pull qwen3:4b && ok "Qwen3-4B for Deep scan (Ollama starts at login)"
fi

# ---------- 3. extension ----------
bold "3/5  Extension"
(cd "$EXT" && npm install --silent --no-fund --no-audit >/dev/null 2>&1 && npm run -s build >/dev/null && npm run -s zip >/dev/null && npx wxt zip -b firefox >/dev/null)
mkdir -p "$DIST"
cp "$EXT"/.output/*-chrome.zip "$DIST/kavach-chrome.zip"
cp "$EXT"/.output/*-firefox.zip "$DIST/kavach-firefox.zip"
ok "Built: extension/.output/chrome-mv3   (zips in dist/)"

# ---------- 4. start the engine automatically ----------
bold "4/5  Engine autostart"
port_busy() { lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; }
LOGDIR="$HOME/Library/Logs/Kavach"; [ "$OS" = "Linux" ] && LOGDIR="$HOME/.local/state/kavach"
mkdir -p "$LOGDIR"

if [ "$AUTOSTART" = 0 ]; then
  warn "Skipped (--no-autostart). Start the engine yourself with ./run.sh"
elif [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  if port_busy; then
    die "Something is already using port $PORT (probably ./run.sh). Stop it, then run this again."
  fi
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ENGINE/.venv/bin/uvicorn</string>
    <string>server:app</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$ENGINE</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOGDIR/engine.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/engine.log</string>
</dict>
</plist>
PLIST
  plutil -lint "$PLIST" >/dev/null || die "Invalid launch agent file"
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  ok "Engine starts automatically at login (logs: $LOGDIR/engine.log)"
else
  UNIT="$HOME/.config/systemd/user/kavach-engine.service"
  mkdir -p "$(dirname "$UNIT")"
  systemctl --user stop kavach-engine >/dev/null 2>&1 || true
  port_busy && die "Something is already using port $PORT (probably ./run.sh). Stop it, then run this again."
  cat > "$UNIT" <<UNIT
[Unit]
Description=Kavach local engine
[Service]
WorkingDirectory=$ENGINE
ExecStart=$ENGINE/.venv/bin/uvicorn server:app --host 127.0.0.1 --port $PORT
Restart=always
StandardOutput=append:$LOGDIR/engine.log
StandardError=append:$LOGDIR/engine.log
[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now kavach-engine >/dev/null
  ok "Engine starts automatically at login (logs: $LOGDIR/engine.log)"
fi

# ---------- 5. check ----------
bold "5/5  Checking the engine"
if [ "$AUTOSTART" = 1 ]; then
  for _ in $(seq 1 60); do
    curl -s "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
    sleep 1
  done
  if curl -s "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    ok "Engine running: $(curl -s http://127.0.0.1:$PORT/health)"
  else
    warn "Engine didn't answer yet; see $LOGDIR/engine.log"
  fi
fi

bold "Done! One last step: load the extension"
cat <<STEPS
  Chrome / Edge / Brave:
    1. open  chrome://extensions
    2. turn on "Developer mode" (top right)
    3. click "Load unpacked" and choose:
         $EXT/.output/chrome-mv3
  Firefox:  about:debugging → This Firefox → Load Temporary Add-on → dist/kavach-firefox.zip

  Try it offline at http://127.0.0.1:$PORT/test
STEPS
[ "$OS" = "Darwin" ] && open "$EXT/.output/chrome-mv3" >/dev/null 2>&1 || true
