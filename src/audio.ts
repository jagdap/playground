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
