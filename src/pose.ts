import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Served from public/ (see scripts/fetch-assets.mjs) so everything runs offline.
const WASM = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL = `${import.meta.env.BASE_URL}models/pose_landmarker_full.task`;

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    return await make("GPU");
  } catch (err) {
    console.warn("GPU delegate failed, falling back to CPU", err);
    return make("CPU");
  }
}
