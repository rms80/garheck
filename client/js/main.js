// client/js/main.js
import { Network } from './Network.js';
import { Renderer } from './Renderer.js';
import { Character } from './Character.js';
import { Camera } from './Camera.js';
import { Input } from './Input.js';
import { Prediction } from './Prediction.js';

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

// Camera, input, network, prediction
const camera = new Camera(canvas);
const input = new Input();
const network = new Network();
const prediction = new Prediction();

// Game state
let gameActive = false;
let myPlayerId = null;

// Player states (fallback before server data arrives)
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

function hideAllScreens() {
  titleScreen.style.display = 'none';
  waitingScreen.style.display = 'none';
  countdownScreen.style.display = 'none';
  fullMessage.style.display = 'none';
  pauseScreen.style.display = 'none';
}

// Handle lobby messages
network.on('lobby', (msg) => {
  console.log('Lobby:', msg);
  myPlayerId = msg.playerId;
  network.playerId = msg.playerId;

  // Set initial camera yaw based on player ID
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

  if (event.kind === 'countdown') {
    hideAllScreens();
    countdownScreen.style.display = 'flex';
    countdownText.textContent = event.value;
  } else if (event.kind === 'roundStart') {
    countdownText.textContent = 'FIGHT!';
    gameActive = true;
    camera.setGameActive(true);
    hud.style.display = 'block';
    setTimeout(() => {
      countdownScreen.style.display = 'none';
      canvas.requestPointerLock();
    }, 1000);
  }
});

// Handle state updates from server
network.on('state', (msg) => {
  if (myPlayerId === null) return;

  for (const p of msg.players) {
    if (p.id === myPlayerId) {
      // Reconcile own player
      prediction.reconcile(p, msg.lastProcessedSeq);
    } else {
      // Opponent interpolation
      prediction.addOpponentSnapshot(p);
    }
    // Always update playerStates for HUD etc.
    playerStates[p.id] = p;
  }
});

// Prevent context menu on right-click
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Render loop
function gameLoop() {
  requestAnimationFrame(gameLoop);

  if (gameActive && myPlayerId !== null) {
    // Capture input and send to server
    const inputState = input.getState(camera.getYaw());
    const seq = prediction.processInput(inputState);
    network.sendInput(seq, inputState);
  }

  // Get display states
  if (myPlayerId !== null) {
    // Own player: use prediction
    const localState = prediction.localState;
    if (localState) {
      characters[myPlayerId].setPosition(localState.x, localState.y, localState.z);
      characters[myPlayerId].setRotation(localState.yaw);
      characters[myPlayerId].updateAnimation(
        localState.state || 'idle',
        localState.stateTimer || 0,
        1 / 60
      );
      characters[myPlayerId].setIframeBlink(localState.iframesRemaining || 0);

      // Camera follows our player
      camera.update(localState.x, localState.y, localState.z);
    }

    // Opponent: use interpolation
    const opponentId = 1 - myPlayerId;
    const oppState = prediction.getOpponentState();
    if (oppState) {
      characters[opponentId].setPosition(oppState.x, oppState.y, oppState.z);
      characters[opponentId].setRotation(oppState.yaw);
      characters[opponentId].updateAnimation(
        oppState.state || 'idle',
        oppState.stateTimer || 0,
        1 / 60
      );
      characters[opponentId].setIframeBlink(oppState.iframesRemaining || 0);
    } else {
      // Fallback: use raw server state
      const ps = playerStates[opponentId];
      characters[opponentId].setPosition(ps.x, ps.y, ps.z);
      characters[opponentId].setRotation(ps.yaw);
      characters[opponentId].updateAnimation(ps.state, ps.stateTimer || 0, 1 / 60);
    }
  }

  // Update HUD
  updateHUD();

  renderer.render(camera.camera);
}

function updateHUD() {
  const hp1 = document.getElementById('hp1');
  const hp2 = document.getElementById('hp2');
  const hp1Text = document.getElementById('hp1Text');
  const hp2Text = document.getElementById('hp2Text');

  if (hp1 && playerStates[0]) {
    hp1.style.width = `${playerStates[0].hp}%`;
    hp1Text.textContent = `${Math.ceil(playerStates[0].hp)}`;
  }
  if (hp2 && playerStates[1]) {
    hp2.style.width = `${playerStates[1].hp}%`;
    hp2Text.textContent = `${Math.ceil(playerStates[1].hp)}`;
  }
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
