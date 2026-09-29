// Synthesized sound effects (no audio files) plus spoken prompts via the Mac's voices.
export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      const prefer = ["Samantha", "Karen", "Moira", "Tessa"];
      this.voice =
        prefer.map((n) => voices.find((v) => v.name.startsWith(n))).find(Boolean) ??
        voices.find((v) => v.lang.startsWith("en")) ??
        null;
    };
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
  }

  get locked() {
    return !this.ctx || this.ctx.state !== "running";
  }

  /** Browsers only allow audio after a user gesture; call from key/click handlers. */
  unlock() {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }

  say(text: string) {
    if (this.muted) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.25;
    if (this.voice) u.voice = this.voice;
    speechSynthesis.speak(u);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  pop() {
    const f = 500 + Math.random() * 400;
    this.tone(f, 0.09, "sine", 0.35, f * 1.8);
  }

  ding() {
    this.tone(880, 0.35, "triangle", 0.25);
    this.tone(1320, 0.4, "sine", 0.12, undefined, 0.05);
  }

  cheer() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.22, undefined, i * 0.09));
  }

  boop() {
    this.tone(300, 0.18, "sine", 0.18, 200);
  }

  /** Audio clock in seconds (for rhythm games); 0 before unlock. */
  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  /** Schedules a note at an absolute audio-clock time. */
  note(freq: number, when: number, dur: number, type: OscillatorType = "triangle", vol = 0.15) {
    this.tone(freq, dur, type, vol, undefined, Math.max(0, when - this.now));
  }

  kick(when: number) {
    this.tone(150, 0.25, "sine", 0.5, 45, Math.max(0, when - this.now));
  }

  snare(when: number) {
    this.noise(when, 0.15, 1800, 0.22, "highpass");
  }

  hat(when: number) {
    this.noise(when, 0.05, 7000, 0.08, "highpass");
  }

  /** Bowling pins. */
  crash() {
    this.noise(this.now, 0.5, 900, 0.35, "bandpass");
    this.tone(180, 0.3, "square", 0.08, 90);
  }

  /** Bat hitting the ball. */
  crack() {
    this.noise(this.now, 0.08, 2500, 0.45, "highpass");
    this.tone(1200, 0.12, "triangle", 0.2, 600);
  }

  private noise(when: number, len: number, freq: number, vol: number, type: BiquadFilterType) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(Math.max(when, ctx.currentTime));
  }

  whoosh() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const len = 0.35;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + len);
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }
}

const PRAISE = ["Great teamwork!", "Wow!", "You're amazing!", "Super duper!", "Yay!", "High five!", "So good!"];
export const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];
