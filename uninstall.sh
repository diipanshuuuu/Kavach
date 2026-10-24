#!/usr/bin/env bash
# Stop the Kavach engine and remove its autostart. Your files, the Python
# environment and the downloaded models are left in place.
set -uo pipefail
LABEL="com.kavach.engine"

if [ "$(uname -s)" = "Darwin" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && echo "✓ Engine stopped"
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" && echo "✓ Autostart removed"
else
  systemctl --user disable --now kavach-engine >/dev/null 2>&1 && echo "✓ Engine stopped"
  rm -f "$HOME/.config/systemd/user/kavach-engine.service" && systemctl --user daemon-reload && echo "✓ Autostart removed"
fi
echo "To remove the extension: chrome://extensions → Kavach → Remove"
echo "To free disk space too: rm -rf engine/.venv engine/models dist"
