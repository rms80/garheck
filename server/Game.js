// server/Game.js
import { Player } from './Player.js';
import { processCombat } from './Combat.js';
import { simulatePlayer, resolvePlayerCollision } from '../shared/Physics.js';
import {
  TICK_DURATION, SEND_INTERVAL,
  ROUND_TIME, ROUNDS_TO_WIN, MAX_DRAWS,
  COUNTDOWN_SECONDS, BETWEEN_ROUNDS_PAUSE
} from '../shared/constants.js';

export class Game {
  constructor(soloMode = false) {
    this.players = [new Player(0), new Player(1)];
    this.soloMode = soloMode;
    this.tickCount = 0;
    this.running = false;
    this.acceptingInputs = false;
    this.connections = [null, null];

    // Match state
    this.scores = [0, 0]; // rounds won
    this.currentRound = 1;
    this.roundTimer = ROUND_TIME;
    this.consecutiveDraws = 0;
    this.suddenDeath = false;

    // Game phase: 'waiting' | 'countdown' | 'playing' | 'roundEnd' | 'matchEnd'
    this.phase = 'waiting';
    this.phaseTimer = 0;
    this.countdownValue = 0;

    // Play again
    this.playAgainFlags = [false, false];

    if (soloMode) {
      this.players[1].isDummy = true;
    }
  }

  setConnection(playerId, ws) {
    this.connections[playerId] = ws;
  }

  startMatch() {
    this.running = true;
    this.scores = [0, 0];
    this.currentRound = 1;
    this.consecutiveDraws = 0;
    this.suddenDeath = false;
    this._resetRound();
    this._startCountdown();
    this._startTickLoop();
  }

  stop() {
    this.running = false;
  }

  handlePlayAgain(playerId) {
    if (this.phase !== 'matchEnd') return;
    this.playAgainFlags[playerId] = true;

    if (this.playAgainFlags[0] && (this.playAgainFlags[1] || this.soloMode)) {
      // Both ready - restart
      this.playAgainFlags = [false, false];
      this.scores = [0, 0];
      this.currentRound = 1;
      this.consecutiveDraws = 0;
      this.suddenDeath = false;
      this._resetRound();
      this._startCountdown();
    } else {
      this._broadcastEvent({ kind: 'playAgainWaiting' });
    }
  }

  queueInput(playerId, input, seq) {
    if (!this.acceptingInputs) return;
    if (playerId < 0 || playerId > 1) return;
    this.players[playerId].queueInput(input, seq);
  }

  _startCountdown() {
    this.phase = 'countdown';
    this.countdownValue = COUNTDOWN_SECONDS;
    this.phaseTimer = 1.0; // 1 second per count
    this.acceptingInputs = false;
    this._broadcastEvent({ kind: 'countdown', value: this.countdownValue });
  }

  _resetRound() {
    for (const player of this.players) {
      player.reset();
    }
    this.roundTimer = this.suddenDeath ? 30 : ROUND_TIME;
    if (this.suddenDeath) {
      this.players[0].hp = 1;
      this.players[1].hp = 1;
    }
  }

  _startTickLoop() {
    // Don't start another loop if already running
    if (this._loopRunning) return;
    this._loopRunning = true;

    let lastTime = performance.now();
    let accumulator = 0;

    const loop = () => {
      if (!this.running) {
        this._loopRunning = false;
        return;
      }

      const now = performance.now();
      accumulator += now - lastTime;
      lastTime = now;

      while (accumulator >= TICK_DURATION) {
        this._tick();
        accumulator -= TICK_DURATION;
      }

      setTimeout(loop, 1);
    };

    loop();
  }

  _tick() {
    const dt = TICK_DURATION / 1000;
    this.tickCount++;

    // Phase-specific logic
    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.countdownValue--;
        if (this.countdownValue > 0) {
          this.phaseTimer = 1.0;
          this._broadcastEvent({ kind: 'countdown', value: this.countdownValue });
        } else {
          this.phase = 'playing';
          this.acceptingInputs = true;
          this._broadcastEvent({ kind: 'roundStart' });
        }
      }
      // Still broadcast state during countdown so clients see positions
      if (this.tickCount % SEND_INTERVAL === 0) {
        this._broadcastState();
      }
      return;
    }

    if (this.phase === 'roundEnd') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this._checkMatchEnd()) {
          this.phase = 'matchEnd';
          const winnerId = this.scores[0] >= ROUNDS_TO_WIN ? 0 : 1;
          this._broadcastEvent({ kind: 'matchEnd', winnerId, scores: [...this.scores] });
        } else {
          this._resetRound();
          this._startCountdown();
        }
      }
      if (this.tickCount % SEND_INTERVAL === 0) {
        this._broadcastState();
      }
      return;
    }

    if (this.phase !== 'playing') {
      if (this.tickCount % SEND_INTERVAL === 0) {
        this._broadcastState();
      }
      return;
    }

    // === PLAYING PHASE ===

    // 1. Process queued inputs
    for (const player of this.players) {
      if (!player.isDummy) {
        player.processInputs();
      }
    }

    // 2. Update state machines
    for (const player of this.players) {
      player.updateState(dt);
    }

    // 3-7. Physics simulation
    for (const player of this.players) {
      simulatePlayer(player, player.currentInput, dt);
    }

    // 10. Player-vs-player collision
    resolvePlayerCollision(this.players[0], this.players[1]);

    // 11. Combat
    const events0 = processCombat(this.players[0], this.players[1]);
    const events1 = processCombat(this.players[1], this.players[0]);
    for (const event of [...events0, ...events1]) {
      this._broadcastEvent(event);
    }

    // 12. Round timer
    this.roundTimer -= dt;

    // 12a. Check for KO
    if (this.players[0].hp <= 0 || this.players[1].hp <= 0) {
      this._endRound();
    }
    // 12b. Check timer expiry
    else if (this.roundTimer <= 0) {
      this._endRoundByTimeout();
    }

    // 13. Broadcast state at SEND_RATE
    if (this.tickCount % SEND_INTERVAL === 0) {
      this._broadcastState();
    }
  }

  _endRound() {
    this.acceptingInputs = false;
    let winnerId;

    if (this.players[0].hp <= 0 && this.players[1].hp <= 0) {
      // Both KO'd - draw
      winnerId = -1;
    } else if (this.players[0].hp <= 0) {
      winnerId = 1;
    } else {
      winnerId = 0;
    }

    if (winnerId >= 0) {
      this.scores[winnerId]++;
      this.consecutiveDraws = 0;
      this.suddenDeath = false;
    } else {
      this.consecutiveDraws++;
      if (this.consecutiveDraws >= MAX_DRAWS) {
        this.suddenDeath = true;
      }
    }

    this._broadcastEvent({
      kind: 'roundEnd',
      winnerId,
      scores: [...this.scores]
    });

    this.phase = 'roundEnd';
    this.phaseTimer = BETWEEN_ROUNDS_PAUSE;

    if (winnerId >= 0) {
      this.currentRound++;
    }
  }

  _endRoundByTimeout() {
    this.acceptingInputs = false;
    let winnerId;

    if (this.players[0].hp > this.players[1].hp) {
      winnerId = 0;
    } else if (this.players[1].hp > this.players[0].hp) {
      winnerId = 1;
    } else {
      winnerId = -1; // draw
    }

    if (winnerId >= 0) {
      this.scores[winnerId]++;
      this.consecutiveDraws = 0;
      this.suddenDeath = false;
    } else {
      this.consecutiveDraws++;
      if (this.consecutiveDraws >= MAX_DRAWS) {
        this.suddenDeath = true;
      }
    }

    this._broadcastEvent({
      kind: 'roundEnd',
      winnerId,
      scores: [...this.scores]
    });

    this.phase = 'roundEnd';
    this.phaseTimer = BETWEEN_ROUNDS_PAUSE;

    if (winnerId >= 0) {
      this.currentRound++;
    }
  }

  _checkMatchEnd() {
    return this.scores[0] >= ROUNDS_TO_WIN || this.scores[1] >= ROUNDS_TO_WIN;
  }

  _broadcastEvent(event) {
    const msg = JSON.stringify({ type: 'event', event });
    for (let i = 0; i < 2; i++) {
      const ws = this.connections[i];
      if (ws && ws.readyState === 1) {
        ws.send(msg);
      }
    }
  }

  _broadcastState() {
    const baseState = {
      type: 'state',
      tick: this.tickCount,
      roundTimer: this.roundTimer,
      currentRound: this.currentRound,
      scores: this.scores,
      players: this.players.map(p => p.serialize()),
      timestamp: performance.now()
    };

    for (let i = 0; i < 2; i++) {
      const ws = this.connections[i];
      if (ws && ws.readyState === 1) {
        const msg = {
          ...baseState,
          lastProcessedSeq: this.players[i].lastProcessedSeq
        };
        ws.send(JSON.stringify(msg));
      }
    }
  }
}
