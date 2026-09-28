import { LM, type Player } from "../players";
import { emoji, label } from "../view";
import { rand, type Game, type GameContext } from "./types";

// Tests: whole-body tracking and jump / duck detection against a standing baseline.
type Obstacle = { kind: "jump" | "duck"; x: number; cued: boolean; done: Set<number> };

const HIT_WINDOW = 0.6; // seconds around the pass where a jump/duck counts

export function jumpAndDuck(): Game {
  let ctx: GameContext;
  let obs: Obstacle[] = [];
  let spawnIn = 0;
  let count = 0;
  let cue: { kind: Obstacle["kind"]; until: number } | null = null;
  let now = 0;

  const groundY = (players: Player[]) => {
    const { H } = ctx.view;
    const feet = players.flatMap((p) => [p.pts[LM.lAnkle], p.pts[LM.rAnkle]]).filter((a) => a.v > 0.5);
    if (!feet.length) return H * 0.88;
    return Math.min(H * 0.95, feet.reduce((s, a) => s + a.y, 0) / feet.length);
  };
  const headY = (players: Player[]) => {
    if (!players.length) return ctx.view.H * 0.3;
    return players.reduce((s, p) => s + p.head.y, 0) / players.length;
  };

  return {
    title: "Jump & Duck",
    emoji: "🦘",
    color: "#7cd67a",
    usesScore: true,

    start(c) {
      ctx = c;
      obs = [];
      spawnIn = 3.5;
      count = 0;
      cue = null;
      c.sound.say("Jump over the logs, and duck under the bees!");
    },

    update(dt, t) {
      now = t;
      const { W, unit } = ctx.view;
      const speed = W / 6;
      const players = ctx.players.active;

      spawnIn -= dt;
      if (spawnIn <= 0) {
        const kind = count < 3 ? "jump" : Math.random() < 0.5 ? "jump" : "duck";
        obs.push({ kind, x: W + 80 * unit, cued: false, done: new Set() });
        count++;
        spawnIn = rand(3.2, 4.5);
      }

      const firstX = players.length ? Math.max(...players.map((p) => p.shoulderMid.x)) : W / 2;
      for (const o of obs) {
        o.x -= speed * dt;
        if (!o.cued && o.x - firstX < speed * 1.4) {
          o.cued = true;
          cue = { kind: o.kind, until: t + 1.8 };
          ctx.sound.say(o.kind === "jump" ? "Jump!" : "Duck!");
          ctx.sound.whoosh();
        }
        for (const p of players) {
          if (o.done.has(p.id) || o.x > p.shoulderMid.x) continue;
          o.done.add(p.id);
          const last = o.kind === "jump" ? p.lastJumpT : p.lastDuckT;
          if (t - last < HIT_WINDOW) {
            ctx.fx.stars(p.head.x, p.head.y, 8);
            ctx.sound.ding();
            ctx.addScore(1, p.head.x, p.head.y - 60 * unit);
          } else {
            ctx.sound.boop(); // no penalty, just a gentle sound
          }
        }
      }
      obs = obs.filter((o) => o.x > -120 * unit);
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      const players = ctx.players.active;
      const gy = groundY(players);
      const hy = headY(players);

      for (const o of obs) {
        if (o.kind === "jump") emoji(g, "🪵", o.x, gy - 40 * unit, 120 * unit);
        else emoji(g, "🐝", o.x, hy + Math.sin(now * 6 + o.x * 0.01) * 12 * unit, 100 * unit);
      }

      if (cue && now < cue.until) {
        const s = 1 + 0.08 * Math.sin(now * 12);
        label(g, cue.kind === "jump" ? "⬆ JUMP!" : "⬇ DUCK!", W / 2, H * 0.2, 90 * unit * s, cue.kind === "jump" ? "#7cff6b" : "#ffd23f");
      }

      if (players.some((p) => p.hipMid.v < 0.5)) {
        label(g, "Step back so your whole body shows", W / 2, H - 40 * unit, 30 * unit, "#fff");
      }
    },
  };
}
