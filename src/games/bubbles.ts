import { dist, type Player } from "../players";
import { emoji, label, roundRect } from "../view";
import { rand, type Game, type GameContext } from "./types";

// Head-to-head: pop more bubbles than the other player before time runs out.
// Bubbles spawn in mirrored pairs so both halves of the screen get the same chances.
type Bubble = { x: number; y: number; r: number; vy: number; phase: number; hue: number; gold: boolean };

const ROUND = 45;
const COLOR_NAMES = ["Pink", "Blue"];

export function bubblePop(): Game {
  let ctx: GameContext;
  let bubbles: Bubble[] = [];
  let spawnIn = 0;
  let phase: "ready" | "play" | "over" = "ready";
  let phaseT = 0;
  let scores = [0, 0];
  let wins = [0, 0];
  let best = 0;
  let winner: number | null = null; // player id, or null for a tie / solo
  let spoke = 0;

  const players = () => ctx.players.active;

  const newRound = () => {
    bubbles = [];
    scores = [0, 0];
    winner = null;
    phase = "ready";
    phaseT = 3.5;
    spoke = 4;
    ctx.sound.say(players().length > 1 ? "Bubble battle! Pop more bubbles than the other player!" : "Pop as many bubbles as you can!");
  };

  const spawnPair = () => {
    const { W, H, unit } = ctx.view;
    const r = rand(50, 75) * unit;
    const x = rand(r, W / 2 - r * 1.2);
    const vy = rand(70, 110) * unit;
    const phase = rand(0, 6);
    const hue = rand(0, 360);
    const gold = Math.random() < 0.07;
    for (const bx of [x, W - x]) bubbles.push({ x: bx, y: H + r, r, vy, phase, hue, gold });
  };

  const finish = () => {
    phase = "over";
    phaseT = 7;
    const ps = players();
    ctx.sound.cheer();
    if (ps.length < 2) {
      const s = Math.max(...scores);
      const record = s > best;
      best = Math.max(best, s);
      ctx.sound.say(record ? `New record! ${s} bubbles!` : `You popped ${s} bubbles!`);
      ctx.fx.confetti(ctx.view.W / 2, ctx.view.H * 0.3, 80);
      return;
    }
    const [a, b] = ps;
    if (scores[a.id] === scores[b.id]) {
      ctx.sound.say("It's a tie! Great game, both of you!");
    } else {
      const w = scores[a.id] > scores[b.id] ? a : b;
      winner = w.id;
      wins[w.id]++;
      ctx.sound.say(`${COLOR_NAMES[w.id]} wins! Great game, both of you!`);
      ctx.fx.confetti(w.head.x, w.head.y, 90);
      ctx.fx.stars(w.head.x, w.head.y, 14);
    }
  };

  const popBy = (b: Bubble): Player | undefined => {
    const reach = b.r + 30 * ctx.view.unit;
    let hit: { p: Player; d: number } | undefined;
    for (const p of players())
      for (const h of p.hands) {
        if (h.v < 0.4) continue;
        const d = dist(h, b);
        if (d < reach && (!hit || d < hit.d)) hit = { p, d };
      }
    return hit?.p;
  };

  return {
    title: "Bubble Battle",
    emoji: "🫧",
    color: "#4cc3ff",
    usesScore: false,

    start(c) {
      ctx = c;
      wins = [0, 0];
      newRound();
    },

    update(dt, t) {
      const { unit } = ctx.view;
      phaseT -= dt;

      if (phase === "ready") {
        const n = Math.ceil(phaseT);
        if (n < spoke && n >= 1 && n <= 3) {
          spoke = n;
          ctx.sound.say(String(n));
        }
        if (phaseT <= 0) {
          phase = "play";
          phaseT = ROUND;
          spawnIn = 0;
          ctx.sound.say("Go!");
        }
        return;
      }

      // Bubbles keep drifting in every phase so the screen stays lively.
      for (const b of bubbles) {
        b.y -= b.vy * dt;
        b.x += Math.sin(t * 1.5 + b.phase) * 25 * unit * dt;
      }
      bubbles = bubbles.filter((b) => b.y > -b.r);
      if (phase !== "play") {
        if (phaseT <= 0) newRound();
        return;
      }

      spawnIn -= dt;
      if (spawnIn <= 0 && bubbles.length < 16) {
        spawnPair();
        spawnIn = rand(0.7, 1.2);
      }

      bubbles = bubbles.filter((b) => {
        const p = popBy(b);
        if (!p) return true;
        const pts = b.gold ? 3 : 1;
        scores[p.id] += pts;
        ctx.sound.pop();
        ctx.fx.burst(b.x, b.y, p.color, b.gold ? 20 : 12);
        ctx.fx.text(b.x, b.y, `+${pts}`, p.color);
        if (b.gold) ctx.sound.ding();
        return false;
      });

      if (phaseT <= 10 && phaseT + dt > 10) ctx.sound.say("Ten seconds left!");
      if (phaseT <= 0) finish();
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      const ps = players();
      const versus = ps.length > 1;

      if (versus && phase !== "over") {
        g.strokeStyle = "rgba(255,255,255,0.25)";
        g.lineWidth = 4 * unit;
        g.setLineDash([16 * unit, 14 * unit]);
        g.beginPath();
        g.moveTo(W / 2, 110 * unit);
        g.lineTo(W / 2, H);
        g.stroke();
        g.setLineDash([]);
      }

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

      // Score pills, each on its player's side of the screen.
      const pill = (text: string, x: number, color: string) => {
        g.font = `800 ${44 * unit}px ui-rounded, system-ui`;
        const w = Math.max(140 * unit, g.measureText(text).width + 48 * unit);
        roundRect(g, x - w / 2, 16 * unit, w, 70 * unit, 35 * unit);
        g.fillStyle = color;
        g.fill();
        label(g, text, x, 52 * unit, 44 * unit);
      };
      if (versus) {
        for (const p of ps) {
          const side = p.shoulderMid.x < W / 2 ? 0.28 : 0.72;
          pill(`${scores[p.id]}`, W * side, p.color);
        }
        if (wins[0] + wins[1] > 0) label(g, `🏆 ${wins[0]} – ${wins[1]}`, W / 2, 52 * unit, 30 * unit);
      } else if (ps.length === 1) {
        pill(`🫧 ${scores[ps[0].id]}`, W / 2, ps[0].color);
        if (best) label(g, `Best ${best}`, W / 2, 110 * unit, 24 * unit);
      }

      if (phase === "ready") {
        label(g, versus ? "Bubble Battle!" : "Bubble Pop!", W / 2, H * 0.36, 80 * unit);
        const n = Math.ceil(phaseT);
        label(g, n <= 3 ? String(n) : "Get ready…", W / 2, H * 0.52, n <= 3 ? 140 * unit : 50 * unit, "#ffd23f");
      } else if (phase === "play") {
        const secs = Math.ceil(phaseT);
        label(g, `⏱ ${secs}`, W / 2, H - 40 * unit, 40 * unit, secs <= 10 ? "#ff8a8a" : "#fff");
      } else {
        const w = ps.find((p) => p.id === winner);
        if (w) {
          emoji(g, "👑", w.head.x, w.head.y - w.headR * 1.6, w.headR * 1.5);
          label(g, `${COLOR_NAMES[w.id]} wins!`, W / 2, H * 0.4, 90 * unit, w.color);
        } else {
          label(g, versus ? "It's a tie!" : "Time's up!", W / 2, H * 0.4, 90 * unit);
        }
        label(g, `Next round in ${Math.ceil(phaseT)}`, W / 2, H * 0.53, 36 * unit);
      }
    },

    next() {
      newRound();
    },
  };
}
