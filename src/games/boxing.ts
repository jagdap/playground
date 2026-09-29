import { Dwell, type Target } from "../dwell";
import { Groove } from "../music";
import { dist, type Player } from "../players";
import { emoji, label, roundRect } from "../view";
import type { Game, GameContext } from "./types";

// Cardio boxing workout for grown-ups: punch the pads on the beat, duck the bar.
type Kind = "jabL" | "jabR" | "hookL" | "hookR" | "upL" | "upR" | "bodyL" | "bodyR" | "duck";
type Pad = { kind: Kind; player: number; time: number; x: number; y: number; state: "live" | "hit" | "miss"; endT: number };

// Pad positions relative to the shoulders, in torso lengths. They sit beyond a
// resting guard so you have to extend to reach them.
const OFFSET: Record<Exclude<Kind, "duck">, [number, number]> = {
  jabL: [-0.75, -0.85], jabR: [0.75, -0.85],
  hookL: [-1.35, -0.45], hookR: [1.35, -0.45],
  upL: [-0.4, -1.55], upR: [0.4, -1.55],
  bodyL: [-1.1, 0.45], bodyR: [1.1, 0.45],
};

const COMBOS: Kind[][] = [
  ["jabL", "jabR"],
  ["jabL", "jabL", "jabR"],
  ["jabL", "jabR", "hookL"],
  ["jabR", "hookL", "jabR"],
  ["upL", "upR"],
  ["bodyL", "bodyR", "hookL"],
  ["jabL", "jabR", "duck"],
  ["hookR", "hookL", "upR"],
  ["duck", "jabL", "jabR"],
];

const LEVELS = [
  { name: "Easy", bpm: 96, spacing: 2, round: 60, emoji: "🙂", color: "#7cd67a" },
  { name: "Normal", bpm: 112, spacing: 1, round: 90, emoji: "😤", color: "#ffb347" },
  { name: "Hard", bpm: 128, spacing: 1, round: 120, emoji: "🔥", color: "#ff5f5f" },
];
const ROUNDS = 3;
const REST = 20;
const LEAD = 1.3;
const EARLY = 0.45;
const LATE = 0.3;

export function shadowBoxing(): Game {
  let ctx: GameContext;
  let groove: Groove;
  let level = LEVELS[1];
  let phase: "pick" | "fight" | "rest" | "done" = "pick";
  let phaseT = 0;
  let round = 1;
  let pads: Pad[] = [];
  let nextBeat = 0;
  let turn = 0;
  let combo = 0;
  let best = 0;
  let hits = 0;
  let total = 0;
  let misses = 0;
  const kcal = new Map<number, number>();
  const picker = new Dwell(1.5);
  let pickRects: Target[] = [];

  const players = () => ctx.players.active;
  const now = () => ctx.sound.now;

  const begin = (i: number) => {
    level = LEVELS[i];
    groove = new Groove(ctx.sound, level.bpm);
    round = 1;
    hits = total = misses = combo = best = 0;
    kcal.clear();
    startRound();
  };

  const startRound = () => {
    phase = "fight";
    phaseT = level.round;
    pads = [];
    groove.start(1.5);
    nextBeat = 4;
    ctx.sound.say(`Round ${round}! Fight!`);
  };

  const place = (p: Player | undefined, kind: Exclude<Kind, "duck">) => {
    const { W, H, unit } = ctx.view;
    const [ox, oy] = OFFSET[kind];
    const cx = p?.shoulderMid.x ?? W / 2;
    const cy = p?.shoulderMid.y ?? H * 0.45;
    const T = p?.torso ?? 150 * unit;
    const m = 60 * unit;
    return { x: Math.min(W - m, Math.max(m, cx + ox * T)), y: Math.min(H - m, Math.max(m + 60 * unit, cy + oy * T)) };
  };

  const spawn = () => {
    // Schedule one combo per 4-beat bar (8 beats on Easy), a bar ahead of time.
    const barBeats = 4 * level.spacing;
    while (groove.timeOfBeat(nextBeat) - LEAD < now() + 0.05) {
      const ps = players();
      const p = ps.length ? ps[turn++ % ps.length] : undefined;
      const combo = COMBOS[Math.floor(Math.random() * COMBOS.length)];
      combo.forEach((kind, i) => {
        const time = groove.timeOfBeat(nextBeat + i * level.spacing);
        const at = kind === "duck" ? { x: p?.head.x ?? ctx.view.W / 2, y: p?.head.y ?? ctx.view.H * 0.3 } : place(p, kind);
        pads.push({ kind, player: p?.id ?? 0, time, ...at, state: "live", endT: 0 });
        total++;
      });
      nextBeat += barBeats;
    }
  };

  const judge = (pad: Pad, d: number) => {
    pad.state = "hit";
    pad.endT = now();
    hits++;
    combo++;
    best = Math.max(best, combo);
    const perfect = Math.abs(d) < 0.15;
    ctx.sound.pop();
    ctx.fx.burst(pad.x, pad.y, perfect ? "#ffd23f" : "#fff", perfect ? 16 : 8);
    ctx.fx.text(pad.x, pad.y - 50 * ctx.view.unit, perfect ? "Perfect!" : "Good", perfect ? "#ffd23f" : "#fff");
    if (combo > 0 && combo % 20 === 0) ctx.sound.say(`${combo} combo!`);
  };

  const updateFight = (dt: number) => {
    const { unit } = ctx.view;
    groove.update();
    spawn();
    const t = now();
    for (const pad of pads) {
      if (pad.state !== "live") continue;
      const d = t - pad.time;
      const p = players().find((q) => q.id === pad.player) ?? players()[0];
      if (d > LATE) {
        pad.state = "miss";
        pad.endT = t;
        combo = 0;
        misses++;
        continue;
      }
      if (d < -EARLY || !p) continue;
      if (pad.kind === "duck") {
        if (p.ducking) judge(pad, d);
        continue;
      }
      // A punch = a moving hand reaching the pad (resting hands don't count).
      const hit = p.hands.some((h, i) => {
        const v = p.vels[i];
        return h.v > 0.4 && dist(h, pad) < 0.5 * p.torso + 20 * unit && Math.hypot(v.x, v.y) > 1.5 * p.torso;
      });
      if (hit) judge(pad, d);
    }
    pads = pads.filter((p) => p.state === "live" || t - p.endT < 0.4);

    // Rough calorie estimate: ~3 kcal/min resting-ish up to ~11 kcal/min flat out.
    for (const p of players()) {
      const intensity = Math.min(1, p.motion / 2.5);
      kcal.set(p.id, (kcal.get(p.id) ?? 0) + ((3 + 8 * intensity) / 60) * dt);
    }

    phaseT -= dt;
    if (phaseT <= 0) {
      groove.stop();
      ctx.sound.cheer();
      if (round >= ROUNDS) {
        phase = "done";
        ctx.sound.say(`Workout complete! You landed ${hits} punches!`);
        ctx.fx.confetti(ctx.view.W / 2, ctx.view.H * 0.3, 120);
      } else {
        phase = "rest";
        phaseT = REST;
        ctx.sound.say("Rest! Breathe and shake it out.");
      }
    }
  };

  const drawPicker = (g: CanvasRenderingContext2D) => {
    const { W, H, unit } = ctx.view;
    label(g, "🥊 Shadow Boxing", W / 2, H * 0.18, 72 * unit);
    label(g, "Hold a hand on a level", W / 2, H * 0.28, 32 * unit);
    const w = Math.min(260 * unit, W * 0.25);
    const h = w * 1.1;
    const gap = 30 * unit;
    const x0 = (W - (3 * w + 2 * gap)) / 2;
    pickRects = LEVELS.map((l, i) => ({ id: String(i), x: x0 + i * (w + gap), y: H * 0.55 - h / 2, w, h }));
    pickRects.forEach((r, i) => {
      const l = LEVELS[i];
      roundRect(g, r.x, r.y, r.w, r.h, 30 * unit);
      g.fillStyle = l.color;
      g.globalAlpha = picker.hovered === r.id ? 1 : 0.8;
      g.fill();
      g.globalAlpha = 1;
      emoji(g, l.emoji, r.x + r.w / 2, r.y + r.h * 0.35, r.w * 0.35);
      label(g, l.name, r.x + r.w / 2, r.y + r.h * 0.7, 36 * unit);
      label(g, `${l.bpm} BPM · ${ROUNDS}×${l.round}s`, r.x + r.w / 2, r.y + r.h * 0.86, 18 * unit);
      const f = picker.fraction(r.id);
      if (f > 0) {
        g.lineWidth = 12 * unit;
        g.strokeStyle = "#fff";
        g.beginPath();
        g.arc(r.x + r.w / 2, r.y + r.h * 0.35, r.w * 0.28, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
        g.stroke();
      }
    });
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return {
    title: "Shadow Boxing",
    emoji: "🥊",
    color: "#e0465e",
    ownsMusic: true,
    usesScore: false,

    start(c) {
      ctx = c;
      phase = "pick";
      picker.reset(performance.now() / 1000, 1.5);
      c.sound.say("Shadow boxing! Pick a level.");
    },

    update(dt, t) {
      if (phase === "pick") {
        const hands = players().flatMap((p) => p.hands).filter((h) => h.v > 0.4);
        const hit = picker.update(pickRects, hands, dt, t);
        if (hit) begin(Number(hit));
      } else if (phase === "fight") updateFight(dt);
      else if (phase === "rest") {
        phaseT -= dt;
        if (phaseT <= 0) {
          round++;
          startRound();
        }
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      if (phase === "pick") return drawPicker(g);
      const t = now();

      if (phase === "fight") {
        for (const pad of pads) {
          const d = pad.time - t;
          const color = players().find((p) => p.id === pad.player)?.color ?? "#fff";
          if (pad.state === "miss") continue;
          if (pad.state === "hit") {
            g.globalAlpha = Math.max(0, 1 - (t - pad.endT) * 3);
            emoji(g, "💥", pad.x, pad.y, 110 * unit);
            g.globalAlpha = 1;
            continue;
          }
          if (d > LEAD) continue;
          const k = Math.max(0, d / LEAD);
          if (pad.kind === "duck") {
            // A bar sweeping in at head height.
            const y = pad.y - 30 * unit;
            g.globalAlpha = 1 - k * 0.6;
            g.fillStyle = "#ffd23f";
            roundRect(g, W * 0.15 + k * W * 0.35, y - 14 * unit, W * 0.7 - k * W * 0.7, 28 * unit, 14 * unit);
            g.fill();
            g.globalAlpha = 1;
            if (d < EARLY) label(g, "⬇ DUCK", pad.x, y - 50 * unit, 44 * unit, "#ffd23f");
            continue;
          }
          const r = 48 * unit;
          g.lineWidth = 6 * unit;
          g.strokeStyle = color;
          g.globalAlpha = 1 - k * 0.5;
          g.beginPath();
          g.arc(pad.x, pad.y, r * (1 + 2 * k), 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          g.fillStyle = d < EARLY ? color : "rgba(255,255,255,0.7)";
          g.beginPath();
          g.arc(pad.x, pad.y, r, 0, Math.PI * 2);
          g.fill();
          emoji(g, "🥊", pad.x, pad.y, r * 1.2);
        }
      }

      // HUD
      g.fillStyle = "rgba(0,0,0,0.45)";
      roundRect(g, W / 2 - 260 * unit, 14 * unit, 520 * unit, 70 * unit, 35 * unit);
      g.fill();
      const acc = hits + misses ? Math.round((hits / (hits + misses)) * 100) : 100;
      label(g, `R${round}/${ROUNDS}  ⏱ ${fmt(Math.max(0, phaseT))}  🥊 ${hits}  🎯 ${acc}%`, W / 2, 49 * unit, 30 * unit);
      if (combo >= 5) label(g, `${combo} combo`, W / 2, H - 50 * unit, 40 * unit, "#ffd23f");
      players().forEach((p, i) =>
        label(g, `${p.name} ≈ ${Math.round(kcal.get(p.id) ?? 0)} kcal`, 30 * unit, H - 90 * unit + i * 36 * unit, 26 * unit, p.color, "left"),
      );

      if (phase === "rest") {
        label(g, "Rest", W / 2, H * 0.4, 100 * unit);
        label(g, `Next round in ${Math.ceil(phaseT)}`, W / 2, H * 0.52, 44 * unit, "#ffd23f");
      } else if (phase === "done") {
        label(g, "Workout complete! 💪", W / 2, H * 0.36, 70 * unit);
        label(g, `${hits} punches · best combo ${best}`, W / 2, H * 0.48, 40 * unit, "#ffd23f");
        label(g, "Cross your arms to pause, then pick Start Over or All Games", W / 2, H * 0.58, 26 * unit);
      }
    },

    resume(pausedFor) {
      if (phase !== "fight") return;
      groove.shift(pausedFor);
      for (const p of pads) p.time += pausedFor;
    },

    onKey(k) {
      if (phase === "pick" && ["1", "2", "3"].includes(k)) {
        begin(Number(k) - 1);
        return true;
      }
      return false;
    },
  };
}
