#!/usr/bin/env bash
# Serve the demo on http://localhost:8765 so Chrome remembers the mic permission
# across reloads (it does not, on file://). Once you Allow the first time, Chrome
# will keep the grant for this origin.
#
# Usage:
#   ./serve.sh           # starts on port 8765
#   PORT=9000 ./serve.sh # custom port
#
# Then open: http://localhost:8765
# In Chrome, when prompted for the mic, choose "Allow" (it persists for localhost).
# If you want to revoke later: chrome://settings/content/microphone

set -e
PORT="${PORT:-8765}"
cd "$(dirname "$0")"
echo "─────────────────────────────────────────────"
echo "  The Atelier · local server"
echo "  http://localhost:${PORT}/index.html      (guest)"
echo "  http://localhost:${PORT}/operator.html   (staff)"
echo "─────────────────────────────────────────────"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
