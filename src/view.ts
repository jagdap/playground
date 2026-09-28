// Maps the camera frame onto the full-window canvas ("cover" fit, mirrored),
// so pose landmarks and game art share one screen coordinate system.
export class View {
  W = 0;
  H = 0;
  /** Size unit that scales art with the window (1 at 800px tall). */
  unit = 1;
  private dpr = 1;
  private ox = 0;
  private oy = 0;
  private dw = 0;
  private dh = 0;
  readonly g: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement, readonly video: HTMLVideoElement) {
    this.g = canvas.getContext("2d")!;
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  resize() {
    this.dpr = devicePixelRatio || 1;
    this.W = innerWidth;
    this.H = innerHeight;
    this.unit = this.H / 800;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout();
  }

  get pixelRatio() {
    return this.dpr;
  }

  layout() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const s = Math.max(this.W / vw, this.H / vh);
    this.dw = vw * s;
    this.dh = vh * s;
    this.ox = (this.W - this.dw) / 2;
    this.oy = (this.H - this.dh) / 2;
  }

  /** Normalized camera coords -> mirrored screen coords. */
  toScreen(x: number, y: number) {
    return { x: this.ox + (1 - x) * this.dw, y: this.oy + y * this.dh };
  }

  drawVideo(dim = 0) {
    const g = this.g;
    if (this.dw) {
      g.save();
      g.translate(this.W, 0);
      g.scale(-1, 1);
      g.drawImage(this.video, this.ox, this.oy, this.dw, this.dh);
      g.restore();
    } else {
      g.fillStyle = "#222";
      g.fillRect(0, 0, this.W, this.H);
    }
    if (dim > 0) {
      g.fillStyle = `rgba(0,0,0,${dim})`;
      g.fillRect(0, 0, this.W, this.H);
    }
  }
}

export const UI_FONT = `ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
export const EMOJI_FONT = `"Apple Color Emoji", "Segoe UI Emoji", sans-serif`;

export function emoji(g: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number) {
  g.font = `${size}px ${EMOJI_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(ch, x, y);
}

export function label(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color = "#fff",
  align: CanvasTextAlign = "center",
) {
  g.font = `800 ${size}px ${UI_FONT}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = size * 0.18;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
