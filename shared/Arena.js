// shared/Arena.js
import { ARENA_RADIUS, ARENA_SIDES } from './constants.js';

export function computeArenaVertices(radius = ARENA_RADIUS, sides = ARENA_SIDES) {
  const vertices = [];
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides;
    vertices.push({
      x: radius * Math.cos(angle),
      z: radius * Math.sin(angle)
    });
  }
  return vertices;
}

export function computeWallSegments(radius = ARENA_RADIUS, sides = ARENA_SIDES) {
  const vertices = computeArenaVertices(radius, sides);
  const segments = [];
  for (let i = 0; i < sides; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % sides];
    // Compute outward normal (pointing away from center)
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    const len = Math.sqrt(midX * midX + midZ * midZ);
    segments.push({
      ax: a.x, az: a.z,
      bx: b.x, bz: b.z,
      normalX: midX / len,
      normalZ: midZ / len
    });
  }
  return segments;
}
