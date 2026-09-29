import { praise } from "../audio";
import { dist, type Player } from "../players";
import { drawStar } from "../fx";
import { label } from "../view";
import type { Game, GameContext } from "./types";

// Rhythm game: touch stars on the beat of a (synthesized) song.
type Song = { name: string; bpm: number; chords: number[][]; beats: number };
type Note = { beat: number; time: number; x: number; y: number; color: string; state: "live" | "hit" | "miss"; endT: number };

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const SONGS: Song[] = [
  { name: "Sunny Hop", bpm: 96, beats: 64, chords: [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]] },
  { name: "Moon Groove", bpm: 88, beats: 64, chords: [[57, 60, 64], [65, 69, 72], [60, 64, 67], [67, 71, 74]] },
  { name: "Rocket Party", bpm: 104, beats: 64, chords: [[62, 66, 69], [59, 62, 66], [67, 71, 74], [69, 73, 76]] },
];

const LEAD = 1.5; // seconds a star is visible before its beat
const EARLY = 0.45;
const LATE = 0.35;
// Reach spots around a player: angle (screen degrees, y down) from the shoulders.
const SPOTS = [-150, -30, 180, 0, -90, 150, 30];

export function starDance(): Game {
  let ctx: GameContext;
  let song = SONGS[0];
  let songIdx = 0;
  let t0 = 0; // audio time of beat 0
  let nextStep = 0; // next 8th-note step to schedule
  let nextNoteBeat = 0;
  let notes: Note[] = [];
  let combo = 0;
  let hits = 0;
  let total = 0;
  let turn = 0;
  let over = 0; // countdown after a song ends

  const beatLen = () => 60 / song.bpm;
  const players = () => ctx.players.active;

  const startSong = (i: number) => {
    songIdx = i % SONGS.length;
    song = SONGS[songIdx];
    t0 = ctx.sound.now + 2.5;
    nextStep = 0;
    nextNoteBeat = 4;
    notes = [];
    combo = hits = total = 0;
    over = 0;
    ctx.sound.say(`Let's dance to ${song.name}! Touch the stars on the beat!`);
  };

  const scheduleMusic = () => {
    const now = ctx.sound.now;
    const step = beatLen() / 2;
    while (nextStep < song.beats * 2 && t0 + nextStep * step < now + 0.25) {
      const when = t0 + nextStep * step;
      const beat = Math.floor(nextStep / 2);
      const chord = song.chords[Math.floor(beat / 4) % song.chords.length];
      const s = ctx.sound;
      s.hat(when);
      if (nextStep % 2 === 0) {
        if (beat % 2 === 0) s.kick(when);
        else s.snare(when);
        s.note(hz(chord[0] - 24), when, step * 1.8, "sine", 0.22);
      }
      s.note(hz(chord[nextStep % 3] + 12), when, step * 0.9, "triangle", 0.06);
      nextStep++;
    }
  };

  const spot = (p: Player | undefined, k: number) => {
    const { W, H, unit } = ctx.view;
    const deg = SPOTS[k % SPOTS.length];
    const a = (deg * Math.PI) / 180;
    const cx = p ? p.shoulderMid.x : W / 2;
    const cy = p ? p.shoulderMid.y : H * 0.45;
    const r = p ? 1.35 * p.torso : 180 * unit;
    const m = 70 * unit;
    return {
      x: Math.min(W - m, Math.max(m, cx + Math.cos(a) * r)),
      y: Math.min(H - m, Math.max(m + 80 * unit, cy + Math.sin(a) * r)),
    };
  };

  const spawnNotes = () => {
    const now = ctx.sound.now;
    while (nextNoteBeat < song.beats - 4 && t0 + nextNoteBeat * beatLen() - LEAD < now) {
      const ps = players();
      const p = ps.length ? ps[turn++ % ps.length] : undefined;
      const k = Math.floor(Math.random() * SPOTS.length);
      const time = t0 + nextNoteBeat * beatLen();
      const color = p?.color ?? "#ffd23f";
      notes.push({ beat: nextNoteBeat, time, ...spot(p, k), color, state: "live", endT: 0 });
      // Every 8 beats, a two-handed pair on the same beat.
      if (nextNoteBeat % 8 === 0 && nextNoteBeat > 8) {
        notes.push({ beat: nextNoteBeat, time, ...spot(p, k + 3), color, state: "live", endT: 0 });
        total++;
      }
      total++;
      nextNoteBeat += 2;
    }
  };

  return {
    title: "Star Dance",
    emoji: "🌟",
    color: "#8f7cff",
    ownsMusic: true,
    usesScore: true,

    start(c) {
      ctx = c;
      turn = 0;
      startSong(0);
    },

    update(dt) {
      const now = ctx.sound.now;
      const { unit } = ctx.view;
      if (over > 0) {
        over -= dt;
        if (over <= 0) startSong(songIdx + 1);
        return;
      }
      scheduleMusic();
      spawnNotes();

      const hands = players().flatMap((p) => p.hands).filter((h) => h.v > 0.4);
      for (const n of notes) {
        if (n.state !== "live") continue;
        const d = now - n.time;
        if (d > LATE) {
          n.state = "miss";
          n.endT = now;
          combo = 0;
          continue;
        }
        if (d < -EARLY) continue;
        if (hands.some((h) => dist(h, n) < 85 * unit)) {
          n.state = "hit";
          n.endT = now;
          hits++;
          combo++;
          const perfect = Math.abs(d) < 0.15;
          ctx.sound.ding();
          ctx.fx.stars(n.x, n.y, perfect ? 10 : 5);
          ctx.fx.text(n.x, n.y - 50 * unit, perfect ? "Perfect!" : "Good!", perfect ? "#ffd23f" : "#fff");
          ctx.addScore(perfect ? 2 : 1, n.x, n.y + 50 * unit);
          if (combo > 0 && combo % 10 === 0) ctx.sound.say(`${combo} in a row!`);
        }
      }
      notes = notes.filter((n) => n.state === "live" || now - n.endT < 0.5);

      if (now > t0 + song.beats * beatLen() + 0.5) {
        over = 4;
        ctx.sound.cheer();
        ctx.sound.say(`${praise()} You caught ${hits} stars!`);
        ctx.fx.confetti(ctx.view.W / 2, ctx.view.H * 0.4, 80);
      }
    },

    draw(g) {
      const { W, H, unit } = ctx.view;
      const now = ctx.sound.now;
      const r = 50 * unit;

      if (over > 0) {
        label(g, "Song complete!", W / 2, H * 0.4, 80 * unit);
        label(g, `🌟 ${hits} / ${total}`, W / 2, H * 0.55, 64 * unit, "#ffd23f");
        return;
      }
      if (now < t0) label(g, String(Math.ceil(t0 - now)), W / 2, H * 0.45, 140 * unit, "#ffd23f");

      for (const n of notes) {
        const d = n.time - now;
        if (n.state === "live") {
          // Approach ring shrinks onto the star exactly on the beat.
          const k = Math.max(0, d / LEAD);
          g.lineWidth = 6 * unit;
          g.strokeStyle = n.color;
          g.globalAlpha = 1 - k * 0.5;
          g.beginPath();
          g.arc(n.x, n.y, r * (1 + 2.2 * k), 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          drawStar(g, n.x, n.y, r * (d < EARLY ? 1.15 : 0.95), 0, d < EARLY ? "#ffd23f" : "#fff6c2");
        } else if (n.state === "miss") {
          g.globalAlpha = Math.max(0, 1 - (now - n.endT) * 2);
          drawStar(g, n.x, n.y + (now - n.endT) * 80 * unit, r * 0.8, 0.3, "rgba(200,200,200,0.6)");
          g.globalAlpha = 1;
        }
      }

      label(g, `♪ ${song.name}`, 30 * unit, H - 40 * unit, 30 * unit, "#fff", "left");
      if (combo >= 3) label(g, `${combo} combo!`, W / 2, H - 50 * unit, 44 * unit, "#ffd23f");
    },

    next() {
      startSong(songIdx + 1);
    },

    resume(pausedFor) {
      // The audio clock kept running while paused: push the song later.
      t0 += pausedFor;
      for (const n of notes) n.time += pausedFor;
    },

    onKey(k) {
      if (k !== "n") return false;
      startSong(songIdx + 1);
      return true;
    },
  };
}
