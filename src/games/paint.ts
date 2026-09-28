import { dist } from "../players";
import type { Game, GameContext } from "./types";

// Tests: smooth, low-jitter hand tracking. No goals, nobody loses.
export function mirrorPaint(): Game {
  let ctx: GameContext;
  let layer: HTMLCanvasElement;
  let lg: CanvasRenderingContext2D;
  let prev = new Map<string, { x: number; y: number }>();
  let clapped = new Map<number, boolean>();
  let highFiveCooldown = 0;

  const ensureLayer = () => {
    const { W, H, pixelRatio } = ctx.view;
    const w = Math.round(W * pixelRatio);
    const h = Math.round(H * pixelRatio);
    if (layer && layer.width === w && layer.height === h) return;
    layer = document.createElement("canvas");
    layer.width = w;
    layer.height = h;
    lg = layer.getContext("2d")!;
    lg.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  return {
    title: "Mirror Paint",
    emoji: "🎨",
    color: "#b388ff",
    usesScore: false,
    hideHands: true,

    start(c) {
      ctx = c;
      ensureLayer();
      lg.clearRect(0, 0, c.view.W, c.view.H);
      prev = new Map();
      clapped = new Map();
      c.sound.say("Wave your hands to paint! Clap for sparkles!");
    },

    update(dt, t) {
      ensureLayer();
      const { W, H, unit } = ctx.view;
      const players = ctx.players.active;

      // Slowly fade old paint so the screen never fills up.
      lg.globalCompositeOperation = "destination-out";
      lg.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.15)})`;
      lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = "source-over";

      lg.lineCap = "round";
      lg.lineWidth = 24 * unit;
      lg.shadowBlur = 24 * unit;
      for (const p of players) {
        p.hands.forEach((h, side) => {
          const key = `${p.id}${side}`;
          if (h.v < 0.4) return void prev.delete(key);
          const hue = (t * 60 + p.id * 180 + side * 40) % 360;
          const color = `hsl(${hue} 100% 60%)`;
          const last = prev.get(key);
          if (last && dist(last, h) < 200 * unit) {
            lg.strokeStyle = lg.shadowColor = color;
            lg.beginPath();
            lg.moveTo(last.x, last.y);
            lg.lineTo(h.x, h.y);
            lg.stroke();
          }
          prev.set(key, { x: h.x, y: h.y });
        });

        // Clap: hands come together (with hysteresis so one clap = one burst).
        const d = dist(p.handL, p.handR);
        const both = p.handL.v > 0.4 && p.handR.v > 0.4;
        const thr = 0.45 * p.torso;
        if (both && d < thr && !clapped.get(p.id)) {
          clapped.set(p.id, true);
          const mx = (p.handL.x + p.handR.x) / 2;
          const my = (p.handL.y + p.handR.y) / 2;
          ctx.fx.confetti(mx, my, 30);
          ctx.sound.pop();
          ctx.sound.ding();
        } else if (d > thr * 1.5) {
          clapped.set(p.id, false);
        }
      }
      lg.shadowBlur = 0;

      // High five between the two players.
      highFiveCooldown -= dt;
      if (players.length === 2 && highFiveCooldown <= 0) {
        const [a, b] = players;
        for (const ha of a.hands)
          for (const hb of b.hands)
            if (ha.v > 0.4 && hb.v > 0.4 && dist(ha, hb) < 70 * unit && highFiveCooldown <= 0) {
              ctx.fx.confetti((ha.x + hb.x) / 2, (ha.y + hb.y) / 2, 70);
              ctx.fx.stars((ha.x + hb.x) / 2, (ha.y + hb.y) / 2, 12);
              ctx.sound.cheer();
              ctx.sound.say("High five!");
              highFiveCooldown = 2;
            }
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      g.drawImage(layer, 0, 0, W, H);
      for (const p of ctx.players.active)
        for (const h of p.hands) {
          if (h.v < 0.4) continue;
          g.fillStyle = "#fff";
          g.beginPath();
          g.arc(h.x, h.y, 10 * unit, 0, Math.PI * 2);
          g.fill();
        }
    },
  };
}
