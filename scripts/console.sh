#!/bin/sh
# "Console mode": runs the dev server and opens Playground full-screen in its own
# Chrome window with sound allowed and the camera pre-approved, so no keyboard or
# mouse is needed. Quit with Cmd+Q.
cd "$(dirname "$0")/.."
PORT=5173
URL="http://localhost:$PORT/"
if ! curl -s -o /dev/null "$URL"; then
  npx vite --port $PORT --strictPort >/dev/null 2>&1 &
  VITE=$!
  trap 'kill $VITE 2>/dev/null' EXIT INT TERM
  until curl -s -o /dev/null "$URL"; do sleep 0.3; done
fi
exec_chrome() {
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --user-data-dir="${TMPDIR:-/tmp}/playground-chrome" \
    --kiosk --app="$URL" \
    --autoplay-policy=no-user-gesture-required \
    --use-fake-ui-for-media-stream \
    --no-first-run --no-default-browser-check "$@"
}
exec_chrome >/dev/null 2>&1
