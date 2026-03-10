// client/js/Prediction.js
// Client-side prediction and reconciliation + opponent interpolation

import { simulatePlayer, resolveWallCollision } from '/shared/Physics.js';
import { SNAP_THRESHOLD, LERP_THRESHOLD, LERP_FACTOR, TICK_DURATION } from '/shared/constants.js';

export class Prediction {
  constructor() {
    // Buffer of unacknowledged inputs: { seq, input, predictedState }
    this.inputBuffer = [];
    this.seq = 0;

    // Local predicted state for our player
    this.localState = null;

    // Opponent interpolation state
    this.opponentSnapshots = []; // { state, timestamp }
    this.opponentRenderState = null;
  }

  /**
   * Initialize local state from server state.
   */
  initLocalState(serverPlayerState) {
    this.localState = { ...serverPlayerState };
  }

  /**
   * Process a local input: predict the result and buffer the input.
   * Returns the current seq number.
   */
  processInput(input) {
    this.seq++;

    if (this.localState) {
      // Create a mutable copy for prediction
      const state = { ...this.localState };
      const dt = TICK_DURATION / 1000;
      simulatePlayer(state, input, dt);
      this.localState = state;

      this.inputBuffer.push({
        seq: this.seq,
        input: { ...input },
      });
    }

    return this.seq;
  }

  /**
   * Reconcile with authoritative server state.
   */
  reconcile(serverState, lastProcessedSeq) {
    if (!this.localState) {
      this.localState = { ...serverState };
      return;
    }

    // Discard acknowledged inputs
    this.inputBuffer = this.inputBuffer.filter(entry => entry.seq > lastProcessedSeq);

    // Start from server authoritative position
    const reconciled = {
      x: serverState.x,
      y: serverState.y,
      z: serverState.z,
      yaw: serverState.yaw,
      velocityY: serverState.velocityY,
      knockbackX: serverState.knockbackX,
      knockbackZ: serverState.knockbackZ,
      grounded: serverState.grounded,
      state: serverState.state,
      stateTimer: serverState.stateTimer,
      hp: serverState.hp,
      iframesRemaining: serverState.iframesRemaining,
      attackPhase: null,
    };

    // Re-simulate unacknowledged inputs
    const dt = TICK_DURATION / 1000;
    for (const entry of this.inputBuffer) {
      simulatePlayer(reconciled, entry.input, dt);
    }

    // Check distance between reconciled and current local
    const dx = reconciled.x - this.localState.x;
    const dz = reconciled.z - this.localState.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > SNAP_THRESHOLD) {
      // Snap
      this.localState = reconciled;
    } else if (dist > LERP_THRESHOLD) {
      // Lerp toward reconciled
      this.localState.x += (reconciled.x - this.localState.x) * LERP_FACTOR;
      this.localState.z += (reconciled.z - this.localState.z) * LERP_FACTOR;
    } else {
      // Close enough, adopt reconciled silently
      this.localState = reconciled;
    }

    // Always adopt non-position authoritative state
    this.localState.y = reconciled.y;
    this.localState.velocityY = reconciled.velocityY;
    this.localState.hp = serverState.hp;
    this.localState.state = serverState.state;
    this.localState.stateTimer = serverState.stateTimer;
    this.localState.iframesRemaining = serverState.iframesRemaining;
    this.localState.airParrying = serverState.airParrying;
  }

  /**
   * Add opponent snapshot for interpolation.
   */
  addOpponentSnapshot(state) {
    this.opponentSnapshots.push({
      state: { ...state },
      timestamp: performance.now()
    });

    // Keep only last 5 snapshots
    if (this.opponentSnapshots.length > 5) {
      this.opponentSnapshots.shift();
    }
  }

  /**
   * Get interpolated opponent state.
   */
  getOpponentState() {
    const snapshots = this.opponentSnapshots;
    if (snapshots.length === 0) return null;
    if (snapshots.length === 1) return snapshots[0].state;

    // Interpolate between the two most recent
    const s0 = snapshots[snapshots.length - 2];
    const s1 = snapshots[snapshots.length - 1];

    const elapsed = performance.now() - s1.timestamp;
    const interval = s1.timestamp - s0.timestamp;

    if (interval <= 0) return s1.state;

    const t = Math.min(1, elapsed / interval);

    return {
      ...s1.state,
      x: s0.state.x + (s1.state.x - s0.state.x) * t,
      y: s0.state.y + (s1.state.y - s0.state.y) * t,
      z: s0.state.z + (s1.state.z - s0.state.z) * t,
    };
  }
}
