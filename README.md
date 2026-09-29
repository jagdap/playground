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

### Hands-free ("console mode")

```sh
npm run console  # macOS + Chrome: full-screen, sound on, camera pre-approved
```

Everything is controlled by pose alone:

- **Pick a game:** Hold a hand over a card until its ring fills (about 1.3 seconds).
- **Pause:** Cross your arms in an X over your chest and hold until the ring fills. The pause menu has Keep Playing, Start Over, Next, Sound and All Games, all selected by holding a hand on them.
- **Quit:** Cmd+Q.

A normal browser tab works hands-free too, except that browsers keep sound off until the first click or keypress. Console mode launches Chrome with `--autoplay-policy=no-user-gesture-required` to avoid that.

## Keys (for the grown-up)

| Key | Action |
|---|---|
| ← → | pick a game |
| Enter / 1–9 | play |
| Space / N | in-game test keys (roll, swing, next round/song) |
| Esc | back to menu |
| P | pause |
| R | restart game |
| D | debug overlay (skeleton, FPS, jump/duck baselines) |
| M | mute |
| F | fullscreen |

## Games

**Party games:**

- **Silly Mirror:** AR filters: Twins (a delayed, color-shifted copy of you), Animal Faces, Big Head, Dragon (arms up to breathe fire), Royal Party, Super Strong (lift a barbell overhead) and Magic Hands. Switch filters with ← → or a clap.
- **Chicken Party:** 25-second mini-games in random order: Flap Flap (flap your arms to fly a chick to its nest), Egg Squat (squat to lay eggs that hatch), Hip Copter (move side to side to catch balloons) and Cookie Catch. N skips to the next one.
- **Star Dance:** Stars appear within arm's reach, and you touch each one as its ring closes on the beat of a synthesized song. Three songs; N skips to the next.
- **Bumper Bowling:** Swing your arm up from your hip to roll, and step left or right to aim. Bumpers are always on, and the two of you alternate frames. Space rolls for testing.
- **Home Run:** Swing your arms sideways as the pitch arrives, with a generous timing window. Batters alternate. Space swings for testing.

**Family games:**

- **Hole in the Wall:** A brick wall with a body-shaped hole rushes at you, and you strike the pose to fit through. Each player gets their own hole wherever they're standing; points outside the hole get a ❌. It gets a little faster every wall.
- **Freeze Dance:** Dance while the music plays and freeze like a statue when it stops. Wobbling gets a silly face, not an elimination. With "My Music" on, it pauses and resumes your real songs.

**For grown-ups:**

- **Shadow Boxing:** A cardio workout. Punch the glove pads on the beat (jabs, hooks, uppercuts, body shots) and duck the sweeping bar. Easy, Normal and Hard levels, 3 rounds with rests, accuracy, best combo and a rough per-player calorie estimate. Pads sit beyond a resting guard and only count a moving hand.

**Tracking demos:**

- **Bubble Pop:** Touch bubbles with your hands. Gold bubbles are worth 3. Tests hand tracking.
- **Jump & Duck:** Jump over logs 🪵 and duck under bees 🐝. Tests whole-body tracking and jump/squat detection.
- **Copy the Pose:** Match the stick figure and hold it until the ring fills. Tests reading static poses.
- **Mirror Paint:** Hands paint glowing trails. Clap for confetti, and high-five each other for a big burst. Tests smooth tracking.

All scoring is a shared team ⭐ counter. A miss just makes a soft "boop", with no penalty.

## Your own music (macOS)

The app can drive the Mac's **Music** app (your library or Apple Music). Cross your arms to pause, then hold a hand on **My Music On**. You can also add `?music=apple` to the URL, and `&playlist=Kids%20Dance` to start a specific playlist when nothing is queued.

- **Background:** Your music plays behind the menu and most games, and the pause menu gets a **Next Song** button.
- **Freeze Dance:** Pauses and resumes your real songs.
- **Star Dance and Shadow Boxing:** These keep their built-in beat, because the Music app doesn't share a song's beat timing, and those games need it.

How it works: browsers can't control other apps, so the local server (`npm run dev`, console mode, or the packaged `serve.py`) exposes `GET /api/music/{status,play,pause,next}`. Each request runs one of the fixed AppleScripts in `scripts/applescript/`. The endpoint only answers on localhost and requires a custom header, so other websites can't trigger it. The first time, macOS asks whether the terminal or Python may control Music.

## Code map

- `src/pose.ts`: MediaPipe PoseLandmarker setup (GPU delegate with CPU fallback, 2 poses)
- `src/players.ts`: Stable P1/P2 assignment, One Euro smoothing, derived body features, and jump/duck detection against a standing baseline
- `src/view.ts`: Mirrored cover-fit mapping from camera to screen, plus drawing helpers
- `src/audio.ts`: Synthesized sound effects and spoken prompts
- `src/fx.ts`: Particles (confetti, stars, "+1" text)
- `src/games/*`: One file per game, implementing the `Game` interface in `types.ts`
- `src/main.ts`: App shell: camera, detect/render loop, menu, pause menu, HUD, keys
- `src/dwell.ts`: Hold-a-hand-to-select buttons
- `src/music.ts`: Synthesized groove with a beat clock (Shadow Boxing, Freeze Dance)
- `src/applemusic.ts` and `scripts/apple-music.mjs`: The Music app bridge (client and dev-server side); `scripts/serve.py` is the packaged equivalent

## Tuning

Detection thresholds are expressed in "torso lengths", so they work at any distance:

- **Jump:** Hips rise 0.15 × torso above the standing baseline (`players.ts`).
- **Duck:** Shoulders drop 0.3 × torso below the baseline (`players.ts`).
- **Poses:** Each pose's `check` function is in `games/copy.ts`.

Press **D** to see the skeleton and baselines while you tune.
