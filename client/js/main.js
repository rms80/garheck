// client/js/main.js
import { Network } from './Network.js';
import { Renderer } from './Renderer.js';
import { Character } from './Character.js';
import { Camera } from './Camera.js';

// Init renderer
const canvas = document.getElementById('gameCanvas');
const renderer = new Renderer(canvas);

// Create characters at spawn positions
const characters = [new Character(0), new Character(1)];
characters[0].setPosition(-8, 0, 0);
characters[0].setRotation(Math.PI / 2); // Face center
characters[1].setPosition(8, 0, 0);
characters[1].setRotation(-Math.PI / 2); // Face center
characters[0].addToScene(renderer.scene);
characters[1].addToScene(renderer.scene);

// Camera
const camera = new Camera(canvas);

// Network
const network = new Network();

// Game state
let gameActive = false;
let myPlayerId = null;

// Player positions (updated from server or prediction)
const playerStates = [
  { x: -8, y: 0, z: 0, yaw: Math.PI / 2, state: 'idle', stateTimer: 0, iframesRemaining: 0 },
  { x: 8, y: 0, z: 0, yaw: -Math.PI / 2, state: 'idle', stateTimer: 0, iframesRemaining: 0 },
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
  if (myPlayerId === 0) {
    camera.yaw = Math.PI / 2;
  } else {
    camera.yaw = -Math.PI / 2;
  }

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
      // Request pointer lock when game starts
      canvas.requestPointerLock();
    }, 1000);
  }
});

// Handle state updates from server
network.on('state', (msg) => {
  for (const p of msg.players) {
    playerStates[p.id] = {
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      state: p.state,
      stateTimer: p.stateTimer,
      iframesRemaining: p.iframesRemaining,
    };
  }
});

// Prevent context menu on right-click
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Render loop
function gameLoop() {
  requestAnimationFrame(gameLoop);

  // Update character positions from state
  for (let i = 0; i < 2; i++) {
    const ps = playerStates[i];
    characters[i].setPosition(ps.x, ps.y, ps.z);
    characters[i].setRotation(ps.yaw);
    characters[i].updateAnimation(ps.state, ps.stateTimer, 1 / 60);
    characters[i].setIframeBlink(ps.iframesRemaining);
  }

  // Update camera to follow local player
  if (myPlayerId !== null) {
    const ps = playerStates[myPlayerId];
    camera.update(ps.x, ps.y, ps.z);
  }

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
