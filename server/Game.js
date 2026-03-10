// server/Game.js
import { Player } from './Player.js';
import { processCombat } from './Combat.js';
import { simulatePlayer, resolvePlayerCollision } from '../shared/Physics.js';
import {
  TICK_DURATION, SEND_INTERVAL, TICK_RATE
} from '../shared/constants.js';

export class Game {
  constructor(soloMode = false) {
    this.players = [new Player(0), new Player(1)];
    this.soloMode = soloMode;
    this.tickCount = 0;
    this.running = false;
    this.acceptingInputs = false;
    this.connections = [null, null]; // WebSocket connections

    if (soloMode) {
      this.players[1].isDummy = true;
    }
  }

  setConnection(playerId, ws) {
    this.connections[playerId] = ws;
  }

  start() {
    this.running = true;
    this.acceptingInputs = true;
    this._startTickLoop();
  }

  stop() {
    this.running = false;
  }

  queueInput(playerId, input, seq) {
    if (!this.acceptingInputs) return;
    if (playerId < 0 || playerId > 1) return;
    this.players[playerId].queueInput(input, seq);
  }

  _startTickLoop() {
    let lastTime = performance.now();
    let accumulator = 0;

    const loop = () => {
      if (!this.running) return;

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
    const dt = TICK_DURATION / 1000; // convert to seconds
    this.tickCount++;

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

    // 11. Combat: check both players attacking
    const events0 = processCombat(this.players[0], this.players[1]);
    const events1 = processCombat(this.players[1], this.players[0]);
    const allEvents = [...events0, ...events1];

    // Broadcast combat events
    for (const event of allEvents) {
      this._broadcastEvent(event);
    }

    // 12. Check HP for round end (will be expanded in Phase 5)

    // 13. Broadcast state at SEND_RATE
    if (this.tickCount % SEND_INTERVAL === 0) {
      this._broadcastState();
    }
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
    const state = {
      type: 'state',
      tick: this.tickCount,
      players: this.players.map(p => ({
        ...p.serialize(),
        lastProcessedSeq: p.lastProcessedSeq
      })),
      timestamp: performance.now()
    };

    const data = JSON.stringify(state);
    for (let i = 0; i < 2; i++) {
      const ws = this.connections[i];
      if (ws && ws.readyState === 1) {
        // Include player-specific lastProcessedSeq
        const playerState = JSON.parse(data);
        playerState.lastProcessedSeq = this.players[i].lastProcessedSeq;
        ws.send(JSON.stringify(playerState));
      }
    }
  }
}
