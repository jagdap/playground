import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { AppleMusic } from "./applemusic";
import { Sound } from "./audio";
import { drawDebug } from "./debug";
import { Dwell, type Target } from "./dwell";
import { Fx } from "./fx";
import { bumperBowling } from "./games/bowling";
import { shadowBoxing } from "./games/boxing";
import { bubblePop } from "./games/bubbles";
import { copyThePose } from "./games/copy";
import { freezeDance } from "./games/freeze";
import { homeRun } from "./games/homerun";
import { jumpAndDuck } from "./games/jump";
import { sillyMirror } from "./games/mirror";
import { mirrorPaint } from "./games/paint";
import { chickenParty } from "./games/party";
import { starDance } from "./games/stardance";
import { holeInTheWall } from "./games/wall";
import type { Game, GameContext } from "./games/types";
import { PlayerTracker, type Player } from "./players";
import { createPoseLandmarker } from "./pose";
import { emoji, label, roundRect, UI_FONT, View } from "./view";

// Party games, family games, the grown-up workout, then the tracking demos.
const GAMES: Game[] = [
  sillyMirror(),
  chickenParty(),
  starDance(),
  bumperBowling(),
  homeRun(),
  holeInTheWall(),
  freezeDance(),
  shadowBoxing(),
  bubblePop(),
  jumpAndDuck(),
  copyThePose(),
  mirrorPaint(),
];

const WEBGL_HELP =
  "The body tracker can't use your graphics card (WebGL is off). Quit Chrome completely (Cmd+Q) and reopen it, or check chrome://gpu.";

class App implements GameContext {
  readonly view: View;
  readonly sound = new Sound();
  readonly music = new AppleMusic();
  readonly players = new PlayerTracker();
  readonly fx: Fx;
  private landmarker: PoseLandmarker | null = null;
  private mode: "loading" | "error" | "menu" | "game" = "loading";
  private status = "Starting camera…";
  private selected = 0;
  private game: Game | null = null;
  private score = 0;
  private debug = false;
  private lastVideoTime = -1;
  private lastFrame = performance.now();
  private noPlayersSince = 0;
  private fps = { render: 0, detect: 0, detectMs: 0 };
  private detectCount = 0;
  private fpsWindowStart = performance.now();
  private renderCount = 0;
  private cardRects: Target[] = [];
  // Hands-free controls.
  private menuDwell = new Dwell(1.3);
  // Menu carousel: one row of cards per page, scrolled with edge arrows.
  private page = 0;
  private scroll = 0; // animated page position
  private arrowDwell = new Dwell(0.8);
  private arrowRects: Target[] = [];
  private wheelAccum = 0;
  private wheelUntil = 0;
  private pauseDwell = new Dwell(1.3);
  private lastHover: string | null = null;
  private paused = false;
  private pausedAt = 0;
  private pauseHold = 0;
  private pauseHolder: Player | null = null;
  private pauseRects: (Target & { emoji: string; title: string; color: string })[] = [];
  private nextUnlockTry = 0;
  private detectFailures = 0;

  constructor(private video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.view = new View(canvas, video);
    this.fx = new Fx(() => this.view.unit);
    this.players.onJoin = (p) => {
      this.fx.confetti(p.head.x, p.head.y, 25);
      this.sound.ding();
    };
    addEventListener("keydown", (e) => this.onKey(e));
    canvas.addEventListener("click", (e) => this.onClick(e));
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    requestAnimationFrame((t) => this.frame(t));
  }

  async init() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.view.layout();
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) throw new Error(WEBGL_HELP);
      this.status = "Loading body tracker…";
      void this.music.probe().then(() => this.music.play());
      this.landmarker = await createPoseLandmarker();
      this.mode = "menu";
    } catch (err) {
      console.error(err);
      this.mode = "error";
      const msg = (err as Error).message;
      this.status = msg === WEBGL_HELP ? msg : `Couldn't start: ${msg}. Allow camera access and reload.`;
    }
  }

  addScore(n: number, x: number, y: number) {
    this.score += n;
    this.fx.text(x, y, `+${n}`);
  }

  private startGame(i: number) {
    this.selected = i;
    this.game = GAMES[i];
    this.score = 0;
    this.fx.clear();
    this.mode = "game";
    this.paused = false;
    this.pauseHold = 0;
    if (this.game.ownsMusic) this.music.pause();
    else this.music.play();
    this.game.start(this);
  }

  private toMenu() {
    this.mode = "menu";
    this.game = null;
    this.paused = false;
    this.menuDwell.reset(performance.now() / 1000, 1.5);
    this.page = this.scroll = Math.floor(this.selected / this.perPage);
    this.music.play();
    this.fx.clear();
    speechSynthesis.cancel();
  }

  private onKey(e: KeyboardEvent) {
    this.sound.unlock();
    const k = e.key.toLowerCase();
    if (this.mode === "game" && !this.paused && this.game?.onKey?.(k)) {
      e.preventDefault();
      return;
    }
    if (k === "d") this.debug = !this.debug;
    else if (k === "m") {
      this.sound.muted = !this.sound.muted;
      if (this.sound.muted) speechSynthesis.cancel();
    } else if (k === "f") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } else if (k === "escape") this.toMenu();
    else if (k === "p" && this.mode === "game") this.paused ? this.resume() : this.pause();
    else if (this.mode === "menu") {
      const n = GAMES.length;
      if (k === "arrowright") this.select((this.selected + 1) % n);
      else if (k === "arrowleft") this.select((this.selected + n - 1) % n);
      else if (k === "arrowdown" || k === "pagedown") this.goPage(this.page + 1);
      else if (k === "arrowup" || k === "pageup") this.goPage(this.page - 1);
      else if (k === "enter" || k === " ") this.startGame(this.selected);
      else if (k.length === 1 && k >= "1" && k <= String(Math.min(n, 9))) this.startGame(Number(k) - 1);
    } else if (this.mode === "game" && k === "r") this.startGame(this.selected);
    else return;
    e.preventDefault();
  }

  private select(i: number) {
    this.selected = i;
    this.page = Math.floor(i / this.perPage); // keyboard selection scrolls the carousel
    this.sound.say(GAMES[i].title);
  }

  private get perPage() {
    const { W, H } = this.view;
    return W > H * 1.2 ? 4 : 2;
  }

  private get pages() {
    return Math.ceil(GAMES.length / this.perPage);
  }

  private goPage(p: number) {
    const next = Math.max(0, Math.min(this.pages - 1, p));
    if (next === this.page) return;
    this.page = next;
    this.selected = next * this.perPage;
    this.sound.whoosh();
    // Don't let a hand that was resting on a card pick it mid-slide.
    this.menuDwell.reset(performance.now() / 1000, 0.6);
  }

  private onClick(e: MouseEvent) {
    this.sound.unlock();
    if (this.mode !== "menu") return;
    const at = (r: Target) => e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h;
    const arrow = this.arrowRects.find(at);
    if (arrow) return this.goPage(this.page + (arrow.id === "next" ? 1 : -1));
    const card = this.cardRects.find(at);
    if (card) this.startGame(Number(card.id));
  }

  // Trackpad / mouse wheel: one page per swipe.
  private onWheel(e: WheelEvent) {
    if (this.mode !== "menu") return;
    e.preventDefault();
    const now = performance.now();
    if (now < this.wheelUntil) return;
    this.wheelAccum += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(this.wheelAccum) < 60) return;
    this.goPage(this.page + Math.sign(this.wheelAccum));
    this.wheelAccum = 0;
    this.wheelUntil = now + 450;
  }

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const t = now / 1000;

    this.detect(now, t);
    this.tryUnlockAudio(t);
    if (this.mode === "menu") this.updateMenu(dt, t);
    else if (this.mode === "game" && this.game) {
      if (this.paused) this.updatePause(dt, t);
      else {
        this.game.update(dt, t);
        this.updatePauseGesture(dt, t);
      }
    }
    this.fx.update(dt);
    this.render(t);

    this.renderCount++;
    if (now - this.fpsWindowStart > 1000) {
      const s = (now - this.fpsWindowStart) / 1000;
      this.fps.render = Math.round(this.renderCount / s);
      this.fps.detect = Math.round(this.detectCount / s);
      this.renderCount = this.detectCount = 0;
      this.fpsWindowStart = now;
    }
  }

  private get hands() {
    return this.players.active.flatMap((p) => p.hands).filter((h) => h.v > 0.4);
  }

  /** Browsers block sound until a click/keypress, unless launched in console mode. */
  private tryUnlockAudio(t: number) {
    if (!this.sound.locked || t < this.nextUnlockTry) return;
    this.nextUnlockTry = t + 1;
    this.sound.unlock();
  }

  private updateMenu(dt: number, t: number) {
    this.page = Math.min(this.page, this.pages - 1); // e.g. after a resize
    this.scroll += (this.page - this.scroll) * Math.min(1, dt * 8);
    const arrow = this.arrowDwell.update(this.arrowRects, this.hands, dt, t);
    if (arrow) this.goPage(this.page + (arrow === "next" ? 1 : -1));
    if (Math.abs(this.scroll - this.page) > 0.03) return; // cards only react once settled
    const hit = this.menuDwell.update(this.cardRects, this.hands, dt, t);
    const hover = this.menuDwell.hovered;
    if (hover && hover !== this.lastHover) this.select(Number(hover));
    this.lastHover = hover;
    if (hit) this.startGame(Number(hit));
  }

  // Pause gesture: cross your arms in an X over your chest and hold.
  private crossed(p: Player) {
    const { handL: l, handR: r, shoulderMid: s, hipMid, torso: T } = p;
    if (l.v < 0.4 || r.v < 0.4) return false;
    const chest = (h: typeof l) => h.y > s.y - 0.4 * T && h.y < hipMid.y + 0.2 * T && Math.abs(h.x - s.x) < T;
    return l.x > r.x + 0.2 * T && chest(l) && chest(r);
  }

  private updatePauseGesture(dt: number, t: number) {
    const who = this.players.active.find((p) => this.crossed(p)) ?? null;
    if (who) {
      this.pauseHolder = who;
      this.pauseHold += dt;
    } else this.pauseHold = Math.max(0, this.pauseHold - dt * 2);
    if (this.pauseHold >= 1.2) this.pause(t);
  }

  private pause(t = performance.now() / 1000) {
    this.paused = true;
    this.pausedAt = t;
    this.pauseHold = 0;
    this.pauseDwell.reset(t, 1);
    this.sound.whoosh();
    this.sound.say("Paused. Hold your hand on a button.");
  }

  private resume() {
    this.paused = false;
    const pausedFor = performance.now() / 1000 - this.pausedAt;
    this.game?.resume?.(pausedFor);
    this.sound.say("Let's go!");
  }

  private updatePause(dt: number, t: number) {
    const hit = this.pauseDwell.update(this.pauseRects, this.hands, dt, t);
    if (!hit) return;
    this.sound.ding();
    if (hit === "resume") this.resume();
    else if (hit === "restart") this.startGame(this.selected);
    else if (hit === "next") {
      this.paused = false;
      this.game?.next?.();
    } else if (hit === "sound") {
      this.sound.muted = !this.sound.muted;
      if (this.sound.muted) speechSynthesis.cancel();
      else this.sound.say("Sound on!");
    } else if (hit === "apple") {
      this.music.setEnabled(!this.music.enabled);
      if (!this.music.enabled) this.music.pause();
      this.sound.say(this.music.enabled ? "Apple Music on!" : "Apple Music off.");
    } else if (hit === "song") this.music.next();
    else if (hit === "menu") this.toMenu();
  }

  private detect(now: number, t: number) {
    const lm = this.landmarker;
    if (!lm || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    const t0 = performance.now();
    let res;
    try {
      res = lm.detectForVideo(this.video, now);
      this.detectFailures = 0;
    } catch (err) {
      // Don't let a tracker crash freeze the screen; give up with a clear message.
      console.error(err);
      if (++this.detectFailures >= 10) {
        this.landmarker = null;
        this.mode = "error";
        this.status = WEBGL_HELP;
      }
      return;
    }
    this.fps.detectMs = performance.now() - t0;
    this.detectCount++;
    this.players.update(res.landmarks, this.view, t);
  }

  private render(t: number) {
    const { g, W, H, unit } = this.view;
    this.view.drawVideo(this.mode === "game" ? 0.1 : 0.45);

    if (this.mode === "loading" || this.mode === "error") {
      label(g, "🎈 Playground", W / 2, H * 0.42, 72 * unit);
      label(g, this.status, W / 2, H * 0.55, 28 * unit, this.mode === "error" ? "#ff8a8a" : "#fff");
    } else if (this.mode === "menu") {
      this.drawMenu(t);
    } else if (this.game) {
      this.game.draw(g);
      if (this.paused) this.drawPause(t);
      else {
        if (!this.game.hideHands) this.drawHands();
        if (this.game.usesScore) this.drawScore();
        this.drawStepIn(t);
        this.drawPauseHold();
        g.globalAlpha = 0.6;
        label(g, "✖ Cross your arms to pause", W - 16 * unit, H - 20 * unit, 18 * unit, "#fff", "right");
        g.globalAlpha = 1;
      }
    }
    if (this.mode !== "loading" && this.mode !== "error" && this.sound.locked)
      label(g, "🔈 Click once for sound", W - 16 * unit, 40 * unit, 20 * unit, "#fff", "right");

    this.fx.draw(g);
    this.drawPlayerBadges();
    if (this.music.playing && this.mode !== "loading") {
      const { name, artist } = this.music.status;
      g.globalAlpha = 0.75;
      label(g, `🎵 ${name}${artist ? ` · ${artist}` : ""}`, W / 2, 104 * unit, 18 * unit);
      g.globalAlpha = 1;
    }
    if (this.debug) drawDebug(g, this.view, this.players, this.fps);
  }

  private drawMenu(t: number) {
    const { g, W, H, unit } = this.view;
    label(g, "🎈 Playground", W / 2, H * 0.14, 80 * unit);

    const n = GAMES.length;
    const per = this.perPage;
    const pages = this.pages;
    const edge = 120 * unit; // room for the arrows
    const gap = 28 * unit;
    const cw = Math.min((W - 2 * edge - gap * (per - 1)) / per, (H * 0.55) / 1.1, 330 * unit);
    const ch = cw * 1.1;
    const cy = H * 0.52;
    const settled = Math.abs(this.scroll - this.page) <= 0.03;

    // Cards slide sideways a whole screen per page.
    this.cardRects = [];
    GAMES.forEach((game, i) => {
      const pg = Math.floor(i / per);
      const inRow = Math.min(per, n - pg * per);
      const rowW = inRow * cw + (inRow - 1) * gap;
      const x = W / 2 + (pg - this.scroll) * W - rowW / 2 + (i % per) * (cw + gap);
      if (x > W || x + cw < 0) return;
      const r = { id: String(i), x, y: cy - ch / 2, w: cw, h: ch };
      this.drawCard(r, game.emoji, game.title, game.color, i === this.selected, this.menuDwell.fraction(r.id), t);
      if (settled && pg === this.page) this.cardRects.push(r);
    });

    // Edge arrows (hold a hand on one to scroll). Tall targets so they're easy to reach.
    this.arrowRects = [];
    for (const [id, show, x] of [["prev", this.page > 0, edge / 2], ["next", this.page < pages - 1, W - edge / 2]] as const) {
      if (!show) continue;
      const r = { id, x: x - edge / 2, y: cy - ch / 2, w: edge, h: ch };
      this.arrowRects.push(r);
      const hot = this.arrowDwell.hovered === id;
      const R = 52 * unit * (hot ? 1.12 : 1) * (1 + 0.04 * Math.sin(t * 4));
      g.fillStyle = hot ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)";
      g.beginPath();
      g.arc(x, cy, R, 0, Math.PI * 2);
      g.fill();
      label(g, id === "next" ? "▶" : "◀", x, cy, 48 * unit);
      const f = this.arrowDwell.fraction(id);
      if (f > 0) {
        g.lineWidth = 10 * unit;
        g.lineCap = "round";
        g.strokeStyle = "#fff";
        g.beginPath();
        g.arc(x, cy, R + 12 * unit, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
        g.stroke();
      }
    }

    // Page dots.
    if (pages > 1)
      for (let p = 0; p < pages; p++) {
        g.fillStyle = p === this.page ? "#fff" : "rgba(255,255,255,0.35)";
        g.beginPath();
        g.arc(W / 2 + (p - (pages - 1) / 2) * 30 * unit, cy + ch / 2 + 50 * unit, (p === this.page ? 9 : 7) * unit, 0, Math.PI * 2);
        g.fill();
      }

    this.drawHands();
    g.globalAlpha = 0.8;
    label(g, "Hold your hand on a game to play! ✋", W / 2, H - 34 * unit, 30 * unit);
    g.globalAlpha = 1;
  }

  private drawCard(r: Target, icon: string, title: string, color: string, selected: boolean, fill: number, t: number) {
    const { g, unit } = this.view;
    const s = selected ? 1.1 + 0.02 * Math.sin(t * 5) : 1;
    g.save();
    g.translate(r.x + r.w / 2, r.y + r.h / 2);
    g.scale(s, s);
    roundRect(g, -r.w / 2, -r.h / 2, r.w, r.h, 32 * unit);
    g.fillStyle = color;
    g.globalAlpha = selected ? 1 : 0.8;
    g.fill();
    g.globalAlpha = 1;
    if (selected) {
      g.lineWidth = 8 * unit;
      g.strokeStyle = "#fff";
      g.stroke();
    }
    emoji(g, icon, 0, -r.h * 0.1, Math.min(r.w, r.h) * 0.42);
    label(g, title, 0, r.h * 0.32, Math.min(30 * unit, r.w * 0.13));
    if (fill > 0) {
      // Dwell ring fills while a hand holds on the card.
      g.lineWidth = 14 * unit;
      g.lineCap = "round";
      g.strokeStyle = "#fff";
      g.beginPath();
      g.arc(0, -r.h * 0.1, Math.min(r.w, r.h) * 0.33, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  private drawPause(t: number) {
    const { g, W, H, unit } = this.view;
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, 0, W, H);
    label(g, "⏸ Paused", W / 2, H * 0.2, 80 * unit);

    const buttons = [
      { id: "resume", emoji: "▶️", title: "Keep Playing", color: "#7cd67a" },
      { id: "restart", emoji: "🔄", title: "Start Over", color: "#4cc3ff" },
      ...(this.game?.next ? [{ id: "next", emoji: "⏭️", title: "Next", color: "#b388ff" }] : []),
      { id: "sound", emoji: this.sound.muted ? "🔇" : "🔊", title: this.sound.muted ? "Sound On" : "Sound Off", color: "#ffb347" },
      ...(this.music.available
        ? [{ id: "apple", emoji: "🎵", title: this.music.enabled ? "My Music Off" : "My Music On", color: "#fc5c7d" }]
        : []),
      ...(this.music.enabled && !this.game?.ownsMusic ? [{ id: "song", emoji: "⏩", title: "Next Song", color: "#6a82fb" }] : []),
      { id: "menu", emoji: "🏠", title: "All Games", color: "#ff6fb5" },
    ];
    const gap = 24 * unit;
    const w = Math.min(230 * unit, (W - gap * (buttons.length + 1)) / buttons.length);
    const h = w * 1.1;
    const x0 = (W - (buttons.length * w + (buttons.length - 1) * gap)) / 2;
    this.pauseRects = buttons.map((b, i) => ({ ...b, x: x0 + i * (w + gap), y: H * 0.52 - h / 2, w, h }));
    for (const r of this.pauseRects)
      this.drawCard(r, r.emoji, r.title, r.color, this.pauseDwell.hovered === r.id, this.pauseDwell.fraction(r.id), t);
    this.drawHands();
  }

  private drawPauseHold() {
    const p = this.pauseHolder;
    if (!p || this.pauseHold < 0.15) return;
    const { g, unit } = this.view;
    const x = p.shoulderMid.x;
    const y = p.shoulderMid.y + 0.4 * p.torso;
    g.lineWidth = 12 * unit;
    g.lineCap = "round";
    g.strokeStyle = "#fff";
    g.beginPath();
    g.arc(x, y, 60 * unit, -Math.PI / 2, -Math.PI / 2 + Math.min(1, this.pauseHold / 1.2) * Math.PI * 2);
    g.stroke();
    label(g, "⏸", x, y, 50 * unit);
  }

  private drawHands() {
    const { g, unit } = this.view;
    for (const p of this.players.active)
      for (const h of p.hands) {
        if (h.v < 0.4) continue;
        g.lineWidth = 6 * unit;
        g.strokeStyle = p.color;
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.beginPath();
        g.arc(h.x, h.y, 22 * unit, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
  }

  private drawScore() {
    const { g, W, unit } = this.view;
    const text = `⭐ ${this.score}`;
    g.font = `800 ${46 * unit}px ${UI_FONT}`;
    const w = g.measureText(text).width + 48 * unit;
    roundRect(g, W / 2 - w / 2, 16 * unit, w, 70 * unit, 35 * unit);
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fill();
    label(g, text, W / 2, 52 * unit, 46 * unit, "#ffd23f");
  }

  private drawStepIn(t: number) {
    const { g, W, H, unit } = this.view;
    if (this.players.active.length) {
      this.noPlayersSince = t;
      return;
    }
    if (t - this.noPlayersSince > 1.5) label(g, "Step into the picture! 👋", W / 2, H / 2, 60 * unit);
  }

  private drawPlayerBadges() {
    const { g, unit } = this.view;
    if (this.mode === "loading" || this.mode === "error") return;
    this.players.all.forEach((p, i) => {
      const x = 20 * unit + i * 80 * unit;
      const y = 20 * unit;
      roundRect(g, x, y, 68 * unit, 40 * unit, 20 * unit);
      g.fillStyle = p.present ? p.color : "rgba(255,255,255,0.2)";
      g.fill();
      label(g, p.name, x + 34 * unit, y + 20 * unit, 22 * unit);
    });
  }
}

const app = new App(document.getElementById("video") as HTMLVideoElement, document.getElementById("canvas") as HTMLCanvasElement);
void app.init();
