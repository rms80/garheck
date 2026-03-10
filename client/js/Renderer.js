// client/js/Renderer.js
import * as THREE from 'three';
import { computeArenaVertices, computeWallSegments } from '/shared/Arena.js';
import { ARENA_RADIUS, ARENA_SIDES, ARENA_WALL_HEIGHT } from '/shared/constants.js';

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this._setupLighting();
    this._buildArena();

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 15, -5);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 50;
    directional.shadow.camera.left = -25;
    directional.shadow.camera.right = 25;
    directional.shadow.camera.top = 25;
    directional.shadow.camera.bottom = -25;
    this.scene.add(directional);
  }

  _buildArena() {
    const vertices = computeArenaVertices();

    // Floor - octagonal shape
    const floorShape = new THREE.Shape();
    floorShape.moveTo(vertices[0].x, vertices[0].z);
    for (let i = 1; i < vertices.length; i++) {
      floorShape.lineTo(vertices[i].x, vertices[i].z);
    }
    floorShape.closePath();

    const floorGeo = new THREE.ShapeGeometry(floorShape);
    // ShapeGeometry creates geometry in XY plane, we need XZ
    floorGeo.rotateX(-Math.PI / 2);

    // Checkerboard-like floor using vertex colors
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid overlay on floor
    this._addFloorGrid();

    // Walls
    const segments = computeWallSegments();
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const wallTopMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

    for (const seg of segments) {
      const dx = seg.bx - seg.ax;
      const dz = seg.bz - seg.az;
      const wallLength = Math.sqrt(dx * dx + dz * dz);

      // Wall body
      const wallGeo = new THREE.BoxGeometry(wallLength, ARENA_WALL_HEIGHT, 0.3);
      const wall = new THREE.Mesh(wallGeo, wallMat);

      const midX = (seg.ax + seg.bx) / 2;
      const midZ = (seg.az + seg.bz) / 2;
      wall.position.set(midX, ARENA_WALL_HEIGHT / 2, midZ);

      // Rotate wall to align with the segment
      const angle = Math.atan2(dz, dx);
      wall.rotation.y = -angle;

      // Offset wall slightly outward so it sits on the arena edge
      wall.position.x += seg.normalX * 0.15;
      wall.position.z += seg.normalZ * 0.15;

      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);

      // Top edge highlight
      const topGeo = new THREE.BoxGeometry(wallLength, 0.1, 0.35);
      const top = new THREE.Mesh(topGeo, wallTopMat);
      top.position.copy(wall.position);
      top.position.y = ARENA_WALL_HEIGHT + 0.05;
      top.rotation.y = wall.rotation.y;
      this.scene.add(top);
    }
  }

  _addFloorGrid() {
    const gridSize = 40;
    const divisions = 20;
    const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x666666, 0x444444);
    gridHelper.position.y = 0.01; // Slightly above floor
    this.scene.add(gridHelper);
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }
}
