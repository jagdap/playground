import type { PlayerTracker } from "./players";
import { UI_FONT, type View } from "./view";

const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 19], [16, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12],
];

export function drawDebug(
  g: CanvasRenderingContext2D,
  view: View,
  players: PlayerTracker,
  fps: { render: number; detect: number; detectMs: number },
) {
  const { W, unit } = view;
  for (const p of players.active) {
    g.lineWidth = 4;
    g.strokeStyle = p.color;
    for (const [a, b] of BONES) {
      const A = p.pts[a];
      const B = p.pts[b];
      if (A.v < 0.3 || B.v < 0.3) continue;
      g.beginPath();
      g.moveTo(A.x, A.y);
      g.lineTo(B.x, B.y);
      g.stroke();
    }
    g.fillStyle = "#fff";
    for (const pt of p.pts) {
      if (pt.v < 0.3) continue;
      g.beginPath();
      g.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      g.fill();
    }
    // Standing baselines used by jump/duck detection.
    if (p.baseHipY !== null) {
      g.setLineDash([8, 8]);
      g.lineWidth = 2;
      const x0 = p.shoulderMid.x - p.torso;
      const x1 = p.shoulderMid.x + p.torso;
      for (const y of [p.baseHipY, p.baseShoulderY]) {
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x1, y);
        g.stroke();
      }
      g.setLineDash([]);
    }
  }

  const lines = [
    `render ${fps.render} fps · detect ${fps.detect} fps (${fps.detectMs.toFixed(1)} ms)`,
    ...players.all.map((p) =>
      p.present
        ? `${p.name}: torso ${p.torso.toFixed(0)}px${p.jumping ? " JUMP" : ""}${p.ducking ? " DUCK" : ""}`
        : `${p.name}: —`,
    ),
  ];
  const lh = 22 * unit;
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.fillRect(W - 420 * unit, 100 * unit, 400 * unit, lh * lines.length + 16 * unit);
  g.fillStyle = "#7cff6b";
  g.font = `600 ${16 * unit}px ${UI_FONT}`;
  g.textAlign = "left";
  g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, W - 410 * unit, 108 * unit + i * lh));
}
