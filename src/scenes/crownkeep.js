import * as THREE from 'three';
import { tex, scaleUV, worldBoxUV } from '../retro/textures.js';
import { lambert, archPoints, archHole, shadowy, box, mergedMesh, boxGeo, lancetGeo, flickerTorches, mulberry } from './kit.js';
import { createGuard } from '../characters/guard.js';
import { createPerson, PALETTES } from '../characters/people.js';
import { createCrowd, faceToward } from '../characters/crowd.js';

// INSIDE THE CROWNKEEP. Original design inspired by the mood references in
// reference/interiors/ (a gothic hall-library with a rose window and moonbeam,
// and a dark grand staircase) plus real royal halls: the raised dais of the
// medieval great hall, the split ceremonial staircase of the Palais Garnier,
// and the looping ribbed vault of Prague Castle's Vladislav Hall.
//
// Coordinates: x = east (you walk in from the west gate), z = south, y up.
//  - Grand Stair Hall: x 0..28, z -14..14, floor y 0, ceiling y 20. A central
//    flight rises to a landing, splits into two flights, and reaches the
//    gallery (piano nobile) at y = GL.
//  - Great Hall: x 28..90, z -9..9, floor y = GL, ribbed vault above.

const GL = 6.5; // gallery / Great Hall floor level
const SH = { x0: 0, x1: 28, hz: 14, h: 27 };
const GH = { x0: 28, x1: 90, hz: 13, spring: GL + 10.5, k: 0.56 };
const MOON = new THREE.Vector3(-0.25, -0.7, -0.66).normalize(); // moonbeams enter from the south windows

function mats() {
  return {
    stone: lambert(tex.hallStone()),
    stoneDark: lambert(tex.hallStone(), { color: 0x6a6878 }),
    marble: lambert(tex.marble(0)),
    marbleGrey: lambert(tex.marble(1)),
    marbleRed: lambert(tex.marble(2)),
    floor: lambert(tex.marbleFloor()),
    medallion: new THREE.MeshLambertMaterial({ map: tex.medallion(), transparent: true, alphaTest: 0.5 }),
    vault: lambert(tex.hallStone(), { color: 0x8a8898, side: THREE.DoubleSide }),
    rib: lambert(tex.column(), { color: 0x9e98a8 }),
    wood: lambert(tex.wood(), { color: 0x9a8474 }),
    woodDark: lambert(tex.wood(), { color: 0x6a5a50 }),
    velvet: lambert(tex.velvet(), { side: THREE.DoubleSide }),
    books: lambert(tex.books()),
    brick: lambert(tex.brickWarm()),
    iron: lambert(null, { color: 0x24201e }),
    gold: lambert(null, { color: 0xb08a40 }),
    candle: lambert(null, { color: 0xe8e0cc }),
    globe: lambert(tex.globe()),
    glassCool: (seed) => new THREE.MeshBasicMaterial({ map: tex.stainedGlass('purple', seed), side: THREE.DoubleSide }),
    rose: new THREE.MeshBasicMaterial({ map: tex.rose('purple'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    night: new THREE.MeshBasicMaterial({ color: 0x0c1226 }),
  };
}

// ---- small geometry helpers ----------------------------------------------------

// Wall in local (u, y) with arched holes, extruded along +z by `thick`.
function holedWall(len, y0, y1, thick, holes, mat) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, y0);
  s.lineTo(len / 2, y0);
  s.lineTo(len / 2, y1);
  s.lineTo(-len / 2, y1);
  s.lineTo(-len / 2, y0);
  for (const h of holes) s.holes.push(archHole(h.u0, h.u1, h.bottom, h.spring, h.k ?? 0.8));
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 1 }), 0.5);
  return shadowy(new THREE.Mesh(g, mat));
}

// Evenly spaced arcade bays along a length: returns [{u0, u1, mid}] and pier centres.
function bays(len, n, pier) {
  const span = (len - (n + 1) * pier) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const u0 = -len / 2 + pier + i * (span + pier);
    out.push({ u0, u1: u0 + span, mid: u0 + span / 2 });
  }
  const piers = Array.from({ length: n + 1 }, (_, i) => -len / 2 + pier / 2 + i * (span + pier));
  return { out, piers };
}

// Baluster profile (a small turned vase), shared.
const BALUSTER = (() => {
  const prof = [
    [0, 0],
    [0.09, 0],
    [0.06, 0.14],
    [0.1, 0.38],
    [0.05, 0.62],
    [0.08, 0.74],
    [0.06, 0.8],
    [0, 0.8],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(prof, 6);
})();

// Balustrade from A to B (feet heights ay/by may differ: stair balustrades).
function balustrade(ax, ay, az, bx, by, bz, rails, posts) {
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax);
  const slope = Math.atan2(by - ay, len);
  const len3 = Math.hypot(len, by - ay);
  for (const [yy, hh, dd] of [
    [0.9, 0.12, 0.26],
    [0.06, 0.12, 0.22],
  ]) {
    const g = worldBoxUV(new THREE.BoxGeometry(len3, hh, dd), len3, hh, dd, 1);
    g.rotateZ(slope);
    g.rotateY(rot);
    g.translate((ax + bx) / 2, (ay + by) / 2 + yy, (az + bz) / 2);
    rails.push(g);
  }
  const n = Math.max(2, Math.round(len / 0.3));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    posts.push(BALUSTER.clone().translate(ax + (bx - ax) * t, ay + (by - ay) * t + 0.1, az + (bz - az) * t));
  }
}

// Solid stair: n steps from y0 to y1 along x (x0 -> x1), across z0..z1, filled to the floor.
function stairGeos(x0, x1, z0, z1, y0, y1, n, base = 0) {
  const out = [];
  const depth = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const top = y0 + ((y1 - y0) * (i + 1)) / n;
    const h = top - base;
    out.push(boxGeo(depth, h, z1 - z0, x0 + depth * (i + 0.5), base + h / 2, (z0 + z1) / 2, 0, 1));
  }
  return out;
}

// Iron ring chandelier with candles (flame sprites) and an optional light.
function chandelier(root, flames, M, x, y, z, { rings = [[1.4, 0, 10]], light = 0, chainTo = null } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const [r, dy, n] of rings) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 4, 16), M.iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = dy;
    g.add(ring);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 4), M.candle);
      c.position.set(Math.cos(a) * r, dy + 0.13, Math.sin(a) * r);
      g.add(c);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
      f.position.set(Math.cos(a) * r, dy + 0.34, Math.sin(a) * r);
      g.add(f);
      flames.push({ flame: f, light: null, base: 0, phase: Math.random() * 10, flameScale: 0.45 });
    }
    // Spokes.
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.04, 0.04), M.iron);
      sp.rotation.y = (i * Math.PI) / 4;
      sp.position.y = dy;
      g.add(sp);
    }
  }
  const top = chainTo ?? y + 6;
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.04, top - y, 0.04), M.iron);
  chain.position.y = (top - y) / 2;
  g.add(chain);
  if (light) {
    const l = new THREE.PointLight(0xffa64e, light, light > 20 ? 34 : 22, 1.6);
    l.position.y = -0.2;
    g.add(l);
    flames.push({ flame: new THREE.Object3D(), light: l, base: light, phase: Math.random() * 10 });
  }
  root.add(g);
  return g;
}

// Standing candelabrum / torchere (Garnier-style lamp at the foot of the stairs).
function candelabrum(root, flames, M, x, y, z, h, arms, light = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const ped = shadowy(new THREE.Mesh(worldBoxUV(new THREE.BoxGeometry(0.8, 1.2, 0.8), 0.8, 1.2, 0.8, 1), M.marbleRed));
  ped.position.y = 0.6;
  g.add(ped);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, h, 6), M.gold);
  stem.position.y = 1.2 + h / 2;
  g.add(stem);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const r = i === 0 && arms % 2 ? 0 : 0.42;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 4), M.candle);
    c.position.set(Math.cos(a) * r, 1.2 + h + 0.15, Math.sin(a) * r);
    g.add(c);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
    f.position.set(Math.cos(a) * r, 1.2 + h + 0.42, Math.sin(a) * r);
    g.add(f);
    flames.push({ flame: f, light: null, base: 0, phase: Math.random() * 10, flameScale: 0.5 });
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 4, 10), M.gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.2 + h;
  g.add(ring);
  if (light) {
    const l = new THREE.PointLight(0xffa04a, light, 10, 2);
    l.position.y = 1.2 + h + 0.6;
    g.add(l);
    flames.push({ flame: new THREE.Object3D(), light: l, base: light, phase: Math.random() * 10 });
  }
  root.add(g);
}

function buildCrownkeep() {
  const M = mats();
  const root = new THREE.Group();
  root.name = 'crownkeep';
  const colliders = [];
  const cameraBlockers = [];
  const floors = [];
  const flames = [];
  const rails = [];
  const posts = [];
  const rnd = mulberry(404);

  // =========================================================================
  // GRAND STAIR HALL
  // =========================================================================
  const { x0, x1, hz, h } = SH;
  const midX = (x0 + x1) / 2;
  // Floor, ceiling, side walls.
  const shFloor = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(x1 - x0, 2 * hz), (x1 - x0) / 2), M.floor);
  shFloor.rotation.x = -Math.PI / 2;
  shFloor.position.set(midX, 0, 0);
  shFloor.receiveShadow = true;
  root.add(shFloor);
  root.add(box(x1 - x0, 0.6, 2 * hz + 2, M.stoneDark, midX, h + 0.3, 0));
  const beams = [];
  for (let x = x0 + 2; x < x1; x += 4) beams.push(boxGeo(0.5, 0.7, 2 * hz, x, h - 0.35, 0, 0, 1));
  for (let z = -hz + 3.5; z < hz; z += 3.5) beams.push(boxGeo(x1 - x0, 0.5, 0.4, midX, h - 0.25, z, 0, 1));
  root.add(mergedMesh(beams, M.woodDark));
  for (const sz of [-1, 1]) {
    const w = box(x1 - x0, h, 1, M.stone, midX, h / 2, sz * (hz + 0.5));
    root.add(w);
    cameraBlockers.push(w);
    colliders.push({ minX: x0 - 1, maxX: x1 + 1, minZ: sz < 0 ? -hz - 1 : hz, maxZ: sz < 0 ? -hz : hz + 1 });
  }
  // West wall with the entrance door (back to the castle gate).
  const west = holedWall(2 * hz, 0, h, 1, [{ u0: -1.8, u1: 1.8, bottom: -0.2, spring: 3.4 }], M.stone);
  west.rotation.y = Math.PI / 2;
  west.position.x = x0 - 1;
  root.add(west);
  cameraBlockers.push(west);
  colliders.push({ minX: x0 - 1, maxX: x0, minZ: -hz, maxZ: -1.8 }, { minX: x0 - 1, maxX: x0, minZ: 1.8, maxZ: hz });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 5.6), M.night);
  outside.rotation.y = Math.PI / 2;
  outside.position.set(x0 - 1.2, 2.8, 0);
  root.add(outside);
  // East wall: the great arched doorway into the Great Hall at gallery level.
  const east = holedWall(2 * hz, 0, h, 0.8, [{ u0: -2.4, u1: 2.4, bottom: GL + 0.02, spring: GL + 4.2 }], M.stone);
  east.rotation.y = Math.PI / 2;
  east.position.x = x1;
  root.add(east);
  cameraBlockers.push(east);
  colliders.push(
    { minX: x1, maxX: x1 + 0.8, minZ: -hz, maxZ: -2.4 },
    { minX: x1, maxX: x1 + 0.8, minZ: 2.4, maxZ: hz },
    { minX: x1, maxX: x1 + 0.8, minZ: -2.4, maxZ: 2.4, y1: 5 },
  );

  // Two-storey arcades along the north and south sides, galleries above them.
  const arc = bays(24, 6, 0.8);
  for (const sz of [-1, 1]) {
    const lower = holedWall(24, -0.3, GL - 0.5, 0.6, arc.out.map((b) => ({ u0: b.u0, u1: b.u1, bottom: -0.2, spring: 3.6 })), M.stone);
    const upper = holedWall(24, GL, h, 0.6, arc.out.map((b) => ({ u0: b.u0, u1: b.u1, bottom: GL + 0.02, spring: GL + 5 })), M.stone);
    for (const wall of [lower, upper]) {
      wall.position.set(12, 0, sz < 0 ? -11.1 : 10.5);
      root.add(wall);
    }
    // Gallery slab.
    root.add(box(24, 0.5, 3.5, M.marble, 12, GL - 0.25, sz * 12.25));
    floors.push({ minX: 0, maxX: 24, minZ: sz < 0 ? -hz : 10.5, maxZ: sz < 0 ? -10.5 : hz, y: GL });
    // Ground-level piers (you can walk under the gallery through the arches).
    for (const p of arc.piers) colliders.push({ minX: 12 + p - 0.4, maxX: 12 + p + 0.4, minZ: sz < 0 ? -11.1 : 10.5, maxZ: sz < 0 ? -10.5 : 11.1, y1: 2 });
    // Gallery level: the arcade line is a parapet you look through.
    colliders.push({ minX: 0, maxX: 24, minZ: sz < 0 ? -11.15 : 10.45, maxZ: sz < 0 ? -10.45 : 11.15, y0: 5, h: GL + 1.2 });
    for (const b of arc.out) balustrade(12 + b.u0, GL, sz * 10.8, 12 + b.u1, GL, sz * 10.8, rails, posts);
    // Columns on the hall side of each pier, lower storey.
    for (const p of arc.piers) {
      const c = shadowy(new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(0.22, 0.22, GL - 0.5, 8), 1), M.marbleRed));
      c.position.set(12 + p, (GL - 0.5) / 2, sz * 10.3);
      root.add(c);
    }
  }
  // East gallery joining the two side galleries, in front of the Great Hall door.
  root.add(box(4, 0.5, 2 * hz, M.marble, 26, GL - 0.25, 0));
  floors.push({ minX: 24, maxX: x1 + 0.9, minZ: -hz, maxZ: hz, y: GL });

  // The grand staircase: central flight -> landing -> two flights to the gallery.
  const steps = [];
  const carpet = [];
  steps.push(...stairGeos(6, 13, -3.2, 3.2, 0, 3.2, 16));
  carpet.push(...stairGeos(5.98, 12.98, -1.2, 1.2, 0.02, 3.22, 16, 0.02));
  floors.push({ minX: 6, maxX: 13, minZ: -3.2, maxZ: 3.2, y0: 0, y1: 3.2, axis: 'x' });
  steps.push(boxGeo(5, 3.2, 19, 15.5, 1.6, 0, 0, 2)); // landing
  floors.push({ minX: 13, maxX: 18, minZ: -9.5, maxZ: 9.5, y: 3.2 });
  colliders.push({ minX: 13, maxX: 18, minZ: -9.5, maxZ: 9.5, y1: 2 });
  for (const sz of [-1, 1]) {
    const za = sz < 0 ? -9.5 : 5;
    const zb = sz < 0 ? -5 : 9.5;
    steps.push(...stairGeos(18, 24, za, zb, 3.2, GL, 15));
    carpet.push(...stairGeos(17.98, 23.98, (za + zb) / 2 - 1, (za + zb) / 2 + 1, 3.22, GL + 0.02, 15, 3.0));
    floors.push({ minX: 18, maxX: 24, minZ: za, maxZ: zb, y0: 3.2, y1: GL, axis: 'x' });
    colliders.push({ minX: 18, maxX: 24, minZ: za, maxZ: zb, y1: 2 });
    // Balustrades: central flight sides, landing edges, side flights, gallery edge.
    balustrade(6, 0, sz * 3.35, 13, 3.2, sz * 3.35, rails, posts);
    colliders.push({ minX: 6, maxX: 13, minZ: sz < 0 ? -3.5 : 3.2, maxZ: sz < 0 ? -3.2 : 3.5, h: 4.5 });
    balustrade(13.1, 3.2, sz * 3.35, 13.1, 3.2, sz * 9.4, rails, posts);
    colliders.push({ minX: 12.8, maxX: 13.15, minZ: sz < 0 ? -9.5 : 3.2, maxZ: sz < 0 ? -3.2 : 9.5, y0: 2, h: 4.4 });
    balustrade(13.1, 3.2, sz * 9.5, 18, 3.2, sz * 9.5, rails, posts);
    colliders.push({ minX: 13, maxX: 18, minZ: sz < 0 ? -9.8 : 9.5, maxZ: sz < 0 ? -9.5 : 9.8, y0: 2, h: 4.4 });
    for (const zz of [za, zb]) {
      balustrade(18, 3.2, zz, 24, GL, zz, rails, posts);
      colliders.push({ minX: 18, maxX: 24, minZ: zz - 0.15, maxZ: zz + 0.15, h: GL + 1.2 });
    }
    balustrade(24.1, GL, sz * 9.5, 24.1, GL, sz * 10.5, rails, posts);
    colliders.push({ minX: 23.8, maxX: 24.2, minZ: sz < 0 ? -10.6 : 9.5, maxZ: sz < 0 ? -9.5 : 10.6, y0: 5, h: GL + 1.2 });
    // Garnier-style torcheres at the foot of the stairs.
    candelabrum(root, flames, M, 5.4, 0, sz * 3.9, 2.4, 5, 5);
    colliders.push({ minX: 5, maxX: 5.8, minZ: sz * 3.9 - 0.4, maxZ: sz * 3.9 + 0.4 });
  }
  balustrade(18, 3.2, -5, 18, 3.2, 5, rails, posts);
  colliders.push({ minX: 17.85, maxX: 18.2, minZ: -5, maxZ: 5, y0: 2, h: 4.4 });
  balustrade(24.1, GL, -5, 24.1, GL, 5, rails, posts);
  colliders.push({ minX: 23.8, maxX: 24.2, minZ: -5, maxZ: 5, y0: 5, h: GL + 1.2 });
  root.add(mergedMesh(steps, M.marbleGrey, { cast: true }));
  root.add(mergedMesh(carpet, M.velvet));
  // Carpet runner from the door to the first step.
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), M.velvet);
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(3, 0.012, 0);
  root.add(runner);

  // The great chandelier over the stairwell (tiered rings like the reference), and sconces.
  chandelier(root, flames, M, 15, 12.5, 0, { rings: [[2.2, 0, 14], [1.4, 1.2, 10], [0.7, 2.2, 6]], light: 30, chainTo: h });
  for (const [cx, cz] of [
    [6, -12.3],
    [18, -12.3],
    [6, 12.3],
    [18, 12.3],
  ])
    chandelier(root, flames, M, cx, GL + 4.4, cz, { rings: [[0.6, 0, 5]], chainTo: h });
  for (const sz of [-1, 1]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
    s.position.set(x0 + 0.4, 2.9, sz * 2.6);
    root.add(s);
    flames.push({ flame: s, light: null, base: 0, phase: rnd() * 9, flameScale: 0.6 });
  }

  // =========================================================================
  // THE GREAT HALL
  // =========================================================================
  const gx0 = GH.x0 + 0.8;
  const gx1 = GH.x1;
  const ghz = GH.hz;
  const gmid = (gx0 + gx1) / 2;
  const glen = gx1 - gx0;
  root.add(box(glen, 0.5, 2 * ghz, M.floor, gmid, GL - 0.25, 0, 2));
  floors.push({ minX: GH.x0, maxX: gx1, minZ: -ghz, maxZ: ghz, y: GL });
  // The inlaid medallion in the middle of the floor.
  const med = new THREE.Mesh(new THREE.CircleGeometry(5.5, 24), M.medallion);
  med.rotation.x = -Math.PI / 2;
  med.position.set(55, GL + 0.012, 0);
  root.add(med);
  // Side walls up to the vault springing; the vault; ribs.
  for (const sz of [-1, 1]) {
    const w = box(glen, GH.spring + 0.3, 1, M.stone, gmid, (GH.spring + 0.3) / 2, sz * (ghz + 0.5));
    root.add(w);
    cameraBlockers.push(w);
    colliders.push({ minX: GH.x0, maxX: gx1 + 1, minZ: sz < 0 ? -ghz - 1 : ghz, maxZ: sz < 0 ? -ghz : ghz + 1 });
  }
  const prof = archPoints(-ghz, ghz, GH.spring, GH.k, 10); // [z, y]
  const vaultY = (z) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [za, ya] = prof[i];
      const [zb, yb] = prof[i + 1];
      if ((z >= za && z <= zb) || (z <= za && z >= zb)) return ya + ((yb - ya) * (z - za)) / (zb - za || 1);
    }
    return GH.spring;
  };
  {
    const pos = [];
    const uv = [];
    const idx = [];
    let u = 0;
    prof.forEach(([z, y], i) => {
      if (i > 0) u += Math.hypot(z - prof[i - 1][0], y - prof[i - 1][1]);
      pos.push(GH.x0, y, z, gx1, y, z);
      uv.push(GH.x0 / 2, u / 2, gx1 / 2, u / 2);
      if (i < prof.length - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, M.vault));
  }
  const ribs = [];
  const tube = (pts, r) => ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), pts.length * 2, r, 4, false));
  const nb = 8;
  const bay = glen / nb;
  const bx = Array.from({ length: nb + 1 }, (_, i) => gx0 + i * bay);
  for (const x of bx) tube(prof.map(([z, y]) => [x, y - 0.12, z]), 0.2);
  const N = 16;
  for (let i = 0; i < nb; i++) {
    // Diagonals across each bay.
    for (const dir of [1, -1]) {
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const z = dir * (-ghz + 2 * ghz * t) * 0.98;
        pts.push([bx[i] + bay * t, vaultY(z) - 0.12, z]);
      }
      tube(pts, 0.13);
    }
  }
  // Vladislav-style looping ribs: petals that swing out and back across two bays.
  for (let i = 0; i < nb - 1; i++) {
    for (const s of [1, -1]) {
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const z = s * ghz * 0.72 * Math.sin(Math.PI * t);
        pts.push([bx[i] + 2 * bay * t, vaultY(z) - 0.16, z]);
      }
      tube(pts, 0.1);
    }
  }
  tube([[gx0, vaultY(0) - 0.14, 0], [gmid, vaultY(0) - 0.14, 0], [gx1, vaultY(0) - 0.14, 0]], 0.16);
  root.add(mergedMesh(ribs, M.rib));
  // Wall shafts carrying the ribs.
  const shafts = [];
  for (const x of bx) {
    for (const sz of [-1, 1]) {
      const c = new THREE.CylinderGeometry(0.22, 0.26, GH.spring - GL, 6);
      scaleUV(c, 2);
      c.translate(x, (GH.spring + GL) / 2, sz * (ghz - 0.2));
      shafts.push(c);
      shafts.push(boxGeo(0.7, 0.35, 0.7, x, GH.spring, sz * (ghz - 0.25), 0, 1));
    }
  }
  root.add(mergedMesh(shafts, M.marbleGrey));

  // East end wall: rose window over two rows of tall lancets.
  {
    const s = new THREE.Shape();
    s.moveTo(-ghz - 1, 0);
    s.lineTo(ghz + 1, 0);
    s.lineTo(ghz + 1, GH.spring);
    for (const [z, y] of prof.slice().reverse()) s.lineTo(z, y + 0.5);
    s.lineTo(-ghz - 1, GH.spring);
    s.lineTo(-ghz - 1, 0);
    const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }), 0.5);
    const m = shadowy(new THREE.Mesh(g, M.stone));
    m.rotation.y = Math.PI / 2;
    m.position.x = gx1;
    root.add(m);
    colliders.push({ minX: gx1 - 0.05, maxX: gx1 + 1, minZ: -ghz - 1, maxZ: ghz + 1 });
  }
  const eastGlass = (geo, x, y, z, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = -Math.PI / 2;
    m.position.set(x, y, z);
    root.add(m);
  };
  for (let i = 0; i < 8; i++) {
    const z = -8.75 + i * 2.5;
    eastGlass(lancetGeo(1.8, 4.4), gx1 - 0.03, GL + 1.4, z, M.glassCool(i));
    eastGlass(lancetGeo(1.8, 4.0), gx1 - 0.03, GL + 6.4, z, M.glassCool(i + 10));
  }
  eastGlass(new THREE.CircleGeometry(5.2, 24), gx1 - 0.03, GL + 16.5, 0, M.rose);
  for (const sz of [-1, 1]) eastGlass(new THREE.CircleGeometry(1.8, 16), gx1 - 0.03, GL + 12.5, sz * 7.2, M.rose);
  // Red velvet hangings flanking the windows.
  for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 8), M.velvet);
    c.rotation.y = -Math.PI / 2;
    c.position.set(gx1 - 0.08, GL + 6, sz * 11.6);
    c.scale.set(1.3, 1.5, 1);
    root.add(c);
  }

  // South wall: tall lancets in every bay, moonlight pouring through.
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xb8c8ff, map: tex.shaft(), transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0x8a96c8, map: tex.stainedGlass('purple', 7), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < nb; i++) {
    const xc = (bx[i] + bx[i + 1]) / 2;
    const win = new THREE.Mesh(lancetGeo(2.8, 9.5), M.glassCool(20 + i));
    win.rotation.y = Math.PI;
    win.position.set(xc, GL + 0.7, ghz - 0.03);
    root.add(win);
    // Red banners between the windows (on the piers).
    if (i > 0 && i % 2 === 0) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4.6), new THREE.MeshLambertMaterial({ map: tex.banner(), alphaTest: 0.5, side: THREE.DoubleSide }));
      b.rotation.y = Math.PI;
      b.position.set(bx[i], GL + 5.5, ghz - 0.32);
      b.scale.set(1.4, 1.6, 1);
      root.add(b);
    }
    if (i % 2 === 1 && i < nb - 1) {
      const start = new THREE.Vector3(xc, GL + 7.5, ghz - 0.2);
      const t = (GL - start.y) / MOON.y;
      const end = start.clone().addScaledVector(MOON, t);
      const len = start.distanceTo(end);
      const beam = new THREE.Group();
      for (const rot of [0, Math.PI / 2]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, len), shaftMat);
        p.rotation.y = rot;
        beam.add(p);
      }
      beam.position.copy(start).add(end).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), MOON.clone().negate());
      beam.renderOrder = 5;
      root.add(beam);
      const pool = new THREE.Mesh(lancetGeo(2.2, 5.5), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(end.x, GL + 0.03, end.z + 2.4);
      pool.renderOrder = 4;
      root.add(pool);
    }
  }

  // North side: the library. Bookcases below and above a wooden gallery.
  {
    const lx0 = 34;
    const lx1 = 66;
    const lw = lx1 - lx0;
    for (const [y0, hh] of [
      [GL, 4.0],
      [GL + 4.5, 3.4],
    ]) {
      const g = new THREE.PlaneGeometry(lw, hh);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * lw) / 2, (uv.getY(i) * hh) / 2);
      const m = new THREE.Mesh(g, M.books);
      m.position.set((lx0 + lx1) / 2, y0 + hh / 2, -ghz + 0.62);
      root.add(m);
    }
    const lib = [];
    lib.push(boxGeo(lw + 0.4, 0.25, 2.4, (lx0 + lx1) / 2, GL + 4.3, -ghz + 1.2, 0, 1)); // mezzanine floor
    lib.push(boxGeo(lw + 0.4, 0.6, 0.6, (lx0 + lx1) / 2, GL + 0.3, -ghz + 0.3, 0, 1)); // case plinth
    for (let x = lx0; x <= lx1 + 0.01; x += 4) {
      lib.push(boxGeo(0.25, 4.3, 0.25, x, GL + 2.15, -ghz + 2.35, 0, 1)); // posts
      lib.push(boxGeo(0.18, 7.9, 0.6, x, GL + 3.95, -ghz + 0.32, 0, 1)); // case uprights
      colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: -ghz + 2.1, maxZ: -ghz + 2.6, y0: 5 });
    }
    root.add(mergedMesh(lib, M.wood, { cast: true }));
    balustrade(lx0, GL + 4.42, -ghz + 2.35, lx1, GL + 4.42, -ghz + 2.35, rails, posts);
    colliders.push({ minX: lx0, maxX: lx1, minZ: -ghz, maxZ: -ghz + 0.7, y0: 5 });
    // A ladder against the cases, a globe, chests.
    const ladder = [];
    for (const dz of [-0.25, 0.25]) ladder.push(boxGeo(0.08, 4.6, 0.08, 0, 2.3, dz, 0, 1));
    for (let y = 0.4; y < 4.6; y += 0.45) ladder.push(boxGeo(0.06, 0.06, 0.5, 0, y, 0, 0, 1));
    const lad = mergedMesh(ladder, M.woodDark);
    lad.position.set(47, GL, -ghz + 1.1);
    lad.rotation.z = 0.18;
    lad.rotation.y = Math.PI / 2;
    root.add(lad);
  }
  {
    const globe = new THREE.Group();
    globe.position.set(38, GL, -4.6);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.35, 1.0, 6), M.woodDark);
    st.position.y = 0.5;
    globe.add(st);
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 7), M.globe);
    sph.position.y = 1.5;
    sph.rotation.z = 0.4;
    globe.add(sph);
    const mer = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 4, 16), M.gold);
    mer.position.y = 1.5;
    globe.add(mer);
    root.add(globe);
    colliders.push({ minX: 37.4, maxX: 38.6, minZ: -5.2, maxZ: -4, y0: 5 });
    const chests = [boxGeo(1.4, 0.8, 0.8, 34.5, GL + 0.4, 11.4, 0.1, 1), boxGeo(1.1, 0.7, 0.7, 36.4, GL + 0.35, 11.7, -0.2, 1)];
    root.add(mergedMesh(chests, M.woodDark, { cast: true }));
    colliders.push({ minX: 33.6, maxX: 37.2, minZ: 10.9, maxZ: 12.2, y0: 5 });
  }
  // A warm, candle-lit doorway in the north wall (like the brick arch in the reference).
  {
    const dx = 74;
    // A deep stone frame stands proud of the wall; the brick-lined recess sits inside it.
    const frame = holedWall(4.4, GL, GL + 5.6, 0.6, [{ u0: -1.4, u1: 1.4, bottom: GL + 0.01, spring: GL + 2.6 }], M.stoneDark);
    frame.position.set(dx, 0, -ghz + 0.01);
    root.add(frame);
    const inner = new THREE.Mesh(lancetGeo(2.8, 4.3), M.brick);
    inner.position.set(dx, GL, -ghz + 0.03);
    root.add(inner);
    const sides = [boxGeo(0.06, 4, 0.58, dx - 1.37, GL + 2, -ghz + 0.3, 0, 1), boxGeo(0.06, 4, 0.58, dx + 1.37, GL + 2, -ghz + 0.3, 0, 1)];
    root.add(mergedMesh(sides, M.brick));
    colliders.push({ minX: dx - 2.2, maxX: dx + 2.2, minZ: -ghz, maxZ: -ghz + 0.65, y0: 5 });
    const sc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
    sc.position.set(dx - 0.9, GL + 2.3, -ghz + 0.25);
    root.add(sc);
    flames.push({ flame: sc, light: null, base: 0, phase: 2, flameScale: 0.55 });
    const l = new THREE.PointLight(0xffa050, 6, 9, 2);
    l.position.set(dx, GL + 2.4, -ghz + 0.9);
    root.add(l);
    flames.push({ flame: new THREE.Object3D(), light: l, base: 6, phase: 4 });
  }

  // The dais and the empty throne (who sits here is undecided lore).
  {
    const dais = [];
    for (const [x, y] of [
      [80, 0.3],
      [80.7, 0.6],
      [81.4, 0.9],
    ]) {
      dais.push(boxGeo(gx1 - x, y, 14, (x + gx1) / 2, GL + y / 2, 0, 0, 1));
      floors.push({ minX: x, maxX: gx1, minZ: -7, maxZ: 7, y: GL + y });
    }
    root.add(mergedMesh(dais, M.marbleGrey, { cast: true }));
    const carpetD = new THREE.Mesh(new THREE.PlaneGeometry(gx1 - 81.4, 3), M.velvet);
    carpetD.rotation.x = -Math.PI / 2;
    carpetD.position.set((81.4 + gx1) / 2, GL + 0.91, 0);
    root.add(carpetD);
    const aisle = new THREE.Mesh(new THREE.PlaneGeometry(80 - gx0, 2.6), M.velvet);
    aisle.rotation.x = -Math.PI / 2;
    aisle.position.set((gx0 + 80) / 2, GL + 0.011, 0);
    root.add(aisle);
    const th = new THREE.Group();
    const T = [];
    T.push(boxGeo(1.3, 0.5, 1.1, 0, 0.75, 0, 0, 1)); // seat
    T.push(boxGeo(1.5, 3.4, 0.3, 0, 1.7, 0.55, 0, 1)); // back
    for (const s of [-1, 1]) {
      T.push(boxGeo(0.2, 1.1, 1.1, s * 0.75, 0.55, 0, 0, 1)); // arms
      T.push(boxGeo(0.28, 3.9, 0.28, s * 0.72, 1.95, 0.6, 0, 1)); // posts
    }
    th.add(mergedMesh(T, M.woodDark, { cast: true }));
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.95), M.velvet);
    cushion.position.y = 1.06;
    th.add(cushion);
    const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.4), M.velvet);
    backPanel.position.set(0, 2.1, 0.39);
    backPanel.rotation.y = Math.PI;
    th.add(backPanel);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), M.gold);
      fin.position.set(s * 0.72, 4.15, 0.6);
      th.add(fin);
    }
    const crownTop = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 6), M.gold);
    crownTop.position.set(0, 3.7, 0.55);
    th.add(crownTop);
    th.position.set(87, GL + 0.9, 0);
    th.rotation.y = Math.PI / 2; // faces west, down the hall
    root.add(th);
    colliders.push({ minX: 86, maxX: 88.2, minZ: -1, maxZ: 1, y0: 5 });
    // Great banner behind the throne.
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(3, 7), new THREE.MeshLambertMaterial({ map: tex.banner(), alphaTest: 0.5, side: THREE.DoubleSide }));
    bn.rotation.y = -Math.PI / 2;
    bn.position.set(gx1 - 0.1, GL + 4.6, 0);
    root.add(bn);
    for (const sz of [-1, 1]) {
      candelabrum(root, flames, M, 84, GL + 0.9, sz * 3, 1.6, 5, 4);
      colliders.push({ minX: 83.6, maxX: 84.4, minZ: sz * 3 - 0.4, maxZ: sz * 3 + 0.4, y0: 5 });
    }
    // A writing desk with candles and books, and a fallen chair.
    const desk = [boxGeo(2.4, 0.12, 1.1, 0, 1.0, 0, 0, 1)];
    for (const [ox, oz] of [
      [-1.05, -0.45],
      [1.05, -0.45],
      [-1.05, 0.45],
      [1.05, 0.45],
    ])
      desk.push(boxGeo(0.12, 1.0, 0.12, ox, 0.5, oz, 0, 1));
    const dm = mergedMesh(desk, M.woodDark, { cast: true });
    dm.position.set(77, GL, 5.6);
    root.add(dm);
    root.add(mergedMesh([boxGeo(0.5, 0.12, 0.35, 76.4, GL + 1.12, 5.5, 0.3, 1), boxGeo(0.45, 0.1, 0.32, 76.5, GL + 1.23, 5.5, 0.1, 1)], M.velvet));
    const dc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
    dc.position.set(77.8, GL + 1.45, 5.6);
    root.add(dc);
    flames.push({ flame: dc, light: null, base: 0, phase: 7, flameScale: 0.4 });
    colliders.push({ minX: 75.6, maxX: 78.4, minZ: 4.9, maxZ: 6.3, y0: 5 });
    const chair = [boxGeo(0.6, 0.08, 0.6, 0, 0.5, 0, 0, 1), boxGeo(0.6, 0.9, 0.08, 0, 0.95, 0.26, 0, 1)];
    for (const [ox, oz] of [
      [-0.25, -0.25],
      [0.25, -0.25],
      [-0.25, 0.25],
      [0.25, 0.25],
    ])
      chair.push(boxGeo(0.06, 0.5, 0.06, ox, 0.25, oz, 0, 1));
    const cm = mergedMesh(chair, M.woodDark, { cast: true });
    cm.position.set(61, GL + 0.3, 2.6);
    cm.rotation.set(0, 0.7, Math.PI / 2); // knocked over
    root.add(cm);
  }

  // Two colonnades of red marble columns down the hall, with gilded capitals.
  {
    const cols = [];
    const caps = [];
    for (let x = 36; x <= 76; x += 8) {
      for (const sz of [-1, 1]) {
        const c = new THREE.CylinderGeometry(0.55, 0.6, 9.5, 10);
        c.translate(x, GL + 4.75, sz * 8.6);
        cols.push(scaleUV(c, 1));
        caps.push(boxGeo(1.6, 0.5, 1.6, x, GL + 9.6, sz * 8.6, 0, 1), boxGeo(1.6, 0.4, 1.6, x, GL + 0.2, sz * 8.6, 0, 1));
        colliders.push({ minX: x - 0.65, maxX: x + 0.65, minZ: sz * 8.6 - 0.65, maxZ: sz * 8.6 + 0.65, y0: 5 });
      }
    }
    root.add(mergedMesh(cols, M.marbleRed, { cast: true }), mergedMesh(caps, M.gold));
  }

  // Ring chandeliers down the hall.
  for (const x of [40, 52, 64, 76]) chandelier(root, flames, M, x, GL + 10, 0, { rings: [[2.4, 0, 16], [1.5, 1.1, 10], [0.7, 2.0, 6]], light: 14, chainTo: vaultY(0) });

  // Two guards standing watch inside the doorway.
  const guards = [];
  for (const sz of [-1, 1]) {
    const g = createGuard();
    g.root.position.set(31.2, GL, sz * 3.4);
    g.root.rotation.y = Math.PI / 2; // facing the door (west)
    root.add(g.root);
    colliders.push({ minX: 30.8, maxX: 31.6, minZ: sz * 3.4 - 0.4, maxZ: sz * 3.4 + 0.4, y0: 5, h: GL + 2.1 });
    guards.push(g);
  }

  root.add(mergedMesh(rails, M.marbleRed, { cast: true }));
  root.add(mergedMesh(posts, M.marbleGrey));

  // =========================================================================
  // THE COURT: people living in the keep (all original designs)
  // =========================================================================
  const crowd = createCrowd({ root, colliders, floors });
  const pr = mulberry(77);
  const P = (opts) => createPerson({ rnd: pr, ...opts });
  const NOB = PALETTES.noble;
  const guardPerson = () => {
    const g = createGuard();
    return { root: g.root, update: (dt, t, s) => g.update(dt, s), setMode() {} };
  };
  // Stair hall.
  crowd.add(P({ outfit: 'servant', hat: 'coif', carry: 'tray' }), {
    path: [[2.5, -5], [5.6, 0], [13, 0], [15.5, -3.5], [15.5, -7.25], [18.2, -7.25], [24, -7.25], [26.5, -4], [26.5, 0], [34, 0], [46, 1.5], [50, 4.5]],
    speed: 1.1,
    wait: 4,
  });
  crowd.add(guardPerson(), { path: [[2, -12.6], [26.4, -12.6], [26.4, 12.6], [2, 12.6]], speed: 0.9, wait: 3 });
  crowd.add(P({ outfit: 'robe', hat: 'chaperon', main: NOB[0] }), { pos: [3, -7], facing: faceToward(3, -7, 3, -5.8), mode: 'talk' });
  crowd.add(P({ outfit: 'gown', hat: 'veil', main: NOB[3], trim: 0xd8d0c0 }), { pos: [3, -5.8], facing: faceToward(3, -5.8, 3, -7), mode: 'idle' });
  crowd.add(P({ outfit: 'gown', hat: 'none', main: NOB[4] }), { path: [[3, 7.5], [11.5, 7.5]], speed: 0.6, wait: 5 });
  crowd.add(P({ outfit: 'herald', hat: 'cap', main: 0x7a1c22 }), { pos: [16.5, 0], facing: Math.PI / 2, mode: 'idle' });
  // Great Hall.
  crowd.add(P({ outfit: 'robe', hat: 'hood', main: NOB[5], carry: 'book' }), { pos: [44, -5.6], facing: 0, mode: 'read' });
  crowd.add(P({ outfit: 'doublet', hat: 'beret', main: NOB[2] }), { pos: [52, -0.2], facing: faceToward(52, -0.2, 52.6, -1), mode: 'talk' });
  crowd.add(P({ outfit: 'gown', hat: 'veil', main: NOB[1] }), { pos: [53.6, -1.0], facing: faceToward(53.6, -1, 52.6, -1), mode: 'idle' });
  crowd.add(P({ outfit: 'robe', hat: 'none', main: NOB[6] }), { pos: [52.2, -1.8], facing: faceToward(52.2, -1.8, 52.6, -1), mode: 'talk' });
  crowd.add(P({ outfit: 'priest', hat: 'coif' }), { pos: [82.2, -4.6], facing: faceToward(82.2, -4.6, 87, 0), mode: 'pray' });
  crowd.add(P({ outfit: 'herald', hat: 'cap', main: 0x1f2f6a, carry: 'scroll' }), { pos: [81.6, 4.6], facing: Math.PI / 2, mode: 'idle' });
  crowd.add(P({ outfit: 'robe', hat: 'chaperon', main: NOB[3] }), { path: [[36, 3.5], [74, 3.5], [74, -3.5], [36, -3.5]], loop: true, speed: 0.7, wait: 0 });
  crowd.add(P({ outfit: 'servant', hat: 'coif', carry: 'candle' }), { path: [[34, 6.2], [73, 6.2]], speed: 0.8, wait: 3 });
  crowd.add(P({ outfit: 'gown', hat: 'none', main: NOB[0] }), { pos: [73.4, -7.3], facing: faceToward(73.4, -7.3, 74.8, -7.0), mode: 'talk' });
  crowd.add(P({ outfit: 'servant', hat: 'none', carry: 'basket' }), { pos: [74.8, -7.0], facing: faceToward(74.8, -7.0, 73.4, -7.3), mode: 'idle' });
  crowd.add(P({ outfit: 'gown', hat: 'veil', main: NOB[4], trim: 0xb08a40 }), { pos: [39.8, -4.0], facing: faceToward(39.8, -4, 38, -4.6), mode: 'idle' });

  const spawn = new THREE.Vector3(2.4, 0, 0);
  return {
    root,
    sky: null,
    colliders,
    cameraBlockers,
    floors,
    spawn,
    spawnYaw: -Math.PI / 2,
    spawnPitch: 0.28,
    entries: { gate: { pos: spawn.clone(), yaw: -Math.PI / 2, pitch: 0.28 } },
    // Walking back out of the entrance door returns to the castle gate.
    portals: [{ minX: -1, maxX: 1.2, minZ: -1.8, maxZ: 1.8, maxY: 1, to: 'bridge', entry: 'gate' }],
    lanternIntensity: 2.2,
    env: {
      fog: { color: 0x0e1020, density: 0.02 },
      hemi: { sky: 0x56628e, ground: 0x2a2228, intensity: 2.3 },
      dir: { dir: MOON.clone().negate(), color: 0x9fb2ff, intensity: 0.5, shadow: false },
    },
    update(dt, t, ctx) {
      flickerTorches(flames, t);
      for (const g of guards) g.update(dt, 0);
      crowd.update(dt, t, ctx?.player);
    },
  };
}

export default {
  id: 'crownkeep',
  title: 'Inside the Crownkeep',
  reference: 'interiors/01-gothic-hall-library.jpg, interiors/02-grand-staircase-dark.jpg',
  build: buildCrownkeep,
};
