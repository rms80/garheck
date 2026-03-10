// server/Player.js
import {
  PLAYER_MAX_HP, MAX_INPUT_QUEUE,
  PLAYER_JUMP_VELOCITY,
  PUNCH_WINDUP, PUNCH_ACTIVE, PUNCH_RECOVERY,
  STOMP_VELOCITY, STOMP_MISS_LAG,
  IFRAMES_DURATION, PARRY_WINDOW
} from '../shared/constants.js';

export class Player {
  constructor(id) {
    this.id = id;
    this.reset();
    this.inputQueue = [];
    this.lastProcessedSeq = 0;
    this.isDummy = false;
  }

  reset() {
    // Spawn positions
    this.x = this.id === 0 ? -8 : 8;
    this.y = 0;
    this.z = 0;
    this.yaw = this.id === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.velocityY = 0;
    this.knockbackX = 0;
    this.knockbackZ = 0;
    this.hp = PLAYER_MAX_HP;
    this.grounded = true;

    // State machine
    this.state = 'idle';
    this.stateTimer = 0;
    this.attackPhase = null; // 'windup', 'active', 'recovery'
    this.attackPhaseTimer = 0;
    this.blockStartTime = 0;  // time when block started (for parry window)
    this.blockElapsed = 0;

    // I-frames
    this.iframesRemaining = 0;

    // Stomp tracking
    this.stompHasHit = false;
    this._stompTapTimer = 0; // double-tap window for airborne stomp

    // Air parry tracking
    this._airParryElapsed = -1; // -1 = inactive

    // Punch tracking (used by Combat.js)
    this._punchHitThisCycle = false;

    // Current input
    this.currentInput = {
      left: false, right: false, forward: false, backward: false,
      jump: false, attack: false, block: false, cameraYaw: this.yaw
    };
  }

  queueInput(input, seq) {
    this.inputQueue.push({ input, seq });
    // Limit queue size
    if (this.inputQueue.length > MAX_INPUT_QUEUE) {
      this.inputQueue = this.inputQueue.slice(-MAX_INPUT_QUEUE);
    }
  }

  /**
   * Process queued inputs for this tick.
   * Returns the effective input for physics (held keys from latest, edge triggers scanned).
   */
  processInputs() {
    if (this.inputQueue.length === 0) return;

    let jumpTriggered = false;
    let attackTriggered = false;

    // Scan all queued inputs for edge triggers
    for (const entry of this.inputQueue) {
      if (entry.input.jump) jumpTriggered = true;
      if (entry.input.attack) attackTriggered = true;
      this.lastProcessedSeq = entry.seq;
    }

    // Use latest input for held keys
    const latest = this.inputQueue[this.inputQueue.length - 1].input;
    this.currentInput = {
      left: latest.left || false,
      right: latest.right || false,
      forward: latest.forward || false,
      backward: latest.backward || false,
      jump: jumpTriggered,
      attack: attackTriggered,
      block: latest.block || false,
      cameraYaw: typeof latest.cameraYaw === 'number' && isFinite(latest.cameraYaw)
        ? latest.cameraYaw : this.currentInput.cameraYaw
    };

    // Clear queue
    this.inputQueue = [];
  }

  /**
   * Update state machine and timers.
   */
  updateState(dt) {
    // Decay i-frames
    if (this.iframesRemaining > 0) {
      this.iframesRemaining = Math.max(0, this.iframesRemaining - dt);
    }

    // State-specific timer updates
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
    }

    // Decay stomp double-tap timer
    if (this._stompTapTimer > 0) {
      this._stompTapTimer = Math.max(0, this._stompTapTimer - dt);
    }

    // Tick air parry timer
    if (this._airParryElapsed >= 0) {
      this._airParryElapsed += dt;
    }

    // Attack phase progression
    if (this.state === 'attacking') {
      this.attackPhaseTimer -= dt;
      if (this.attackPhaseTimer <= 0) {
        if (this.attackPhase === 'windup') {
          this.attackPhase = 'active';
          this.attackPhaseTimer = PUNCH_ACTIVE;
        } else if (this.attackPhase === 'active') {
          this.attackPhase = 'recovery';
          this.attackPhaseTimer = PUNCH_RECOVERY;
        } else if (this.attackPhase === 'recovery') {
          if (!this.grounded) {
            // Air punch finished — return to falling
            this.state = 'falling';
            this.stateTimer = 0;
            this.attackPhase = null;
            this.attackPhaseTimer = 0;
          } else {
            this._transitionToIdle();
          }
        }
      }
    }

    // Hitstun expiry
    if (this.state === 'hitstun' && this.stateTimer <= 0) {
      if (this.grounded) {
        this._transitionToIdle();
      } else {
        this.state = 'falling';
        this.stateTimer = 0;
      }
    }

    // StompLag expiry
    if (this.state === 'stompLag' && this.stateTimer <= 0) {
      this._transitionToIdle();
    }

    // Block elapsed tracking
    if (this.state === 'blocking') {
      this.blockElapsed += dt;
    }

    // Jumping -> falling transition
    if (this.state === 'jumping' && this.velocityY <= 0) {
      this.state = 'falling';
    }

    // Landing while jumping or falling
    if ((this.state === 'jumping' || this.state === 'falling') && this.grounded) {
      this._stompTapTimer = 0;
      if (this.currentInput.block) {
        // Landing while holding block — enter block without parry window
        this.state = 'blocking';
        this.blockElapsed = PARRY_WINDOW;
        this._airParryElapsed = -1;
      } else {
        this._airParryElapsed = -1;
        this._transitionToIdle();
      }
    }

    // Stomping - landing
    if (this.state === 'stomping' && this.grounded) {
      if (this.stompHasHit) {
        // Bounce (handled by combat)
        this.state = 'jumping';
        this.stateTimer = 0;
      } else {
        // Miss - stomp lag
        this.state = 'stompLag';
        this.stateTimer = STOMP_MISS_LAG;
      }
    }

    // Process input-driven transitions
    this._processInputTransitions();
  }

  _processInputTransitions() {
    const input = this.currentInput;
    const canAct = this.state === 'idle' || this.state === 'running';
    const isAirborne = this.state === 'jumping' || this.state === 'falling';

    // Block (held) - ground only
    if (input.block && canAct && this.grounded) {
      this.state = 'blocking';
      this.blockElapsed = 0;
      return;
    }

    // Release block
    if (this.state === 'blocking' && !input.block) {
      this._transitionToIdle();
    }

    // Release block resets air parry
    if (!input.block) {
      this._airParryElapsed = -1;
    }

    // Air parry — block pressed while airborne starts parry window (doesn't change state)
    if (input.block && !this.grounded && this._airParryElapsed < 0 && this.state !== 'stomping') {
      this._airParryElapsed = 0;
    }

    // Jump
    if (input.jump && canAct && this.grounded) {
      this.state = 'jumping';
      this.velocityY = PLAYER_JUMP_VELOCITY;
      this.grounded = false;
      input.jump = false; // consume so it doesn't also trigger stomp this tick
    }

    // Re-evaluate airborne after possible jump transition
    // Also consider running/idle while not grounded (e.g., walked off an edge or player collision)
    const isNowAirborne = this.state === 'jumping' || this.state === 'falling'
      || ((this.state === 'running' || this.state === 'idle') && !this.grounded);

    // Air stomp - double-tap spacebar while airborne
    if (input.jump && isNowAirborne && this.state !== 'stomping') {
      if (this._stompTapTimer > 0) {
        // Second tap within window — stomp
        this.state = 'stomping';
        this.velocityY = STOMP_VELOCITY;
        this.stompHasHit = false;
        this._stompTapTimer = 0;
        return;
      } else {
        // First tap — start the double-tap window
        this._stompTapTimer = 0.3;
      }
    }

    // Attack - punch (ground or air)
    if (input.attack && (canAct || isNowAirborne) && this.state !== 'attacking' && this.state !== 'stomping') {
      this.state = 'attacking';
      this.attackPhase = 'windup';
      this.attackPhaseTimer = PUNCH_WINDUP;
      this.stateTimer = PUNCH_WINDUP + PUNCH_ACTIVE + PUNCH_RECOVERY;
      this._wasAirborneWhenAttacking = !this.grounded;
      return;
    }

    // Running / idle transitions
    if (canAct) {
      const hasMovement = input.left || input.right || input.forward || input.backward;
      if (hasMovement && this.state !== 'running') {
        this.state = 'running';
      } else if (!hasMovement && this.state !== 'idle') {
        this.state = 'idle';
      }
    }
  }

  _transitionToIdle() {
    const input = this.currentInput;
    const hasMovement = input.left || input.right || input.forward || input.backward;
    this.state = hasMovement ? 'running' : 'idle';
    this.stateTimer = 0;
    this.attackPhase = null;
    this.attackPhaseTimer = 0;
  }

  enterHitstun(duration) {
    this.state = 'hitstun';
    this.stateTimer = duration;
    this.attackPhase = null;
    this.attackPhaseTimer = 0;
  }

  applyDamage(damage) {
    this.hp = Math.max(0, this.hp - damage);
  }

  applyKnockback(kbX, kbY, kbZ) {
    this.knockbackX += kbX;
    this.knockbackZ += kbZ;
    if (kbY > 0) {
      this.velocityY = Math.max(this.velocityY, kbY);
    } else if (kbY < 0) {
      this.velocityY = kbY;
    }
  }

  applyIframes() {
    this.iframesRemaining = IFRAMES_DURATION;
  }

  isInvincible() {
    return this.iframesRemaining > 0;
  }

  isParrying() {
    if (this.state === 'blocking' && this.blockElapsed < PARRY_WINDOW) return true;
    if (this._airParryElapsed >= 0 && this._airParryElapsed < PARRY_WINDOW) return true;
    return false;
  }

  isBlocking() {
    return this.state === 'blocking';
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      velocityY: this.velocityY,
      knockbackX: this.knockbackX,
      knockbackZ: this.knockbackZ,
      hp: this.hp,
      grounded: this.grounded,
      state: this.state,
      stateTimer: this.stateTimer,
      iframesRemaining: this.iframesRemaining,
      airParrying: this._airParryElapsed >= 0 && this._airParryElapsed < PARRY_WINDOW,
    };
  }
}
