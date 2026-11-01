const byId = (id) => document.getElementById(id);
const labelOr = (device, fallback) => device.label?.trim() || fallback;

function fillSelect(select, devices, kind) {
  const previous = select.value;
  select.replaceChildren();
  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = labelOr(device, `${kind} ${index + 1}`);
    select.append(option);
  });
  if (devices.some(device => device.deviceId === previous)) {
    select.value = previous;
    return;
  }
  const external = devices.find(d => /usb|webcam|camera|external|audio device/i.test(d.label || "") && !/realtek/i.test(d.label || ""));
  if (external) select.value = external.deviceId;
}

export async function scanDevices() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera/microphone APIs are unavailable. Open QuietIQ over HTTPS in Chrome or Edge.");
  }
  // Permission enables device names. The short-lived tracks are stopped immediately.
  const temp = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
  try {
    const available = await navigator.mediaDevices.enumerateDevices();
    const cams = available.filter(d => d.kind === "videoinput");
    const mics = available.filter(d => d.kind === "audioinput");
    if (!cams.length || !mics.length) throw new Error("Windows/browser did not find both a camera and microphone.");
    fillSelect(byId("cameraSelect"), cams, "Camera");
    fillSelect(byId("micSelect"), mics, "Microphone");
    return {cameras: cams.length, microphones: mics.length};
  } finally {
    temp.getTracks().forEach(t => t.stop());
  }
}

export async function openSelectedDevices(profile = {}, micProcessingMode = "filtered") {
  const cameraId = byId("cameraSelect").value;
  const microphoneId = byId("micSelect").value;
  // Request a modest camera resolution. Capturing 1080p and downscaling on every
  // inference frame was an avoidable source of CPU/GPU load on older laptops.
  const video = {
    width: {ideal: profile.cameraWidth || 640},
    height: {ideal: profile.cameraHeight || 360},
    frameRate: {ideal: profile.cameraFps || 15}
  };
  // Less filtering helps diagnose microphones whose suppression algorithms
  // mistakenly remove quieter voices. The VAD still decides whether sound is speech.
  const natural = micProcessingMode === "natural";
  const audio = {echoCancellation: !natural, noiseSuppression: !natural,
                 autoGainControl: true, channelCount: {ideal: 1}};
  if (cameraId) video.deviceId = {exact: cameraId};
  if (microphoneId) audio.deviceId = {exact: microphoneId};
  const stream = await navigator.mediaDevices.getUserMedia({video, audio});
  const cam = stream.getVideoTracks()[0];
  const mic = stream.getAudioTracks()[0];
  if (!cam || !mic) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error("Camera or microphone track missing. Check the selected device.");
  }
  return {stream, cameraName: cam.label, microphoneName: mic.label};
}
