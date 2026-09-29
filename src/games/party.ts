import { praise } from "../audio";
import { dist, type Player } from "../players";
import { emoji, label, roundRect } from "../view";
import { rand, type Game, type GameContext } from "./types";

// A run of short, silly body-motion mini-games.
type Mini = { name: string; emoji: string; say: string; start(): void; update(dt: number, t: number): void; draw(g: CanvasRenderingContext2D, t: number): void };

const ROUND = 25; // seconds per mini-game

export function chickenParty(): Game {
  let ctx: GameContext;
  let order: Mini[] = [];
  let at = 0;
  let phase: "intro" | "play" | "done" = "intro";
  let phaseT = 0;
  let roundScore = 0;

  const players = () => ctx.players.active;
  const score = (n: number, x: number, y: number) => {
    roundScore += n;
    ctx.addScore(n, x, y);
  };

  // --- Flap your wings: flaps lift a chick up to its nest. ---
  let flapUp = new Map<number, boolean>();
  let chickY = 0; // 0 = ground, 1 = nest
  const flap: Mini = {
    name: "Flap Flap!", emoji: "🐥", say: "Flap your wings to help the chick fly to the nest!",
    start() { flapUp = new Map(); chickY = 0; },
    update(dt) {
      for (const p of players()) {
        const s = p.shoulderMid.y;
        const up = p.handL.y < s - 0.15 * p.torso && p.handR.y < s - 0.15 * p.torso;
        const down = p.handL.y > s + 0.35 * p.torso && p.handR.y > s + 0.35 * p.torso;
        if (up) flapUp.set(p.id, true);
        else if (down && flapUp.get(p.id)) {
          flapUp.set(p.id, false);
          chickY += 0.07;
          ctx.sound.pop();
        }
      }
      chickY = Math.max(0, chickY - dt * 0.02); // gentle gravity
      if (chickY >= 1) {
        const { W, H } = ctx.view;
        ctx.fx.confetti(W / 2, H * 0.2, 60);
        ctx.sound.cheer();
        ctx.sound.say("The chick made it home!");
        score(3, W / 2, H * 0.25);
        chickY = 0;
      }
    },
    draw(g, t) {
      const { W, H, unit } = ctx.view;
      emoji(g, "🪺", W / 2, H * 0.14, 110 * unit);
      const y = H * 0.85 - chickY * (H * 0.7);
      emoji(g, "🐥", W / 2 + Math.sin(t * 8) * 10 * unit, y, 110 * unit);
      g.fillStyle = "rgba(255,255,255,0.35)";
      roundRect(g, W * 0.9, H * 0.15, 24 * unit, H * 0.7, 12 * unit);
      g.fill();
      g.fillStyle = "#ffd23f";
      roundRect(g, W * 0.9, H * 0.85 - chickY * H * 0.7, 24 * unit, chickY * H * 0.7, 12 * unit);
      g.fill();
    },
  };

  // --- Egg squat: each squat lays an egg that hatches. ---
  let eggs: { x: number; y: number; t: number; hatched: boolean }[] = [];
  let wasDown = new Map<number, boolean>();
  const eggSquat: Mini = {
    name: "Egg Squat!", emoji: "🥚", say: "Squat down low to lay an egg!",
    start() { eggs = []; wasDown = new Map(); },
    update(_dt, t) {
      for (const p of players()) {
        if (p.ducking && !wasDown.get(p.id)) {
          const feetY = Math.min(ctx.view.H * 0.92, p.hipMid.y + p.torso * 1.6);
          eggs.push({ x: p.hipMid.x + rand(-40, 40), y: feetY, t, hatched: false });
          ctx.sound.pop();
        }
        wasDown.set(p.id, p.ducking);
      }
      for (const e of eggs)
        if (!e.hatched && t - e.t > 1) {
          e.hatched = true;
          ctx.fx.burst(e.x, e.y, "#fff3b0", 12);
          ctx.sound.ding();
          score(1, e.x, e.y - 60);
        }
      eggs = eggs.filter((e) => t - e.t < 4);
    },
    draw(g, t) {
      const u = ctx.view.unit;
      for (const e of eggs) {
        const walk = e.hatched ? (t - e.t - 1) * 120 * u : 0;
        emoji(g, e.hatched ? "🐣" : "🥚", e.x + walk, e.y - Math.abs(Math.sin(t * 10)) * (e.hatched ? 10 * u : 0), 80 * u);
      }
    },
  };

  // --- Hip copter: move side to side to fly under balloons. ---
  let balloons: { x: number; y: number; vy: number }[] = [];
  let copters = new Map<number, number>();
  let spawnIn = 0;
  const hipCopter: Mini = {
    name: "Hip Copter!", emoji: "🚁", say: "Move side to side to fly your helicopter to the balloons!",
    start() { balloons = []; copters = new Map(); spawnIn = 0; },
    update(dt) {
      const { W, H, unit } = ctx.view;
      spawnIn -= dt;
      if (spawnIn <= 0) {
        balloons.push({ x: rand(W * 0.1, W * 0.9), y: -60 * unit, vy: rand(60, 100) * unit });
        spawnIn = rand(1, 1.8);
      }
      const cy = H * 0.72;
      for (const p of players()) {
        const x = copters.get(p.id) ?? p.hipMid.x;
        // Exaggerate sideways movement around the player's position.
        copters.set(p.id, x + (p.hipMid.x - x) * Math.min(1, dt * 8));
      }
      balloons = balloons.filter((b) => {
        b.y += b.vy * dt;
        for (const [, x] of copters)
          if (dist(b, { x, y: cy }) < 90 * unit) {
            ctx.sound.pop();
            ctx.fx.burst(b.x, b.y, "#ff5f5f", 14);
            score(1, b.x, b.y);
            return false;
          }
        return b.y < H + 60 * unit;
      });
    },
    draw(g, t) {
      const { H, unit } = ctx.view;
      for (const b of balloons) emoji(g, "🎈", b.x, b.y, 80 * unit);
      for (const p of players()) {
        const x = copters.get(p.id);
        if (x === undefined) continue;
        emoji(g, "🚁", x, H * 0.72 + Math.sin(t * 6) * 8 * unit, 110 * unit);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(x, H * 0.72 + 60 * unit, 10 * unit, 0, Math.PI * 2);
        g.fill();
      }
    },
  };

  // --- Cookie catch: catch falling cookies, skip the broccoli (no penalty). ---
  let items: { x: number; y: number; vy: number; good: boolean; rot: number }[] = [];
  const cookieCatch: Mini = {
    name: "Cookie Catch!", emoji: "🍪", say: "Catch the cookies with your hands!",
    start() { items = []; spawnIn = 0; },
    update(dt) {
      const { W, H, unit } = ctx.view;
      spawnIn -= dt;
      if (spawnIn <= 0) {
        items.push({ x: rand(W * 0.1, W * 0.9), y: -50 * unit, vy: rand(110, 170) * unit, good: Math.random() > 0.2, rot: rand(0, 6) });
        spawnIn = rand(0.6, 1.1) / Math.max(1, players().length * 0.8);
      }
      const hands = players().flatMap((p: Player) => p.hands).filter((h) => h.v > 0.4);
      items = items.filter((it) => {
        it.y += it.vy * dt;
        it.rot += dt * 2;
        if (hands.some((h) => dist(h, it) < 75 * unit)) {
          if (it.good) {
            ctx.sound.ding();
            ctx.fx.burst(it.x, it.y, "#c68642", 12);
            score(1, it.x, it.y);
          } else {
            ctx.sound.boop();
            ctx.fx.text(it.x, it.y, "Yuck!", "#7cff6b");
          }
          return false;
        }
        return it.y < H + 50 * unit;
      });
    },
    draw(g) {
      const u = ctx.view.unit;
      for (const it of items) {
        g.save();
        g.translate(it.x, it.y);
        g.rotate(it.rot);
        emoji(g, it.good ? "🍪" : "🥦", 0, 0, 80 * u);
        g.restore();
      }
    },
  };

  const ALL = [flap, eggSquat, hipCopter, cookieCatch];

  const begin = (i: number) => {
    at = i % order.length;
    phase = "intro";
    phaseT = 3;
    roundScore = 0;
    order[at].start();
    ctx.sound.say(order[at].say);
  };

  return {
    title: "Chicken Party",
    emoji: "🐔",
    color: "#ffb347",
    usesScore: true,

    start(c) {
      ctx = c;
      order = [...ALL].sort(() => Math.random() - 0.5);
      begin(0);
    },

    update(dt, t) {
      phaseT -= dt;
      if (phase === "intro") {
        if (phaseT <= 0) {
          phase = "play";
          phaseT = ROUND;
          ctx.sound.say("Go!");
        }
      } else if (phase === "play") {
        order[at].update(dt, t);
        if (phaseT <= 0) {
          phase = "done";
          phaseT = 3.5;
          ctx.sound.cheer();
          ctx.sound.say(`${praise()} You got ${roundScore}!`);
          ctx.fx.confetti(ctx.view.W / 2, ctx.view.H * 0.4, 70);
        }
      } else if (phaseT <= 0) {
        begin(at + 1);
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      const m = order[at];
      const t = performance.now() / 1000;
      if (phase === "intro") {
        emoji(g, m.emoji, W / 2, H * 0.4, 200 * unit);
        label(g, m.name, W / 2, H * 0.62, 80 * unit);
        label(g, String(Math.ceil(phaseT)), W / 2, H * 0.76, 60 * unit, "#ffd23f");
        return;
      }
      m.draw(g, t);
      if (phase === "play") {
        label(g, `${m.emoji} ${Math.ceil(phaseT)}`, 30 * unit, H - 40 * unit, 40 * unit, "#fff", "left");
      } else {
        label(g, "Round over!", W / 2, H * 0.4, 80 * unit);
        label(g, `⭐ ${roundScore}`, W / 2, H * 0.55, 70 * unit, "#ffd23f");
      }
    },

    next() {
      begin(at + 1);
    },

    onKey(k) {
      if (k !== "n") return false;
      begin(at + 1); // skip to the next mini-game
      return true;
    },
  };
}
