// client/js/Input.js

export class Input {
  constructor() {
    this.keys = {
      left: false,
      right: false,
      forward: false,
      backward: false,
    };
    this.jumpPressed = false;
    this.attackPressed = false;
    this.blockHeld = false;
    this.dashDirection = null; // 'forward', 'backward', 'left', 'right'

    // Edge-trigger tracking
    this._jumpDown = false;
    this._attackDown = false;

    // Double-tap tracking for dash
    this._keyHeld = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
    this._lastTapTime = { KeyW: 0, KeyA: 0, KeyS: 0, KeyD: 0 };
    this._dashKeyMap = {
      KeyW: 'forward',
      KeyS: 'backward',
      KeyA: 'left',
      KeyD: 'right',
    };

    this._setupListeners();
  }

  _setupListeners() {
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.backward = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'Space':
          if (!this._jumpDown) {
            this.jumpPressed = true;
            this._jumpDown = true;
          }
          e.preventDefault();
          break;
        case 'KeyF':
          if (!this._attackDown) {
            this.attackPressed = true;
            this._attackDown = true;
          }
          break;
      }

      // Double-tap dash detection
      if (this._dashKeyMap[e.code] && !this._keyHeld[e.code]) {
        const now = performance.now();
        if (now - this._lastTapTime[e.code] < 200) {
          this.dashDirection = this._dashKeyMap[e.code];
        }
        this._lastTapTime[e.code] = now;
        this._keyHeld[e.code] = true;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'Space': this._jumpDown = false; break;
        case 'KeyF': this._attackDown = false; break;
      }

      if (this._keyHeld[e.code] !== undefined) {
        this._keyHeld[e.code] = false;
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // Left click - attack
        if (!this._attackDown) {
          this.attackPressed = true;
          this._attackDown = true;
        }
      } else if (e.button === 2) {
        // Right click - block
        this.blockHeld = true;
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this._attackDown = false;
      } else if (e.button === 2) {
        this.blockHeld = false;
      }
    });
  }

  /**
   * Get current input state and consume edge triggers.
   */
  getState(cameraYaw) {
    const state = {
      left: this.keys.left,
      right: this.keys.right,
      forward: this.keys.forward,
      backward: this.keys.backward,
      jump: this.jumpPressed,
      attack: this.attackPressed,
      block: this.blockHeld,
      dash: this.dashDirection,
      cameraYaw: cameraYaw,
    };

    // Consume edge triggers
    this.jumpPressed = false;
    this.attackPressed = false;
    this.dashDirection = null;

    return state;
  }
}
