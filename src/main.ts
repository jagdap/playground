import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { Sound } from "./audio";
import { drawDebug } from "./debug";
import { Fx } from "./fx";
import { bubblePop } from "./games/bubbles";
import { copyThePose } from "./games/copy";
import { jumpAndDuck } from "./games/jump";
import { mirrorPaint } from "./games/paint";
import type { Game, GameContext } from "./games/types";
import { PlayerTracker } from "./players";
import { createPoseLandmarker } from "./pose";
import { emoji, label, roundRect, UI_FONT, View } from "./view";

const GAMES: Game[] = [bubblePop(), jumpAndDuck(), copyThePose(), mirrorPaint()];

class App implements GameContext {
  readonly view: View;
  readonly sound = new Sound();
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
  private cardRects: DOMRect[] = [];

  constructor(private video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.view = new View(canvas, video);
    this.fx = new Fx(() => this.view.unit);
    this.players.onJoin = (p) => {
      this.fx.confetti(p.head.x, p.head.y, 25);
      this.sound.ding();
    };
    addEventListener("keydown", (e) => this.onKey(e));
    canvas.addEventListener("click", (e) => this.onClick(e));
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
      this.status = "Loading body tracker…";
      this.landmarker = await createPoseLandmarker();
      this.mode = "menu";
    } catch (err) {
      console.error(err);
      this.mode = "error";
      this.status = `Couldn't start: ${(err as Error).message}. Allow camera access and reload.`;
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
    this.game.start(this);
  }

  private toMenu() {
    this.mode = "menu";
    this.game = null;
    this.fx.clear();
    speechSynthesis.cancel();
  }

  private onKey(e: KeyboardEvent) {
    this.sound.unlock();
    const k = e.key.toLowerCase();
    if (k === "d") this.debug = !this.debug;
    else if (k === "m") {
      this.sound.muted = !this.sound.muted;
      if (this.sound.muted) speechSynthesis.cancel();
    } else if (k === "f") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } else if (k === "escape") this.toMenu();
    else if (this.mode === "menu") {
      const n = GAMES.length;
      if (k === "arrowright" || k === "arrowdown") this.select((this.selected + 1) % n);
      else if (k === "arrowleft" || k === "arrowup") this.select((this.selected + n - 1) % n);
      else if (k === "enter" || k === " ") this.startGame(this.selected);
      else if (k >= "1" && k <= String(n)) this.startGame(Number(k) - 1);
    } else if (this.mode === "game" && k === "r") this.startGame(this.selected);
    else return;
    e.preventDefault();
  }

  private select(i: number) {
    this.selected = i;
    this.sound.say(GAMES[i].title);
  }

  private onClick(e: MouseEvent) {
    this.sound.unlock();
    if (this.mode !== "menu") return;
    const i = this.cardRects.findIndex((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    if (i >= 0) this.startGame(i);
  }

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const t = now / 1000;

    this.detect(now, t);
    if (this.mode === "game" && this.game) this.game.update(dt, t);
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

  private detect(now: number, t: number) {
    const lm = this.landmarker;
    if (!lm || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    const t0 = performance.now();
    const res = lm.detectForVideo(this.video, now);
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
      if (!this.game.hideHands) this.drawHands();
      if (this.game.usesScore) this.drawScore();
      this.drawStepIn(t);
      g.globalAlpha = 0.6;
      label(g, "Esc menu · R restart", W - 16 * unit, H - 20 * unit, 18 * unit, "#fff", "right");
      g.globalAlpha = 1;
    }

    this.fx.draw(g);
    this.drawPlayerBadges();
    if (this.debug) drawDebug(g, this.view, this.players, this.fps);
  }

  private drawMenu(t: number) {
    const { g, W, H, unit } = this.view;
    label(g, "🎈 Playground", W / 2, H * 0.14, 80 * unit);

    const n = GAMES.length;
    const cols = W > H * 1.2 ? n : 2;
    const rows = Math.ceil(n / cols);
    const gap = 28 * unit;
    const cw = Math.min((W - gap * (cols + 1)) / cols, 280 * unit);
    const ch = cw * 1.1;
    const totalW = cols * cw + (cols - 1) * gap;
    const totalH = rows * ch + (rows - 1) * gap;
    const x0 = (W - totalW) / 2;
    const y0 = H * 0.55 - totalH / 2;

    this.cardRects = GAMES.map((game, i) => {
      const x = x0 + (i % cols) * (cw + gap);
      const y = y0 + Math.floor(i / cols) * (ch + gap);
      const sel = i === this.selected;
      const s = sel ? 1.1 + 0.02 * Math.sin(t * 5) : 1;
      g.save();
      g.translate(x + cw / 2, y + ch / 2);
      g.scale(s, s);
      roundRect(g, -cw / 2, -ch / 2, cw, ch, 32 * unit);
      g.fillStyle = game.color;
      g.globalAlpha = sel ? 1 : 0.8;
      g.fill();
      g.globalAlpha = 1;
      if (sel) {
        g.lineWidth = 8 * unit;
        g.strokeStyle = "#fff";
        g.stroke();
      }
      emoji(g, game.emoji, 0, -ch * 0.1, cw * 0.45);
      label(g, game.title, 0, ch * 0.32, 30 * unit);
      g.restore();
      return new DOMRect(x, y, cw, ch);
    });

    this.drawHands();
    g.globalAlpha = 0.8;
    label(g, "← → pick   Enter play   Esc menu   D debug   M mute   F fullscreen", W / 2, H - 30 * unit, 20 * unit);
    g.globalAlpha = 1;
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
