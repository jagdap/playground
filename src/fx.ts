import { label } from "./view";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "dot" | "star" | "text";
  text?: string;
  rot: number;
  spin: number;
  gravity: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const CONFETTI = ["#ff5fa2", "#ffd23f", "#3fb6ff", "#7cff6b", "#b388ff", "#ff9f43"];

export class Fx {
  private ps: Particle[] = [];
  constructor(private unit: () => number) {}

  burst(x: number, y: number, color: string, n = 14) {
    const u = this.unit();
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(120, 320) * u;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rand(0.4, 0.8), size: rand(5, 11) * u, color, kind: "dot", gravity: 300 * u });
    }
  }

  confetti(x: number, y: number, n = 40) {
    const u = this.unit();
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0);
      const s = rand(250, 650) * u;
      this.add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rand(1.2, 2), size: rand(8, 14) * u,
        color: CONFETTI[i % CONFETTI.length], kind: "dot", gravity: 700 * u,
      });
    }
  }

  stars(x: number, y: number, n = 8) {
    const u = this.unit();
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(150, 380) * u;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 150 * u, max: rand(0.8, 1.3), size: rand(14, 24) * u, color: "#ffd23f", kind: "star", gravity: 400 * u });
    }
  }

  text(x: number, y: number, text: string, color = "#ffd23f") {
    const u = this.unit();
    this.add({ x, y, vx: 0, vy: -90 * u, max: 1, size: 44 * u, color, kind: "text", text, gravity: 0 });
  }

  private add(p: Omit<Particle, "life" | "rot" | "spin">) {
    this.ps.push({ ...p, life: p.max, rot: rand(0, Math.PI * 2), spin: rand(-6, 6) });
  }

  update(dt: number) {
    for (const p of this.ps) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.ps = this.ps.filter((p) => p.life > 0);
  }

  clear() {
    this.ps = [];
  }

  draw(g: CanvasRenderingContext2D) {
    for (const p of this.ps) {
      g.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      if (p.kind === "text") {
        label(g, p.text!, p.x, p.y, p.size, p.color);
      } else if (p.kind === "star") {
        drawStar(g, p.x, p.y, p.size, p.rot, p.color);
      } else {
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
}

export function drawStar(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, color: string) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = r * 0.12;
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.stroke();
  g.restore();
}
