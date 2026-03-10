// client/js/Camera.js
import * as THREE from 'three';
import {
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  CAMERA_DEFAULT_DISTANCE, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE,
  CAMERA_MIN_PITCH, CAMERA_MAX_PITCH,
  PLAYER_HEIGHT
} from '/shared/constants.js';

export class Camera {
  constructor(canvas) {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR
    );

    this.canvas = canvas;
    this.yaw = 0;
    this.pitch = 0.3; // Start looking slightly down
    this.distance = CAMERA_DEFAULT_DISTANCE;
    this.pointerLocked = false;

    this._setupPointerLock();
    this._setupMouseInput();
    this._setupResizeHandler();
  }

  _setupPointerLock() {
    const pauseScreen = document.getElementById('pauseScreen');

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && this._gameActive) {
        pauseScreen.style.display = 'flex';
      }
    });

    // Click to resume
    this.canvas.addEventListener('click', () => {
      if (!this.pointerLocked && this._gameActive) {
        this.canvas.requestPointerLock();
      }
    });

    const pauseOverlay = document.getElementById('pauseScreen');
    if (pauseOverlay) {
      pauseOverlay.addEventListener('click', () => {
        this.canvas.requestPointerLock();
        pauseOverlay.style.display = 'none';
      });
    }
  }

  _setupMouseInput() {
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      const sensitivity = 0.002;
      this.yaw -= e.movementX * sensitivity;
      this.pitch += e.movementY * sensitivity;
      this.pitch = Math.max(CAMERA_MIN_PITCH, Math.min(CAMERA_MAX_PITCH, this.pitch));
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.distance += e.deltaY * 0.01;
      this.distance = Math.max(CAMERA_MIN_DISTANCE, Math.min(CAMERA_MAX_DISTANCE, this.distance));
      e.preventDefault();
    }, { passive: false });
  }

  _setupResizeHandler() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  _gameActive = false;

  setGameActive(active) {
    this._gameActive = active;
  }

  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  update(playerX, playerY, playerZ) {
    const charHeight = PLAYER_HEIGHT;

    // Camera position from formula in spec
    const camX = playerX - this.distance * Math.sin(this.yaw) * Math.cos(this.pitch);
    const camY = playerY + charHeight + this.distance * Math.sin(this.pitch);
    const camZ = playerZ - this.distance * Math.cos(this.yaw) * Math.cos(this.pitch);

    this.camera.position.set(camX, camY, camZ);

    // Look at point
    const lookY = playerY + charHeight * 0.75;
    this.camera.lookAt(playerX, lookY, playerZ);
  }

  getYaw() {
    return this.yaw;
  }
}
