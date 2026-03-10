// server/index.js
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { SERVER_PORT } from '../shared/constants.js';
import { Game } from './Game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const SOLO_MODE = process.argv.includes('--solo');

// MIME type map
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// Static file server
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  let filePath;
  if (urlPath.startsWith('/shared/')) {
    filePath = path.join(ROOT, urlPath);
  } else if (urlPath.startsWith('/css/') || urlPath.startsWith('/js/')) {
    filePath = path.join(ROOT, 'client', urlPath);
  } else if (urlPath === '/index.html') {
    filePath = path.join(ROOT, 'client', 'index.html');
  } else {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(resolved);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocketServer({ server });

// Game session state
let wsConnections = [null, null]; // ws connections
let playerIds = new Map();  // ws -> playerId
let game = null;

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsConnections) {
    if (ws && ws.readyState === 1) {
      ws.send(data);
    }
  }
}

function sendTo(playerId, msg) {
  const ws = wsConnections[playerId];
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

function startGame() {
  game = new Game(SOLO_MODE);
  for (let i = 0; i < 2; i++) {
    game.setConnection(i, wsConnections[i]);
  }

  // Countdown sequence
  let count = 3;
  const interval = setInterval(() => {
    if (count > 0) {
      broadcast({ type: 'event', event: { kind: 'countdown', value: count } });
      count--;
    } else {
      clearInterval(interval);
      broadcast({ type: 'event', event: { kind: 'roundStart' } });
      game.start();
    }
  }, 1000);
}

function cleanupSession() {
  if (game) {
    game.stop();
    game = null;
  }
  wsConnections = [null, null];
  playerIds.clear();
}

function handleDisconnect(ws) {
  const playerId = playerIds.get(ws);
  if (playerId === undefined) return;

  playerIds.delete(ws);
  wsConnections[playerId] = null;

  if (game) {
    const otherId = 1 - playerId;
    broadcast({ type: 'event', event: { kind: 'disconnect', playerId } });
    broadcast({ type: 'event', event: { kind: 'matchEnd', winnerId: otherId, scores: [0, 0] } });
    cleanupSession();
  }
}

wss.on('connection', (ws) => {
  // Check if game is full (both connections exist or game running)
  if (wsConnections[0] && wsConnections[1]) {
    ws.send(JSON.stringify({ type: 'lobby', status: 'full' }));
    ws.close();
    return;
  }

  // Assign player ID
  const playerId = wsConnections[0] === null ? 0 : 1;
  wsConnections[playerId] = ws;
  playerIds.set(ws, playerId);

  console.log(`Player ${playerId} connected${SOLO_MODE ? ' (solo mode)' : ''}`);

  ws.send(JSON.stringify({ type: 'lobby', status: 'waiting', playerId }));

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'input' && game) {
        game.queueInput(playerId, msg.keys, msg.seq);
      }
    } catch (e) {
      // Silently ignore malformed messages
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => handleDisconnect(ws));

  // Check if we should start the game
  if (SOLO_MODE && playerId === 0) {
    console.log('Solo mode: starting game session with dummy opponent');
    sendTo(0, { type: 'lobby', status: 'countdown', playerId: 0 });
    startGame();
  } else if (wsConnections[0] && wsConnections[1]) {
    console.log('Two players connected: starting game session');
    sendTo(0, { type: 'lobby', status: 'countdown', playerId: 0 });
    sendTo(1, { type: 'lobby', status: 'countdown', playerId: 1 });
    startGame();
  }
});

// Heartbeat interval
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 5000);

wss.on('close', () => clearInterval(heartbeatInterval));

const port = process.env.PORT || SERVER_PORT;
server.listen(port, () => {
  console.log(`Arena Brawl server running on port ${port}${SOLO_MODE ? ' (solo mode)' : ''}`);
});
