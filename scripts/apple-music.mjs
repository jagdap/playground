// Local-only bridge from the browser to the macOS Music app, via fixed AppleScripts.
// GET /api/music/{status|play|pause|next}[?playlist=Name]
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "applescript");
const COMMANDS = new Set(["status", "play", "pause", "next"]);

export function handleMusic(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const cmd = url.pathname.replace(/^\/+/, "");
  // A custom header can't be sent cross-origin without CORS, so other websites
  // can't poke this endpoint.
  if (process.platform !== "darwin" || !COMMANDS.has(cmd) || req.headers["x-playground"] !== "1") {
    res.statusCode = 404;
    return res.end();
  }
  const args = [path.join(DIR, `${cmd}.applescript`)];
  if (cmd === "play") args.push(url.searchParams.get("playlist") ?? "");
  execFile("osascript", args, { timeout: 30000 }, (err, stdout) => {
    res.setHeader("Content-Type", "application/json");
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: String(err.message).slice(0, 200) }));
    }
    const [state, name = "", artist = ""] = stdout.trim().split("\n");
    res.end(JSON.stringify({ state, name, artist }));
  });
}
