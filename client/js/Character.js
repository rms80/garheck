// client/js/Character.js
import * as THREE from 'three';

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

export class Character {
  constructor(playerId) {
    this.playerId = playerId;
    const baseColor = playerId === 0 ? P1_COLOR : P2_COLOR;

    const bodyMat = new THREE.MeshLambertMaterial({ color: baseColor });
    const headMat = new THREE.MeshLambertMaterial({ color: lighten(baseColor, 0.15) });
    const limbMat = new THREE.MeshLambertMaterial({ color: darken(baseColor, 0.1) });

    this.group = new THREE.Group();

    // Body (torso) - 0.6 x 0.8 x 0.4
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 0.5 + 0.4; // legs(0.5) + half body(0.4)
    this.body.castShadow = true;
    this.group.add(this.body);

    // Head - sphere radius 0.3
    const headGeo = new THREE.SphereGeometry(0.3, 16, 12);
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 0.5 + 0.8 + 0.3; // legs + body + head radius
    this.head.castShadow = true;
    this.group.add(this.head);

    // Eyes
    this._addEyes();

    // Left Arm - 0.2 x 0.6 x 0.2
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    this.leftArm = new THREE.Mesh(armGeo, limbMat);
    this.leftArm.position.set(-0.4, 0.5 + 0.4, 0); // side of body
    this.leftArm.castShadow = true;
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, limbMat);
    this.rightArm.position.set(0.4, 0.5 + 0.4, 0);
    this.rightArm.castShadow = true;
    this.group.add(this.rightArm);

    // Legs - 0.2 x 0.5 x 0.2
    const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    this.leftLeg = new THREE.Mesh(legGeo, limbMat);
    this.leftLeg.position.set(-0.15, 0.25, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, limbMat);
    this.rightLeg.position.set(0.15, 0.25, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);

    // Store materials for effects
    this.materials = [bodyMat, headMat, limbMat];
    this.baseMaterials = this.materials.map(m => m.color.clone());
  }

  _addEyes() {
    const eyeWhiteGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const eyeWhiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupilGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const pupilMat = new THREE.MeshLambertMaterial({ color: 0x000000 });

    const eyeY = 0.5 + 0.8 + 0.35; // slightly above head center
    const eyeZ = 0.22;

    // Left eye
    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEyeWhite.position.set(-0.1, eyeY, eyeZ);
    this.group.add(leftEyeWhite);

    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.1, eyeY, eyeZ + 0.05);
    this.group.add(leftPupil);

    // Right eye
    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEyeWhite.position.set(0.1, eyeY, eyeZ);
    this.group.add(rightEyeWhite);

    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.1, eyeY, eyeZ + 0.05);
    this.group.add(rightPupil);
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

  // Animation methods will be expanded in later phases
  updateAnimation(state, stateTimer, dt) {
    // Reset positions
    this._resetPose();

    const time = performance.now() / 1000;

    switch (state) {
      case 'idle':
        this._animateIdle(time);
        break;
      case 'running':
        this._animateRunning(time);
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
        // Crouched landing pose — same as idle but lower
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
  }

  _resetPose() {
    this.body.position.y = 0.9;
    this.body.rotation.set(0, 0, 0);
    this.leftArm.position.set(-0.4, 0.9, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.position.set(0.4, 0.9, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftLeg.position.set(-0.15, 0.25, 0);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.position.set(0.15, 0.25, 0);
    this.rightLeg.rotation.set(0, 0, 0);
  }

  _animateIdle(time) {
    // Subtle bob
    const bob = Math.sin(time * Math.PI * 4) * 0.02;
    this.body.position.y += bob;
    this.head.position.y = 0.5 + 0.8 + 0.3 + bob;
    // Slight arm sway
    const sway = Math.sin(time * 2) * 0.05;
    this.leftArm.rotation.z = sway;
    this.rightArm.rotation.z = -sway;
  }

  _animateRunning(time) {
    const speed = 8;
    const swing = Math.sin(time * speed) * (Math.PI / 6); // ±30deg
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing;
    this.rightArm.rotation.x = swing;
    // Lean forward
    this.body.rotation.x = -Math.PI / 36; // ~5deg
  }

  _animateJumping() {
    // Tuck legs up
    this.leftLeg.rotation.x = -Math.PI / 4;
    this.rightLeg.rotation.x = -Math.PI / 4;
    this.leftArm.rotation.x = -Math.PI / 8;
    this.rightArm.rotation.x = -Math.PI / 8;
  }

  _animateFalling() {
    // Legs extend, arms out
    this.leftArm.rotation.z = -Math.PI / 4;
    this.rightArm.rotation.z = Math.PI / 4;
  }

  _animateAttacking(stateTimer) {
    // Right arm punch forward
    const punchAngle = Math.PI / 2; // 90deg forward
    this.rightArm.rotation.x = -punchAngle;
  }

  _animateStomping() {
    // Both legs down, body tucks
    this.leftLeg.rotation.x = Math.PI / 8;
    this.rightLeg.rotation.x = Math.PI / 8;
    this.body.rotation.x = Math.PI / 12;
  }

  _animateBlocking() {
    // Arms crossed in front
    this.leftArm.rotation.x = -Math.PI / 3;
    this.leftArm.rotation.z = Math.PI / 5;
    this.rightArm.rotation.x = -Math.PI / 3;
    this.rightArm.rotation.z = -Math.PI / 5;
    // Lean back slightly
    this.body.rotation.x = Math.PI / 36;
  }

  _animateHitstun() {
    // Lean back
    this.body.rotation.x = Math.PI / 9; // ~20deg
  }

  _animateKO() {
    // Fall flat - rotate entire group forward
    // This is handled by rotating the body forward
    this.body.rotation.x = Math.PI / 2;
    this.head.position.y = 0.3;
    this.leftArm.position.y = 0.3;
    this.rightArm.position.y = 0.3;
    this.leftLeg.position.y = 0.3;
    this.rightLeg.position.y = 0.3;
  }

  // I-frame blinking
  setIframeBlink(iframesRemaining) {
    if (iframesRemaining > 0) {
      const blink = Math.floor(performance.now() / 50) % 2 === 0;
      this.group.visible = blink;
    } else {
      this.group.visible = true;
    }
  }
}
