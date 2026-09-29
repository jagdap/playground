import { LM, type Player } from "../players";
import { emoji, label } from "../view";
import type { Game, GameContext } from "./types";

// Batting: swing when the pitch arrives. Very forgiving timing.
const PITCH_TIME = 1.8; // seconds from release to the plate
const EARLY = 0.5; // swing window before arrival
const LATE = 0.35; // and after
const COLOR_NAMES = ["Pink", "Blue"];

type Pitch = { start: number; batter: number; swung: boolean; thrown: boolean };
type Flight = { x: number; y: number; vx: number; vy: number; t: number; feet: number; homer: boolean };

export function homeRun(): Game {
  let ctx: GameContext;
  let pitch: Pitch | null = null;
  let flight: Flight | null = null;
  let waitT = 0;
  let turn = 0;
  let lastSwing = new Map<number, number>();
  let message: { text: string; color: string; until: number } | null = null;
  let now = 0;
  let forceSwing = false;

  const batter = (): Player | undefined => {
    const ps = ctx.players.active;
    return ps.find((p) => p.id === pitch?.batter) ?? ps[0];
  };

  // Where the ball crosses the plate: in front of the batter's belly.
  const zone = (p: Player | undefined) => {
    const { W, H } = ctx.view;
    return p ? { x: p.shoulderMid.x, y: p.shoulderMid.y + 0.6 * p.torso } : { x: W / 2, y: H * 0.6 };
  };
  const mound = () => ({ x: ctx.view.W / 2, y: ctx.view.H * 0.3 });

  const nextPitch = (t: number) => {
    const ps = ctx.players.active;
    const who = ps.length ? ps[turn++ % ps.length] : undefined;
    pitch = { start: t + 1.2, batter: who?.id ?? 0, swung: false, thrown: false };
    const name = ps.length > 1 && who ? `${COLOR_NAMES[who.id]}, ` : "";
    ctx.sound.say(`${name}get ready!`);
  };

  const swingDetected = (p: Player, t: number) => {
    if (forceSwing) {
      forceSwing = false;
      return true;
    }
    // Fast sideways hands = a swing. One swing per 0.8s.
    const speed = Math.max(Math.abs(p.velL.x), Math.abs(p.velR.x));
    if (speed < 3.5 * p.torso || t - (lastSwing.get(p.id) ?? -1e9) < 0.8) return false;
    lastSwing.set(p.id, t);
    return true;
  };

  return {
    title: "Home Run",
    emoji: "⚾",
    color: "#5fd0a8",
    usesScore: true,

    start(c) {
      ctx = c;
      turn = 0;
      flight = null;
      lastSwing = new Map();
      message = null;
      ctx.sound.say("Swing your arms like a bat when the ball comes!");
      nextPitch(performance.now() / 1000 + 1.5);
    },

    update(dt, t) {
      now = t;
      const { W, H, unit } = ctx.view;

      if (pitch) {
        const p = batter();
        const arrive = pitch.start + PITCH_TIME;
        if (t >= pitch.start && !pitch.thrown) {
          pitch.thrown = true;
          ctx.sound.whoosh();
        }
        if (p && !pitch.swung && swingDetected(p, t) && t > arrive - EARLY && t < arrive + LATE) {
          pitch.swung = true;
          const off = Math.abs(t - arrive);
          const quality = 1 - off / Math.max(EARLY, LATE);
          const feet = Math.round(120 + 330 * quality);
          const homer = feet >= 300;
          const z = zone(p);
          const dir = t < arrive ? -1 : 1; // early pulls one way, late the other
          flight = { x: z.x, y: z.y, vx: dir * (200 + 300 * (1 - quality)) * unit, vy: -(700 + 500 * quality) * unit, t: 0, feet, homer };
          ctx.sound.crack();
          pitch = null;
          if (homer) {
            ctx.sound.cheer();
            ctx.sound.say(`Home run! ${feet} feet!`);
            ctx.addScore(3, z.x, z.y - 80 * unit);
            message = { text: `🎉 HOME RUN! ${feet} ft`, color: "#ffd23f", until: t + 2.5 };
          } else {
            ctx.sound.ding();
            ctx.sound.say("Nice hit!");
            ctx.addScore(1, z.x, z.y - 80 * unit);
            message = { text: `Hit! ${feet} ft`, color: "#fff", until: t + 2 };
          }
          waitT = 3;
        } else if (t > arrive + LATE) {
          ctx.sound.boop();
          ctx.sound.say(pitch.swung ? "So close!" : "Swing when the ball comes!");
          message = { text: "Try again!", color: "#fff", until: t + 1.5 };
          pitch = null;
          waitT = 1.5;
        }
      } else {
        waitT -= dt;
        if (waitT <= 0) nextPitch(t);
      }

      if (flight) {
        flight.t += dt;
        flight.x += flight.vx * dt;
        flight.y += flight.vy * dt;
        flight.vy += 600 * unit * dt;
        if (flight.homer && Math.floor(flight.t * 10) % 3 === 0) ctx.fx.burst(flight.x, flight.y, "#ffd23f", 2);
        if (flight.homer && flight.t > 0.9 && flight.t - dt <= 0.9) ctx.fx.confetti(W / 2, H * 0.2, 90);
        if (flight.t > 2.5) flight = null;
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      const m = mound();
      emoji(g, "🤖", m.x, m.y - 30 * unit, 90 * unit);

      const p = batter();
      if (pitch) {
        const k = Math.min(1, Math.max(0, (now - pitch.start) / PITCH_TIME));
        const z = zone(p);
        if (now >= pitch.start) {
          // Ball grows as it comes toward the batter, with a little arc.
          const x = m.x + (z.x - m.x) * k;
          const y = m.y + (z.y - m.y) * k - Math.sin(k * Math.PI) * 60 * unit;
          emoji(g, "⚾", x, y, (18 + 60 * k * k) * unit);
        }
        // Target circle where to swing.
        g.lineWidth = 6 * unit;
        g.strokeStyle = p?.color ?? "#fff";
        g.setLineDash([12 * unit, 10 * unit]);
        g.beginPath();
        g.arc(z.x, z.y, 70 * unit, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        if (now > pitch.start + PITCH_TIME - EARLY) label(g, "SWING!", W / 2, H * 0.15, 80 * unit, "#ffd23f");
      }

      // A bat held in the batter's hands.
      for (const pl of ctx.players.active) {
        const hL = pl.handL, hR = pl.handR;
        if (hL.v < 0.3 && hR.v < 0.3) continue;
        const hx = (hL.x + hR.x) / 2, hy = (hL.y + hR.y) / 2;
        const el = pl.pts[hL.v > hR.v ? LM.lElbow : LM.rElbow];
        let dx = hx - el.x, dy = hy - el.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const L = 1.4 * pl.torso;
        g.lineCap = "round";
        g.strokeStyle = "#c68642";
        g.lineWidth = 16 * unit;
        g.beginPath();
        g.moveTo(hx, hy);
        g.lineTo(hx + dx * L, hy + dy * L);
        g.stroke();
        g.lineWidth = 26 * unit;
        g.beginPath();
        g.moveTo(hx + dx * L * 0.6, hy + dy * L * 0.6);
        g.lineTo(hx + dx * L, hy + dy * L);
        g.stroke();
      }

      if (flight) emoji(g, "⚾", flight.x, flight.y, Math.max(12, 70 - flight.t * 30) * unit);
      if (message && now < message.until) label(g, message.text, W / 2, H * 0.24, 64 * unit, message.color);
    },

    resume() {
      // Throw a fresh pitch rather than one that "arrived" during the pause.
      pitch = null;
      flight = null;
      waitT = 1;
    },

    onKey(k) {
      if (k !== " " || !pitch) return false;
      // Keyboard swing for testing: a perfectly timed swing.
      pitch.start = now - PITCH_TIME + 0.01;
      forceSwing = true;
      return true;
    },
  };
}
