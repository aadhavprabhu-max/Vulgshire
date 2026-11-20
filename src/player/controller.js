import * as THREE from 'three';

// Third-person, over-the-shoulder controller.
// WASD / arrows move relative to the camera, Shift runs, mouse looks (click to
// lock the pointer), Q/E turn without a mouse. Collision is circle-vs-box in XZ.

const WALK_SPEED = 2.0;
const RUN_SPEED = 4.2;
const RADIUS = 0.34;
const SHOULDER = new THREE.Vector3(1.1, 0.0, 0); // camera sits right of the monk
const DISTANCE = 3.9;
const HEAD_HEIGHT = 1.8;

export class ThirdPersonController {
  constructor({ camera, character, canvas, colliders, blockers, spawn, yaw = 0 }) {
    this.camera = camera;
    this.character = character;
    this.colliders = colliders;
    this.blockers = blockers;
    this.pos = spawn.clone();
    this.yaw = yaw; // camera yaw; 0 looks toward -Z
    this.pitch = 0.22;
    this.facing = yaw;
    this.speed = 0;
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0024;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.002, -0.9, 0.55);
    });
  }

  update(dt) {
    const k = this.keys;
    if (k.has('KeyQ')) this.yaw += dt * 1.8;
    if (k.has('KeyE')) this.yaw -= dt * 1.8;

    let ix = 0;
    let iz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;

    const moving = ix !== 0 || iz !== 0;
    const target = moving ? (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);

    if (moving) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      // Rotate input by camera yaw.
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = ix * cos + iz * sin;
      const dz = -ix * sin + iz * cos;
      this.pos.x += dx * this.speed * dt;
      this.pos.z += dz * this.speed * dt;
      // Turn the monk toward the movement direction.
      const want = Math.atan2(-dx, -dz);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 10);
    }
    this.collide();

    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = this.facing;
    this.updateCamera();
  }

  collide() {
    const p = this.pos;
    for (let iter = 0; iter < 3; iter++) {
      for (const b of this.colliders) {
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        let dx = p.x - cx;
        let dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (RADIUS - d);
          p.z += (dz / d) * (RADIUS - d);
        } else {
          // Centre is inside the box: push out along the shallowest axis.
          const pushes = [
            [b.minX - RADIUS - p.x, 0],
            [b.maxX + RADIUS - p.x, 0],
            [0, b.minZ - RADIUS - p.z],
            [0, b.maxZ + RADIUS - p.z],
          ];
          pushes.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += pushes[0][0];
          p.z += pushes[0][1];
        }
      }
    }
  }

  updateCamera() {
    const head = new THREE.Vector3(this.pos.x, this.pos.y + HEAD_HEIGHT, this.pos.z);
    const rot = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    const shoulder = SHOULDER.clone().applyEuler(new THREE.Euler(0, this.yaw, 0));
    const pivot = head.clone().add(shoulder);
    const back = new THREE.Vector3(0, 0, 1).applyEuler(rot);
    // Pull the camera in if a wall is between the pivot and the desired spot.
    let dist = DISTANCE;
    this.raycaster.set(pivot, back);
    this.raycaster.far = DISTANCE;
    const hit = this.raycaster.intersectObjects(this.blockers, false)[0];
    if (hit) dist = Math.max(0.4, hit.distance - 0.25);
    this.camera.position.copy(pivot).addScaledVector(back, dist);
    this.camera.quaternion.setFromEuler(rot);
  }
}
