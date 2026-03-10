// client/js/main.js
import { Network } from './Network.js';

const network = new Network();

// UI Elements
const titleScreen = document.getElementById('titleScreen');
const waitingScreen = document.getElementById('waitingScreen');
const countdownScreen = document.getElementById('countdownScreen');
const countdownText = document.getElementById('countdownText');
const connectionStatus = document.getElementById('connectionStatus');
const fullMessage = document.getElementById('fullMessage');

function hideAllScreens() {
  titleScreen.style.display = 'none';
  waitingScreen.style.display = 'none';
  countdownScreen.style.display = 'none';
  fullMessage.style.display = 'none';
}

// Handle lobby messages
network.on('lobby', (msg) => {
  console.log('Lobby:', msg);
  network.playerId = msg.playerId;

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
    hideAllScreens();
    countdownText.textContent = 'FIGHT!';
    setTimeout(() => {
      countdownScreen.style.display = 'none';
    }, 1000);
  }
});

// Connect
network.connect();

// Animate waiting dots
let dotCount = 0;
setInterval(() => {
  dotCount = (dotCount + 1) % 4;
  const dots = document.getElementById('waitingDots');
  if (dots) dots.textContent = '.'.repeat(dotCount || 1);
}, 500);

console.log('Arena Brawl client initialized');
