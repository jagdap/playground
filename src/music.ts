import type { Sound } from "./audio";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A synthesized four-on-the-floor groove with a beat clock, for workouts and dancing. */
export class Groove {
  playing = false;
  private t0 = 0;
  private step = 0;

  constructor(
    private sound: Sound,
    public bpm = 110,
    private chords = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
  ) {}

  get beatLen() {
    return 60 / this.bpm;
  }

  start(delay = 0.1) {
    this.t0 = this.sound.now + delay;
    this.step = 0;
    this.playing = true;
  }

  stop() {
    this.playing = false;
  }

  /** Audio-clock time of a beat number. */
  timeOfBeat(beat: number) {
    return this.t0 + beat * this.beatLen;
  }

  /** Current beat (fractional). */
  get beat() {
    return (this.sound.now - this.t0) / this.beatLen;
  }

  /** Push the song later, e.g. after a pause. */
  shift(seconds: number) {
    this.t0 += seconds;
  }

  /** Call every frame: schedules the next ~250ms of notes. */
  update() {
    if (!this.playing) return;
    const s = this.sound;
    const eighth = this.beatLen / 2;
    while (this.t0 + this.step * eighth < s.now + 0.25) {
      const when = this.t0 + this.step * eighth;
      const beat = Math.floor(this.step / 2);
      const chord = this.chords[Math.floor(beat / 4) % this.chords.length];
      s.hat(when);
      if (this.step % 2 === 0) {
        s.kick(when);
        if (beat % 2 === 1) s.snare(when);
      } else {
        s.note(hz(chord[0] - 24), when, eighth * 0.9, "sawtooth", 0.07);
      }
      if (this.step % 4 === 2) s.note(hz(chord[(beat / 2) % 3 | 0] + 12), when, eighth * 1.5, "triangle", 0.06);
      this.step++;
    }
  }
}
