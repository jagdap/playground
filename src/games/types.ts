import type { AppleMusic } from "../applemusic";
import type { Sound } from "../audio";
import type { Fx } from "../fx";
import type { PlayerTracker } from "../players";
import type { View } from "../view";

export interface GameContext {
  view: View;
  players: PlayerTracker;
  sound: Sound;
  fx: Fx;
  /** The Mac's Music app, when enabled (otherwise its calls do nothing). */
  music: AppleMusic;
  /** Shared team score. */
  addScore(n: number, x: number, y: number): void;
}

export interface Game {
  title: string;
  emoji: string;
  color: string;
  /** Shows the team star counter. */
  usesScore: boolean;
  /** Has its own soundtrack (or controls Apple Music itself), so background music pauses. */
  ownsMusic?: boolean;
  /** Skip the default hand-cursor rings (the game draws its own). */
  hideHands?: boolean;
  start(ctx: GameContext): void;
  update(dt: number, t: number): void;
  draw(g: CanvasRenderingContext2D): void;
  /** Skip to the next round / song / filter (shown as a pause-menu button). */
  next?(): void;
  /** Called after the pause menu closes, with how long the game was frozen. */
  resume?(pausedFor: number): void;
  /** Optional in-game keys (e.g. arrows); return true if handled. */
  onKey?(key: string): boolean;
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
