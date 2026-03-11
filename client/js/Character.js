// client/js/Character.js
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { simplifyGeometry } from './util/simplify.js';

const P1_COLOR = 0xe74c3c;
const P2_COLOR = 0x3498db;

function lighten(color, amount) {
  const c = new THREE.Color(color);
  c.r = Math.min(1, c.r + amount);
  c.g = Math.min(1, c.g + amount);
  c.b = Math.min(1, c.b + amount);
  return c;
}

function darken(color, amount) {
  const c = new THREE.Color(color);
  c.r = Math.max(0, c.r - amount);
  c.g = Math.max(0, c.g - amount);
  c.b = Math.max(0, c.b - amount);
  return c;
}

/**
 * Create a BufferGeometry from a BoxGeometry's vertices and indices.
 * Returns an explicit triangle mesh (non-indexed BufferGeometry with position and normal attributes).
 */
function boxToMeshGeometry(width, height, depth) {
  const box = new THREE.BoxGeometry(width, height, depth);
  const geo = box.toNonIndexed(); // explicit triangles
  box.dispose();
  return geo;
}

/**
 * Create a BufferGeometry from a SphereGeometry's vertices and indices.
 * Returns an explicit triangle mesh (non-indexed BufferGeometry with position and normal attributes).
 */
function sphereToMeshGeometry(radius, widthSegments = 16, heightSegments = 12) {
  const sphere = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const geo = sphere.toNonIndexed();
  sphere.dispose();
  return geo;
}

/**
 * Create a BufferGeometry from a CapsuleGeometry.
 * @param {number} pivotY - if set, translates geometry so this Y position becomes the origin.
 *   Use 'top' to pivot from top, 'bottom' for bottom, or a number for explicit offset.
 * Returns an explicit triangle mesh.
 */
function capsuleToMeshGeometry(radius, length, capSegments = 8, radialSegments = 12, pivot = 'center') {
  const capsule = new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments);
  const totalHeight = length + 2 * radius;
  if (pivot === 'top') {
    // Shift geometry down so top of capsule is at origin
    capsule.translate(0, -totalHeight / 2, 0);
  } else if (pivot === 'bottom') {
    capsule.translate(0, totalHeight / 2, 0);
  }
  const geo = capsule.toNonIndexed();
  capsule.dispose();
  return geo;
}

/**
 * Create a Mesh from an arbitrary BufferGeometry.
 * The geometry must have 'position' and 'normal' attributes.
 * This is the standard way to create character body parts — call this
 * with any triangle mesh geometry (default boxes/spheres, or custom meshes later).
 */
function createPartMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export class Character {
  constructor(playerId) {
    this.playerId = playerId;
    this.color = playerId === 0 ? P1_COLOR : P2_COLOR;
    const baseColor = this.color;

    const bodyMat = new THREE.MeshLambertMaterial({ color: baseColor, side: THREE.DoubleSide, flatShading: true });
    const headMat = new THREE.MeshLambertMaterial({ color: lighten(baseColor, 0.15), side: THREE.DoubleSide, flatShading: true });
    const limbMat = new THREE.MeshLambertMaterial({ color: darken(baseColor, 0.1), side: THREE.DoubleSide, flatShading: true });

    this.group = new THREE.Group();

    // Body (torso) - 0.6 x 0.8 x 0.4
    this.body = createPartMesh(boxToMeshGeometry(0.6, 0.8, 0.4), bodyMat);
    this.body.position.y = 0.5 + 0.4; // legs(0.5) + half body(0.4)
    this.group.add(this.body);

    // Head - sphere radius 0.3
    this.head = createPartMesh(sphereToMeshGeometry(0.3, 16, 12), headMat);
    this.head.position.y = 0.5 + 0.8 + 0.3; // legs + body + head radius
    this.group.add(this.head);

    // Eyes (stay as sphere primitives — not modified during gameplay)
    this._addEyes();

    // Left Arm - capsule radius 0.1, length 0.4 (total ~0.6), pivot at shoulder (top)
    this.leftArm = createPartMesh(capsuleToMeshGeometry(0.1, 0.4, 8, 12, 'top'), limbMat);
    this.leftArm.position.set(-0.4, 1.2, 0); // shoulder position (near top of body)
    this.group.add(this.leftArm);

    // Right Arm
    this.rightArm = createPartMesh(capsuleToMeshGeometry(0.1, 0.4, 8, 12, 'top'), limbMat);
    this.rightArm.position.set(0.4, 1.2, 0);
    this.group.add(this.rightArm);

    // Left Leg - capsule radius 0.1, length 0.3 (total ~0.5), pivot at hip (top)
    this.leftLeg = createPartMesh(capsuleToMeshGeometry(0.1, 0.3, 8, 12, 'top'), limbMat);
    this.leftLeg.position.set(-0.15, 0.5, 0); // hip position (bottom of body)
    this.group.add(this.leftLeg);

    // Right Leg
    this.rightLeg = createPartMesh(capsuleToMeshGeometry(0.1, 0.3, 8, 12, 'top'), limbMat);
    this.rightLeg.position.set(0.15, 0.5, 0);
    this.group.add(this.rightLeg);

    // Store original geometries in merged (indexed) form for simplification
    this._simplifyParts = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    this._originalIndexed = {};
    this._originalGeometries = {};
    for (const name of this._simplifyParts) {
      this._originalGeometries[name] = this[name].geometry.clone();
      // Strip normals before merge so only positions are compared
      const forMerge = this[name].geometry.clone();
      forMerge.deleteAttribute('normal');
      if (forMerge.hasAttribute('uv')) forMerge.deleteAttribute('uv');
      if (forMerge.hasAttribute('uv2')) forMerge.deleteAttribute('uv2');
      const indexed = mergeVertices(forMerge);
      indexed.computeVertexNormals();
      forMerge.dispose();

      this._originalIndexed[name] = indexed;
    }

    // Store materials for effects
    this.materials = [bodyMat, headMat, limbMat];
    this.baseMaterials = this.materials.map(m => m.color.clone());
  }

  /**
   * Replace the geometry of a body part with a custom triangle mesh.
   * @param {string} partName - one of: 'body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'
   * @param {THREE.BufferGeometry} geometry - must have 'position' attribute (and ideally 'normal')
   */
  setPartGeometry(partName, geometry) {
    const part = this[partName];
    if (!part || !(part instanceof THREE.Mesh)) {
      console.warn(`Character.setPartGeometry: unknown part "${partName}"`);
      return;
    }
    // Ensure normals exist
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals();
    }
    part.geometry.dispose();
    part.geometry = geometry;
  }

  _addEyes() {
    const eyeWhiteGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const eyeWhiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupilGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const pupilMat = new THREE.MeshLambertMaterial({ color: 0x000000 });

    // Positions relative to head center (head is a sphere at origin of its own mesh)
    const eyeY = 0.05;  // slightly above head center
    const eyeZ = 0.22;

    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEyeWhite.position.set(-0.1, eyeY, eyeZ);
    this.head.add(leftEyeWhite);

    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.1, eyeY, eyeZ + 0.05);
    this.head.add(leftPupil);

    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEyeWhite.position.set(0.1, eyeY, eyeZ);
    this.head.add(rightEyeWhite);

    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.1, eyeY, eyeZ + 0.05);
    this.head.add(rightPupil);
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  setRotation(yaw) {
    this.group.rotation.y = yaw;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  updateAnimation(state, stateTimer, dt, airParrying = false, dashDirection = null, isStrafing = false) {
    this._resetPose();

    const time = performance.now() / 1000;

    switch (state) {
      case 'idle':
        this._animateIdle(time);
        break;
      case 'running':
        this._animateRunning(time, isStrafing);
        break;
      case 'jumping':
        this._animateJumping();
        break;
      case 'falling':
        this._animateFalling();
        break;
      case 'attacking':
        this._animateAttacking(stateTimer);
        break;
      case 'stomping':
        this._animateStomping();
        break;
      case 'stompLag':
        this.body.position.y -= 0.1;
        break;
      case 'blocking':
        this._animateBlocking();
        break;
      case 'hitstun':
        this._animateHitstun();
        break;
      case 'ko':
        this._animateKO();
        break;
    }

    // Override pose for dash directions (only during jump/fall, not while attacking etc.)
    if (dashDirection && (state === 'jumping' || state === 'falling')) {
      this._animateDash(dashDirection);
    }

    // Overlay block arm pose during air parry
    if (airParrying) {
      this._animateBlocking();
    }
  }

  _resetPose() {
    this.body.position.y = 0.9;
    this.body.rotation.set(0, 0, 0);
    this.leftArm.position.set(-0.4, 1.2, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.position.set(0.4, 1.2, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftLeg.position.set(-0.15, 0.5, 0);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.position.set(0.15, 0.5, 0);
    this.rightLeg.rotation.set(0, 0, 0);
  }

  _animateIdle(time) {
    const bob = Math.sin(time * Math.PI * 4) * 0.02;
    this.body.position.y += bob;
    this.head.position.y = 0.5 + 0.8 + 0.3 + bob;
    const sway = Math.sin(time * 2) * 0.05;
    this.leftArm.rotation.z = sway;
    this.rightArm.rotation.z = -sway;
  }

  _animateRunning(time, isStrafing = false) {
    const speed = 8;
    const swing = Math.sin(time * speed) * (Math.PI / 6);
    if (isStrafing) {
      // Legs swing side-to-side
      this.leftLeg.rotation.z = swing;
      this.rightLeg.rotation.z = -swing;
      this.leftArm.rotation.z = -swing * 0.5;
      this.rightArm.rotation.z = swing * 0.5;
    } else {
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing;
      this.rightArm.rotation.x = swing;
      this.body.rotation.x = -Math.PI / 36;
    }
  }

  _animateJumping() {
    this.leftLeg.rotation.x = -Math.PI / 4;
    this.rightLeg.rotation.x = -Math.PI / 4;
    this.leftArm.rotation.x = -Math.PI / 8;
    this.rightArm.rotation.x = -Math.PI / 8;
  }

  _animateFalling() {
    this.leftLeg.rotation.x = -Math.PI / 4;
    this.rightLeg.rotation.x = -Math.PI / 4;
    this.leftArm.rotation.x = -Math.PI / 8;
    this.rightArm.rotation.x = -Math.PI / 8;
  }

  _animateDash(direction) {
    switch (direction) {
      case 'left':
        this.leftLeg.rotation.z = Math.PI / 4;
        this.rightLeg.rotation.z = Math.PI / 4;
        this.body.rotation.z = Math.PI / 8;
        break;
      case 'right':
        this.leftLeg.rotation.z = -Math.PI / 4;
        this.rightLeg.rotation.z = -Math.PI / 4;
        this.body.rotation.z = -Math.PI / 8;
        break;
      case 'forward':
        this.leftLeg.rotation.x = Math.PI / 4;
        this.rightLeg.rotation.x = Math.PI / 4;
        this.body.rotation.x = -Math.PI / 8;
        break;
      case 'backward':
        this.leftLeg.rotation.x = -Math.PI / 3;
        this.rightLeg.rotation.x = -Math.PI / 3;
        this.body.rotation.x = Math.PI / 8;
        break;
    }
  }

  _animateAttacking(stateTimer) {
    const punchAngle = Math.PI / 2;
    this.rightArm.rotation.x = -punchAngle;
  }

  _animateStomping() {
    this.leftLeg.rotation.x = Math.PI / 8;
    this.rightLeg.rotation.x = Math.PI / 8;
    this.body.rotation.x = Math.PI / 12;
  }

  _animateBlocking() {
    this.leftArm.rotation.x = -Math.PI / 3;
    this.leftArm.rotation.z = Math.PI / 5;
    this.rightArm.rotation.x = -Math.PI / 3;
    this.rightArm.rotation.z = -Math.PI / 5;
    this.body.rotation.x = Math.PI / 36;
  }

  _animateHitstun() {
    this.body.rotation.x = Math.PI / 9;
  }

  _animateKO() {
    this.body.rotation.x = Math.PI / 2;
    this.head.position.y = 0.3;
    this.leftArm.position.y = 0.5;
    this.rightArm.position.y = 0.5;
    this.leftLeg.position.y = 0.2;
    this.rightLeg.position.y = 0.2;
  }

  /**
   * Simplify parts based on remaining health percentage (0-100).
   * At 100 HP = original mesh, at 0 HP = maximally simplified.
   */
  simplifyByHealth(hp, maxHp) {
    const healthPct = Math.max(0, Math.min(1, hp / maxHp));
    // Cube root curve: ramps faster at high HP
    const removeFraction = Math.min(1, Math.pow((1 - healthPct) / 0.9, 1 / 3));

    for (const name of this._simplifyParts) {
      const mesh = this[name];
      const indexed = this._originalIndexed[name].clone();

      const simplified = simplifyGeometry(indexed, removeFraction);
      indexed.dispose();

      if (!simplified) {
        // Nothing to simplify (full health or too few verts) — restore original
        mesh.geometry.dispose();
        mesh.geometry = this._originalGeometries[name].clone();
        continue;
      }

      mesh.geometry.dispose();
      mesh.geometry = simplified;
    }
  }

  resetGeometries() {
    for (const name of this._simplifyParts) {
      this[name].geometry.dispose();
      this[name].geometry = this._originalGeometries[name].clone();
    }
  }

  setIframeBlink(iframesRemaining) {
    if (iframesRemaining > 0) {
      const blink = Math.floor(performance.now() / 50) % 2 === 0;
      this.group.visible = blink;
    } else {
      this.group.visible = true;
    }
  }
}
