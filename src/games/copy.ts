import { praise } from "../audio";
import { dist, type Player, type Pt } from "../players";
import { label, roundRect } from "../view";
import type { Game, GameContext } from "./types";

// Tests: reading static body shapes from joint positions.
export type Figure = Record<
  "head" | "shL" | "shR" | "elL" | "elR" | "hL" | "hR" | "hipL" | "hipR" | "knL" | "knR" | "ftL" | "ftR",
  [number, number]
>;

// Stick-figure layout in torso units (y down), as seen on screen.
export const BASE: Figure = {
  head: [0, -1.55], shL: [-0.45, -1], shR: [0.45, -1],
  elL: [-0.6, -0.4], elR: [0.6, -0.4], hL: [-0.6, 0.2], hR: [0.6, 0.2],
  hipL: [-0.3, 0], hipR: [0.3, 0], knL: [-0.35, 0.9], knR: [0.35, 0.9], ftL: [-0.35, 1.8], ftR: [0.35, 1.8],
};

type PoseDef = { name: string; say: string; figure: Partial<Figure>; check: (p: Player) => boolean };

const ok = (h: Pt) => h.v > 0.3;
const up = (p: Player, h: Pt) => ok(h) && h.y < p.head.y;
const down = (p: Player, h: Pt) => ok(h) && h.y > p.shoulderMid.y + 0.3 * p.torso;
const out = (p: Player, h: Pt, k: number) => Math.abs(h.x - p.shoulderMid.x) > k * p.torso;

export const POSES: PoseDef[] = [
  {
    name: "Arms Up!", say: "Put your arms up high!",
    figure: { elL: [-0.55, -1.7], elR: [0.55, -1.7], hL: [-0.55, -2.4], hR: [0.55, -2.4] },
    check: (p) => up(p, p.handL) && up(p, p.handR),
  },
  {
    name: "Make a T!", say: "Stretch your arms out wide, like a T!",
    figure: { elL: [-1.1, -1], elR: [1.1, -1], hL: [-1.8, -1], hR: [1.8, -1] },
    check: (p) =>
      [p.handL, p.handR].every((h) => ok(h) && Math.abs(h.y - p.shoulderMid.y) < 0.5 * p.torso && out(p, h, 1.1)) &&
      p.handL.x < p.handR.x,
  },
  {
    name: "Be a Star!", say: "Be a big star! Arms up and out!",
    figure: { elL: [-1, -1.5], elR: [1, -1.5], hL: [-1.5, -2.05], hR: [1.5, -2.05], knL: [-0.65, 0.9], knR: [0.65, 0.9], ftL: [-0.95, 1.8], ftR: [0.95, 1.8] },
    check: (p) => [p.handL, p.handR].every((h) => ok(h) && h.y < p.shoulderMid.y - 0.2 * p.torso && out(p, h, 0.8)),
  },
  {
    name: "One Hand Up!", say: "Put one hand up, like the picture!",
    figure: { elL: [-0.55, -1.7], hL: [-0.55, -2.4] },
    check: (p) => up(p, p.handL) && down(p, p.handR),
  },
  {
    name: "Other Hand Up!", say: "Now the other hand up!",
    figure: { elR: [0.55, -1.7], hR: [0.55, -2.4] },
    check: (p) => up(p, p.handR) && down(p, p.handL),
  },
  {
    name: "Hands on Head!", say: "Put your hands on your head!",
    figure: { elL: [-0.95, -1.6], elR: [0.95, -1.6], hL: [-0.25, -1.95], hR: [0.25, -1.95] },
    check: (p) =>
      [p.handL, p.handR].every((h) => ok(h) && dist(h, p.head) < 0.9 * p.torso && h.y < p.shoulderMid.y),
  },
  {
    name: "Get Tiny!", say: "Get small, like a tiny mouse!",
    figure: {
      head: [0, -0.55], shL: [-0.45, -0.05], shR: [0.45, -0.05], elL: [-0.75, 0.35], elR: [0.75, 0.35],
      hL: [-0.45, 0.85], hR: [0.45, 0.85], hipL: [-0.3, 0.75], hipR: [0.3, 0.75], knL: [-0.75, 0.9], knR: [0.75, 0.9],
    },
    check: (p) => p.baseHipY !== null && p.shoulderMid.y > p.baseShoulderY + 0.45 * p.torso,
  },
];

const HOLD = 0.7; // seconds a pose must be held
const ROUND_LIMIT = 12;

function drawFigure(g: CanvasRenderingContext2D, f: Figure, cx: number, cy: number, s: number) {
  const P = (k: keyof Figure) => [cx + f[k][0] * s, cy + f[k][1] * s] as const;
  const line = (...ks: (keyof Figure)[]) => {
    g.beginPath();
    ks.forEach((k, i) => (i ? g.lineTo(...P(k)) : g.moveTo(...P(k))));
    g.stroke();
  };
  g.lineCap = g.lineJoin = "round";
  g.strokeStyle = "#fff";
  g.lineWidth = s * 0.22;
  line("shL", "shR");
  line("shL", "elL", "hL");
  line("shR", "elR", "hR");
  g.beginPath();
  g.moveTo(...P("shL"));
  g.lineTo(...P("hipL"));
  g.lineTo(...P("hipR"));
  g.lineTo(...P("shR"));
  g.stroke();
  line("hipL", "knL", "ftL");
  line("hipR", "knR", "ftR");
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(...P("head"), s * 0.38, 0, Math.PI * 2);
  g.fill();
}

export function copyThePose(): Game {
  let ctx: GameContext;
  let pose = POSES[0];
  let holds = new Map<number, number>();
  let done = new Set<number>();
  let roundT = 0;
  let repeated = false;
  let pause = 0; // celebration / transition time before the next pose

  const next = () => {
    const choices = POSES.filter((p) => p !== pose);
    pose = choices[Math.floor(Math.random() * choices.length)];
    holds = new Map();
    done = new Set();
    roundT = 0;
    repeated = false;
    ctx.sound.say(pose.say);
  };

  return {
    title: "Copy the Pose",
    emoji: "🤸",
    color: "#ff9f43",
    usesScore: true,

    start(c) {
      ctx = c;
      pose = POSES[0];
      pause = 0;
      holds = new Map();
      done = new Set();
      roundT = 0;
      repeated = false;
      c.sound.say("Copy the picture! " + pose.say);
    },

    update(dt) {
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) next();
        return;
      }
      const players = ctx.players.active;
      roundT += dt;
      for (const p of players) {
        if (done.has(p.id)) continue;
        const h = pose.check(p) ? (holds.get(p.id) ?? 0) + dt : Math.max(0, (holds.get(p.id) ?? 0) - dt * 2);
        holds.set(p.id, h);
        if (h >= HOLD) {
          done.add(p.id);
          ctx.fx.stars(p.head.x, p.head.y, 10);
          ctx.sound.ding();
        }
      }
      if (players.length && players.every((p) => done.has(p.id))) {
        ctx.sound.cheer();
        ctx.sound.say(praise());
        ctx.addScore(players.length, ctx.view.W / 2, ctx.view.H * 0.3);
        players.forEach((p) => ctx.fx.confetti(p.head.x, p.head.y));
        pause = 2;
      } else if (roundT > ROUND_LIMIT) {
        ctx.sound.say("Let's try a different one!");
        pause = 1.5;
      } else if (!repeated && roundT > 6) {
        repeated = true;
        ctx.sound.say(pose.say);
      }
    },

    draw(g) {
      const { W, unit } = ctx.view;
      // Target card on the right so it doesn't cover faces in the middle.
      const cw = Math.min(W * 0.24, 300 * unit);
      const ch = cw * 1.35;
      const x = W - cw - 24 * unit;
      const y = 24 * unit;
      roundRect(g, x, y, cw, ch, 28 * unit);
      g.fillStyle = "rgba(255,159,67,0.9)";
      g.fill();
      drawFigure(g, { ...BASE, ...pose.figure }, x + cw / 2, y + ch * 0.55, ch * 0.17);
      label(g, pose.name, x + cw / 2, y + ch + 36 * unit, 38 * unit);

      for (const p of ctx.players.active) {
        const r = 70 * unit;
        const prog = done.has(p.id) ? 1 : Math.min(1, (holds.get(p.id) ?? 0) / HOLD);
        g.lineWidth = 12 * unit;
        g.lineCap = "round";
        g.strokeStyle = "rgba(255,255,255,0.3)";
        g.beginPath();
        g.arc(p.head.x, p.head.y, r, 0, Math.PI * 2);
        g.stroke();
        if (prog > 0) {
          g.strokeStyle = done.has(p.id) ? "#7cff6b" : p.color;
          g.beginPath();
          g.arc(p.head.x, p.head.y, r, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
          g.stroke();
        }
      }
    },
  };
}
