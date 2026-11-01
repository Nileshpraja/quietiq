import {SETTINGS} from "./config.js";

/** Silero VAD (ONNX in browser), never forwards raw audio to Python. */
export async function startSpeechAI(activeStream, onSpeech, onFrame, sensitivity = 0.40,
    {audioContext = null, processorType = 'auto'} = {}) {
  if (!window.vad?.MicVAD) {
    throw new Error("Speech AI scripts did not load. Check your internet connection / browser blocking extensions.");
  }
  // Stay single-threaded in the browser without cross-origin isolation.
  // Exact ONNX .mjs and .wasm files are served at SETTINGS.onnxWasm.
  if (window.ort?.env?.wasm) window.ort.env.wasm.numThreads = 1;
  const audioTrack = activeStream.getAudioTracks()[0];
  if (!audioTrack) throw new Error("The selected microphone produced no audio track.");

  // The VAD and noise meter share the exact microphone selected in the UI.
  // Prevent the VAD from stopping our shared track when paused.
  // Reuse the already RUNNING AudioContext that powers the live microphone
  // meter. Chromium may suspend a brand-new context created by MicVAD after
  // asynchronous ONNX model loading, leaving the frame counter at zero.
  // A user-clicked camera session has already resumed the meter's context.
  if (audioContext?.state === 'suspended') await audioContext.resume();
  if (audioContext && audioContext.state !== 'running') {
    throw new Error(`Browser audio context is ${audioContext.state}, not running`);
  }
  const speech = await window.vad.MicVAD.new({
    ...(audioContext ? {audioContext} : {}),
    processorType,
    model: "v5",
    baseAssetPath: SETTINGS.vadAssets,
    onnxWASMBasePath: SETTINGS.onnxWasm,
    getStream: async () => new MediaStream([audioTrack]),
    pauseStream: async () => {},
    resumeStream: async stream => stream,
    startOnLoad: false,
    positiveSpeechThreshold: sensitivity,
    negativeSpeechThreshold: Math.max(0.12, sensitivity - 0.15),
    minSpeechMs: 140,
    redemptionMs: 480,
    onSpeechStart: () => onSpeech(true),
    onSpeechEnd: () => onSpeech(false),
    onVADMisfire: () => onSpeech(false),
    onFrameProcessed: (probabilities) => {
      const confidence = Number(probabilities?.isSpeech);
      if (Number.isFinite(confidence)) onFrame(Math.max(0, Math.min(1, confidence)));
    }
  });
  await speech.start();
  // Verify context state after the VAD starts. MicVAD itself does not
  // resume a suspended AudioContext in the pinned 0.0.31 release.
  if (audioContext?.state === 'suspended') await audioContext.resume();
  return speech;
}

export async function stopSpeechAI(instance) {
  if (!instance) return;
  try { await instance.destroy(); } catch (err) { console.warn("VAD cleanup:", err); }
}

/** Relative microphone amplitude, not calibrated decibels or proof of speaking. */
export async function createNoiseMeter(stream) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === "suspended") await context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.65;
  const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  source.connect(analyser);
  const values = new Uint8Array(analyser.fftSize);
  return {
    // Shared, active audio graph. Never close this until MicVAD is destroyed.
    audioContext: context,
    sample() {
      analyser.getByteTimeDomainData(values);
      let total = 0;
      for (const v of values) { const n = (v - 128) / 128; total += n * n; }
      const rms = Math.sqrt(total / values.length);
      return Math.max(0, Math.min(100, Math.round(rms * 700)));
    },
    async close() { source.disconnect(); await context.close(); }
  };
}
