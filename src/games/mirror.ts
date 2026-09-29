import { LM, dist, type Player } from "../players";
import { emoji, label } from "../view";
import { rand, type Game, type GameContext } from "./types";

// Silly AR filters: no rules, no score.
// ← → or a clap switches filters.
type Filter = { name: string; say: string; start?(): void; update?(dt: number, t: number): void; draw(g: CanvasRenderingContext2D, t: number): void };

type Flame = { x: number; y: number; vx: number; vy: number; life: number; size: number };

export function sillyMirror(): Game {
  let ctx: GameContext;
  let index = 0;
  let bannerUntil = 0;
  let lastClap = 0;
  let now = 0;

  // Twin: ring buffer of small delayed camera frames.
  const frames: { c: HTMLCanvasElement; t: number }[] = [];
  let frameHead = 0;
  // Dragon fire and magic sparkles.
  let flames: Flame[] = [];
  // Per-player picks and state.
  const ANIMALS = ["🐱", "🐶", "🐯", "🐸", "🐵", "🐼", "🦁", "🐰"];
  let animals: string[] = [];
  let lifted = new Map<number, boolean>();
  const scratch = document.createElement("canvas");

  const players = () => ctx.players.active;
  const mouth = (p: Player) => {
    const a = p.pts[LM.mouthL];
    const b = p.pts[LM.mouthR];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const eyes = (p: Player) => {
    const a = p.pts[LM.lEye];
    const b = p.pts[LM.rEye];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: dist(a, b) };
  };

  const FILTERS: Filter[] = [
    {
      name: "Twins",
      say: "Look! You have a twin! Can you catch them?",
      update(_dt, t) {
        const video = ctx.view.video;
        if (!video.videoWidth) return;
        const f = frames[frameHead] ?? { c: document.createElement("canvas"), t: 0 };
        f.c.width = 320;
        f.c.height = Math.round((320 * video.videoHeight) / video.videoWidth);
        f.c.getContext("2d")!.drawImage(video, 0, 0, f.c.width, f.c.height);
        f.t = t;
        frames[frameHead] = f;
        frameHead = (frameHead + 1) % 90;
      },
      draw(g, t) {
        // Show the frame from ~1s ago, color-shifted and offset to the side.
        let best: (typeof frames)[number] | null = null;
        for (const f of frames) if (f.t <= t - 1 && (!best || f.t > best.t)) best = f;
        if (!best) return;
        g.save();
        g.globalAlpha = 0.55;
        g.filter = "hue-rotate(160deg) saturate(2)";
        ctx.view.drawMirrored(best.c, ctx.view.W * 0.22);
        g.restore();
      },
    },
    {
      name: "Animal Faces",
      say: "You're an animal! Meow! Woof!",
      start() {
        animals = [0, 1].map(() => ANIMALS[Math.floor(Math.random() * ANIMALS.length)]);
      },
      draw(g) {
        for (const p of players()) emoji(g, animals[p.id], p.head.x, p.head.y, p.headR * 2.6);
      },
    },
    {
      name: "Big Head",
      say: "Whoa! Big head!",
      draw(g) {
        const dpr = ctx.view.pixelRatio;
        for (const p of players()) {
          const r = p.headR * 1.35;
          const sx = (p.head.x - r) * dpr;
          const sy = (p.head.y - r * 1.1) * dpr;
          scratch.width = Math.max(1, Math.round(2 * r * dpr));
          scratch.height = scratch.width;
          scratch.getContext("2d")!.drawImage(g.canvas, sx, sy, scratch.width, scratch.height, 0, 0, scratch.width, scratch.height);
          const R = r * 1.9;
          g.save();
          g.beginPath();
          g.arc(p.head.x, p.head.y - r * 0.6, R, 0, Math.PI * 2);
          g.clip();
          g.drawImage(scratch, p.head.x - R, p.head.y - r * 0.6 - R, R * 2, R * 2);
          g.restore();
        }
      },
    },
    {
      name: "Dragon",
      say: "Roar like a dragon! Put your arms up to breathe fire!",
      start() {
        flames = [];
      },
      update(dt) {
        const u = ctx.view.unit;
        for (const p of players()) {
          const armsUp = p.handL.y < p.head.y && p.handR.y < p.head.y;
          if (!armsUp) continue;
          const m = mouth(p);
          for (let i = 0; i < 4; i++) {
            const a = rand(Math.PI * 0.25, Math.PI * 0.75); // downward cone toward the viewer
            const s = rand(250, 500) * u;
            flames.push({ x: m.x, y: m.y, vx: Math.cos(a) * s * 0.8, vy: Math.sin(a) * s * 0.6, life: 1, size: p.headR * 0.4 });
          }
        }
        for (const f of flames) {
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.life -= dt * 1.4;
          f.size *= 1 + dt * 1.8;
        }
        flames = flames.filter((f) => f.life > 0);
      },
      draw(g) {
        g.save();
        g.globalCompositeOperation = "lighter";
        for (const f of flames) {
          const hue = 50 * f.life; // yellow -> red
          g.fillStyle = `hsla(${hue} 100% 55% / ${f.life * 0.6})`;
          g.beginPath();
          g.arc(f.x, f.y, f.size, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      },
    },
    {
      name: "Royal Party",
      say: "You're a king! You're a queen!",
      draw(g) {
        for (const p of players()) {
          const e = eyes(p);
          const r = p.headR;
          emoji(g, "👑", p.head.x, p.head.y - r * 1.25, r * 1.4);
          emoji(g, "🕶️", e.x, e.y + r * 0.05, Math.max(e.w * 3.2, r * 1.2));
          g.fillStyle = "#ff2d2d";
          g.beginPath();
          g.arc(p.head.x, p.head.y + r * 0.08, r * 0.2, 0, Math.PI * 2);
          g.fill();
        }
      },
    },
    {
      name: "Super Strong",
      say: "Lift the big weights up high!",
      start() {
        lifted = new Map();
      },
      update() {
        for (const p of players()) {
          const up = p.handL.y < p.head.y && p.handR.y < p.head.y;
          if (up && !lifted.get(p.id)) {
            ctx.fx.stars((p.handL.x + p.handR.x) / 2, p.head.y - p.headR * 2, 10);
            ctx.sound.cheer();
            ctx.sound.say("So strong!");
          }
          lifted.set(p.id, up);
        }
      },
      draw(g) {
        const u = ctx.view.unit;
        for (const p of players()) {
          if (p.handL.v < 0.3 || p.handR.v < 0.3) continue;
          const dx = p.handR.x - p.handL.x;
          const dy = p.handR.y - p.handL.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const ext = 70 * u;
          g.lineCap = "round";
          g.strokeStyle = "#d8d8d8";
          g.lineWidth = 14 * u;
          g.beginPath();
          g.moveTo(p.handL.x - ux * ext, p.handL.y - uy * ext);
          g.lineTo(p.handR.x + ux * ext, p.handR.y + uy * ext);
          g.stroke();
          for (const [h, s] of [[p.handL, -1], [p.handR, 1]] as const) {
            g.fillStyle = "#333";
            g.beginPath();
            g.arc(h.x + ux * ext * 0.7 * s, h.y + uy * ext * 0.7 * s, 45 * u, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#666";
            g.beginPath();
            g.arc(h.x + ux * ext * 0.7 * s, h.y + uy * ext * 0.7 * s, 16 * u, 0, Math.PI * 2);
            g.fill();
          }
        }
      },
    },
    {
      name: "Magic Hands",
      say: "You have magic hands! Wave them around!",
      update() {
        for (const p of players())
          p.hands.forEach((h, i) => {
            const v = p.vels[i];
            if (h.v > 0.4 && Math.hypot(v.x, v.y) > 150) ctx.fx.burst(h.x, h.y, `hsl(${(now * 120 + i * 90) % 360} 100% 65%)`, 3);
          });
      },
      draw() {},
    },
  ];

  const choose = (i: number) => {
    index = (i + FILTERS.length) % FILTERS.length;
    FILTERS[index].start?.();
    bannerUntil = now + 2.5;
    ctx.sound.whoosh();
    ctx.sound.say(FILTERS[index].say);
  };

  return {
    title: "Silly Mirror",
    emoji: "🪞",
    color: "#ff6fb5",
    usesScore: false,
    hideHands: true,

    start(c) {
      ctx = c;
      now = performance.now() / 1000;
      lastClap = now;
      frames.length = 0;
      choose(0);
    },

    update(dt, t) {
      now = t;
      // A clap from anyone switches to the next filter.
      const clap = Math.max(...players().map((p) => p.lastClapT), -1e9);
      if (clap > lastClap + 1) {
        lastClap = clap;
        choose(index + 1);
      }
      FILTERS[index].update?.(dt, t);
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      FILTERS[index].draw(g, now);
      if (now < bannerUntil) label(g, FILTERS[index].name, W / 2, H * 0.12, 64 * unit, "#fff");
      g.globalAlpha = 0.7;
      label(g, "← → change filter · clap to switch", W / 2, H - 24 * unit, 20 * unit);
      g.globalAlpha = 1;
    },

    next() {
      choose(index + 1);
    },

    onKey(k) {
      if (k === "arrowright") choose(index + 1);
      else if (k === "arrowleft") choose(index - 1);
      else return false;
      return true;
    },
  };
}
