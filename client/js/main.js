// client/js/main.js
import { Network } from './Network.js';
import { Renderer } from './Renderer.js';
import { Character } from './Character.js';
import { Camera } from './Camera.js';
import { Input } from './Input.js';
import { Prediction } from './Prediction.js';
import { HUD } from './HUD.js';
import { Particles } from './Particles.js';

// Init renderer
const canvas = document.getElementById('gameCanvas');
const renderer = new Renderer(canvas);

// Create characters at spawn positions
const characters = [new Character(0), new Character(1)];
characters[0].setPosition(-8, 0, 0);
characters[0].setRotation(Math.PI / 2);
characters[1].setPosition(8, 0, 0);
characters[1].setRotation(-Math.PI / 2);
characters[0].addToScene(renderer.scene);
characters[1].addToScene(renderer.scene);

// Camera, input, network, prediction, HUD
const camera = new Camera(canvas);
const input = new Input();
const network = new Network();
const prediction = new Prediction();
const hudManager = new HUD();
const particles = new Particles(renderer.scene);

// Game state
let gameActive = false;
let myPlayerId = null;
let roundTimer = 90;
let currentRound = 1;
let scores = [0, 0];

// Player states
const playerStates = [
  { x: -8, y: 0, z: 0, yaw: Math.PI / 2, state: 'idle', stateTimer: 0, iframesRemaining: 0, hp: 100 },
  { x: 8, y: 0, z: 0, yaw: -Math.PI / 2, state: 'idle', stateTimer: 0, iframesRemaining: 0, hp: 100 },
];

// UI Elements
const titleScreen = document.getElementById('titleScreen');
const waitingScreen = document.getElementById('waitingScreen');
const countdownScreen = document.getElementById('countdownScreen');
const countdownText = document.getElementById('countdownText');
const connectionStatus = document.getElementById('connectionStatus');
const fullMessage = document.getElementById('fullMessage');
const pauseScreen = document.getElementById('pauseScreen');
const hud = document.getElementById('hud');
const roundEndScreen = document.getElementById('roundEndScreen');
const roundEndText = document.getElementById('roundEndText');
const matchEndScreen = document.getElementById('matchEndScreen');
const matchEndText = document.getElementById('matchEndText');
const matchEndScore = document.getElementById('matchEndScore');
const playAgainBtn = document.getElementById('playAgainBtn');

function hideAllScreens() {
  titleScreen.style.display = 'none';
  waitingScreen.style.display = 'none';
  countdownScreen.style.display = 'none';
  fullMessage.style.display = 'none';
  pauseScreen.style.display = 'none';
  roundEndScreen.style.display = 'none';
  matchEndScreen.style.display = 'none';
}

// Handle lobby messages
network.on('lobby', (msg) => {
  console.log('Lobby:', msg);
  myPlayerId = msg.playerId;
  network.playerId = msg.playerId;
  camera.yaw = myPlayerId === 0 ? Math.PI / 2 : -Math.PI / 2;

  if (msg.status === 'waiting') {
    hideAllScreens();
    waitingScreen.style.display = 'flex';
    connectionStatus.textContent = 'Connected!';
  } else if (msg.status === 'countdown') {
    hideAllScreens();
    countdownScreen.style.display = 'flex';
  } else if (msg.status === 'full') {
    hideAllScreens();
    fullMessage.style.display = 'flex';
  }
});

// Handle game events
network.on('event', (msg) => {
  const event = msg.event;
  console.log('Event:', event);

  switch (event.kind) {
    case 'countdown':
      hideAllScreens();
      countdownScreen.style.display = 'flex';
      countdownText.textContent = event.value;
      hud.style.display = 'block';
      // Reset play again button
      playAgainBtn.textContent = 'Play Again';
      playAgainBtn.disabled = false;
      break;

    case 'roundStart':
      hideAllScreens();
      countdownScreen.style.display = 'flex';
      countdownText.textContent = 'FIGHT!';
      gameActive = true;
      camera.setGameActive(true);
      hud.style.display = 'block';
      setTimeout(() => {
        countdownScreen.style.display = 'none';
        canvas.requestPointerLock();
      }, 1000);
      break;

    case 'roundEnd':
      gameActive = false;
      scores = event.scores;
      if (event.winnerId >= 0) {
        roundEndText.textContent = `Player ${event.winnerId + 1} wins the round!`;
      } else {
        roundEndText.textContent = 'Draw!';
      }
      roundEndScreen.style.display = 'flex';
      break;

    case 'matchEnd':
      gameActive = false;
      camera.setGameActive(false);
      document.exitPointerLock();
      hideAllScreens();
      matchEndText.textContent = `Player ${event.winnerId + 1} WINS!`;
      matchEndScore.textContent = `Score: ${event.scores[0]} - ${event.scores[1]}`;
      matchEndScreen.style.display = 'flex';
      break;

    case 'hit': {
      console.log(`Player ${event.attackerId} hit Player ${event.targetId} for ${event.damage} damage (${event.attackType})`);
      const target = playerStates[event.targetId];
      if (target) {
        const hitColor = event.targetId === 0 ? 0xe74c3c : 0x3498db;
        particles.spawnHit(target.x, target.y + 1.0, target.z, hitColor);
      }
      break;
    }

    case 'parry': {
      console.log(`Player ${event.targetId} parried Player ${event.attackerId}!`);
      const parrier = playerStates[event.targetId];
      if (parrier) {
        particles.spawnHit(parrier.x, parrier.y + 1.0, parrier.z, 0xffffff);
      }
      break;
    }

    case 'playAgainWaiting':
      playAgainBtn.textContent = 'Waiting for opponent...';
      playAgainBtn.disabled = true;
      break;

    case 'disconnect':
      console.log(`Player ${event.playerId} disconnected`);
      break;
  }
});

// Handle state updates from server
network.on('state', (msg) => {
  if (myPlayerId === null) return;

  // Update round info
  if (msg.roundTimer !== undefined) roundTimer = msg.roundTimer;
  if (msg.currentRound !== undefined) currentRound = msg.currentRound;
  if (msg.scores !== undefined) scores = msg.scores;

  for (const p of msg.players) {
    playerStates[p.id] = p;
    if (p.id === myPlayerId) {
      prediction.reconcile(p, msg.lastProcessedSeq);
    } else {
      prediction.addOpponentSnapshot(p);
    }
  }
});

// Play Again button
playAgainBtn.addEventListener('click', () => {
  network.sendPlayAgain();
  playAgainBtn.textContent = 'Waiting for opponent...';
  playAgainBtn.disabled = true;
});

// Prevent context menu
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Render loop
function gameLoop() {
  requestAnimationFrame(gameLoop);

  if (gameActive && myPlayerId !== null) {
    const inputState = input.getState(camera.getYaw());
    const seq = prediction.processInput(inputState);
    network.sendInput(seq, inputState);
  }

  // Update character visuals
  if (myPlayerId !== null) {
    const localState = prediction.localState;
    if (localState) {
      characters[myPlayerId].setPosition(localState.x, localState.y, localState.z);
      characters[myPlayerId].setRotation(localState.yaw);
      characters[myPlayerId].updateAnimation(localState.state || 'idle', localState.stateTimer || 0, 1 / 60, localState.airParrying || false);
      characters[myPlayerId].setIframeBlink(localState.iframesRemaining || 0);
      camera.update(localState.x, localState.y, localState.z);
    }

    const opponentId = 1 - myPlayerId;
    const oppState = prediction.getOpponentState() || playerStates[opponentId];
    if (oppState) {
      characters[opponentId].setPosition(oppState.x, oppState.y, oppState.z);
      characters[opponentId].setRotation(oppState.yaw);
      characters[opponentId].updateAnimation(oppState.state || 'idle', oppState.stateTimer || 0, 1 / 60, oppState.airParrying || false);
      characters[opponentId].setIframeBlink(oppState.iframesRemaining || 0);
    }
  }

  // Update particles
  particles.update(1 / 60);

  // Update HUD
  hudManager.updateHP(playerStates[0].hp, playerStates[1].hp);
  hudManager.updateRound(currentRound, scores);
  hudManager.updateTimer(roundTimer);

  renderer.render(camera.camera);
}

// Start
network.connect();
gameLoop();

// Animate waiting dots
let dotCount = 0;
setInterval(() => {
  dotCount = (dotCount + 1) % 4;
  const dots = document.getElementById('waitingDots');
  if (dots) dots.textContent = '.'.repeat(dotCount || 1);
}, 500);

console.log('Arena Brawl client initialized');
