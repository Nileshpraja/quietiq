/**
 * QuietIQ's three deterministic performance presets.
 * Every number is a workload target, not a guaranteed camera frame rate.
 * The optional 40-face scanner is disabled in Smooth to protect CPU time.
 */
export const PERFORMANCE_PRESETS = Object.freeze({
  smooth: Object.freeze({
    label: 'Smooth / older laptop',
    cameraWidth: 640, cameraHeight: 360, cameraFps: 15,
    meshWidth: 320, meshMinWidth: 288, meshFaces: 2,
    faceEveryMs: 165, statsEveryMs: 380, chartEveryMs: 650,
    crowdAllowed: false,
    summary: 'Best for weak laptops: 640×360 camera, 2 detailed faces, about 6 AI frame attempts/second. Wide scan unavailable.'
  }),
  balanced: Object.freeze({
    label: 'Balanced / normal laptop',
    cameraWidth: 960, cameraHeight: 540, cameraFps: 20,
    meshWidth: 448, meshMinWidth: 320, meshFaces: 5,
    faceEveryMs: 120, statsEveryMs: 260, chartEveryMs: 480,
    crowdAllowed: true,
    summary: 'Tracks up to 5 detailed faces; optional 40-face scan is available but may cause lag.'
  }),
  detail: Object.freeze({
    label: 'High detail / fast laptop',
    cameraWidth: 1280, cameraHeight: 720, cameraFps: 24,
    meshWidth: 560, meshMinWidth: 320, meshFaces: 5,
    faceEveryMs: 90, statsEveryMs: 200, chartEveryMs: 320,
    crowdAllowed: true,
    summary: 'Sharper preview and detailed tracking; higher CPU/GPU use. Use only after testing Balanced.'
  })
});

export function choosePerformancePreset(name) {
  return PERFORMANCE_PRESETS[name] || PERFORMANCE_PRESETS.smooth;
}

export function nextInferenceWidth(latencyMs, currentWidth, minimumWidth) {
  if (!Number.isFinite(latencyMs) || latencyMs < 230) return currentWidth;
  const desired = latencyMs > 420 ? 288 : latencyMs > 310 ? 320 : 384;
  return Math.min(currentWidth, Math.max(minimumWidth, desired));
}
