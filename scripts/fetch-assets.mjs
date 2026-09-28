// Copies MediaPipe's wasm runtime into public/ and downloads the pose model,
// so the app runs fully offline and no video ever leaves the machine.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

const wasmSrc = "node_modules/@mediapipe/tasks-vision/wasm";
if (existsSync(wasmSrc)) {
  cpSync(wasmSrc, "public/mediapipe/wasm", { recursive: true });
  console.log("copied mediapipe wasm -> public/mediapipe/wasm");
}

const models = {
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
};
mkdirSync("public/models", { recursive: true });
for (const [name, url] of Object.entries(models)) {
  const dest = `public/models/${name}`;
  if (existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${url}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${dest}`);
}
