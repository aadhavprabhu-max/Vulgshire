import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// The Vulgshire metro train (owner's design sheet: reference/metro-train-design.webp):
// a 3-car flat-faced train, weathered green and cream livery with rust streaks,
// gothic trim, amber-lit windows, sliding doors, lanterns and the city crest up
// front. Original low-poly build; all textures are drawn here in code.
//
// Local frame: the train runs along +x (front at +x), centred on z = 0, rails at y = 0,
// car floor at y = FLOOR. Doors are on both sides; only the -z (platform) side opens.

export const CAR_L = 14;
export const GAP = 0.8;
export const CAR_W = 2.8;
export const FLOOR = 1.0;
const CAR_H = 3.3;
export const TRAIN_L = 3 * CAR_L + 2 * GAP;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Side of one car: 224 x 52 px for 14 m x 3.3 m (16 px per metre).
let SIDE = null;
function sideTex() {
  if (SIDE) return SIDE;
  const W = 224;
  const H = 52;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const r = rng(5);
  const green = '#3e5a46';
  const cream = '#b8b29c';
  g.fillStyle = green;
  g.fillRect(0, 0, W, H);
  g.fillStyle = cream;
  g.fillRect(0, 14, W, 20); // cream window band
  g.fillStyle = '#2c4232';
  g.fillRect(0, 0, W, 4); // roof edge
  // Gothic trim: a row of small pointed arches under the roof.
  g.fillStyle = '#5a7a62';
  for (let x = 2; x < W; x += 6) {
    g.fillRect(x, 6, 3, 4);
    g.fillRect(x + 1, 5, 1, 1);
  }
  g.fillStyle = '#20301f';
  g.fillRect(0, 11, W, 1);
  g.fillRect(0, 35, W, 1);
  // Doors (two per side) and windows.
  const doors = [40, 168];
  for (const dx of doors) {
    g.fillStyle = '#34503c';
    g.fillRect(dx - 10, 8, 20, 40);
    g.fillStyle = '#1a2418';
    g.fillRect(dx - 10, 8, 1, 40);
    g.fillRect(dx + 9, 8, 1, 40);
    g.fillRect(dx, 8, 1, 40);
    g.fillStyle = '#e8a850';
    g.fillRect(dx - 7, 14, 5, 14);
    g.fillRect(dx + 3, 14, 5, 14);
  }
  for (const [x, w] of [
    [4, 22],
    [64, 34],
    [110, 22],
    [134, 22],
    [194, 26],
  ]) {
    g.fillStyle = '#1c1810';
    g.fillRect(x - 1, 15, w + 2, 15);
    g.fillStyle = '#f0b860';
    g.fillRect(x, 16, w, 13);
    g.fillStyle = '#c88838';
    for (let k = x + 8; k < x + w; k += 9) g.fillRect(k, 16, 1, 13);
    g.fillRect(x, 22, w, 1);
  }
  // Rust streaks and grime.
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * H);
    const len = 2 + Math.floor(r() * 10);
    g.fillStyle = `rgba(${120 + r() * 40},${50 + r() * 20},${30},${0.25 + r() * 0.35})`;
    g.fillRect(x, y, 1, len);
  }
  g.fillStyle = 'rgba(20,16,10,0.35)';
  g.fillRect(0, 44, W, 8);
  SIDE = toTex(c);
  return SIDE;
}

// Flat front: big dark windscreen, "VULGSHIRE", crest, buffers.
let FRONT = null;
function frontTex() {
  if (FRONT) return FRONT;
  const c = canvas(48, 56);
  const g = c.getContext('2d');
  g.fillStyle = '#3e5a46';
  g.fillRect(0, 0, 48, 56);
  g.fillStyle = '#20301f';
  g.fillRect(4, 6, 40, 22);
  g.fillStyle = '#0c1014';
  g.fillRect(6, 8, 36, 18);
  g.fillStyle = 'rgba(120,150,170,0.25)';
  g.fillRect(8, 9, 10, 2);
  g.fillStyle = '#c8a04a';
  g.font = 'bold 7px serif';
  g.textAlign = 'center';
  g.fillText('VULGSHIRE', 24, 37);
  // Crest: a small shield.
  g.fillStyle = '#8a6a2a';
  g.fillRect(21, 40, 6, 6);
  g.fillRect(22, 46, 4, 2);
  g.fillStyle = '#c8a04a';
  g.fillRect(23, 41, 2, 4);
  const r = rng(9);
  for (let i = 0; i < 25; i++) {
    g.fillStyle = `rgba(130,55,30,${0.2 + r() * 0.3})`;
    g.fillRect(Math.floor(r() * 48), Math.floor(r() * 56), 1, 2 + Math.floor(r() * 6));
  }
  FRONT = toTex(c);
  return FRONT;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const side = new THREE.MeshLambertMaterial({ map: sideTex(), side: THREE.DoubleSide });
  const front = new THREE.MeshLambertMaterial({ map: frontTex(), side: THREE.DoubleSide });
  const end = new THREE.MeshLambertMaterial({ color: 0x34503c, side: THREE.DoubleSide });
  const roof = new THREE.MeshLambertMaterial({ color: 0x4a6450, side: THREE.DoubleSide });
  const under = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
  MATS = {
    side,
    front,
    end,
    roof,
    under,
    iron: new THREE.MeshLambertMaterial({ color: 0x222222 }),
    floor: new THREE.MeshLambertMaterial({ map: tex.wood(), color: 0x8a7060 }),
    seat: new THREE.MeshLambertMaterial({ map: tex.velvet() }),
    door: new THREE.MeshLambertMaterial({ color: 0x34503c }),
    lamp: new THREE.MeshBasicMaterial({ map: tex.lanternPane() }),
    bellows: new THREE.MeshLambertMaterial({ color: 0x141414 }),
  };
  return MATS;
}

export function createTrain() {
  const M = mats();
  const group = new THREE.Group();
  group.name = 'train';
  const doorsL = []; // platform-side (-z) door panels that slide open
  const blockers = [];
  const cars = []; // { group, offset } so each car can follow a curved track
  for (let k = 0; k < 3; k++) {
    const car = new THREE.Group();
    const cx = -TRAIN_L / 2 + CAR_L / 2 + k * (CAR_L + GAP);
    car.position.x = cx;
    group.add(car);
    cars.push({ group: car, offset: cx });
    const head = k === 2;
    const tail = k === 0;
    // Body shell: materials per face [+x, -x, +y, -y, +z, -z].
    const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_L, CAR_H, CAR_W), [head || tail ? M.front : M.end, tail ? M.front : M.end, M.roof, M.under, M.side, M.side]);
    if (tail) body.material = [M.end, M.front, M.roof, M.under, M.side, M.side];
    body.position.y = FLOOR + CAR_H / 2 - 0.1;
    car.add(body);
    blockers.push(body);
    // Curved roof cap: a flattened half-cylinder along the car.
    const capG = new THREE.CylinderGeometry(CAR_W / 2, CAR_W / 2, CAR_L - 0.2, 8, 1, false, 0, Math.PI);
    capG.rotateZ(Math.PI / 2);
    capG.scale(1, 0.25, 1);
    capG.translate(0, FLOOR + CAR_H - 0.12, 0);
    car.add(new THREE.Mesh(capG, M.roof));
    // Underframe and bogies.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - 1, 0.6, CAR_W - 0.4), M.under);
    frame.position.y = FLOOR - 0.35;
    car.add(frame);
    for (const bx of [-CAR_L / 2 + 2.2, CAR_L / 2 - 2.2]) {
      const bog = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, CAR_W - 0.2), M.iron);
      bog.position.set(bx, 0.55, 0);
      car.add(bog);
      for (const wx of [-0.8, 0.8])
        for (const wz of [-1.05, 1.05]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 10), M.iron);
          wh.rotation.x = Math.PI / 2;
          wh.position.set(bx + wx, 0.42, wz);
          car.add(wh);
        }
    }
    // Interior: wooden floor, velvet benches along both sides, ceiling lamps.
    const fl = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - 0.2, 0.08, CAR_W - 0.2), M.floor);
    fl.position.y = FLOOR + 0.0;
    car.add(fl);
    for (const sz of [-1, 1])
      for (const sx of [-4.4, 0, 4.4]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.45, 0.5), M.seat);
        seat.position.set(sx, FLOOR + 0.25, sz * 1.05);
        car.add(seat);
      }
    for (const lx of [-4, 0, 4]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), M.lamp);
      lamp.position.set(lx, FLOOR + CAR_H - 0.45, 0);
      car.add(lamp);
    }
    // Sliding doors on the platform side (in front of the painted ones).
    for (const dx of [-CAR_L / 2 + 2.5, CAR_L / 2 - 3.5]) {
      for (const half of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.45, 0.06), M.door);
        const x0 = dx + half * 0.31;
        d.position.set(x0, FLOOR + 1.25, -CAR_W / 2 - 0.04);
        car.add(d);
        doorsL.push({ mesh: d, x0, half });
      }
    }
    // Bellows between cars.
    if (k < 2) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(GAP + 0.1, CAR_H - 0.5, CAR_W - 0.6), M.bellows);
      b.position.set(CAR_L / 2 + GAP / 2, FLOOR + (CAR_H - 0.5) / 2, 0);
      car.add(b);
    }
    // Front details on the leading and trailing cars: lanterns and buffers.
    if (head || tail) {
      const fx = head ? CAR_L / 2 + 0.02 : -CAR_L / 2 - 0.02;
      for (const sz of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.3), M.lamp);
        l.position.set(fx, FLOOR + 0.6, sz * 0.95);
        car.add(l);
        const buf = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 8), M.iron);
        buf.rotation.z = Math.PI / 2;
        buf.position.set(fx + (head ? 0.2 : -0.2), FLOOR - 0.2, sz * 0.9);
        car.add(buf);
      }
    }
  }
  // Warm interior light and a headlamp glow.
  const inner = new THREE.PointLight(0xffb060, 10, 22, 1.6);
  inner.position.set(0, FLOOR + 2.4, 0);
  group.add(inner);
  const head = new THREE.PointLight(0xffc880, 14, 26, 1.6);
  head.position.set(TRAIN_L / 2 + 2, FLOOR + 1, 0);
  group.add(head);

  let open = 0;
  return {
    group,
    blockers,
    cars,
    lights: { inner, head },
    /** Place every car on a curve: frame(s) -> {x, z, rot}; s = train centre; y = rail height. */
    placeOnCurve(frame, s, y = 0) {
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
      for (const c of cars) {
        const f = frame(s + c.offset);
        c.group.position.set(f.x, y, f.z);
        c.group.rotation.y = f.rot;
      }
      const fi = frame(s);
      inner.position.set(fi.x, y + FLOOR + 2.4, fi.z);
      const fh = frame(s + TRAIN_L / 2 + 2);
      head.position.set(fh.x, y + FLOOR + 1, fh.z);
    },
    /** 0 = closed, 1 = open (platform side). */
    setDoors(v) {
      open = v;
      for (const d of doorsL) d.mesh.position.x = d.x0 + d.half * v * 0.58;
    },
    get doors() {
      return open;
    },
  };
}
