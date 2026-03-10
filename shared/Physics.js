// shared/Physics.js
// Core physics simulation shared between server and client.
// Pure functions with no Three.js dependency.

import {
  PLAYER_MOVE_SPEED, PLAYER_JUMP_VELOCITY, GRAVITY,
  AIR_CONTROL_FACTOR, KNOCKBACK_FRICTION, PLAYER_RADIUS,
  PLAYER_HEIGHT
} from './constants.js';
import { computeWallSegments } from './Arena.js';

const wallSegments = computeWallSegments();

/**
 * Resolve movement direction from input keys and camera yaw.
 * Returns normalized XZ direction vector (or zero).
 */
export function resolveMovementDirection(input) {
  let dx = 0;
  let dz = 0;

  // Forward = direction camera faces (yaw), projected onto XZ
  const forward_x = Math.sin(input.cameraYaw);
  const forward_z = Math.cos(input.cameraYaw);
  const right_x = -Math.cos(input.cameraYaw);
  const right_z = Math.sin(input.cameraYaw);

  if (input.forward) { dx += forward_x; dz += forward_z; }
  if (input.backward) { dx -= forward_x; dz -= forward_z; }
  if (input.left) { dx -= right_x; dz -= right_z; }
  if (input.right) { dx += right_x; dz += right_z; }

  // Normalize
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }

  return { dx, dz };
}

/**
 * Simulate one physics tick for a player.
 * Mutates the player state in place.
 * @param {object} player - Player state object
 * @param {object} input - Current input state (held keys)
 * @param {number} dt - Time step in seconds
 */
export function simulatePlayer(player, input, dt) {
  // Compute intentional velocity (0 if in hitstun/ko/stompLag)
  let intentionalVelX = 0;
  let intentionalVelZ = 0;

  const canMove = player.state === 'idle' || player.state === 'running' ||
                  player.state === 'jumping' || player.state === 'falling' ||
                  player.state === 'attacking';

  if (canMove) {
    const dir = resolveMovementDirection(input);
    let speed = PLAYER_MOVE_SPEED;

    // Air control
    if (!player.grounded) {
      speed *= AIR_CONTROL_FACTOR;
    }

    intentionalVelX = dir.dx * speed;
    intentionalVelZ = dir.dz * speed;
  }

  // Decay knockback
  const friction = 1 - KNOCKBACK_FRICTION * dt;
  player.knockbackX *= Math.max(0, friction);
  player.knockbackZ *= Math.max(0, friction);

  // Apply XZ movement
  player.x += (intentionalVelX + player.knockbackX) * dt;
  player.z += (intentionalVelZ + player.knockbackZ) * dt;

  // Apply gravity
  player.velocityY += GRAVITY * dt;

  // Apply Y movement
  player.y += player.velocityY * dt;

  // Ground clamp
  if (player.y <= 0 && player.velocityY < 0) {
    player.y = 0;
    player.velocityY = 0;
    player.grounded = true;
  } else if (player.y > 0) {
    player.grounded = false;
  }

  // Face camera direction (allows strafing with A/D)
  if (canMove) {
    player.yaw = lerpAngle(player.yaw, input.cameraYaw, 10 * dt);
  }

  // Wall collision
  resolveWallCollision(player);
}

/**
 * Resolve player-vs-wall collision.
 * Treats player as circle of PLAYER_RADIUS on XZ plane.
 */
export function resolveWallCollision(player) {
  for (const seg of wallSegments) {
    const closest = closestPointOnSegment(
      player.x, player.z,
      seg.ax, seg.az, seg.bx, seg.bz
    );
    const dx = player.x - closest.x;
    const dz = player.z - closest.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < PLAYER_RADIUS) {
      if (dist === 0) {
        // Push along wall normal
        player.x += seg.normalX * PLAYER_RADIUS;
        player.z += seg.normalZ * PLAYER_RADIUS;
      } else {
        const push = PLAYER_RADIUS - dist;
        player.x += (dx / dist) * push;
        player.z += (dz / dist) * push;
      }
    }
  }
}

/**
 * Resolve player-vs-player collision.
 * Both players are circles of PLAYER_RADIUS.
 */
export function resolvePlayerCollision(p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const minDist = PLAYER_RADIUS * 2;

  if (dist < minDist && dist > 0) {
    const push = (minDist - dist) / 2;
    const nx = dx / dist;
    const nz = dz / dist;
    p1.x -= nx * push;
    p1.z -= nz * push;
    p2.x += nx * push;
    p2.z += nz * push;
  }
}

/**
 * Closest point on line segment AB to point P.
 */
function closestPointOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const dot = apx * abx + apz * abz;
  const lenSq = abx * abx + abz * abz;
  let t = lenSq > 0 ? dot / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * abx, z: az + t * abz };
}

/**
 * Lerp between two angles (handling wrap-around).
 */
function lerpAngle(a, b, t) {
  let diff = b - a;
  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}
