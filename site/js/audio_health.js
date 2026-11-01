/**
 * Read-only troubleshooting hints. Do NOT classify audio based on loudness.
 * Speech decisions remain with Silero, not the RMS microphone meter.
 */
export function diagnoseMicrophone({active = false, track = null,
    vad = null, vadFailed = false, vadFrames = 0, vadConfidence = 0,
    level = 0, speech = false, sensitivity = 0.4,
    elapsedMs = 0, frameAgeMs = null, audioContextState = null, recovering = false, recoveryTried = false} = {}) {
  if (!active) return {status: 'idle', text: 'Start the camera + AI mic to test talking detection.'};
  if (!track) return {status: 'error', text: 'No microphone audio track. Select the USB webcam microphone and restart.'};
  if (recovering) return {status: 'loading', text: 'Silero audio frames stalled. Switching to a compatible speech processor automatically...'};
  if (track.readyState === 'ended' || track.enabled === false) {
    return {status: 'error', text: 'Microphone track stopped or disabled. Restart the camera and microphone.'};
  }
  if (track.muted) return {status: 'error', text: 'Windows/browser muted the microphone. Check Windows Sound Input.'};
  if (vadFailed) return {status: 'error', text: 'Silero failed to start. Check the Status message and installed AI files.'};
  if (audioContextState && audioContextState !== 'running') return {status: 'error', text: `Microphone AudioContext is ${audioContextState}. Restart the session from a user click.`};
  if (!vad) return {status: 'loading', text: 'Waiting for Silero to initialize. Keep this page open.'};
  if (vadFrames === 0 && elapsedMs > 6500) {
    return {status: 'error', text: recoveryTried ? 'Compatibility speech engine still has no frames. Click Retry Speech AI or open F12 Console and share the first red error.' : 'Silero is not processing frames. Automatic compatibility fallback will start.'};
  }
  if (Number.isFinite(frameAgeMs) && frameAgeMs > 4000 && elapsedMs > 6500) {
    return {status: 'error', text: 'Speech AI frames have stalled. Stop/restart; close heavy background apps.'};
  }
  if (vadFrames === 0) return {status: 'loading', text: 'Waiting for first Silero audio frame...'};
  if (speech) return {status: 'ok', text: 'Speech detected by Silero. Look for lip movement to trigger a red box.'};
  if (level === 0 && vadConfidence < 0.02 && elapsedMs > 3000) {
    return {status: 'warning', text: 'Almost no microphone sound. Check the USB mic selection, Windows input level, and mute.'};
  }
  if (vadConfidence >= sensitivity) {
    return {status: 'loading', text: 'Silero speech probability is high; waiting for its speech-start event.'};
  }
  if (level > 2 && vadConfidence < sensitivity) {
    return {status: 'warning', text: 'The microphone hears sound, but Silero is not confident it is speech. Try threshold 0.40, or Unfiltered mic mode if your voice is muffled.'};
  }
  return {status: 'idle', text: 'Listening. Speak clearly near the USB mic for 3 seconds; watch the probability.'};
}
