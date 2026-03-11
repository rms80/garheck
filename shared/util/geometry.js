// shared/util/geometry.js
// Geometry utility functions

/**
 * Check for duplicate vertex positions in a BufferGeometry.
 * Logs results to console. Returns the array of duplicate pairs.
 * @param {BufferGeometry} geometry - geometry to check
 * @param {string} label - label for console output
 * @param {number} tolerance - distance threshold (default 1e-4)
 */
export function checkDuplicateVertices(geometry, label = '', tolerance = 1e-4) {
  const pos = geometry.attributes.position;
  const dupes = [];
  for (let i = 0; i < pos.count; i++) {
    for (let j = i + 1; j < pos.count; j++) {
      const dx = pos.getX(i) - pos.getX(j);
      const dy = pos.getY(i) - pos.getY(j);
      const dz = pos.getZ(i) - pos.getZ(j);
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < tolerance) {
        dupes.push([i, j]);
      }
    }
  }
  if (dupes.length > 0) {
    console.warn(`[${label}] ${dupes.length} duplicate vertex pairs (${pos.count} verts):`, dupes);
  } else {
    console.log(`[${label}] ${pos.count} unique verts, 0 duplicates`);
  }
  return dupes;
}
