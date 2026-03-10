// client/js/Particles.js
import * as THREE from 'three';

const PARTICLE_COUNT = 12;
const PARTICLE_LIFETIME = 0.5; // seconds
const PARTICLE_SPEED = 8;
const PARTICLE_SIZE = 0.08;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this._effects = [];
  }

  spawnHit(x, y, z, color) {
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const geo = new THREE.SphereGeometry(PARTICLE_SIZE, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);

      // Random outward velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.8 + 0.1;
      const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.5);
      const vx = speed * Math.sin(phi) * Math.cos(theta);
      const vy = speed * Math.cos(phi);
      const vz = speed * Math.sin(phi) * Math.sin(theta);

      this.scene.add(mesh);
      particles.push({ mesh, mat, vx, vy, vz });
    }

    this._effects.push({ particles, age: 0 });
  }

  update(dt) {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const effect = this._effects[i];
      effect.age += dt;

      if (effect.age >= PARTICLE_LIFETIME) {
        for (const p of effect.particles) {
          this.scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mat.dispose();
        }
        this._effects.splice(i, 1);
        continue;
      }

      const t = effect.age / PARTICLE_LIFETIME;
      for (const p of effect.particles) {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 15 * dt; // gravity
        p.mat.opacity = 1 - t;
        const scale = 1 - t * 0.5;
        p.mesh.scale.setScalar(scale);
      }
    }
  }
}
