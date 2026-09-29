// Controls the macOS Music app through the local server's /api/music bridge.
// Only available when served by `npm run dev` / console mode / the packaged app on a Mac.
type Status = { state: string; name: string; artist: string };

const KEY = "playground.appleMusic";
const params = new URLSearchParams(location.search);

export class AppleMusic {
  available = false;
  enabled = false;
  status: Status = { state: "stopped", name: "", artist: "" };
  /** Optional playlist to start when nothing is queued (?playlist=Name). */
  playlist = params.get("playlist") ?? "";
  private pollTimer = 0;

  async probe() {
    try {
      const s = await this.call("status");
      this.available = true;
      this.status = s;
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {
        // Storage can be blocked; fall back to the URL flag.
      }
      this.setEnabled(params.get("music") === "apple" || saved === "on");
    } catch {
      this.available = false;
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on && this.available;
    try {
      localStorage.setItem(KEY, this.enabled ? "on" : "off");
    } catch {
      // Not critical.
    }
    clearInterval(this.pollTimer);
    if (this.enabled) this.pollTimer = window.setInterval(() => void this.refresh(), 3000);
  }

  get playing() {
    return this.enabled && this.status.state === "playing";
  }

  play() {
    if (!this.enabled) return;
    this.status.state = "playing";
    void this.send("play", this.playlist ? `?playlist=${encodeURIComponent(this.playlist)}` : "");
  }

  pause() {
    if (!this.enabled) return;
    this.status.state = "paused";
    void this.send("pause");
  }

  next() {
    if (!this.enabled) return;
    void this.send("next");
  }

  private async refresh() {
    try {
      this.status = await this.call("status");
    } catch {
      // Keep the last known status.
    }
  }

  private async send(cmd: string, query = "") {
    try {
      await this.call(cmd, query);
      await this.refresh();
    } catch (err) {
      console.warn("Apple Music command failed", cmd, err);
    }
  }

  private async call(cmd: string, query = ""): Promise<Status> {
    const res = await fetch(`api/music/${cmd}${query}`, { headers: { "X-Playground": "1" } });
    if (!res.ok) throw new Error(`music ${cmd}: ${res.status}`);
    return res.json();
  }
}
