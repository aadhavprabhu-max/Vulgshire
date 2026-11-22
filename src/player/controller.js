import * as THREE from 'three';
import { floorAt as floorHeight } from './floors.js';

// Third-person (over the shoulder) or first-person controller.
// WASD / arrows move relative to the camera, Shift runs, mouse looks (click to
// lock the pointer), Q/E turn without a mouse, V toggles first person.
// Collision is circle-vs-box in XZ: axis-aligned boxes {minX,maxX,minZ,maxZ}
// or rotated boxes {cx,cz,hx,hz,rot}. Optional per-collider levels:
//   y0 / y1 = the collider only blocks while the player's feet are in [y0, y1]
//             (e.g. a gallery balustrade, or a stair block at ground level);
//   h       = top of the collider for the camera (camera passes over below-h stuff).
// Floors: scenes may provide walkable surfaces (flat or ramps) above the y = 0
// ground; the player stands on the highest one within a step of their feet.

const WALK_SPEED = 2.0;
const RUN_SPEED = 4.2;
const RADIUS = 0.34;
const SHOULDER = new THREE.Vector3(1.1, 0.0, 0); // camera sits right of the monk
const DISTANCE = 3.9;
const HEAD_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;

const active = (b, y) => (b.y0 === undefined || y >= b.y0 - 0.01) && (b.y1 === undefined || y <= b.y1);

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
    this.firstPerson = false;
    this.floors = [];
    this.ground = 0;
    this.walkable = null; // optional (x, z) => bool from the scene (map masks)
    this._colliders = [];
    this.grid = new Map();
    this.dynamic = [];
    this.raycaster = new THREE.Raycaster();

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement === canvas) return;
      // Pointer lock may be refused (e.g. inside a sandboxed frame): drag-to-look still works.
      try {
        const p = canvas.requestPointerLock?.();
        if (p && p.catch) p.catch(() => {});
      } catch {
        /* ignore */
      }
    });
    window.addEventListener('mousemove', (e) => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && !(e.buttons & 1)) return; // unlocked: look while the left button is held
      this.yaw -= e.movementX * 0.0024;
      const lim = this.firstPerson ? [-1.35, 1.35] : [-0.9, 0.55];
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.002, lim[0], lim[1]);
    });
  }

  // Colliders are indexed in an 8 m grid; ones marked `dynamic` (NPCs) are
  // checked every frame instead.
  get colliders() {
    return this._colliders;
  }
  set colliders(list) {
    this._colliders = list;
    this.grid = new Map();
    this.dynamic = [];
    for (const b of list) {
      if (b.dynamic) {
        this.dynamic.push(b);
        continue;
      }
      let x0, x1, z0, z1;
      if (b.rot === undefined) [x0, x1, z0, z1] = [b.minX, b.maxX, b.minZ, b.maxZ];
      else {
        const r = Math.hypot(b.hx, b.hz);
        [x0, x1, z0, z1] = [b.cx - r, b.cx + r, b.cz - r, b.cz + r];
      }
      for (let gx = Math.floor(x0 / 8); gx <= Math.floor(x1 / 8); gx++)
        for (let gz = Math.floor(z0 / 8); gz <= Math.floor(z1 / 8); gz++) {
          const k = gx * 100003 + gz;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(b);
        }
    }
  }
  near(x, z) {
    const out = new Set(this.dynamic);
    for (let gx = Math.floor((x - 1) / 8); gx <= Math.floor((x + 1) / 8); gx++)
      for (let gz = Math.floor((z - 1) / 8); gz <= Math.floor((z + 1) / 8); gz++) {
        const c = this.grid.get(gx * 100003 + gz);
        if (c) for (const b of c) out.add(b);
      }
    return out;
  }

  setFirstPerson(on) {
    this.firstPerson = on;
    this.character.setFirstPerson?.(on);
    if (on) this.facing = this.yaw;
    else this.pitch = THREE.MathUtils.clamp(this.pitch, -0.9, 0.55);
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
      const ox = this.pos.x;
      const oz = this.pos.z;
      this.pos.x += dx * this.speed * dt;
      this.pos.z += dz * this.speed * dt;
      // Stay on walkable ground (slide along the edge, axis by axis).
      if (this.walkable && !this.walkable(this.pos.x, this.pos.z)) {
        if (this.walkable(this.pos.x, oz)) this.pos.z = oz;
        else if (this.walkable(ox, this.pos.z)) this.pos.x = ox;
        else {
          this.pos.x = ox;
          this.pos.z = oz;
        }
      }
      // Turn the monk toward the movement direction (first person: face the view).
      const want = this.firstPerson ? this.yaw : Math.atan2(-dx, -dz);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 10);
    }
    if (this.firstPerson) this.facing = this.yaw;
    // While carried (riding a train) the scene owns position, height and collision.
    if (this.carried) {
      this.character.root.position.copy(this.pos);
      this.character.root.rotation.y = this.facing;
      this.updateCamera();
      return;
    }
    this.collide();
    // Stand on the highest floor within a step; fall smoothly otherwise.
    const want = this.floorAt(this.pos.x, this.pos.z, this.pos.y);
    if (want >= this.pos.y) this.pos.y = want;
    else this.pos.y = Math.max(want, this.pos.y - 9 * dt);

    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = this.facing;
    this.updateCamera();
  }

  floorAt(x, z, y) {
    return floorHeight(this.floors, this.ground, x, z, y);
  }

  collide() {
    const p = this.pos;
    const nearby = this.near(p.x, p.z);
    for (let iter = 0; iter < 3; iter++) {
      for (const b of nearby) {
        if (!active(b, p.y)) continue;
        if (b.rot !== undefined) {
          this.collideOBB(p, b);
          continue;
        }
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

  pointInCollider(x, z, b, pad = 0) {
    if (b.rot === undefined) return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = x - b.cx;
    const dz = z - b.cz;
    return Math.abs(dx * c - dz * s) < b.hx + pad && Math.abs(dx * s + dz * c) < b.hz + pad;
  }

  // Circle vs rotated box: work in the box's local frame.
  collideOBB(p, b) {
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = p.x - b.cx;
    const dz = p.z - b.cz;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const qx = Math.max(-b.hx, Math.min(lx, b.hx));
    const qz = Math.max(-b.hz, Math.min(lz, b.hz));
    let ox = lx - qx;
    let oz = lz - qz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= RADIUS * RADIUS) return;
    let nlx = lx;
    let nlz = lz;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      nlx = qx + (ox / d) * RADIUS;
      nlz = qz + (oz / d) * RADIUS;
    } else {
      const pushes = [
        [b.hx + RADIUS - lx, 0],
        [-b.hx - RADIUS - lx, 0],
        [0, b.hz + RADIUS - lz],
        [0, -b.hz - RADIUS - lz],
      ].sort((a, e) => Math.abs(a[0] + a[1]) - Math.abs(e[0] + e[1]));
      nlx = lx + pushes[0][0];
      nlz = lz + pushes[0][1];
    }
    p.x = b.cx + nlx * c + nlz * s;
    p.z = b.cz - nlx * s + nlz * c;
  }

  updateCamera() {
    if (this.firstPerson) {
      this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      return;
    }
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
    // Also stop at walls described only by colliders (merged town buildings).
    for (let s = 0.3; s < dist; s += 0.2) {
      const x = pivot.x + back.x * s;
      const y = pivot.y + back.y * s;
      const z = pivot.z + back.z * s;
      let hitC = false;
      for (const b of this.near(x, z)) if (y < (b.h ?? Infinity) && y > (b.y0 ?? -Infinity) && this.pointInCollider(x, z, b, 0.25)) hitC = true;
      if (hitC) {
        dist = Math.max(0.4, s - 0.3);
        break;
      }
    }
    this.camera.position.copy(pivot).addScaledVector(back, dist);
    this.camera.quaternion.setFromEuler(rot);
  }
}
