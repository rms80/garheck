// client/js/util/simplify.js
// Mesh simplification wrapper with pluggable backends.

import * as THREE from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

// --- Backend state ---
let activeBackend = 'three';

// Three.js SimplifyModifier (always available)
const threeSimplifier = new SimplifyModifier();

// Meshoptimizer (lazy-loaded via dynamic import)
let MeshoptSimplifier = null;
let meshoptReady = false;

/**
 * Initialize the meshoptimizer WASM backend.
 * Must be awaited before using the 'meshopt' backend.
 */
export async function initMeshopt() {
  if (meshoptReady) return;
  try {
    const mod = await import('meshoptimizer/simplifier');
    MeshoptSimplifier = mod.default || mod.MeshoptSimplifier;
    await MeshoptSimplifier.ready;
    meshoptReady = true;
    console.log('meshoptimizer simplifier ready');
  } catch (e) {
    console.error('Failed to load meshoptimizer:', e);
  }
}

/**
 * Set the active simplification backend.
 * @param {'three' | 'meshopt'} backend
 */
export function setBackend(backend) {
  if (backend === 'meshopt' && !meshoptReady) {
    console.warn('meshopt backend not initialized — call initMeshopt() first. Falling back to three.');
    return;
  }
  activeBackend = backend;
}

/**
 * Get the current backend name.
 */
export function getBackend() {
  return activeBackend;
}

/**
 * Simplify an indexed BufferGeometry by removing a fraction of detail.
 *
 * @param {THREE.BufferGeometry} indexedGeometry - must have .index
 * @param {number} removeFraction - 0 (no change) to 1 (max simplification)
 * @returns {THREE.BufferGeometry | null} simplified geometry, or null on failure / nothing to do
 */
export function simplifyGeometry(indexedGeometry, removeFraction) {
  if (removeFraction <= 0) return null;

  if (activeBackend === 'meshopt' && meshoptReady) {
    return simplifyWithMeshopt(indexedGeometry, removeFraction);
  }
  return simplifyWithThree(indexedGeometry, removeFraction);
}

// --- Three.js SimplifyModifier backend ---

function simplifyWithThree(geometry, removeFraction) {
  const vertCount = geometry.attributes.position.count;
  const removeCount = Math.floor(vertCount * removeFraction);
  if (removeCount < 1) return null;
  if (vertCount - removeCount < 4) return null;

  try {
    const simplified = threeSimplifier.modify(geometry, removeCount);
    if (simplified.attributes.position.count < 3) return null;
    simplified.computeVertexNormals();
    return simplified;
  } catch (e) {
    console.warn('Three.js simplification failed:', e);
    return null;
  }
}

// --- meshoptimizer backend ---

function simplifyWithMeshopt(geometry, removeFraction) {
  const positions = geometry.attributes.position.array;
  const indices = geometry.index.array;
  const indexCount = indices.length;

  const raw = Math.floor(indexCount * (1 - removeFraction));
  const targetIndexCount = Math.max(3, raw - (raw % 3));

  const indicesU32 = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
  const positionsF32 = positions instanceof Float32Array ? positions : new Float32Array(positions);

  try {
    const [newIndices, error] = MeshoptSimplifier.simplify(
      indicesU32,
      positionsF32,
      3, // stride in floats (x, y, z)
      targetIndexCount,
      1e10 // no error limit — we want aggressive visual degradation
    );

    console.log(`meshopt simplify: ${indexCount} -> target ${targetIndexCount} -> result ${newIndices.length} (error ${error.toFixed(4)})`);

    if (newIndices.length < 3) return null;

    // Build indexed geometry, then convert to non-indexed for flat shading consistency
    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positionsF32), 3));
    newGeo.setIndex(new THREE.BufferAttribute(newIndices, 1));
    const nonIndexed = newGeo.toNonIndexed();
    newGeo.dispose();
    nonIndexed.computeVertexNormals();
    return nonIndexed;
  } catch (e) {
    console.warn('meshoptimizer simplification failed:', e);
    return null;
  }
}
