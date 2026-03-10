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

    // Wall collision: 2D ray-segment intersection from look-at to ideal camera (XZ plane)
    const WALL_MARGIN = 0.3;
    let closestT = 1.0; // parametric t along ray, 1.0 = full distance (no hit)
    const rdx = camX - lookX;
    const rdz = camZ - lookZ;

    for (const seg of this._wallSegments) {
      const t = this._raySegmentIntersect(lookX, lookZ, rdx, rdz,
        seg.ax, seg.az, seg.bx, seg.bz);
      if (t !== null && t < closestT) {
        closestT = t;
      }
    }

    if (closestT < 1.0) {
      // Pull camera to just before the wall hit
      const clampedDist = Math.max(CAMERA_MIN_DISTANCE, this.distance * closestT - WALL_MARGIN);
      camX = playerX - clampedDist * Math.sin(this.yaw) * Math.cos(this.pitch);
      camY = playerY + charHeight + clampedDist * Math.sin(this.pitch);
      camZ = playerZ - clampedDist * Math.cos(this.yaw) * Math.cos(this.pitch);
    }

    // Clamp camera Y above ground
    camY = Math.max(0.5, camY);

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  // 2D ray-segment intersection. Returns parametric t along ray [0,1] or null.
  // Ray: origin (ox,oz) + t*(dx,dz), Segment: (ax,az)-(bx,bz)
  _raySegmentIntersect(ox, oz, dx, dz, ax, az, bx, bz) {
    const sx = bx - ax;
    const sz = bz - az;
    const denom = dx * sz - dz * sx;
    if (Math.abs(denom) < 1e-8) return null; // parallel
    const t = ((ax - ox) * sz - (az - oz) * sx) / denom;
    const u = ((ax - ox) * dz - (az - oz) * dx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
  }

  getYaw() {
    return this.yaw;
  }
}
