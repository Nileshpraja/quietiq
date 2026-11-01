import {SETTINGS} from "./config.js";

// Legacy MediaPipe Face Mesh: landmark 13 is the inside upper lip, 14 the
// inside lower lip, and 61 / 291 are the mouth corners.
// All face landmarks are processed in this browser tab, not on the server.
export function createFaceMesh(onFrame, maxFaces = SETTINGS.maxFaces) {
  if (!window.FaceMesh) {
    throw new Error("Face Mesh script missing. The website AI files are missing. Check the Pages deployment and refresh.");
  }
  const instance = new window.FaceMesh({
    locateFile: file => `${SETTINGS.faceMeshAssets}${file}`
  });
  instance.setOptions({
    maxNumFaces: Math.max(1, Math.min(SETTINGS.maxFaces, Math.round(maxFaces))),
    // Basic Face Mesh still contains lip landmarks; disabling refinement
    // reduces inference cost on classroom demo laptops.
    refineLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  instance.onResults(results => {
    onFrame(results?.multiFaceLandmarks || [], performance.now());
  });
  return instance;
}

let lastTracks = new Map();
let nextId = 1;
const APERTURE_WINDOW_MS = 580;
const MAX_TRACK_GAP_MS = 1100;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function resetTracks() {
  lastTracks = new Map();
  nextId = 1;
}

function toTrack(points, now, previous) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.max(0, Math.min(...xs) - 0.025);
  const maxX = Math.min(1, Math.max(...xs) + 0.025);
  const minY = Math.max(0, Math.min(...ys) - 0.035);
  const maxY = Math.min(1, Math.max(...ys) + 0.035);

  // Normalize the gap between the lips by face mouth width, reducing the
  // effect of distance from the webcam. An open mouth alone proves nothing.
  const mouthWidth = Math.max(0.01, distance(points[61], points[291]));
  const opening = distance(points[13], points[14]) / mouthWidth;
  const fresh = Boolean(previous && now - previous.seenAt <= MAX_TRACK_GAP_MS);
  const recent = fresh ? previous.apertures.filter(s => now - s.at < APERTURE_WINDOW_MS) : [];
  recent.push({at: now, value: opening});

  // Short rolling interval responds faster than a 1.1 second history,
  // while still requiring actual changes in mouth opening.
  const values = recent.map(s => s.value);
  const apertureRange = Math.max(...values) - Math.min(...values);
  const delta = fresh ? Math.abs(opening - previous.opening) : 0;
  const rawMotion = Math.min(1, 3.2 * apertureRange + 1.6 * delta);
  const motion = fresh ? 0.22 * previous.motion + 0.78 * rawMotion : 0;

  const lipIndices = [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91, 13, 14, 78, 308];
  const lipPoints = lipIndices.map(index => points[index])
    .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(p => ({x: p.x, y: p.y}));
  return {
    id: fresh ? previous.id : nextId++,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    x: minX, y: minY, w: maxX - minX, h: maxY - minY,
    opening, apertureRange, motion, apertures: recent, lipPoints, seenAt: now,
  };
}

// Ephemeral proximity-only tracking during the session, not identity recognition.
export function trackFaces(faces, now) {
  const oldTracks = [...lastTracks.values()].filter(t => now - t.seenAt < MAX_TRACK_GAP_MS);
  const usedIds = new Set();
  const next = new Map();
  for (const points of faces || []) {
    if (!points || points.length < 292 || ![13,14,61,291].every(i =>
      Number.isFinite(points[i]?.x) && Number.isFinite(points[i]?.y))) continue;
    const center = points[1] || points[4];
    let nearest = null, distanceLimit = 0.20;
    for (const old of oldTracks) {
      if (usedIds.has(old.id)) continue;
      const d = distance(center, {x: old.cx, y: old.cy});
      if (d < distanceLimit) { nearest = old; distanceLimit = d; }
    }
    if (nearest) usedIds.add(nearest.id);
    const t = toTrack(points, now, nearest);
    next.set(t.id, t);
  }
  lastTracks = next;
  return [...next.values()];
}

// Only a tentative visual estimate. In a crowded room, the result may be wrong.
export function assessSpeakers(tracks, speechActive, lipThreshold = 0.08) {
  if (!tracks.length) return {ids: [], reason: "No visible faces"};
  if (!speechActive) return {ids: [], reason: "Silero reports quiet — no red box"};
  const maxMotion = Math.max(0, ...tracks.map(t => t.motion));
  if (maxMotion < lipThreshold) {
    return {ids: [], reason: `Speech detected, but mouth movement is below the threshold (${Math.round(maxMotion * 100)}/${Math.round(lipThreshold * 100)})`};
  }
  const cutoff = Math.max(lipThreshold, maxMotion * 0.78);
  const ids = tracks.filter(t => t.motion >= cutoff).map(t => t.id);
  return {ids, reason: `${ids.length} possible speaker(s) — visual estimate only`};
}

// Retained for code that imported the older helper.
export function estimateSpeakers(tracks, speechActive) {
  return assessSpeakers(tracks, speechActive).ids;
}
