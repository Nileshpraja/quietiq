/**
 * Speech frame watchdog, isolated for deterministic testing.
 * A running microphone amplitude meter does not prove the VAD receives audio.
 * We retry only once, changing the VAD capture backend without re-opening the
 * camera or microphone and without touching consented recordings.
 */
export function shouldSwitchToCompatibleProcessor({
  active = false, vadReady = false, processor = 'auto',
  retryStarted = false, frames = 0, elapsedMs = 0,
  lastFrameAgeMs = null, initializing = false
} = {}) {
  if (!active || !vadReady || initializing || retryStarted || processor === 'ScriptProcessor') {
    return false;
  }
  if (frames === 0) return elapsedMs >= 4800;
  return Number.isFinite(lastFrameAgeMs) && lastFrameAgeMs >= 5000;
}
