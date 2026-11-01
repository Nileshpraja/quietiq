import {SETTINGS} from "./config.js";
import {addHistoryEvent, listHistoryEvents, clearHistoryEvents, downloadHistoryCsv} from "./local_history.js";
import {choosePerformancePreset, nextInferenceWidth} from "./performance.js";
import {initAmbientParticles} from "./particles.js";
import {initReport} from "./report.js";
import {SnapshotGate} from "./snapshot_gate.js";
import {TeacherAudioLibrary} from "./audio_archive.js";
import {scanDevices, openSelectedDevices} from "./devices.js";
import {createFaceMesh, trackFaces, assessSpeakers, resetTracks} from "./face_ai.js";
import {createCrowdDetector, mergeCrowdAndMesh} from "./crowd_ai.js";
import {createNoiseMeter, startSpeechAI, stopSpeechAI} from "./speech_ai.js";
import {diagnoseMicrophone} from "./audio_health.js";
import {shouldSwitchToCompatibleProcessor} from "./vad_watchdog.js";
import {message, drawOverlay, clearOverlay, drawNoiseGraph, renderHistory,
        croppedPhoto, addPhoto, clearPhotos} from "./visuals.js";

const byId = id => document.getElementById(id);
const camera = byId("camera");
const scanBtn = byId("scanBtn");
const startBtn = byId("startBtn");
const stopBtn = byId("stopBtn");
const modeBtn = byId("modeBtn");
const consent = byId("consentCheck");
const audioConsent = byId("audioConsentCheck");
const micProcessingMode = byId("micProcessingMode");
const retrySpeechBtn = byId("retrySpeechBtn");
const audioStartBtn = byId("audioStartBtn");
const audioStopBtn = byId("audioStopBtn");
const themeToggleBtn = byId("themeToggleBtn");
const fullscreenBtn = byId("fullscreenBtn");
const introSoundCheck = byId("introSoundCheck");
const performanceMode = byId("performanceMode");
const performancePresetSelect = byId("performancePreset");
const manualPhotoBtn = byId("manualPhotoBtn");
const mirrorCameraBtn = byId("mirrorCameraBtn");
const wideScanEnabled = byId("wideScanEnabled");
const wideScanModel = byId("wideScanModel");

// Mirror only the displayed camera image. Face Mesh still receives the
// unmodified frame, and the overlay maps landmarks to the mirrored positions.
function setCameraMirror(enabled) {
  const mirrored = Boolean(enabled);
  byId("cameraStage").classList.toggle("mirror-camera", mirrored);
  mirrorCameraBtn.textContent = mirrored ? "↔ Mirror Camera: ON" : "↔ Mirror Camera: OFF";
  mirrorCameraBtn.setAttribute("aria-pressed", String(mirrored));
  try { localStorage.setItem("quietiq-mirror-camera", mirrored ? "on" : "off"); }
  catch (_) { /* The control still works without storage. */ }
  renderFaceBoxes();
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = next;
  try { localStorage.setItem("quietiq-theme", next); } catch (_) { /* optional */ }
  themeToggleBtn.textContent = next === "dark" ? "☀" : "☾";
  themeToggleBtn.setAttribute("aria-label", next === "dark" ? "Switch to light mode" : "Switch to dark mode");
  drawNoiseGraph(state.points);
}

// Optional, subtle sound plays only after a direct user click and opt-in.
function playIntroSound() {
  if (!introSoundCheck?.checked) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const notes = [392.00, 493.88, 587.33];
    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      const start = ctx.currentTime + i * 0.095;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.31);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.33);
    });
    // Close audio context after the effect finishes; never records audio.
    window.setTimeout(() => void ctx.close().catch(() => {}), 1000);
  } catch (error) { console.warn("Intro sound was unavailable", error); }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) { console.warn("Fullscreen unavailable", error); }
}

function initScrollExperience() {
  const links = [...document.querySelectorAll('.nav-link')];
  const sections = ['home','problem','features','launch','recordings']
    .map(id => document.getElementById(id)).filter(Boolean);
  const progress = byId('scrollProgress');
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const range = document.documentElement.scrollHeight - window.innerHeight;
    const pct = range > 0 ? Math.min(100, Math.max(0, window.scrollY / range * 100)) : 0;
    progress.style.width = `${pct.toFixed(1)}%`;
    const threshold = window.scrollY + Math.max(130, window.innerHeight * .35);
    let current = 'home';
    for (const section of sections) {
      if (section.offsetTop <= threshold) current = section.id;
    }
    for (const link of links) {
      const active = link.getAttribute('href') === `#${current}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  const scheduleUpdate = () => {
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', scheduleUpdate, {passive: true});
  window.addEventListener('resize', scheduleUpdate);
  scheduleUpdate();

  if (window.IntersectionObserver &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('js-motion');
    const revealObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      }
    }, {rootMargin:'0px 0px -8% 0px', threshold:.08});
    for (const node of document.querySelectorAll('.fade-reveal')) revealObserver.observe(node);
  }
}

function initPresentation() {
  state.profile = choosePerformancePreset(performancePresetSelect.value);
  updatePresetDescription();
  let savedTheme = 'dark';
  try { savedTheme = localStorage.getItem('quietiq-theme') || 'dark'; } catch (_) { /* optional */ }
  applyTheme(savedTheme);
  // Selfie-style mirrored preview is ON by default; preference is remembered.
  let mirrorEnabled = true;
  try { mirrorEnabled = localStorage.getItem("quietiq-mirror-camera") !== "off"; }
  catch (_) { /* Use the default. */ }
  setCameraMirror(mirrorEnabled);
  mirrorCameraBtn.addEventListener("click", () => {
    setCameraMirror(!byId("cameraStage").classList.contains("mirror-camera"));
  });
  initAmbientParticles(byId('particleCanvas'));
  initReport();
  initScrollExperience();
  themeToggleBtn.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  fullscreenBtn.addEventListener('click', () => void toggleFullscreen());
  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    fullscreenBtn.textContent = active ? '⤢' : '⛶';
    fullscreenBtn.setAttribute('title', active ? 'Exit fullscreen' : 'Toggle presentation fullscreen');
  });
  document.querySelector('.hero-launch-link')?.addEventListener('click', () => playIntroSound());
}

const state = {
  active: false, loading: false, stopping: false, run: 0,
  profile: choosePerformancePreset('smooth'),
  lastChartPaint: 0,
  stream: null, faceAI: null, faceBusy: false, firstFaceFrame: false,
  vad: null, vadFailed: false, noiseMeter: null,
  vadConfidence: 0, vadFrames: 0, vadPeakScore: 0, vadPeakWindowAt: 0, lastVadFrameAt: 0, vadStartedAt: 0, vadStalledAlert: false,
  vadProcessor: 'auto', vadEpoch: 0, vadRecovering: false, vadRecoveryAttempted: false, vadLastError: '', 
  faces: [], possible: [], speech: false, level: 0, faceFrameCount: 0, gateReason: "Waiting for camera",
  points: Array(160).fill(0),
  snapshotGate: new SnapshotGate({holdMs: SETTINGS.photoHoldMs, cooldownMs: SETTINGS.photoCooldownMs}),
  snapshots: 0, snapshotStatus: "Turn on consented demo mode to enable capture",
  inferenceCanvas: null, inferenceContext: null, inferenceWidth: SETTINGS.inferenceWidth,
  faceLatencyMs: 0, lastFaceCompletedAt: 0, lastStatsPaint: 0,
  lastFaceAt: 0, lastVideoTime: -1, raf: 0, timer: 0,
  lastSample: 0, lastPhoto: 0, speechStartAt: 0, photoMode: false,
  crowdAI: null, crowdBusy: false, crowdReady: false, crowdFaces: [],
  crowdFrameCount: 0, crowdLatencyMs: 0,
  crowdCanvas: null, crowdContext: null, crowdFailed: false, wideAssetsReady: false,
  crowdDisposeAfter: null,
  lastCrowdAt: 0, lastCrowdVideoTime: -1,
  lastCrowdCompletedAt: 0, lastCrowdResultAt: 0
};

function updatePresetDescription() {
  const profile = choosePerformancePreset(performancePresetSelect.value);
  byId("performancePresetHelp").textContent = profile.summary;
  if (!state.active && !state.loading) state.profile = profile;
  if (!profile.crowdAllowed) {
    wideScanEnabled.checked = false;
    wideScanEnabled.disabled = true;
    crowdHelp("Smooth preset protects performance by disabling the experimental 40-face scanner. Choose Balanced or High detail before Start to enable it.");
  } else {
    wideScanEnabled.disabled = !state.wideAssetsReady || state.crowdFailed;
    if (!state.wideAssetsReady) crowdHelp("Optional 40-face model files missing. Check the Pages deployment; normal Face Mesh works without wide scan.");
  }
}

function updatePerformanceStatus() {
  const node = byId("performanceLiveStatus");
  if (!state.active) {
    node.textContent = "Performance: choose a preset before starting the camera. To change it, stop and restart the session.";
    return;
  }
  const ms = Math.round(state.faceLatencyMs);
  const size = camera.videoWidth ? `${camera.videoWidth}×${camera.videoHeight}` : 'loading';
  const summary = `${state.profile.label} • webcam ${size} • Face Mesh ${ms || '…'} ms/frame`;
  if (ms > 330) {
    node.textContent = `${summary}. Your device is struggling: try Smooth, switch the 40-face scan OFF, and close other camera apps.`;
    node.classList.add('is-slow');
  } else {
    node.textContent = summary + (state.crowdAI ? ' • experimental wide scan ON' : ' • stable scan OFF');
    node.classList.remove('is-slow');
  }
}

// Audio archive is separate from Silero. A recording captures the microphone
// continuously (not just moments when speech AI reports speech), so words are
// not truncated by Silero's start/stop timing.
const audioArchive = new TeacherAudioLibrary();
audioArchive.onChange = () => updateRecordingControls();

function updateRecordingControls() {
  const liveMic = state.stream?.getAudioTracks().some(t => t.readyState === "live" && t.enabled && !t.muted);
  const canStart = state.active && !state.loading && !state.stopping && state.photoMode &&
    audioConsent.checked && Boolean(liveMic) && !audioArchive.isRecording && !audioArchive.pending;
  audioStartBtn.disabled = !canStart;
  audioStopBtn.disabled = !audioArchive.isRecording;
  byId("audioRecordingPill").textContent = audioArchive.isRecording ? "● RECORDING LIVE" :
    audioArchive.pending ? "SAVING AUDIO" : "RECORDING OFF";
  byId("audioRecordingPill").classList.toggle("is-recording", audioArchive.isRecording);
  byId("deleteAllRecordingsBtn").disabled = audioArchive.isRecording || audioArchive.pending;
}

async function startAudioRecording() {
  if (!(state.active && state.photoMode && audioConsent.checked)) {
    message("Turn on Teacher Absence Mode and confirm informed audio consent first.", true);
    return;
  }
  try {
    await audioArchive.start(state.stream);
    updateRecordingControls();
    message("Audio RECORDING is visibly ON. QuietIQ is capturing the selected USB microphone. Stop & save when finished.");
  } catch (error) {
    audioArchive.emit(`Could not start recording: ${error.message}`, true);
    message(`Audio recording failed: ${error.message}`, true);
  }
}

function visibleTracks() {
  // Face Detection supplies the wide-classroom boxes; Face Mesh supplies
  // lip measurements for only a few faces. If the detector has no results,
  // leave the Face Mesh boxes visible as a fallback, not a fabricated count.
  if (!state.crowdAI || !state.crowdReady || !state.crowdFaces.length ||
      performance.now() - state.lastCrowdResultAt > 4000) return state.faces;
  return mergeCrowdAndMesh(state.crowdFaces, state.faces);
}

function renderFaceBoxes() {
  const threshold = Number(byId("lipThreshold").value);
  const diagnosticMouthIds = byId("showMouthTest").checked
    ? state.faces.filter(t => t.motion >= threshold).map(t => t.id) : [];
  const overview = visibleTracks();
  // If a detailed Face Mesh candidate was missed by the overview detector,
  // still show the tentative red/yellow box around that tracked mouth.
  // Do not add it to the detector's approximate classroom face count.
  const ids = new Set(overview.map(t => t.id));
  const needed = new Set([...state.possible, ...diagnosticMouthIds]);
  const unmatched = state.faces.filter(t => needed.has(t.id) && !ids.has(t.id));
  drawOverlay([...overview, ...unmatched], state.possible, camera, diagnosticMouthIds);
}

// The optional full-range detector uses a second legacy MediaPipe WASM graph.
// Some laptop/browser combinations abort inside this graph. Keep it disabled by
// default and never let a crash stop Face Mesh, Silero or consented recording.
function crowdHelp(text, error = false) {
  const node = byId("wideScanHelp");
  node.textContent = text;
  node.classList.toggle("scan-error", error);
}

function safelyCloseCrowd(detector) {
  if (!detector) return;
  // close() itself can synchronously throw after a native WASM abort.
  void Promise.resolve().then(() => detector.close()).catch(err => {
    console.warn("Could not release failed classroom detector:", err);
  });
}

function releaseCrowdDetector() {
  const detector = state.crowdAI;
  state.crowdAI = null;
  state.crowdReady = false;
  state.crowdFaces = [];
  state.lastCrowdResultAt = 0;
  byId("crowdState").textContent = "Classroom scan: OFF — Face Mesh available";
  if (detector) {
    if (state.crowdBusy) state.crowdDisposeAfter = detector;
    else safelyCloseCrowd(detector);
  }
  renderFaceBoxes();
  updateStats(true);
}

function maybeStartCrowdDetector(token = state.run) {
  if (!wideScanEnabled.checked || !state.profile.crowdAllowed || state.crowdFailed || !state.wideAssetsReady || !state.active ||
      state.stopping || token !== state.run || state.crowdAI || state.crowdBusy) return;
  // Warm up the working AI models first. Starting both legacy WASM graphs at
  // the same time has caused crashes on some Windows/browser configurations.
  if (state.faceFrameCount < 4 || !state.vad) return;
  try {
    const model = wideScanModel.value;
    let detector;
    detector = createCrowdDetector((detections, detectedAt) => {
      if (!state.active || token !== state.run ||
          !wideScanEnabled.checked || state.crowdAI !== detector) return;
      state.crowdReady = true;
      state.crowdFaces = detections;
      state.crowdFrameCount += 1;
      state.lastCrowdResultAt = detectedAt;
      byId("crowdState").textContent = `Classroom scan: ${detections.length} face(s) estimated`;
      crowdHelp(`Experimental ${model === "full" ? "whole-classroom" : "near-camera"} scan running. Face Mesh and speech AI stay active.`);
      renderFaceBoxes();
      updateStats();
    }, model);
    state.crowdAI = detector;
    wideScanModel.disabled = true;
    byId("crowdState").textContent = "Classroom scan: loading optional detector";
    crowdHelp("Loading the optional classroom scanner. Face Mesh and Silero remain available.");
  } catch (error) {
    stopCrowdAI(error);
  }
}

function onWideScanToggle() {
  if (!state.profile.crowdAllowed && wideScanEnabled.checked) {
    wideScanEnabled.checked = false;
    crowdHelp("Smooth preset disables the optional 40-face scan. Stop monitoring and select Balanced if you need to try it.", true);
    return;
  }
  if (!wideScanEnabled.checked) {
    releaseCrowdDetector();
    wideScanModel.disabled = false;
    crowdHelp("Stable mode: classroom-wide scan OFF. Face Mesh tracks up to five faces; Silero and audio library stay available.");
    return;
  }
  if (state.crowdFailed) {
    wideScanEnabled.checked = false;
    crowdHelp("Wide scan crashed earlier in this browser session. Refresh before trying the near-camera option.", true);
    return;
  }
  crowdHelp("Wide scan requested. It will start after Face Mesh and Silero are ready.");
  if (state.active) maybeStartCrowdDetector();
}

function updateControls() {
  scanBtn.disabled = state.active || state.loading;
  startBtn.disabled = state.active || state.loading ||
    !byId("cameraSelect").value || !byId("micSelect").value;
  stopBtn.disabled = !state.active;
  byId("cameraSelect").disabled = state.active || state.loading;
  byId("micSelect").disabled = state.active || state.loading;
  wideScanModel.disabled = Boolean(state.crowdAI);
  performancePresetSelect.disabled = state.active || state.loading || state.stopping;
  micProcessingMode.disabled = state.active || state.loading || state.stopping;
  retrySpeechBtn.disabled = !state.active || state.vadRecovering || !state.noiseMeter || state.stopping;
  retrySpeechBtn.textContent = state.vadRecovering ? 'Repairing speech engine...' :
    (state.vadProcessor === 'ScriptProcessor' ? 'Restart compatible speech engine' : 'Retry speech AI (compatibility mode)');
  wideScanEnabled.disabled = !state.profile.crowdAllowed || !state.wideAssetsReady || state.crowdFailed;
  modeBtn.disabled = !state.active || (!consent.checked && !audioConsent.checked);
  manualPhotoBtn.disabled = !state.photoMode || !state.active || !consent.checked;
  modeBtn.textContent = state.photoMode ? "Turn demo mode OFF" : "Turn demo mode ON";
  byId("modeLabel").textContent = state.photoMode ? "ON • VISIBLE" : "OFF";
  byId("captureIndicator").hidden = !state.photoMode || !consent.checked;
  document.body.classList.toggle("ai-active", state.active);
  document.body.classList.toggle("smooth-ai", performanceMode.checked);
  const stage = byId("cameraStage");
  stage.classList.toggle("is-live", state.active);
  byId("hudStatus").textContent = state.active ? "● LIVE • LOCAL AI" : "● STANDBY • LOCAL";
  updateRecordingControls();
}

function updateStats(force = false) {
  const now = performance.now();
  if (!force && now - state.lastStatsPaint < state.profile.statsEveryMs) return;
  state.lastStatsPaint = now;
  const displayed = visibleTracks();
  byId("faceCount").textContent = String(displayed.length);
  byId("meshTrackedCount").textContent = `Lip landmarks: ${state.faces.length} / ${state.profile.meshFaces} faces`;
  byId("crowdFrameCount").textContent = `Classroom scans: ${state.crowdFrameCount}`;
  byId("crowdLatency").textContent = state.crowdLatencyMs
    ? `Scan time: ${Math.round(state.crowdLatencyMs)} ms` : "Scan time: —";
  byId("speakerCount").textContent = String(state.possible.length);
  byId("volumeLabel").textContent = String(state.level);
  byId("levelFill").style.width = `${state.level}%`;
  byId("levelOut").textContent = `${state.level} / 100`;
  byId("speechLabel").textContent = !state.active ? "Not started" :
    !state.vad ? (state.vadFailed ? "AI unavailable" : "AI loading") : state.speech ? "Detected" : "Quiet";
  byId("vadProbability").textContent = `${Math.round(state.vadConfidence * 100)}%`;
  byId("vadPeakScore").textContent = `${Math.round(state.vadPeakScore * 100)}%`;
  byId("vadProbabilityFill").style.width = `${Math.round(state.vadConfidence * 100)}%`;
  byId("vadFrameCount").textContent = String(state.vadFrames);
  const contextState = state.noiseMeter?.audioContext?.state || 'not started';
  byId('vadAudioContextState').textContent = contextState;
  byId('vadProcessorState').textContent = state.vadRecovering ? 'Switching to compatibility mode...' :
    state.vad?.errored ? `Backend error: ${state.vad.errored}` :
    state.vad ? (state.vadProcessor === 'ScriptProcessor' ? 'Compatibility (ScriptProcessor)' : 'Automatic (AudioWorklet)') :
    state.vadFailed ? `Startup error: ${state.vadLastError}` : 'Not started';
  byId("lipMotion").textContent = `${Math.round(100 * Math.max(0, ...state.faces.map(f => f.motion)))} / 100`;
  byId("mouthOpening").textContent = `${Math.round(1000 * Math.max(0, ...state.faces.map(f => f.opening))) / 1000}`;
  byId("faceFrameCount").textContent = String(state.faceFrameCount);
  byId("faceLatency").textContent = state.faceLatencyMs ? `${Math.round(state.faceLatencyMs)} ms / frame` : "Not started";
  updatePerformanceStatus();
  byId("snapshotStatus").textContent = state.snapshotStatus;
  byId("snapshotCount").textContent = String(state.snapshots);
  byId("speakerGateReason").textContent = state.gateReason;
  const audioTrack = state.stream?.getAudioTracks()?.[0];
  const audioStatus = !state.active ? "Not started" : !audioTrack ? "NO AUDIO TRACK" :
    audioTrack.readyState === "ended" ? "TRACK ENDED" :
    audioTrack.muted ? "Track muted by device/OS" :
    !audioTrack.enabled ? "Track disabled" : "Track live";
  byId("micTrackState").textContent = audioStatus;
  const diagnosis = diagnoseMicrophone({
    active: state.active, track: audioTrack, vad: state.vad,
    vadFailed: state.vadFailed, vadFrames: state.vadFrames,
    vadConfidence: state.vadConfidence, level: state.level,
    speech: state.speech, sensitivity: Number(byId("speechSensitivity").value),
    elapsedMs: now - state.vadStartedAt,
    frameAgeMs: state.lastVadFrameAt ? now - state.lastVadFrameAt : null,
    audioContextState: contextState, recovering: state.vadRecovering,
    recoveryTried: state.vadRecoveryAttempted
  });
  const health = byId("audioHealth");
  health.textContent = diagnosis.text;
  health.dataset.status = diagnosis.status;
}

async function checkAssets() {
  // Public GitHub Pages: static-file checks replace the private Python /api/assets.
  const coreFiles = [
    `${SETTINGS.faceMeshAssets}face_mesh.js`,
    `${SETTINGS.faceMeshAssets}face_mesh_solution_packed_assets.data`,
    `${SETTINGS.vadAssets}bundle.min.js`,
    `${SETTINGS.vadAssets}vad.worklet.bundle.min.js`,
    `${SETTINGS.vadAssets}silero_vad_v5.onnx`,
    `${SETTINGS.onnxWasm}ort.wasm.min.js`,
    `${SETTINGS.onnxWasm}ort-wasm-simd-threaded.wasm`
  ];
  const optionalFiles = [
    `${SETTINGS.faceDetectionAssets}face_detection.js`,
    `${SETTINGS.faceDetectionAssets}face_detection_full.binarypb`,
    `${SETTINGS.faceDetectionAssets}face_detection_full_range_sparse.tflite`
  ];
  const present = async path => {
    try {
      const resp = await fetch(path, {method:'HEAD', cache:'no-store'});
      return resp.ok && !String(resp.headers.get('content-type') || '').includes('text/html');
    } catch { return false; }
  };
  const [coreResults, wideResults] = await Promise.all([
    Promise.all(coreFiles.map(present)),
    Promise.all(optionalFiles.map(present))
  ]);
  const missingCore = coreFiles.filter((_, i) => !coreResults[i]);
  state.wideAssetsReady = wideResults.every(Boolean);
  if (!state.wideAssetsReady) {
    wideScanEnabled.checked = false;
    wideScanEnabled.disabled = true;
    crowdHelp('Optional classroom scan models are unavailable. The face mesh and Silero demo can still run.', true);
  } else if (!state.crowdFailed) {
    wideScanEnabled.disabled = !state.profile.crowdAllowed;
  }
  const ready = missingCore.length === 0;
  byId('assetsState').textContent = ready
    ? `Browser AI models: ready. Optional classroom scan: ${state.wideAssetsReady ? 'available' : 'unavailable'}.`
    : `AI model files missing from the website (${missingCore.length}). Check the GitHub Pages deployment build.`;
  byId('assetsState').style.color = ready ? '#84edbd' : '#ffc3c3';
  return ready;
}

async function refreshHistory() {
  renderHistory(listHistoryEvents(100));
}

async function logEvent(kind) {
  try {
    addHistoryEvent({
      kind, faces: visibleTracks().length,
      possible_speakers: state.possible.length,
      relative_sound: state.level
    });
    if (kind !== 'sample') await refreshHistory();
  } catch (err) { console.warn('Could not save local aggregate event:', err); }
}

function setSpeech(speaking, token) {
  if (!state.active || token !== state.run || state.speech === speaking) return;
  state.speech = speaking;
  state.speechStartAt = speaking ? performance.now() : 0;
  if (!speaking) {
    state.snapshotGate.endSpeech();
    if (state.photoMode) state.snapshotStatus = "Waiting for Silero speech detection";
    state.possible = [];
    state.gateReason = "Silero reports quiet — no red box";
    renderFaceBoxes();
  } else if (state.faces.length &&
             performance.now() - (state.faces[0].seenAt || 0) < 380) {
    // The VAD callback can arrive between Face Mesh frames. Reuse only fresh
    // visual evidence so the red box can update without waiting for inference.
    const threshold = Number(byId("lipThreshold").value);
    const decision = assessSpeakers(state.faces, true, threshold);
    state.possible = decision.ids;
    state.gateReason = decision.reason;
    renderFaceBoxes();
  }
  updateStats(true);
  void logEvent(speaking ? "speech_started" : "speech_ended");
}

function changePhotoMode(enable) {
  state.photoMode = Boolean(enable && state.active && (consent.checked || audioConsent.checked));
  if (!state.photoMode && audioArchive.isRecording) void audioArchive.stop(audioConsent.checked);
  state.snapshotGate.reset();
  state.snapshotStatus = state.photoMode && consent.checked
    ? "Ready — waiting for speech and one moving mouth"
    : state.photoMode ? "Demo mode ON for audio only — photo consent not confirmed"
    : "Demo mode OFF — no automatic photos";
  updateControls();
  updateStats(true);
  message(state.photoMode
    ? (consent.checked ? "Teacher Absence Mode ON. Consented photos allowed; optional audio recording still requires a separate Start click." : "Teacher Absence Mode ON for audio only. No photos will be taken without photo consent.")
    : "Teacher Absence Mode OFF. Photos OFF; any active audio recording is being stopped and saved.");
}

function saveDemoPhoto(track, label = "Possible speaker (estimate)") {
  try {
    const picture = croppedPhoto(camera, track);
    if (!picture) {
      state.snapshotStatus = "Video frame unavailable — camera not ready";
      return false;
    }
    addPhoto(picture, new Date().toLocaleTimeString(), SETTINGS.maxPhotos, label);
    state.snapshots += 1;
    state.snapshotStatus = `${label} snapshot saved in this browser tab`;
    updateStats(true);
    return true;
  } catch (error) {
    state.snapshotStatus = `Snapshot failed: ${error.message || error}`;
    message(state.snapshotStatus, true);
    return false;
  }
}

function takeManualSnapshot() {
  if (!state.active || !state.photoMode || !consent.checked) {
    message("Enable Teacher Absence Mode and confirm all participants' photo consent first.", true);
    return;
  }
  // Never pick an arbitrary person from a multi-face frame.
  const selected = state.possible.length === 1
    ? state.faces.find(t => t.id === state.possible[0])
    : state.faces.length === 1 ? state.faces[0] : null;
  if (!selected) {
    state.snapshotStatus = "For a manual test, show one consenting volunteer (or one possible speaker)";
    updateStats(true);
    message(state.snapshotStatus, true);
    return;
  }
  if (saveDemoPhoto(selected, "Consented manual demo")) {
    if (state.speech) state.snapshotGate.confirmCaptured(performance.now());
    message("Manual demonstration snapshot saved locally in this tab. Download it from the snapshot card if you want to keep it.");
  }
}

function onFaceResults(landmarks, now, token) {
  if (!state.active || token !== state.run) return;
  if (!state.firstFaceFrame) {
    state.firstFaceFrame = true;
    byId("faceState").textContent = "Face Mesh: running";
  }
  state.faceFrameCount += 1;
  state.faces = trackFaces(landmarks, now);
  const threshold = Number(byId("lipThreshold").value);
  const decision = assessSpeakers(state.faces, state.speech, threshold);
  state.possible = decision.ids;
  state.gateReason = decision.reason;
  renderFaceBoxes();

  // Photo gating uses the SAME candidate displayed in red, not a secretly
  // stricter motion cutoff that would make visible red boxes un-capturable.
  const candidates = state.faces.filter(track => state.possible.includes(track.id));
  const gate = state.snapshotGate.evaluate({
    now,
    enabled: state.photoMode,
    consent: consent.checked,
    speaking: state.speech,
    speechStartedAt: state.speechStartAt,
    candidates
  });
  if (state.photoMode) state.snapshotStatus = gate.reason;
  if (gate.ready) {
    const track = candidates.find(t => t.id === gate.id);
    if (track && saveDemoPhoto(track)) {
      state.snapshotGate.confirmCaptured(now);
    }
  }
  updateStats();
}

function stopFaceAI(reason) {
  console.error("Face Mesh processing failed:", reason);
  const engine = state.faceAI;
  state.faceAI = null;
  state.faces = [];
  state.possible = [];
  byId("faceState").textContent = "Face Mesh: error";
  renderFaceBoxes();
  message(`Face Mesh stopped: ${reason?.message || String(reason)}. Classroom face count can still work.`, true);
  if (engine) void Promise.resolve(engine.close()).catch(console.warn);
}

function stopCrowdAI(reason) {
  console.error("Optional classroom Face Detection failed:", reason);
  state.crowdFailed = true;
  wideScanEnabled.checked = false;
  wideScanEnabled.disabled = true; // Avoid repeated WASM aborts on this page.
  releaseCrowdDetector();
  wideScanModel.disabled = false;
  byId("crowdState").textContent = "Wide scan unavailable — Face Mesh still works";
  const detail = reason?.message || String(reason);
  crowdHelp(`Optional 40-face detector failed (${detail}). Safe fallback is ON: webcam, Face Mesh, Silero, photos and consented audio remain available. Refresh to retry with 'Near camera' if needed.`, true);
  message("Optional classroom scanner stopped. Face Mesh and Silero still work; see the scan settings above the camera.", true);
}

function videoLoop(now) {
  if (!state.active) return;
  // Do not run the two MediaPipe graphs simultaneously: this prevents the
  // expensive Face Mesh graph from building a queue of old webcam frames.
  if (wideScanEnabled.checked && state.crowdAI && !state.crowdBusy && !state.faceBusy && state.crowdContext &&
      camera.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      camera.currentTime !== state.lastCrowdVideoTime &&
      now - state.lastCrowdAt >= SETTINGS.crowdEveryMs) {
    state.lastCrowdAt = now;
    state.lastCrowdVideoTime = camera.currentTime;
    const detector = state.crowdAI;
    state.crowdBusy = true;
    try {
      state.crowdContext.drawImage(camera, 0, 0,
        state.crowdCanvas.width, state.crowdCanvas.height);
    } catch (error) {
      state.crowdBusy = false;
      console.warn("Classroom camera frame unavailable", error);
    }
    if (state.crowdBusy) {
      const sentAt = performance.now();
      void Promise.resolve().then(() => detector.send({image: state.crowdCanvas})).then(() => {
        if (!state.active || state.crowdAI !== detector) return;
        const ms = performance.now() - sentAt;
        state.crowdLatencyMs = state.crowdLatencyMs
          ? .78 * state.crowdLatencyMs + .22 * ms : ms;
      }).catch(err => {
        if (state.active && state.crowdAI === detector) stopCrowdAI(err);
      }).finally(() => {
        state.crowdBusy = false;
        state.lastCrowdCompletedAt = performance.now();
        if (state.crowdDisposeAfter === detector) {
          state.crowdDisposeAfter = null;
          safelyCloseCrowd(detector);
        }
      });
    }
  }
  if (state.faceAI && !state.faceBusy && !state.crowdBusy && state.inferenceContext &&
      camera.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      camera.currentTime !== state.lastVideoTime &&
      now - state.lastFaceAt >= state.profile.faceEveryMs &&
      now - state.lastFaceCompletedAt >= Math.max(SETTINGS.faceIdleMs, state.faceLatencyMs * 0.25)) {
    state.lastFaceAt = now;
    state.lastVideoTime = camera.currentTime;
    const face = state.faceAI;
    state.faceBusy = true;
    // Downscale before inference: rendering stays at native webcam resolution,
    // but MediaPipe receives a smaller frame and cannot queue stale frames.
    try {
      state.inferenceContext.drawImage(camera, 0, 0,
        state.inferenceCanvas.width, state.inferenceCanvas.height);
    } catch (error) {
      state.faceBusy = false;
      console.warn("Camera frame unavailable", error);
      state.raf = requestAnimationFrame(videoLoop);
      return;
    }
    const submittedAt = performance.now();
    void Promise.resolve().then(() => face.send({image: state.inferenceCanvas})).then(() => {
      if (!state.active || state.faceAI !== face) return;
      const ms = performance.now() - submittedAt;
      state.faceLatencyMs = state.faceLatencyMs ? .72 * state.faceLatencyMs + .28 * ms : ms;
      // One-way adaptive reduction: heavy inference gets lower resolution.
      // Do not silently increase size and reintroduce stutter mid-session.
      const targetWidth = nextInferenceWidth(
        state.faceLatencyMs, state.inferenceWidth, state.profile.meshMinWidth);
      if (targetWidth < state.inferenceWidth && state.faceFrameCount > 10) {
        state.inferenceWidth = targetWidth;
        state.inferenceCanvas.width = Math.min(targetWidth, camera.videoWidth);
        state.inferenceCanvas.height = Math.max(1, Math.round(state.inferenceCanvas.width * camera.videoHeight / camera.videoWidth));
      }
    }).catch(error => {
      if (state.active && state.faceAI === face) stopFaceAI(error);
    }).finally(() => {
      state.lastFaceCompletedAt = performance.now();
      state.faceBusy = false;
    });
  }
  state.raf = requestAnimationFrame(videoLoop);
}

// Start Silero using the SAME AudioContext as the already-working sound
// meter, so browser autoplay suspensions cannot quietly starve the VAD.
async function initializeSpeechAI(token, processorType = 'auto') {
  const epoch = ++state.vadEpoch;
  const threshold = Number(byId('speechSensitivity').value);
  const vad = await startSpeechAI(state.stream,
    speaking => {
      if (epoch === state.vadEpoch && state.active && token === state.run)
        setSpeech(speaking, token);
    },
    probability => {
      if (epoch !== state.vadEpoch || !state.active || token !== state.run) return;
      state.vadConfidence = probability;
      const sampleAt = performance.now();
      if (sampleAt - state.vadPeakWindowAt > 3000) {
        state.vadPeakScore = probability;
        state.vadPeakWindowAt = sampleAt;
      } else {
        state.vadPeakScore = Math.max(state.vadPeakScore, probability);
      }
      state.vadFrames += 1;
      state.lastVadFrameAt = sampleAt;
    },
    threshold,
    {audioContext: state.noiseMeter?.audioContext, processorType}
  );
  if (!state.active || token !== state.run || epoch !== state.vadEpoch) {
    await stopSpeechAI(vad);
    return false;
  }
  state.vad = vad;
  state.vadProcessor = processorType;
  // Count only actual listening time, not model-download/initialization time.
  state.vadStartedAt = performance.now();
  state.vadStalledAlert = false;
  state.vadFailed = false;
  state.vadLastError = '';
  byId('vadState').textContent = processorType === 'ScriptProcessor'
    ? 'Silero AI: compatibility mode' : 'Silero AI: listening';
  updateStats(true);
  return true;
}

async function repairSpeechAI(token = state.run) {
  if (!state.active || state.stopping || state.vadRecovering || token !== state.run) return;
  state.vadRecovering = true;
  state.vadRecoveryAttempted = true;
  const old = state.vad;
  state.vad = null;
  ++state.vadEpoch; // Ignore late callbacks from the stopped processor.
  state.speech = false;
  state.possible = [];
  state.vadFrames = 0;
  state.lastVadFrameAt = 0;
  state.vadConfidence = 0;
  state.vadPeakScore = 0;
  state.vadPeakWindowAt = performance.now();
  state.vadStartedAt = performance.now();
  state.gateReason = 'Speech AI temporarily restarting — no red box';
  renderFaceBoxes();
  byId('vadState').textContent = 'Silero: switching audio backend';
  message('Microphone sound works, but Silero stopped receiving frames. Switching to the compatible audio processor without restarting the webcam...');
  updateControls();
  updateStats(true);
  try {
    if (old) await stopSpeechAI(old);
    if (!state.active || token !== state.run) return;
    const ok = await initializeSpeechAI(token, 'ScriptProcessor');
    if (ok) message('Compatible speech engine started. Speak for 3 seconds and check that Silero audio frames are increasing.');
  } catch (err) {
    if (state.active && token === state.run) {
      state.vadFailed = true;
      state.vadLastError = err?.message || String(err);
      byId('vadState').textContent = 'Silero AI: compatibility error';
      message(`Compatible speech engine failed: ${state.vadLastError}. Open Chrome/Edge Console (F12) for details.`, true);
      console.error('QuietIQ compatible speech backend:', err);
    }
  } finally {
    state.vadRecovering = false;
    if (state.active && token === state.run) {
      updateControls(); updateStats(true);
    }
  }
}

function audioTick() {
  if (!state.active) return;
  if (wideScanEnabled.checked && !state.crowdAI && !state.crowdFailed) {
    maybeStartCrowdDetector();
  }
  if (state.noiseMeter) state.level = state.noiseMeter.sample();
  const nowMs = performance.now();
  if (shouldSwitchToCompatibleProcessor({
    active: state.active, vadReady: Boolean(state.vad),
    processor: state.vadProcessor, retryStarted: state.vadRecoveryAttempted,
    frames: state.vadFrames, elapsedMs: nowMs - state.vadStartedAt,
    lastFrameAgeMs: state.lastVadFrameAt ? nowMs - state.lastVadFrameAt : null,
    initializing: state.vadRecovering
  })) {
    // Automatic one-time fallback. It never re-opens the camera or microphone.
    void repairSpeechAI(state.run);
  } else if (state.vad && state.vadRecoveryAttempted && state.vadFrames === 0 &&
             nowMs - state.vadStartedAt > 6500 && !state.vadStalledAlert) {
    state.vadStalledAlert = true;
    byId('vadState').textContent = 'Silero still receiving zero frames';
    message('Compatibility mode has no AI audio frames either. Click Retry speech AI, or press F12 and send the first red Console error.', true);
  }
  state.points.push(state.level);
  if (state.points.length > 96) state.points.shift();
  const now = performance.now();
  if (now - state.lastChartPaint >= state.profile.chartEveryMs) {
    state.lastChartPaint = now;
    drawNoiseGraph(state.points);
  }
  updateStats();
  if (now - state.lastSample >= SETTINGS.sampleEveryMs) {
    state.lastSample = now;
    void logEvent("sample");
  }
}

async function startSession() {
  if (state.active || state.loading) return;
  state.profile = choosePerformancePreset(performancePresetSelect.value);
  if (!state.profile.crowdAllowed) wideScanEnabled.checked = false;
  state.loading = true;
  const token = ++state.run;
  updateControls();
  message("Checking AI packages before opening your USB camera and microphone...");
  if (!(await checkAssets())) {
    state.loading = false;
    updateControls();
    message("Browser AI files are missing from this website deployment. Check the GitHub Actions Pages build.", true);
    return;
  }
  try {
    const {stream, cameraName, microphoneName} = await openSelectedDevices(state.profile, micProcessingMode.value);
    if (token !== state.run) { stream.getTracks().forEach(t => t.stop()); return; }
    state.stream = stream;
    state.active = true;
    camera.srcObject = stream;
    await camera.play();
    if (!state.active || token !== state.run) return;
    byId("cameraPlaceholder").hidden = true;
    byId("cameraStage").style.aspectRatio = `${camera.videoWidth}/${camera.videoHeight}`;
    byId("chosenDevices").textContent = `Camera: ${cameraName || "USB camera"} | Microphone: ${microphoneName || "USB mic"}`;
    byId("audioState").textContent = "Microphone: connected";
    byId("faceState").textContent = "Face Mesh: starting...";
    byId("crowdState").textContent = wideScanEnabled.checked
      ? "Classroom scan: queued until Face Mesh is ready" : "Classroom scan: OFF (stable mode)";
    byId("vadState").textContent = "Silero: starting...";
    state.vadFailed = false;
    state.vadConfidence = 0;
    state.vadPeakScore = 0; state.vadPeakWindowAt = performance.now();
    state.vadFrames = 0;
    state.lastVadFrameAt = 0;
    state.vadStartedAt = performance.now();
    state.vadStalledAlert = false;
    state.vadProcessor = 'auto';
    state.vadRecovering = false;
    state.vadRecoveryAttempted = false;
    state.vadLastError = '';
    state.noiseMeter = await createNoiseMeter(stream);
    state.inferenceCanvas = document.createElement("canvas");
    state.inferenceWidth = Math.min(state.profile.meshWidth, camera.videoWidth);
    state.inferenceCanvas.width = state.inferenceWidth;
    state.inferenceCanvas.height = Math.max(1, Math.round(state.inferenceWidth * camera.videoHeight / camera.videoWidth));
    state.inferenceContext = state.inferenceCanvas.getContext("2d", {alpha: false});
    if (!state.inferenceContext) throw new Error("Could not initialize the Face Mesh input canvas.");
    state.crowdCanvas = document.createElement("canvas");
    const cw = Math.min(SETTINGS.crowdInferenceWidth, camera.videoWidth);
    state.crowdCanvas.width = cw;
    state.crowdCanvas.height = Math.max(1, Math.round(cw * camera.videoHeight / camera.videoWidth));
    state.crowdContext = state.crowdCanvas.getContext("2d", {alpha: false});
    if (!state.crowdContext) throw new Error("Could not initialize classroom face detector canvas.");
    state.crowdReady = false;
    state.crowdFaces = [];
    state.crowdFrameCount = 0;
    state.crowdLatencyMs = 0;
    state.crowdBusy = false;
    state.lastCrowdVideoTime = -1;
    state.lastCrowdAt = 0;
    state.lastCrowdResultAt = 0;
    state.points = Array(64).fill(0);
    state.lastSample = performance.now();
    state.lastChartPaint = 0;
    state.lastStatsPaint = 0;
    resetTracks();
    state.faces = []; state.possible = []; state.faceFrameCount = 0;
    state.faceLatencyMs = 0; state.lastFaceCompletedAt = 0;
    state.snapshots = 0;
    state.snapshotGate.reset();
    state.snapshotStatus = "Confirm consent, then turn demo mode ON to enable photos";
    state.gateReason = "Waiting for face tracking";
    state.lastVideoTime = -1;
    state.lastFaceAt = 0;
    state.firstFaceFrame = false;
    state.faceBusy = false;
    state.raf = requestAnimationFrame(videoLoop);
    state.timer = setInterval(audioTick,
      Math.max(SETTINGS.noiseEveryMs, state.profile === choosePerformancePreset('smooth') ? 240 : SETTINGS.noiseEveryMs));
    updateControls();
    void logEvent("session_started");
    message(`Camera and mic connected. Starting ${state.profile.label} AI preset with ${state.profile.meshFaces} detailed face slots and Silero speech AI...`);

    // FaceMesh loads its WASM/model on the first asynchronous send().
    try {
      state.faceAI = createFaceMesh((landmarks, now) => onFaceResults(landmarks, now, token), state.profile.meshFaces);
    } catch (err) {
      byId("faceState").textContent = "Face Mesh: missing";
      console.error(err);
      message(`MediaPipe Face Mesh could not start: ${err.message}`, true);
    }
    // The optional wide detector is not started here. It is deliberately
    // delayed until Face Mesh and Silero are warm, and only with user opt-in.
    if (wideScanEnabled.checked) {
      crowdHelp("Waiting for Face Mesh and Silero warm-up before optional wide scan.");
    }
    // Speech AI is independent of Face Mesh, but shares the running microphone
    // AudioContext. If its worklet stalls, the watchdog changes only the VAD.
    try {
      await initializeSpeechAI(token, 'auto');
    } catch (err) {
      if (state.active && token === state.run) {
        state.vadFailed = true;
        state.vadLastError = err?.message || String(err);
        byId('vadState').textContent = 'Silero AI: error';
        console.error('Silero startup:', err);
        message(`Silero could not start: ${state.vadLastError}. The microphone graph can still work; use Retry Speech AI.`, true);
      }
    }
    if (state.faceAI && state.vad) {
      message("Face Mesh + Silero are ready. The optional 40-face scan starts only if you enable it above the camera. Red boxes remain estimates.");
    }
  } catch (err) {
    message(`Cannot start camera/microphone: ${err.name || "Error"}: ${err.message}`, true);
    await stopSession({silent: true});
  } finally {
    state.loading = false;
    updateControls();
  }
}

async function stopSession({silent = false} = {}) {
  if (state.stopping) return;
  state.stopping = true;
  const wasActive = state.active;
  ++state.run;
  // Save the current recorded clip before releasing the microphone track.
  if (audioArchive.isRecording || audioArchive.pending) {
    await audioArchive.stop(audioConsent.checked);
  }
  if (wasActive && !silent) void logEvent("session_stopped");
  state.active = false;
  state.speech = false;
  state.vadFailed = false;
  ++state.vadEpoch;
  state.vadConfidence = 0; state.vadPeakScore = 0; state.vadPeakWindowAt = 0; state.vadFrames = 0; state.lastVadFrameAt = 0; state.vadStartedAt = 0;
  state.vadRecovering = false; state.vadRecoveryAttempted = false; state.vadLastError = ''; state.vadProcessor = 'auto';
  state.photoMode = false;
  consent.checked = false;
  audioConsent.checked = false;
  state.snapshotGate.reset();
  state.snapshotStatus = "Not running — no snapshots";
  cancelAnimationFrame(state.raf);
  clearInterval(state.timer);
  state.raf = 0; state.timer = 0;
  state.faces = []; state.possible = []; state.level = 0;
  state.crowdFaces = []; state.crowdReady = false;
  state.crowdFrameCount = 0; state.crowdLatencyMs = 0;
  state.crowdCanvas = null; state.crowdContext = null;
  state.inferenceCanvas = null; state.inferenceContext = null;
  state.faceLatencyMs = 0; state.lastFaceCompletedAt = 0;
  state.snapshots = 0;
  state.faceFrameCount = 0; state.gateReason = "Not started";
  const oldFace = state.faceAI; state.faceAI = null;
  const oldCrowd = state.crowdAI; state.crowdAI = null;
  const oldVAD = state.vad; state.vad = null;
  const oldMeter = state.noiseMeter; state.noiseMeter = null;
  state.stream?.getTracks().forEach(t => t.stop());
  state.stream = null;
  camera.pause(); camera.srcObject = null;
  byId("cameraPlaceholder").hidden = false;
  byId("cameraStage").style.aspectRatio = "16 / 9";
  byId("faceState").textContent = "Face Mesh: off";
  byId("crowdState").textContent = "Classroom scan: OFF";
  byId("audioState").textContent = "Microphone: off";
  byId("vadState").textContent = "Silero AI: off";
  clearOverlay(); clearPhotos();
  if (oldFace) await Promise.resolve(oldFace.close()).catch(console.warn);
  if (oldCrowd) await Promise.resolve().then(() => oldCrowd.close()).catch(console.warn);
  if (oldVAD) await stopSpeechAI(oldVAD);
  if (oldMeter) await oldMeter.close().catch(console.warn);
  if (!silent) message("Stopped. Camera and mic released, snapshots cleared from this browser tab.");
  state.stopping = false;
  updateStats(true); updateControls();
}

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  message("Requesting permission to list cameras and microphones...");
  try {
    const result = await scanDevices();
    message(`Found ${result.cameras} camera(s) and ${result.microphones} mic(s). Select your USB webcam for both devices, then Start.`);
  } catch (err) {
    message(`Device selection failed: ${err.name || "Error"}: ${err.message}`, true);
  } finally { updateControls(); }
});
wideScanEnabled.addEventListener("change", onWideScanToggle);
wideScanModel.addEventListener("change", () => {
  crowdHelp(`Selected ${wideScanModel.value === "full" ? "whole classroom" : "near camera"} model. Enable the scan to try it.`);
});
startBtn.addEventListener("click", () => void startSession());
stopBtn.addEventListener("click", () => void stopSession());
retrySpeechBtn.addEventListener('click', () => void repairSpeechAI(state.run));
byId("lipThreshold").addEventListener("input", () => {
  byId("lipThresholdValue").textContent = Number(byId("lipThreshold").value).toFixed(2);
  // The next Face Mesh frame re-evaluates the condition.
});
byId("speechSensitivity").addEventListener("input", () => {
  const threshold = Number(byId("speechSensitivity").value);
  byId("sensitivityValue").textContent = threshold.toFixed(2);
  if (state.vad?.setOptions) {
    try { state.vad.setOptions({
      positiveSpeechThreshold: threshold,
      negativeSpeechThreshold: Math.max(0.12, threshold - 0.15)
    }); } catch (err) { console.warn("Sensitivity adjustment:", err); }
  }
});
consent.addEventListener("change", () => {
  if (!consent.checked && state.photoMode && !audioConsent.checked) changePhotoMode(false);
  state.snapshotStatus = consent.checked ? "Now turn demo mode ON to enable photos" : "Photo consent not confirmed";
  updateStats(true);
  updateControls();
});
audioConsent.addEventListener("change", () => {
  if (!audioConsent.checked) {
    if (audioArchive.isRecording) void audioArchive.stop(false);
    if (state.photoMode && !consent.checked) changePhotoMode(false);
  }
  updateControls();
});
audioStartBtn.addEventListener("click", () => void startAudioRecording());
audioStopBtn.addEventListener("click", () => void audioArchive.stop(true));
byId("refreshRecordingsBtn").addEventListener("click", () => void audioArchive.refresh());
byId("deleteAllRecordingsBtn").addEventListener("click", async () => {
  if (!confirm("Delete ALL saved classroom audio recordings on this laptop? This cannot be undone.")) return;
  try { await audioArchive.deleteAll(); }
  catch (error) { message(`Could not delete audio recordings: ${error.message}`, true); }
});
modeBtn.addEventListener("click", () => changePhotoMode(!state.photoMode));
manualPhotoBtn.addEventListener("click", takeManualSnapshot);
performanceMode.addEventListener("change", updateControls);
performancePresetSelect.addEventListener("change", () => {
  updatePresetDescription();
  updateControls();
  updateStats(true);
});
byId("clearPhotosBtn").addEventListener("click", () => {
  clearPhotos(); state.snapshots = 0;
  state.snapshotStatus = state.photoMode ? "Ready for a new consented demonstration" : "No snapshots";
  updateStats(true);
  message("Temporary demonstration snapshots deleted.");
});
byId("clearHistoryBtn").addEventListener("click", async () => {
  if (!confirm("Delete all aggregate activity history stored in this browser?")) return;
  clearHistoryEvents();
  await refreshHistory();
  message("This browser's activity history was deleted.");
});
byId("downloadCsvBtn").addEventListener("click", downloadHistoryCsv);
// A recording must remain visible. Switching tabs stops and saves the clip
// instead of silently capturing audio while the recording indicator is hidden.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && audioArchive.isRecording) {
    void audioArchive.stop(audioConsent.checked);
  }
});
window.addEventListener("beforeunload", event => {
  if (audioArchive.isRecording || audioArchive.pending) {
    event.preventDefault();
    event.returnValue = "Stop and save the audio recording first.";
  } else {
    state.stream?.getTracks().forEach(t => t.stop());
  }
});

updateControls(); updateStats(true); drawNoiseGraph(state.points);
initPresentation();
void refreshHistory(); void checkAssets(); void audioArchive.refresh();
