"""Static server for the packaged app, plus the same local Apple Music bridge
as the dev server (GET /api/music/{status|play|pause|next}). Usage:
    python3 serve.py PORT APP_DIR
"""
import functools, http.server, json, os, subprocess, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "applescript")
COMMANDS = {"status", "play", "pause", "next"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if not url.path.startswith("/api/music/"):
            return super().do_GET()
        cmd = url.path[len("/api/music/"):]
        if sys.platform != "darwin" or cmd not in COMMANDS or self.headers.get("X-Playground") != "1":
            return self.send_error(404)
        args = ["osascript", os.path.join(SCRIPTS, cmd + ".applescript")]
        if cmd == "play":
            args.append(urllib.parse.parse_qs(url.query).get("playlist", [""])[0])
        try:
            out = subprocess.run(args, capture_output=True, text=True, timeout=30, check=True).stdout
            state, name, artist = (out.strip().split("\n") + ["", ""])[:3]
            body, code = {"state": state, "name": name, "artist": artist}, 200
        except Exception as e:  # noqa: BLE001 - report any failure to the page
            body, code = {"error": str(e)[:200]}, 500
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port, root = int(sys.argv[1]), sys.argv[2]
    handler = functools.partial(Handler, directory=root)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
