import type { Player } from "../players";
import { label } from "../view";
import type { Game, GameContext } from "./types";

// Bowling: swing your arm up to roll. Bumpers are always on.
type Pin = { u: number; v: number; vu: number; vv: number; down: boolean; tilt: number };

const BALL_R = 0.09; // in lane-width units (u spans -1..1)
const PIN_R = 0.05;
const BUMPER = 0.85;
const COLOR_NAMES = ["Pink", "Blue"];

function rack(): Pin[] {
  const pins: Pin[] = [];
  for (let row = 0; row < 4; row++)
    for (let i = 0; i <= row; i++)
      pins.push({ u: (i - row / 2) * 0.16, v: 0.84 + row * 0.04, vu: 0, vv: 0, down: false, tilt: 0 });
  return pins;
}

export function bumperBowling(): Game {
  let ctx: GameContext;
  let pins: Pin[] = [];
  let ball: { u: number; v: number; speed: number; curve: number } | null = null;
  let phase: "aim" | "roll" | "settle" = "aim";
  let phaseT = 0;
  let roll = 0; // 0 or 1 within a frame
  let bowler = 0;
  let downBefore = 0;
  let armDownAt = new Map<number, number>();
  let now = 0;

  const current = (): Player | undefined => {
    const ps = ctx.players.active;
    return ps.find((p) => p.id === bowler) ?? ps[0];
  };

  // Lane geometry in screen space.
  const project = (u: number, v: number) => {
    const { W, H } = ctx.view;
    const yb = H * 0.97;
    const yt = H * 0.3;
    const wb = W * 0.34;
    const wt = W * 0.11;
    const k = v ** 0.8;
    const half = (wb + (wt - wb) * k) / 2;
    return { x: W / 2 + u * half, y: yb + (yt - yb) * k, s: half / (wb / 2) };
  };

  const newFrame = () => {
    pins = rack();
    roll = 0;
    const ps = ctx.players.active;
    if (ps.length > 1) bowler = ps.find((p) => p.id !== bowler)?.id ?? bowler;
    else bowler = ps[0]?.id ?? 0;
    const name = ps.length > 1 ? `${COLOR_NAMES[bowler]}'s turn! ` : "";
    ctx.sound.say(`${name}Swing your arm to roll the ball!`);
    phase = "aim";
  };

  const release = (p: Player | undefined, power: number) => {
    const { W } = ctx.view;
    // Aim with where you stand: step left/right of center.
    const u = p ? Math.max(-0.7, Math.min(0.7, ((p.shoulderMid.x - W / 2) / (W * 0.3)) * 0.7)) : 0;
    ball = { u, v: 0, speed: 0.45 + 0.4 * power, curve: 0 };
    downBefore = pins.filter((q) => q.down).length;
    phase = "roll";
    ctx.sound.whoosh();
  };

  return {
    title: "Bumper Bowling",
    emoji: "🎳",
    color: "#ff7b7b",
    usesScore: true,

    start(c) {
      ctx = c;
      bowler = 1; // newFrame flips to P1 first
      armDownAt = new Map();
      ball = null;
      newFrame();
    },

    update(dt, t) {
      now = t;
      if (phase === "aim") {
        const p = current();
        if (!p) return;
        // Arm swing: a hand that was down by the hip comes up fast.
        for (const [h, v] of [[p.handL, p.velL], [p.handR, p.velR]] as const) {
          if (h.v < 0.3) continue;
          if (h.y > p.hipMid.y - 0.1 * p.torso) armDownAt.set(p.id, t);
          const wasDown = t - (armDownAt.get(p.id) ?? -1e9) < 0.8;
          if (wasDown && h.y < p.shoulderMid.y + 0.3 * p.torso && -v.y > 2.5 * p.torso) {
            release(p, Math.min(1, -v.y / (8 * p.torso)));
            armDownAt.delete(p.id);
            break;
          }
        }
      } else if (phase === "roll" && ball) {
        ball.v += ball.speed * dt;
        ball.u = Math.max(-BUMPER, Math.min(BUMPER, ball.u + ball.curve * dt));
        if (Math.abs(ball.u) >= BUMPER) ball.curve = -Math.sign(ball.u) * 0.1; // bonk off the bumper

        for (const pin of pins) {
          if (pin.down) continue;
          const du = pin.u - ball.u;
          const dv = (pin.v - ball.v) * 2.5;
          if (Math.hypot(du, dv) < BALL_R + PIN_R) {
            pin.down = true;
            pin.vu = du * 6 + (Math.random() - 0.5) * 0.4;
            pin.vv = 0.5 + Math.random() * 0.3;
            ctx.sound.crash();
          }
        }
        if (ball.v > 1.12) {
          ball = null;
          phase = "settle";
          phaseT = 1.4;
        }
      } else if (phase === "settle") {
        phaseT -= dt;
        if (phaseT <= 0) {
          const down = pins.filter((q) => q.down).length;
          const knocked = down - downBefore;
          const p = current();
          const { W, H } = ctx.view;
          if (knocked > 0) ctx.addScore(knocked, W / 2, H * 0.3);
          if (down === 10) {
            ctx.sound.cheer();
            ctx.fx.confetti(W / 2, H * 0.3, 90);
            ctx.sound.say(roll === 0 ? "Strike! Amazing!" : "Spare! Great job!");
            newFrame();
          } else if (roll === 0) {
            roll = 1;
            phase = "aim";
            ctx.sound.say(knocked ? `${knocked}! Roll again!` : "Roll again!");
          } else {
            ctx.sound.say(`${down} pins!`);
            if (p) ctx.fx.stars(p.head.x, p.head.y, 6);
            newFrame();
          }
        }
      }

      // Knocked pins slide and topple others (a tiny chain reaction).
      for (const pin of pins) {
        if (!pin.down || (pin.vu === 0 && pin.vv === 0)) continue;
        pin.u += pin.vu * dt * 0.3;
        pin.v += pin.vv * dt * 0.3;
        pin.tilt = Math.min(1, pin.tilt + dt * 4);
        pin.vu *= 1 - dt * 3;
        pin.vv *= 1 - dt * 3;
        if (Math.abs(pin.vu) + Math.abs(pin.vv) < 0.05) pin.vu = pin.vv = 0;
        for (const other of pins)
          if (!other.down && Math.hypot(other.u - pin.u, (other.v - pin.v) * 2.5) < PIN_R * 2.2) {
            other.down = true;
            other.vu = (other.u - pin.u) * 5 + pin.vu * 0.5;
            other.vv = pin.vv * 0.7;
            ctx.sound.crash();
          }
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;

      // Lane with bumpers.
      const a = project(-1, 0), b = project(1, 0), c = project(1, 1.15), d = project(-1, 1.15);
      g.fillStyle = "rgba(222,172,110,0.8)";
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.fill();
      g.lineWidth = 10 * unit;
      g.strokeStyle = "#ffd23f";
      for (const s of [-1, 1]) {
        const p0 = project(s, 0), p1 = project(s, 1.15);
        g.beginPath();
        g.moveTo(p0.x, p0.y);
        g.lineTo(p1.x, p1.y);
        g.stroke();
      }
      // Aim arrows.
      g.fillStyle = "rgba(120,70,30,0.6)";
      for (let i = -3; i <= 3; i++) {
        const p = project(i * 0.22, 0.3);
        g.beginPath();
        g.moveTo(p.x, p.y - 14 * unit * p.s);
        g.lineTo(p.x - 8 * unit * p.s, p.y);
        g.lineTo(p.x + 8 * unit * p.s, p.y);
        g.fill();
      }

      // Pins, far to near.
      for (const pin of [...pins].sort((p, q) => q.v - p.v)) {
        const p = project(pin.u, pin.v);
        const h = 70 * unit * p.s;
        const w = 22 * unit * p.s;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(pin.tilt * (pin.vu >= 0 ? 1.3 : -1.3));
        g.globalAlpha = pin.down ? 0.6 : 1;
        g.fillStyle = "#fff";
        g.beginPath();
        g.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#e53935";
        g.fillRect(-w / 2, -h * 0.72, w, h * 0.08);
        g.restore();
      }
      g.globalAlpha = 1;

      if (ball) {
        const p = project(ball.u, ball.v);
        const r = BALL_R * (W * 0.34) / 2 * p.s * 0.9;
        const color = current()?.color ?? "#6a5acd";
        const grad = g.createRadialGradient(p.x - r * 0.3, p.y - r * 1.3, r * 0.1, p.x, p.y - r, r);
        grad.addColorStop(0, "#fff");
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, "#222");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(p.x, p.y - r, r, 0, Math.PI * 2);
        g.fill();
      }

      const p = current();
      if (phase === "aim") {
        const pulse = 1 + 0.06 * Math.sin(now * 8);
        label(g, "Swing your arm! 🎳", W / 2, H * 0.18, 56 * unit * pulse, p?.color ?? "#fff");
        if (p) {
          g.strokeStyle = p.color;
          g.lineWidth = 8 * unit;
          g.beginPath();
          g.arc(p.head.x, p.head.y, p.headR * 1.6, 0, Math.PI * 2);
          g.stroke();
        }
      }
      label(g, `Roll ${roll + 1}`, 30 * unit, H - 40 * unit, 30 * unit, "#fff", "left");
    },

    onKey(k) {
      if (k !== " " || phase !== "aim") return false;
      release(current(), 0.6); // keyboard roll for testing
      return true;
    },
  };
}
