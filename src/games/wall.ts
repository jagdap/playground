import { praise } from "../audio";
import { LM, type Player } from "../players";
import { emoji, label } from "../view";
import { BASE, POSES, type Figure } from "./copy";
import type { Game, GameContext } from "./types";

// A wall with a body-shaped hole rushes toward you: strike the pose to fit through.
type Shape = { name: string; say: string; figure: Partial<Figure> };

const SHAPES: Shape[] = [
  ...POSES.filter((p) => p.name !== "Get Tiny!").map(({ name, say, figure }) => ({ name, say, figure })),
  {
    name: "Flamingo!", say: "Stand on one leg like a flamingo!",
    figure: { knR: [0.55, 0.45], ftR: [0.2, 0.95], elL: [-1.1, -1], elR: [1.1, -1], hL: [-1.8, -1], hR: [1.8, -1] },
  },
  {
    name: "Teapot!", say: "Make a teapot shape! One hand on your hip, and lean to the side!",
    figure: { head: [-0.45, -1.45], elL: [-1.0, -0.55], hL: [-1.3, -1.1], elR: [0.85, -0.55], hR: [0.3, -0.1] },
  },
];

// Bones of the hole, with capsule radius in torso lengths.
const BONES: [keyof Figure, keyof Figure, number][] = [
  ["shL", "shR", 0.35], ["hipL", "hipR", 0.35], ["shL", "hipL", 0.35], ["shR", "hipR", 0.35],
  ["shL", "elL", 0.32], ["elL", "hL", 0.32], ["shR", "elR", 0.32], ["elR", "hR", 0.32],
  ["hipL", "knL", 0.34], ["knL", "ftL", 0.32], ["hipR", "knR", 0.34], ["knR", "ftR", 0.32],
];
const HEAD_R = 0.6;
// Body points checked against the hole.
const CHECK = [LM.nose, LM.lShoulder, LM.rShoulder, LM.lElbow, LM.rElbow, LM.lWrist, LM.rWrist, LM.lHip, LM.rHip, LM.lKnee, LM.rKnee, LM.lAnkle, LM.rAnkle];

type Hole = { player: number; color: string; pts: Record<keyof Figure, { x: number; y: number }>; T: number };
type Result = { player: number; out: { x: number; y: number }[]; pass: boolean };

const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
};

export function holeInTheWall(): Game {
  let ctx: GameContext;
  let shape = SHAPES[0];
  let holes: Hole[] = [];
  let wall: HTMLCanvasElement | null = null;
  let phase: "coming" | "result" = "coming";
  let k = 0; // wall progress 0 (far) .. 1 (here)
  let duration = 6;
  let results: Result[] = [];
  let resultT = 0;
  let count = 0;
  let tol = 1.25; // hole size multiplier; kinder for small kids

  const buildWall = () => {
    const { W, H, pixelRatio: dpr } = ctx.view;
    const c = document.createElement("canvas");
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Brick wall.
    const hue = [20, 200, 280, 140][count % 4];
    g.fillStyle = `hsl(${hue} 60% 45%)`;
    g.fillRect(0, 0, W, H);
    const bw = 90, bh = 40;
    g.strokeStyle = `hsl(${hue} 50% 30%)`;
    g.lineWidth = 4;
    for (let y = 0; y < H; y += bh)
      for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < W; x += bw) g.strokeRect(x, y, bw, bh);
    // Cut the holes: a colored rim, then the opening.
    for (const hole of holes) {
      for (const [pass, extra] of [["rim", 1.18], ["cut", 1]] as const) {
        g.globalCompositeOperation = pass === "cut" ? "destination-out" : "source-over";
        g.strokeStyle = g.fillStyle = hole.color;
        g.lineCap = "round";
        for (const [a, b, r] of BONES) {
          g.lineWidth = 2 * r * hole.T * tol * extra;
          g.beginPath();
          g.moveTo(hole.pts[a].x, hole.pts[a].y);
          g.lineTo(hole.pts[b].x, hole.pts[b].y);
          g.stroke();
        }
        const q = hole.pts;
        g.beginPath();
        g.moveTo(q.shL.x, q.shL.y);
        g.lineTo(q.shR.x, q.shR.y);
        g.lineTo(q.hipR.x, q.hipR.y);
        g.lineTo(q.hipL.x, q.hipL.y);
        g.fill();
        g.beginPath();
        g.arc(q.head.x, q.head.y, HEAD_R * hole.T * tol * extra, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalCompositeOperation = "source-over";
    wall = c;
  };

  const nextWall = () => {
    const choices = SHAPES.filter((s) => s !== shape);
    shape = choices[Math.floor(Math.random() * choices.length)];
    const { W, H, unit } = ctx.view;
    const ps = ctx.players.active;
    const fig = { ...BASE, ...shape.figure };
    // One hole per player, placed where they're standing now.
    const anchors: { id: number; color: string; x: number; y: number; T: number }[] = ps.length
      ? ps.map((p) => ({ id: p.id, color: p.color, x: p.hipMid.x, y: p.hipMid.y, T: p.torso }))
      : [{ id: 0, color: "#fff", x: W / 2, y: H * 0.6, T: 160 * unit }];
    holes = anchors.map((a) => {
      const pts = {} as Hole["pts"];
      for (const key of Object.keys(fig) as (keyof Figure)[]) pts[key] = { x: a.x + fig[key][0] * a.T, y: a.y + fig[key][1] * a.T };
      return { player: a.id, color: a.color, pts, T: a.T };
    });
    buildWall();
    k = 0;
    phase = "coming";
    duration = Math.max(3.5, 6 - count * 0.2);
    count++;
    ctx.sound.say(shape.say);
    ctx.sound.whoosh();
  };

  const fits = (p: Player, hole: Hole): Result => {
    const out: { x: number; y: number }[] = [];
    let seen = 0;
    for (const i of CHECK) {
      const pt = p.pts[i];
      if (pt.v < 0.5) continue;
      seen++;
      const q = hole.pts;
      const inside =
        Math.hypot(pt.x - q.head.x, pt.y - q.head.y) < HEAD_R * hole.T * tol ||
        BONES.some(([a, b, r]) => segDist(pt, q[a], q[b]) < r * hole.T * tol) ||
        segDist(pt, { x: (q.shL.x + q.shR.x) / 2, y: (q.shL.y + q.shR.y) / 2 }, { x: (q.hipL.x + q.hipR.x) / 2, y: (q.hipL.y + q.hipR.y) / 2 }) < 0.5 * hole.T * tol;
      if (!inside) out.push({ x: pt.x, y: pt.y });
    }
    return { player: p.id, out, pass: seen > 0 && out.length <= Math.floor(seen * 0.15) };
  };

  return {
    title: "Hole in the Wall",
    emoji: "🧱",
    color: "#d9774b",
    usesScore: true,

    start(c) {
      ctx = c;
      count = 0;
      tol = 1.25;
      c.sound.say("Here comes the wall! Make your body fit the hole!");
      nextWall();
    },

    update(dt) {
      if (phase === "coming") {
        k += dt / duration;
        if (k < 1) return;
        k = 1;
        phase = "result";
        resultT = 2.2;
        results = holes.flatMap((h) => {
          const p = ctx.players.active.find((q) => q.id === h.player);
          return p ? [fits(p, h)] : [];
        });
        const passed = results.filter((r) => r.pass).length;
        if (results.length && passed === results.length) {
          ctx.sound.cheer();
          ctx.sound.say(praise());
          ctx.fx.confetti(ctx.view.W / 2, ctx.view.H * 0.4, 90);
        } else {
          ctx.sound.boop();
          ctx.sound.crash();
          ctx.sound.say(passed ? "Almost! One of you got bonked!" : "Bonk! Silly wall!");
        }
        for (const r of results) {
          const p = ctx.players.active.find((q) => q.id === r.player);
          if (r.pass && p) ctx.addScore(1, p.head.x, p.head.y - 80);
        }
      } else {
        resultT -= dt;
        if (resultT <= 0) nextWall();
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      if (!wall) return;
      // The wall grows from the distance; after a pass it keeps flying past.
      const passAll = phase === "result" && results.length > 0 && results.every((r) => r.pass);
      const extra = phase === "result" ? (passAll ? (2.2 - resultT) * 0.8 : 0) : 0;
      const s = 0.12 + 0.88 * k * k + extra;
      const shake = phase === "result" && !passAll && resultT > 1.6 ? Math.sin(resultT * 60) * 10 * unit : 0;
      const vx = W / 2;
      const vy = H * 0.45;
      g.save();
      g.globalAlpha = Math.max(0, (0.45 + 0.45 * k) * (1 - extra));
      g.drawImage(wall, vx - vx * s + shake, vy - vy * s, W * s, H * s);
      g.restore();

      if (phase === "coming") {
        label(g, shape.name, W / 2, H * 0.12, 64 * unit);
        label(g, String(Math.ceil((1 - k) * duration)), W / 2, H * 0.22, 50 * unit, "#ffd23f");
      } else {
        for (const r of results) for (const o of r.out) emoji(g, "❌", o.x, o.y, 40 * unit);
        label(g, passAll ? "You fit! 🎉" : "BONK! 😆", W / 2, H * 0.14, 80 * unit, passAll ? "#7cff6b" : "#ffd23f");
      }
    },

    next() {
      nextWall();
    },
  };
}
