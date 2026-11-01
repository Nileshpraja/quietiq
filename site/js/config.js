// Local-only models. Lower-size AI input keeps camera boxes more responsive.
export const SETTINGS = Object.freeze({
  faceMeshAssets: new URL('../assets/face_mesh/', import.meta.url).href,
  faceDetectionAssets: new URL('../assets/face_detection/', import.meta.url).href,
  vadAssets: new URL('../assets/vad/', import.meta.url).href,
  onnxWasm: new URL('../assets/onnx/', import.meta.url).href,
  maxFaces: 5, // Detailed lip landmark tracking subset
  maxCrowdFaces: 40, // Display capacity; actual detections depend on camera/model
  crowdInferenceWidth: 768, // Conservative input size helps avoid WASM/GPU pressure
  crowdEveryMs: 1250, // Keep wide scans infrequent; Face Mesh and VAD have priority
  inferenceWidth: 640,
  inferenceMinWidth: 448,
  faceEveryMs: 80,
  faceIdleMs: 24,
  noiseEveryMs: 170,
  sampleEveryMs: 15000,
  photoCooldownMs: 6000,
  photoHoldMs: 350,
  maxPhotos: 8
});
