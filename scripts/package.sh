#!/bin/sh
# Builds a self-contained zip: the static app plus a double-click launcher.
set -e
cd "$(dirname "$0")/.."
npm run build
OUT=release/Playground
rm -rf release && mkdir -p "$OUT"
cp -R dist "$OUT/app"
mkdir -p "$OUT/server"
cp scripts/serve.py "$OUT/server/"
cp -R scripts/applescript "$OUT/server/"
# Keep only what Macs need: the SIMD wasm and the full pose model.
rm -f "$OUT"/app/mediapipe/wasm/vision_wasm_module_internal.* \
      "$OUT"/app/mediapipe/wasm/vision_wasm_nosimd_internal.* \
      "$OUT"/app/models/pose_landmarker_lite.task
cat > "$OUT/Start Playground.command" <<'SH'
#!/bin/sh
# Serves the game locally (the camera needs http://localhost) and opens it
# full-screen in its own Chrome window, with sound allowed and the camera
# pre-approved, so it can be played with no keyboard or mouse. Quit with Cmd+Q.
cd "$(dirname "$0")"
PORT=8765
URL="http://localhost:$PORT/"
python3 server/serve.py $PORT app >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
until curl -s -o /dev/null "$URL"; do sleep 0.3; done
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -x "$CHROME" ]; then
  echo "Playground is running. Press Cmd+Q in the game window to quit."
  "$CHROME" --user-data-dir="${TMPDIR:-/tmp}/playground-chrome" --kiosk --app="$URL" \
    --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream \
    --no-first-run --no-default-browser-check >/dev/null 2>&1
else
  open "$URL"
  echo "Playground is running at $URL (click once in the page for sound)."
  echo "Close this window to stop it."
  wait $SERVER
fi
SH
chmod +x "$OUT/Start Playground.command"
cat > "$OUT/READ ME FIRST.txt" <<'TXT'
PLAYGROUND: motion games for kids and grown-ups, played with your webcam.

HOW TO START
1. Double-click "Start Playground.command".
   The first time, macOS may block it. If so, right-click it, choose Open,
   then click Open again.
2. The game opens full-screen. No keyboard or mouse needed from here.
3. Stand 6-8 feet back so your body is in the picture.
4. Hold your hand on a game to start it. Cross your arms in an X over
   your chest to pause. Press Cmd+Q to quit.

KEYS (for the grown-up)
  Arrow keys  pick a game       Enter   play
  Esc         back to menu      R       restart
  M           mute              F       fullscreen
  D           show the tracking skeleton

Two players can play at once. Everything runs on your Mac; no video
is ever uploaded or saved.

YOUR OWN MUSIC (optional)
Cross your arms to pause, then hold a hand on "My Music On". The game
will play and pause the Mac's Music app (your library or Apple Music),
and Freeze Dance stops your real songs when it's time to freeze. The
first time, macOS asks to let the game control Music; click OK.

Needs: a Mac with a camera, Google Chrome (recommended), and python3
(built in; if macOS offers to install "command line developer tools",
say yes).
TXT
(cd release && ditto -c -k --sequesterRsrc --keepParent Playground Playground.zip)
du -sh release/Playground release/Playground.zip
