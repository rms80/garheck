// client/js/Camera.js
import * as THREE from 'three';
import {
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR,
  CAMERA_DEFAULT_DISTANCE, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE,
  CAMERA_MIN_PITCH, CAMERA_MAX_PITCH,
  PLAYER_HEIGHT
} from '/shared/constants.js';
import { computeWallSegments } from '/shared/Arena.js';

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

    // Wall segments for camera collision
    this._wallSegments = computeWallSegments();

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

    // Ideal camera position from formula in spec
    let camX = playerX - this.distance * Math.sin(this.yaw) * Math.cos(this.pitch);
    let camY = playerY + charHeight + this.distance * Math.sin(this.pitch);
    let camZ = playerZ - this.distance * Math.cos(this.yaw) * Math.cos(this.pitch);

    // Look-at point
    const lookX = playerX;
    const lookY = playerY + charHeight * 0.75;
    const lookZ = playerZ;

    // Wall collision: raycast from look-at to ideal camera position
    const dirX = camX - lookX;
    const dirY = camY - lookY;
    const dirZ = camZ - lookZ;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

    if (dirLen > 0.01) {
      // Simple wall collision using arena wall segments
      // Check if camera is outside arena bounds on XZ plane
      let clampedDist = this.distance;
      for (const seg of this._wallSegments) {
        // Check if camera ray intersects wall plane
        const wallDist = this._pointToSegmentDist(camX, camZ, seg.ax, seg.az, seg.bx, seg.bz);
        if (wallDist < 0.5) {
          // Camera too close to wall, pull it in
          const pullFactor = Math.max(0.3, wallDist / 0.5);
          clampedDist = Math.min(clampedDist, this.distance * pullFactor);
        }
      }

      if (clampedDist < this.distance) {
        camX = playerX - clampedDist * Math.sin(this.yaw) * Math.cos(this.pitch);
        camY = playerY + charHeight + clampedDist * Math.sin(this.pitch);
        camZ = playerZ - clampedDist * Math.cos(this.yaw) * Math.cos(this.pitch);
      }
    }

    // Clamp camera Y above ground
    camY = Math.max(0.5, camY);

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  _pointToSegmentDist(px, pz, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const apx = px - ax;
    const apz = pz - az;
    const dot = apx * abx + apz * abz;
    const lenSq = abx * abx + abz * abz;
    let t = lenSq > 0 ? dot / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const closestX = ax + t * abx;
    const closestZ = az + t * abz;
    const dx = px - closestX;
    const dz = pz - closestZ;
    return Math.sqrt(dx * dx + dz * dz);
  }

  getYaw() {
    return this.yaw;
  }
}
