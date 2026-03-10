// client/js/Network.js

export class Network {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.connected = false;
    this.callbacks = {
      lobby: [],
      state: [],
      event: [],
    };
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onopen = () => {
      this.connected = true;
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._dispatch(msg);
      } catch (e) {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('WebSocket disconnected');
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  _dispatch(msg) {
    const handlers = this.callbacks[msg.type];
    if (handlers) {
      for (const cb of handlers) {
        cb(msg);
      }
    }
  }

  on(type, callback) {
    if (!this.callbacks[type]) {
      this.callbacks[type] = [];
    }
    this.callbacks[type].push(callback);
  }

  sendInput(seq, keys) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', seq, keys }));
    }
  }

  sendPlayAgain() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'playAgain' }));
    }
  }
}
