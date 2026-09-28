import { praise } from "../audio";
import { dist } from "../players";
import { emoji } from "../view";
import { rand, type Game, type GameContext } from "./types";

// Tests: hand tracking accuracy and two players at once.
type Bubble = { x: number; y: number; r: number; vy: number; phase: number; hue: number; gold: boolean };

export function bubblePop(): Game {
  let ctx: GameContext;
  let bubbles: Bubble[] = [];
  let spawnIn = 0;
  let pops = 0;

  return {
    title: "Bubble Pop",
    emoji: "🫧",
    color: "#4cc3ff",
    usesScore: true,

    start(c) {
      ctx = c;
      bubbles = [];
      spawnIn = 0.5;
      pops = 0;
      c.sound.say("Pop the bubbles with your hands!");
    },

    update(dt, t) {
      const { W, H, unit } = ctx.view;
      const n = Math.max(1, ctx.players.active.length);

      spawnIn -= dt;
      if (spawnIn <= 0 && bubbles.length < 5 + 4 * n) {
        const r = rand(50, 80) * unit;
        bubbles.push({
          x: rand(r, W - r), y: H + r, r, vy: rand(60, 100) * unit,
          phase: rand(0, 6), hue: rand(0, 360), gold: Math.random() < 0.08,
        });
        spawnIn = rand(0.6, 1.1) / n;
      }

      const hands = ctx.players.active.flatMap((p) => p.hands).filter((h) => h.v > 0.4);
      for (const b of bubbles) {
        b.y -= b.vy * dt;
        b.x += Math.sin(t * 1.5 + b.phase) * 25 * unit * dt;
      }
      bubbles = bubbles.filter((b) => {
        if (b.y < -b.r) return false;
        // Generous hit radius: little hands, big bubbles.
        if (!hands.some((h) => dist(h, b) < b.r + 30 * unit)) return true;
        ctx.sound.pop();
        ctx.fx.burst(b.x, b.y, b.gold ? "#ffd23f" : `hsl(${b.hue} 90% 75%)`);
        ctx.addScore(b.gold ? 3 : 1, b.x, b.y);
        if (b.gold) {
          ctx.fx.stars(b.x, b.y, 10);
          ctx.sound.cheer();
        }
        if (++pops % 15 === 0) ctx.sound.say(praise());
        return false;
      });
    },

    draw(g) {
      for (const b of bubbles) {
        const grad = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
        const hue = b.gold ? 48 : b.hue;
        grad.addColorStop(0, `hsla(${hue} 100% 95% / 0.9)`);
        grad.addColorStop(0.6, `hsla(${hue} 90% 70% / 0.35)`);
        grad.addColorStop(1, `hsla(${hue} 90% 60% / 0.7)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = `hsla(${hue} 100% 90% / 0.9)`;
        g.stroke();
        if (b.gold) emoji(g, "⭐", b.x, b.y, b.r);
      }
    },
  };
}
