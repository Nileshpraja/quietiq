import {SETTINGS} from "./config.js";

// MediaPipe's lightweight Face Detection handles the classroom overview.
// The visible-face count is an estimate from one camera frame, not attendance.
export function createCrowdDetector(onFrame, model = "full") {
  if (!window.FaceDetection) {
    throw new Error("Face Detection library missing. The website AI files are missing. Check the Pages deployment and refresh.");
  }
  const detector = new window.FaceDetection({
    locateFile: file => `${SETTINGS.faceDetectionAssets}${file}`
  });
  // Full-range sparse BlazeFace is more suitable for a wide classroom than
  // the short-range/selfie model. This does not guarantee 40 recognisable faces.
  if (model !== "full" && model !== "short") throw new Error("Unsupported detection model");
  detector.setOptions({
    model,
    minDetectionConfidence: 0.45,
    selfieMode: false
  });
  detector.onResults(results => {
    onFrame(normalizeCrowdDetections(results?.detections || [], SETTINGS.maxCrowdFaces), performance.now());
  });
  return detector;
}

const clamp = value => Math.min(1, Math.max(0, value));
const numeric = value => typeof value === "number" && Number.isFinite(value);

export function normalizeCrowdDetections(detections, maxFaces = 40) {
  const found = [];
  for (const entry of detections || []) {
    if (found.length >= maxFaces) break;
    const rect = entry?.boundingBox || entry?.locationData?.relativeBoundingBox;
    if (!rect) continue;
    const width = rect.width, height = rect.height;
    if (!numeric(width) || !numeric(height) || width <= 0 || height <= 0) continue;
    // MediaPipe JS gives xCenter/yCenter; some solutions expose xmin/ymin.
    const left = numeric(rect.xCenter) ? rect.xCenter - width / 2 :
      numeric(rect.xmin) ? rect.xmin : rect.xMin;
    const top = numeric(rect.yCenter) ? rect.yCenter - height / 2 :
      numeric(rect.ymin) ? rect.ymin : rect.yMin;
    if (!numeric(left) || !numeric(top)) continue;
    const x = clamp(left), y = clamp(top);
    const w = Math.max(0, Math.min(1, left + width) - x);
    const h = Math.max(0, Math.min(1, top + height) - y);
    if (w < 0.005 || h < 0.005) continue;
    const box = {id: `det-${found.length + 1}`, x, y, w, h,
      cx: x + w / 2, cy: y + h / 2, motion: 0, opening: 0, lipPoints: []};
    // Suppress accidental duplicate detections of exactly the same face.
    if (found.some(old => intersectionOverUnion(old, box) > 0.62)) continue;
    found.push(box);
  }
  return found;
}

function intersectionOverUnion(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersect = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - intersect;
  return union > 0 ? intersect / union : 0;
}

// Associate just the small Face Mesh subset with detector boxes. This does
// NOT establish identity. All other crowd boxes remain green (not analysed for
// lip motion), and are never labelled "not speaking".
export function mergeCrowdAndMesh(crowd, mesh) {
  if (!crowd.length) return [...mesh];
  const used = new Set();
  return crowd.map(box => {
    let match = null, best = 0;
    for (const track of mesh) {
      if (used.has(track.id)) continue;
      const overlap = intersectionOverUnion(box, track);
      // FaceMesh boxes can be larger than the detector box; overlap > 0.12
      // with close centers is enough to connect the estimates.
      const dx = Math.abs(box.cx - track.cx), dy = Math.abs(box.cy - track.cy);
      const centerNear = dx < Math.max(box.w, track.w) * .48 &&
                         dy < Math.max(box.h, track.h) * .48;
      const score = centerNear ? overlap + 0.1 : 0;
      if (score > best && overlap >= 0.12) { best = score; match = track; }
    }
    if (!match) return box;
    used.add(match.id);
    return {...box, id: match.id, motion: match.motion,
      opening: match.opening, lipPoints: match.lipPoints,
      meshSeenAt: match.seenAt};
  });
}
