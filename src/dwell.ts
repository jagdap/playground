// Hands-free buttons: hold a hand over a target until its ring fills.
export type Target = { id: string; x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

export class Dwell {
  hovered: string | null = null;
  private progress = new Map<string, number>();
  private lockUntil = 0;

  constructor(private holdTime = 1.3) {}

  /** Returns the id of a target that just finished filling, if any. */
  update(targets: Target[], hands: Point[], dt: number, t: number, margin = 0): string | null {
    if (t < this.lockUntil) {
      this.hovered = null;
      return null;
    }
    const inside = (r: Target, h: Point) =>
      h.x >= r.x - margin && h.x <= r.x + r.w + margin && h.y >= r.y - margin && h.y <= r.y + r.h + margin;
    const hit = targets.find((r) => hands.some((h) => inside(r, h)))?.id ?? null;
    this.hovered = hit;

    for (const [id, p] of this.progress) if (id !== hit) this.progress.set(id, Math.max(0, p - dt * 2));
    if (!hit) return null;
    const p = (this.progress.get(hit) ?? 0) + dt;
    this.progress.set(hit, p);
    if (p < this.holdTime) return null;
    this.reset(t);
    return hit;
  }

  /** 0..1 fill for drawing. */
  fraction(id: string) {
    return Math.min(1, (this.progress.get(id) ?? 0) / this.holdTime);
  }

  /** Clears progress and ignores hands briefly so one hold can't trigger twice. */
  reset(t: number, lock = 1) {
    this.progress.clear();
    this.hovered = null;
    this.lockUntil = t + lock;
  }
}
