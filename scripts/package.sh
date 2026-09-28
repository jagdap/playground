#!/bin/sh
# Builds a self-contained zip: the static app plus a double-click launcher.
set -e
cd "$(dirname "$0")/.."
npm run build
OUT=release/Playground
rm -rf release && mkdir -p "$OUT"
cp -R dist "$OUT/app"
# Keep only what Macs need: the SIMD wasm and the full pose model.
rm -f "$OUT"/app/mediapipe/wasm/vision_wasm_module_internal.* \
      "$OUT"/app/mediapipe/wasm/vision_wasm_nosimd_internal.* \
      "$OUT"/app/models/pose_landmarker_lite.task
cat > "$OUT/Start Playground.command" <<'SH'
#!/bin/sh
# Serves the game locally (the camera needs http://localhost) and opens it in Chrome.
cd "$(dirname "$0")/app"
PORT=8765
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
sleep 1
URL="http://localhost:$PORT/"
open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
echo "Playground is running at $URL"
echo "Close this window to stop it."
wait $SERVER
SH
chmod +x "$OUT/Start Playground.command"
cat > "$OUT/READ ME FIRST.txt" <<'TXT'
PLAYGROUND: motion games for kids and grown-ups, played with your webcam.

HOW TO START
1. Double-click "Start Playground.command".
   The first time, macOS may block it. If so, right-click it, choose Open,
   then click Open again.
2. Chrome opens the game. Click "Allow" when it asks to use the camera.
3. Stand 6-8 feet back so your body is in the picture.

KEYS (for the grown-up)
  Arrow keys  pick a game       Enter   play
  Esc         back to menu      R       restart
  M           mute              F       fullscreen
  D           show the tracking skeleton

Two players can play at once. Everything runs on your Mac; no video
is ever uploaded or saved.

Needs: a Mac with a camera, Google Chrome (recommended), and python3
(built in; if macOS offers to install "command line developer tools",
say yes).
TXT
(cd release && ditto -c -k --sequesterRsrc --keepParent Playground Playground.zip)
du -sh release/Playground release/Playground.zip
