import { praise } from "../audio";
import { Groove } from "../music";
import { emoji, label } from "../view";
import { rand, type Game, type GameContext } from "./types";

// Dance while the music plays; freeze like a statue when it stops.
const STILL = 0.8; // torso-lengths/s of motion allowed while frozen
const GRACE = 0.6; // seconds to stop after "Freeze!"
const FREEZE = 3.5;
const SILLY = ["🥴", "🤪", "🙃", "😜", "🐒"];

export function freezeDance(): Game {
  let ctx: GameContext;
  let groove: Groove;
  let phase: "dance" | "freeze" = "dance";
  let phaseT = 0;
  let wobbled = new Map<number, string>(); // player id -> silly face
  let danceCredit = new Map<number, number>();

  const players = () => ctx.players.active;

  const dance = () => {
    phase = "dance";
    phaseT = rand(6, 14);
    wobbled = new Map();
    if (ctx.music.enabled) ctx.music.play(); // your own songs
    else {
      groove.bpm = [100, 112, 124][Math.floor(Math.random() * 3)];
      groove.start(0.1);
    }
    ctx.sound.say("Dance!");
  };

  const freeze = () => {
    phase = "freeze";
    phaseT = FREEZE;
    groove.stop();
    ctx.music.pause();
    ctx.sound.say("Freeze!");
  };

  return {
    title: "Freeze Dance",
    emoji: "🧊",
    color: "#56c9e8",
    ownsMusic: true,
    usesScore: true,

    start(c) {
      ctx = c;
      groove = new Groove(c.sound, 112);
      danceCredit = new Map();
      c.sound.say("Dance when the music plays, and freeze when it stops!");
      dance();
    },

    update(dt) {
      phaseT -= dt;
      if (phase === "dance") {
        groove.update();
        // Reward dancing: a star for every few seconds of real movement.
        for (const p of players()) {
          if (p.motion < 1.5) continue;
          const c = (danceCredit.get(p.id) ?? 0) + dt;
          danceCredit.set(p.id, c % 4);
          if (Math.random() < dt * 6) ctx.fx.burst(p.head.x + rand(-80, 80), p.head.y + rand(0, 200), `hsl(${rand(0, 360)} 100% 65%)`, 3);
          if (c >= 4) ctx.addScore(1, p.head.x, p.head.y - 80);
        }
        if (phaseT <= 0) freeze();
      } else {
        const elapsed = FREEZE - phaseT;
        if (elapsed > GRACE)
          for (const p of players())
            if (!wobbled.has(p.id) && p.motion > STILL) {
              wobbled.set(p.id, SILLY[Math.floor(Math.random() * SILLY.length)]);
              ctx.sound.boop();
              ctx.fx.text(p.head.x, p.head.y - 90, "Wiggle!", "#ffd23f");
            }
        if (phaseT <= 0) {
          const frozen = players().filter((p) => !wobbled.has(p.id));
          for (const p of frozen) {
            ctx.fx.stars(p.head.x, p.head.y, 10);
            ctx.addScore(2, p.head.x, p.head.y - 80);
          }
          if (frozen.length) {
            ctx.sound.cheer();
            ctx.sound.say(frozen.length === players().length ? `${praise()} Perfect statues!` : "Nice freezing!");
          }
          dance();
        }
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      if (phase === "dance") {
        const beat = ctx.music.enabled ? performance.now() / 500 : groove.beat;
        const pulse = 1 + 0.08 * Math.sin(beat * Math.PI * 2);
        label(g, "💃 DANCE! 🕺", W / 2, H * 0.14, 70 * unit * pulse, "#ff6fb5");
        return;
      }
      g.fillStyle = "rgba(140,220,255,0.18)";
      g.fillRect(0, 0, W, H);
      label(g, "🧊 FREEZE! 🧊", W / 2, H * 0.14, 80 * unit, "#bdf0ff");
      for (const p of players()) {
        const face = wobbled.get(p.id);
        if (face) emoji(g, face, p.head.x, p.head.y, p.headR * 2.6);
        else emoji(g, "🗿", p.head.x, p.head.y - p.headR * 1.6, p.headR * 1.1);
      }
    },

    resume() {
      if (phase !== "dance") return;
      if (ctx.music.enabled) ctx.music.play();
      else groove.start(0.1);
    },
  };
}
