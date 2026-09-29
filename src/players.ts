import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { View } from "./view";

export type Pt = { x: number; y: number; v: number };

// MediaPipe's 33-point BlazePose indices. "l"/"r" are the person's own sides;
// because the video is mirrored, the person's left shows on the screen's left.
export const LM = {
  nose: 0,
  lEye: 2,
  rEye: 5,
  lEar: 7,
  rEar: 8,
  mouthL: 9,
  mouthR: 10,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lIndex: 19,
  rIndex: 20,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
} as const;

const MOTION_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export const PLAYER_COLORS = ["#ff5fa2", "#3fb6ff"];

/** One Euro filter: smooths jitter when still, stays responsive when moving fast. */
class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(
    private minCutoff = 1.5,
    private beta = 0.01,
    private dCutoff = 1,
  ) {}
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x: number, t: number) {
    if (this.x === null) {
      this.x = x;
      this.t = t;
      return x;
    }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export class Player {
  readonly color: string;
  pts: Pt[] = [];
  present = false;
  lastSeen = -1e9;
  private filters: [OneEuro, OneEuro][] = [];

  // Derived body features, in screen pixels.
  head: Pt = { x: 0, y: 0, v: 0 };
  shoulderMid: Pt = { x: 0, y: 0, v: 0 };
  hipMid: Pt = { x: 0, y: 0, v: 0 };
  handL: Pt = { x: 0, y: 0, v: 0 };
  handR: Pt = { x: 0, y: 0, v: 0 };
  torso = 100;
  /** Hand velocities in px/s. */
  velL = { x: 0, y: 0 };
  velR = { x: 0, y: 0 };
  /** Smoothed whole-body motion, in torso-lengths per second (≈0 when frozen). */
  motion = 0;
  /** Time of the most recent clap (hands coming together). */
  lastClapT = -1e9;
  private handsTogether = false;

  // Standing baseline for jump / duck detection.
  baseHipY: number | null = null;
  baseShoulderY = 0;
  private offBaselineSince: number | null = null;
  jumping = false;
  ducking = false;
  lastJumpT = -1e9;
  lastDuckT = -1e9;

  constructor(readonly id: number) {
    this.color = PLAYER_COLORS[id];
    this.reset();
  }

  get name() {
    return `P${this.id + 1}`;
  }

  get hands() {
    return [this.handL, this.handR];
  }

  get vels() {
    return [this.velL, this.velR];
  }

  /** Rough head radius in px, from ear spacing (falls back to torso size). */
  get headR() {
    const l = this.pts[LM.lEar];
    const r = this.pts[LM.rEar];
    return Math.max(dist(l, r) * 0.75, 0.35 * this.torso);
  }

  reset() {
    this.filters = Array.from({ length: 33 }, () => [new OneEuro(), new OneEuro()]);
    this.baseHipY = null;
    this.offBaselineSince = null;
    this.jumping = this.ducking = false;
  }

  ingest(raw: Pt[], t: number) {
    const dt = t - this.lastSeen;
    const prevL = this.handL;
    const prevR = this.handR;
    const prevPts = this.pts;
    this.pts = raw.map((p, i) => ({
      x: this.filters[i][0].filter(p.x, t),
      y: this.filters[i][1].filter(p.y, t),
      v: p.v,
    }));
    this.present = true;
    this.lastSeen = t;

    const p = this.pts;
    this.head = p[LM.nose];
    this.shoulderMid = mid(p[LM.lShoulder], p[LM.rShoulder]);
    this.hipMid = mid(p[LM.lHip], p[LM.rHip]);
    this.torso = Math.max(dist(this.shoulderMid, this.hipMid), 30);
    this.handL = mid(p[LM.lWrist], p[LM.lIndex]);
    this.handR = mid(p[LM.rWrist], p[LM.rIndex]);
    if (dt > 0 && dt < 0.2) {
      const ema = (v: { x: number; y: number }, a: Pt, b: Pt) => {
        v.x += 0.5 * ((b.x - a.x) / dt - v.x);
        v.y += 0.5 * ((b.y - a.y) / dt - v.y);
      };
      ema(this.velL, prevL, this.handL);
      ema(this.velR, prevR, this.handR);
    } else {
      this.velL = { x: 0, y: 0 };
      this.velR = { x: 0, y: 0 };
    }
    if (dt > 0 && dt < 0.2 && prevPts.length) {
      let sum = 0;
      let n = 0;
      for (const i of MOTION_JOINTS) {
        if (p[i].v < 0.5) continue;
        sum += dist(p[i], prevPts[i]);
        n++;
      }
      if (n) this.motion += 0.3 * (sum / n / dt / this.torso - this.motion);
    } else this.motion = 0;
    this.updateClap(t);
    this.updateBaseline(t);
  }

  private updateClap(t: number) {
    if (this.handL.v < 0.4 || this.handR.v < 0.4) return;
    const d = dist(this.handL, this.handR);
    const thr = 0.45 * this.torso;
    if (!this.handsTogether && d < thr) {
      this.handsTogether = true;
      this.lastClapT = t;
    } else if (this.handsTogether && d > thr * 1.5) {
      this.handsTogether = false;
    }
  }

  private updateBaseline(t: number) {
    const T = this.torso;
    const hipY = this.hipMid.y;
    const shY = this.shoulderMid.y;
    if (this.baseHipY === null) {
      this.baseHipY = hipY;
      this.baseShoulderY = shY;
    }
    this.jumping = hipY < this.baseHipY - 0.15 * T;
    this.ducking = shY > this.baseShoulderY + 0.3 * T;
    if (this.jumping) this.lastJumpT = t;
    if (this.ducking) this.lastDuckT = t;

    const near = Math.abs(hipY - this.baseHipY) < 0.1 * T && Math.abs(shY - this.baseShoulderY) < 0.1 * T;
    if (near) {
      // Slowly follow small drifts while standing.
      this.baseHipY += 0.05 * (hipY - this.baseHipY);
      this.baseShoulderY += 0.05 * (shY - this.baseShoulderY);
      this.offBaselineSince = null;
    } else if (this.offBaselineSince === null) {
      this.offBaselineSince = t;
    } else if (t - this.offBaselineSince > 2.5) {
      // Held a new height for a while: they probably stepped closer/farther.
      this.baseHipY = hipY;
      this.baseShoulderY = shY;
      this.offBaselineSince = null;
    }
  }
}

/** Assigns detected poses to stable player slots (P1/P2) frame to frame. */
export class PlayerTracker {
  readonly all = [new Player(0), new Player(1)];
  onJoin?: (p: Player) => void;

  get active() {
    return this.all.filter((p) => p.present);
  }

  update(poses: NormalizedLandmark[][], view: View, t: number) {
    const cands = poses.map((pose) => {
      const pts = pose.map((l) => ({ ...view.toScreen(l.x, l.y), v: l.visibility ?? 1 }));
      const cx = (pts[LM.lShoulder].x + pts[LM.rShoulder].x) / 2;
      return { pts, cx };
    });

    const used = new Set<number>();
    const assigned = new Set<Player>();

    // Existing players keep the candidate nearest to where they were.
    const pairs: { pl: Player; i: number; d: number }[] = [];
    for (const pl of this.all)
      if (pl.present) cands.forEach((c, i) => pairs.push({ pl, i, d: Math.abs(c.cx - pl.shoulderMid.x) }));
    pairs.sort((a, b) => a.d - b.d);
    for (const { pl, i, d } of pairs) {
      if (used.has(i) || assigned.has(pl) || d > view.W * 0.3) continue;
      used.add(i);
      assigned.add(pl);
      pl.ingest(cands[i].pts, t);
    }

    // Leftover confident detections fill empty slots, leftmost first.
    const rest = cands
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => !used.has(i) && c.pts[LM.lShoulder].v > 0.6 && c.pts[LM.rShoulder].v > 0.6)
      .sort((a, b) => a.c.cx - b.c.cx);
    for (const { c } of rest) {
      const free = this.all.find((p) => !p.present && !assigned.has(p));
      if (!free) break;
      free.reset();
      free.ingest(c.pts, t);
      assigned.add(free);
      this.onJoin?.(free);
    }

    // Brief dropouts are tolerated so a player doesn't flicker out.
    for (const pl of this.all) if (!assigned.has(pl) && t - pl.lastSeen > 0.8) pl.present = false;
  }
}
