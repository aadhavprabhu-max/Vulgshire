import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// The Vulgshire metro train (owner's design: reference/metro-train-design.webp),
// built after the owner's train guide:
// - hollow cars with real window openings (glass you can see through) and real
//   doorways with sliding leaves (platform side = -z opens);
// - each body sits on the chord between its two bogies; bogies turn with the
//   rails; bellows stretch between cars; wheels spin with distance;
// - cab lights swap ends with the direction of travel.
// Car local frame: x along the car (front +x), y up from the rails, z across.

export const CAR_L = 14;
export const GAP = 0.8;
export const CAR_W = 2.8;
export const FLOOR = 1.0; // floor height above the rails
export const CAR_SPACING = CAR_L + GAP;
export const TRAIN_L = 3 * CAR_L + 2 * GAP;
const CAR_H = 3.3;
const BOGIE_HALF = 5.0;
const WHEEL_R = 0.42;
export const DOORS = [-4.5, 3.5]; // doorway centres (car local x), both sides
export const DOOR_W = 1.3;
const WINDOWS = [
  [-6.5, -5.5],
  [-3.4, -1.9],
  [-1.5, 0.0],
  [0.4, 2.4],
  [4.6, 6.5],
];
const WIN_Y = [FLOOR + 1.0, FLOOR + 2.25];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
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

let M = null;
function mats() {
  if (M) return M;
  // Livery: 16 px per metre vertically; green below the waist, cream band, rust streaks.
  const livery = canvasTex(64, 64, (g) => {
    const r = rng(5);
    g.fillStyle = '#3e5a46';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#b8b29c';
    g.fillRect(0, 10, 64, 22); // cream band around the windows
    g.fillStyle = '#20301f';
    g.fillRect(0, 9, 64, 1);
    g.fillRect(0, 32, 64, 1);
    g.fillStyle = '#5a7a62';
    for (let x = 1; x < 64; x += 6) g.fillRect(x, 4, 3, 3); // gothic trim
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${120 + r() * 40},${50 + r() * 20},30,${0.25 + r() * 0.35})`;
      g.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), 1, 2 + Math.floor(r() * 8));
    }
  });
  const front = canvasTex(48, 56, (g) => {
    g.fillStyle = '#3e5a46';
    g.fillRect(0, 0, 48, 56);
    g.fillStyle = '#c8a04a';
    g.font = 'bold 7px serif';
    g.textAlign = 'center';
    g.fillText('VULGSHIRE', 24, 37);
    g.fillStyle = '#8a6a2a';
    g.fillRect(21, 40, 6, 6);
    g.fillStyle = '#c8a04a';
    g.fillRect(23, 41, 2, 4);
  });
  const L = (o) => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, ...o });
  M = {
    shell: L({ map: livery }),
    front: L({ map: front }),
    roof: L({ color: 0x4a6450 }),
    under: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    iron: new THREE.MeshLambertMaterial({ color: 0x222222 }),
    floor: new THREE.MeshLambertMaterial({ map: tex.wood(), color: 0x8a7060 }),
    ceiling: L({ color: 0xc8c0a8 }),
    seat: new THREE.MeshLambertMaterial({ map: tex.velvet() }),
    brass: new THREE.MeshLambertMaterial({ color: 0xb08a40 }),
    door: L({ color: 0x34503c }),
    glass: new THREE.MeshBasicMaterial({ color: 0x9ab0c8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    lamp: new THREE.MeshBasicMaterial({ map: tex.lanternPane() }),
    head: new THREE.MeshBasicMaterial({ color: 0xffd890 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xc81818 }),
    off: new THREE.MeshBasicMaterial({ color: 0x201a14 }),
    bellows: new THREE.MeshLambertMaterial({ color: 0x141414 }),
  };
  return M;
}

// A car side wall (in the x-y plane) with window and doorway openings.
function sideWall() {
  const s = new THREE.Shape();
  s.moveTo(-CAR_L / 2, FLOOR - 0.35);
  s.lineTo(CAR_L / 2, FLOOR - 0.35);
  s.lineTo(CAR_L / 2, FLOOR + CAR_H);
  s.lineTo(-CAR_L / 2, FLOOR + CAR_H);
  s.lineTo(-CAR_L / 2, FLOOR - 0.35);
  const hole = (x0, x1, y0, y1) => {
    const h = new THREE.Path();
    h.moveTo(x0, y0);
    h.lineTo(x1, y0);
    h.lineTo(x1, y1);
    h.lineTo(x0, y1);
    h.lineTo(x0, y0);
    s.holes.push(h);
  };
  for (const [a, b] of WINDOWS) hole(a, b, WIN_Y[0], WIN_Y[1]);
  for (const d of DOORS) hole(d - DOOR_W / 2, d + DOOR_W / 2, FLOOR, FLOOR + 2.35);
  const g = new THREE.ShapeGeometry(s);
  // UVs in metres: one livery tile = 4 m along, 4 m up (64 px = 4 m).
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, (uv.getY(i) - FLOOR + 0.35) / 4);
  return g;
}

function buildCar(k) {
  const m = mats();
  const car = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    car.add(o);
    return o;
  };
  // Sides with real openings.
  for (const sz of [-1, 1]) {
    const w = add(sideWall(), m.shell, 0, 0, sz * CAR_W / 2);
    if (sz > 0) w.rotation.y = 0;
    // Glass in every window.
    for (const [a, b] of WINDOWS) add(new THREE.PlaneGeometry(b - a, WIN_Y[1] - WIN_Y[0]), m.glass, (a + b) / 2, (WIN_Y[0] + WIN_Y[1]) / 2, sz * CAR_W / 2);
  }
  // Ends: cab faces on the end cars (with a windscreen), plain bulkheads with a gangway door between cars.
  for (const sx of [-1, 1]) {
    const isCab = (k === 0 && sx < 0) || (k === 2 && sx > 0);
    const end = new THREE.Shape();
    end.moveTo(-CAR_W / 2, FLOOR - 0.35);
    end.lineTo(CAR_W / 2, FLOOR - 0.35);
    end.lineTo(CAR_W / 2, FLOOR + CAR_H);
    end.lineTo(-CAR_W / 2, FLOOR + CAR_H);
    end.lineTo(-CAR_W / 2, FLOOR - 0.35);
    const h = new THREE.Path();
    if (isCab) {
      h.moveTo(-1.1, FLOOR + 1.4);
      h.lineTo(1.1, FLOOR + 1.4);
      h.lineTo(1.1, FLOOR + 2.6);
      h.lineTo(-1.1, FLOOR + 2.6);
    } else {
      h.moveTo(-0.5, FLOOR);
      h.lineTo(0.5, FLOOR);
      h.lineTo(0.5, FLOOR + 2.1);
      h.lineTo(-0.5, FLOOR + 2.1);
    }
    end.holes.push(h);
    const eg = new THREE.ShapeGeometry(end);
    const uv = eg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + CAR_W / 2) / CAR_W, (uv.getY(i) - FLOOR + 0.35) / (CAR_H + 0.35));
    const e = add(eg, isCab ? m.front : m.shell, sx * CAR_L / 2, 0, 0);
    e.rotation.y = sx * Math.PI / 2;
    if (isCab) add(new THREE.PlaneGeometry(2.2, 1.2), m.glass, sx * CAR_L / 2, FLOOR + 2.0, 0).rotation.y = sx * Math.PI / 2;
  }
  // Roof (curved cap), floor, ceiling, underframe.
  const capG = new THREE.CylinderGeometry(CAR_W / 2, CAR_W / 2, CAR_L, 8, 1, false, 0, Math.PI);
  capG.rotateZ(Math.PI / 2);
  capG.scale(1, 0.25, 1);
  add(capG, m.roof, 0, FLOOR + CAR_H, 0);
  add(new THREE.BoxGeometry(CAR_L, 0.1, CAR_W), m.floor, 0, FLOOR - 0.05, 0);
  add(new THREE.PlaneGeometry(CAR_L, CAR_W), m.ceiling, 0, FLOOR + CAR_H - 0.02, 0).rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(CAR_L - 1.5, 0.55, CAR_W - 0.4), m.under, 0, FLOOR - 0.4, 0);
  // Interior: velvet benches along both walls between the doors, brass poles, lamps.
  for (const sz of [-1, 1]) {
    for (const [a, b] of [
      [-6.7, -5.4],
      [-3.6, 2.6],
      [4.4, 6.7],
    ]) {
      add(new THREE.BoxGeometry(b - a, 0.45, 0.5), m.seat, (a + b) / 2, FLOOR + 0.25, sz * (CAR_W / 2 - 0.3));
      add(new THREE.BoxGeometry(b - a, 0.6, 0.08), m.seat, (a + b) / 2, FLOOR + 0.75, sz * (CAR_W / 2 - 0.06));
    }
  }
  for (const d of DOORS) for (const ox of [-0.9, 0.9]) add(new THREE.CylinderGeometry(0.03, 0.03, CAR_H, 5), m.brass, d + ox, FLOOR + CAR_H / 2, 0);
  for (const lx of [-4.5, 0, 4.5]) add(new THREE.BoxGeometry(0.4, 0.15, 0.4), m.lamp, lx, FLOOR + CAR_H - 0.1, 0);
  // Door leaves: two per doorway, per side. They slide along the wall (outside it).
  const leaves = [];
  for (const sz of [-1, 1])
    for (const d of DOORS)
      for (const half of [-1, 1]) {
        const leaf = add(new THREE.BoxGeometry(DOOR_W / 2, 2.35, 0.05), m.door, d + (half * DOOR_W) / 4, FLOOR + 1.175, sz * (CAR_W / 2 + 0.04));
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W / 2 - 0.15, 0.8), m.glass);
        pane.position.set(0, 0.4, sz * 0.03);
        leaf.add(pane);
        leaves.push({ leaf, x0: d + (half * DOOR_W) / 4, half, side: sz });
      }
  // Cab lamps at both ends (switched by direction).
  const ends = {};
  for (const sx of [-1, 1]) {
    if (!((k === 0 && sx < 0) || (k === 2 && sx > 0))) continue;
    const lamps = [];
    for (const sz of [-1, 1]) {
      const l = add(new THREE.BoxGeometry(0.06, 0.32, 0.32), m.off, sx * (CAR_L / 2 + 0.03), FLOOR + 0.55, sz * 0.95);
      lamps.push(l);
    }
    ends[sx] = lamps;
  }
  return { group: car, leaves, ends };
}

function buildBogie() {
  const m = mats();
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, CAR_W - 0.3), m.iron);
  frame.position.y = 0.6;
  g.add(frame);
  const wheels = [];
  for (const wx of [-0.85, 0.85])
    for (const wz of [-0.72, 0.72]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.12, 8), m.iron);
      w.rotation.x = Math.PI / 2;
      const hub = new THREE.Group();
      hub.position.set(wx, WHEEL_R, wz);
      hub.add(w);
      // A spoke so the spin is visible.
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, WHEEL_R * 1.8, 0.14), m.under);
      hub.add(spoke);
      g.add(hub);
      wheels.push(hub);
    }
  return { group: g, wheels };
}

export function createTrain() {
  const m = mats();
  const group = new THREE.Group();
  group.name = 'train';
  const cars = [];
  const blockers = [];
  for (let k = 0; k < 3; k++) {
    const c = buildCar(k);
    // offset = car centre relative to the train centre (front car = k 2 at +x).
    const offset = (k - 1) * CAR_SPACING;
    const bogies = [buildBogie(), buildBogie()];
    for (const b of bogies) group.add(b.group);
    group.add(c.group);
    cars.push({ ...c, offset, bogies });
    blockers.push(...c.group.children.filter((o) => o.isMesh && o.material === m.shell));
  }
  const bellows = [0, 1].map(() => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, CAR_H - 0.6, CAR_W - 0.7), m.bellows);
    group.add(b);
    return b;
  });
  const inner = new THREE.PointLight(0xffb060, 9, 24, 1.6);
  const head = new THREE.PointLight(0xffc880, 14, 30, 1.6);
  group.add(inner, head);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  return {
    group,
    blockers,
    cars,
    /**
     * Place the whole train from one number: the distance of its centre.
     * frame(s) -> {x, z, ...}; railY(s) -> rail height; dir = travel direction; travelled = wheel spin.
     */
    place(frame, railY, s, { dir = 1, travelled = 0 } = {}) {
      for (const c of cars) {
        const cs = s + c.offset;
        const sf = cs + BOGIE_HALF;
        const sb = cs - BOGIE_HALF;
        const F = frame(sf);
        const B = frame(sb);
        tmpA.set(F.x, railY(sf), F.z);
        tmpB.set(B.x, railY(sb), B.z);
        // Body on the chord between its bogies (it overhangs on curves, like a real car).
        c.group.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
        tmpC.subVectors(tmpA, tmpB);
        c.group.rotation.order = 'YZX';
        c.group.rotation.y = Math.atan2(-tmpC.z, tmpC.x);
        c.group.rotation.z = Math.atan2(tmpC.y, Math.hypot(tmpC.x, tmpC.z));
        c.group.rotation.x = 0;
        c.bogies.forEach((b, i) => {
          const f = i === 0 ? F : B;
          const ss = i === 0 ? sf : sb;
          b.group.position.set(f.x, railY(ss), f.z);
          b.group.rotation.set(0, f.rot, 0);
          for (const w of b.wheels) w.rotation.z = -travelled / WHEEL_R;
        });
        c.group.updateMatrixWorld();
      }
      // Bellows stretched between car ends.
      for (let k = 0; k < 2; k++) {
        const a = cars[k].group;
        const b = cars[k + 1].group;
        tmpA.set(CAR_L / 2, FLOOR + (CAR_H - 0.6) / 2, 0).applyMatrix4(a.matrixWorld);
        tmpB.set(-CAR_L / 2, FLOOR + (CAR_H - 0.6) / 2, 0).applyMatrix4(b.matrixWorld);
        const bl = bellows[k];
        bl.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
        tmpC.subVectors(tmpB, tmpA);
        bl.rotation.set(0, Math.atan2(-tmpC.z, tmpC.x), 0);
        bl.scale.x = Math.max(0.2, tmpC.length() + 0.1);
      }
      const mid = cars[1].group;
      inner.position.set(0, FLOOR + 2.4, 0).applyMatrix4(mid.matrixWorld);
      const lead = cars[dir > 0 ? 2 : 0].group;
      head.position.set(dir > 0 ? CAR_L / 2 + 2 : -CAR_L / 2 - 2, FLOOR + 1, 0).applyMatrix4(lead.matrixWorld);
      // Cab switch: headlamps on the leading end, red tail lamps on the trailing end.
      for (const c of cars)
        for (const [sx, lamps] of Object.entries(c.ends)) for (const l of lamps) l.material = Number(sx) === dir ? m.head : m.tail;
    },
    /** Door leaves: 0 closed .. 1 open, platform side (-z) only. */
    setDoors(v) {
      const e = v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; // ease in-out
      for (const c of cars) for (const d of c.leaves) d.leaf.position.x = d.x0 + (d.side < 0 ? d.half * e * (DOOR_W / 2 - 0.02) : 0);
    },
  };
}

/**
 * Keep a passenger inside a car, in car-local coordinates. Returns the clamped
 * point and whether they stepped out through an open platform-side doorway.
 */
export function constrainInCar(p, doorsOpen) {
  const out = { x: p.x, y: FLOOR, z: p.z, alight: false };
  const atDoor = DOORS.some((d) => Math.abs(p.x - d) < DOOR_W / 2 - 0.25);
  out.x = Math.max(-CAR_L / 2 + 0.35, Math.min(CAR_L / 2 - 0.35, p.x));
  if (atDoor) {
    if (doorsOpen && p.z < -CAR_W / 2 - 0.45) out.alight = true;
    out.z = Math.max(doorsOpen ? -CAR_W / 2 - 0.6 : -CAR_W / 2 + 0.3, Math.min(CAR_W / 2 - 0.3, p.z));
  } else out.z = Math.max(-CAR_W / 2 + 0.7, Math.min(CAR_W / 2 - 0.7, p.z)); // the benches
  return out;
}
