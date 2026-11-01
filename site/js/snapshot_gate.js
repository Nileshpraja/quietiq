/**
 * Consent-first snapshot decision logic. No images, identities, or audio here.
 * Keeps confidence separate from authority: a tentative speaker estimate is
 * only used after the operator has explicitly enabled demo photography.
 */
export class SnapshotGate {
  constructor({holdMs = 350, cooldownMs = 6000, missingGraceMs = 1100} = {}) {
    this.holdMs = holdMs;
    this.cooldownMs = cooldownMs;
    this.missingGraceMs = missingGraceMs;
    this.reset();
  }

  reset() {
    this.candidateId = null;
    this.candidateSince = 0;
    this.lastCandidateAt = -Infinity;
    this.lastCapturedAt = -Infinity;
    this.capturedInSpeech = false;
  }

  endSpeech() {
    this.candidateId = null;
    this.candidateSince = 0;
    this.lastCandidateAt = -Infinity;
    this.capturedInSpeech = false;
  }

  evaluate({now, enabled, consent, speaking, candidates, speechStartedAt = 0}) {
    if (!enabled) {
      this.endSpeech();
      return {ready: false, reason: 'Demo mode OFF — no photos'};
    }
    if (!consent) {
      this.endSpeech();
      return {ready: false, reason: 'Consent confirmation required'};
    }
    if (!speaking) {
      this.endSpeech();
      return {ready: false, reason: 'Waiting for Silero speech detection'};
    }
    if (!Array.isArray(candidates) || candidates.length !== 1) {
      if (candidates?.length > 1) {
        this.candidateId = null;
        return {ready: false, reason: 'Several possible speakers — no automatic photo'};
      }
      if (now - this.lastCandidateAt > this.missingGraceMs) {
        this.candidateId = null;
        this.candidateSince = 0;
      }
      return {ready: false, reason: 'Waiting for matching lip motion'};
    }
    const candidate = candidates[0];
    if (this.candidateId !== candidate.id || now - this.lastCandidateAt > this.missingGraceMs) {
      this.candidateId = candidate.id;
      this.candidateSince = now;
    }
    this.lastCandidateAt = now;
    if (this.capturedInSpeech) {
      return {ready: false, reason: 'Captured this speech segment — waiting for next one'};
    }
    const untilCooldown = this.cooldownMs - (now - this.lastCapturedAt);
    if (untilCooldown > 0) {
      return {ready: false, reason: `Capture cooldown: ${Math.ceil(untilCooldown / 1000)}s`};
    }
    const heldFor = now - Math.max(this.candidateSince, speechStartedAt);
    if (heldFor < this.holdMs) {
      return {ready: false, reason: `Confirming speech + lip motion (${Math.round(heldFor)} / ${this.holdMs} ms)`};
    }
    return {ready: true, id: candidate.id, reason: 'Consented capture ready'};
  }

  confirmCaptured(now) {
    this.capturedInSpeech = true;
    this.lastCapturedAt = now;
  }
}
