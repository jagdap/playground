# 🎈 Playground

A camera-based motion game system for families that runs in the browser on a Mac.
The webcam tracks up to two players' bodies with MediaPipe Pose, all on the device,
and games are drawn on top of the mirrored camera video.

## Run

```sh
npm install      # also copies the MediaPipe wasm and downloads the pose model into public/
npm run dev      # open http://localhost:5173 in Chrome and allow the camera
```

Stand 6–8 ft back so that at least your hips, and ideally your whole body, are in frame.

## Keys (for the grown-up)

| Key | Action |
|---|---|
| ← → | pick a game |
| Enter / 1–4 | play |
| Esc | back to menu |
| R | restart game |
| D | debug overlay (skeleton, FPS, jump/duck baselines) |
| M | mute |
| F | fullscreen |

## Games

- **Bubble Pop:** Touch bubbles with your hands. Gold bubbles are worth 3. Tests hand tracking.
- **Jump & Duck:** Jump over logs 🪵 and duck under bees 🐝. Tests whole-body tracking and jump/squat detection.
- **Copy the Pose:** Match the stick figure and hold it until the ring fills. Tests reading static poses.
- **Mirror Paint:** Hands paint glowing trails. Clap for confetti, and high-five each other for a big burst. Tests smooth tracking.

All scoring is a shared team ⭐ counter. A miss just makes a soft "boop", with no penalty.

## Code map

- `src/pose.ts`: MediaPipe PoseLandmarker setup (GPU delegate with CPU fallback, 2 poses)
- `src/players.ts`: Stable P1/P2 assignment, One Euro smoothing, derived body features, and jump/duck detection against a standing baseline
- `src/view.ts`: Mirrored cover-fit mapping from camera to screen, plus drawing helpers
- `src/audio.ts`: Synthesized sound effects and spoken prompts
- `src/fx.ts`: Particles (confetti, stars, "+1" text)
- `src/games/*`: One file per game, implementing the `Game` interface in `types.ts`
- `src/main.ts`: App shell: camera, detect/render loop, menu, HUD, keys

## Tuning

Detection thresholds are expressed in "torso lengths", so they work at any distance:

- **Jump:** Hips rise 0.15 × torso above the standing baseline (`players.ts`).
- **Duck:** Shoulders drop 0.3 × torso below the baseline (`players.ts`).
- **Poses:** Each pose's `check` function is in `games/copy.ts`.

Press **D** to see the skeleton and baselines while you tune.
