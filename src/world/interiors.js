import * as THREE from 'three';
import { tex, worldBoxUV, scaleUV } from '../retro/textures.js';
import { mergedMesh, mulberry, floorMat, lambert } from '../scenes/kit.js';
import { patchSceneMaterials, refreshSceneMaterials } from '../retro/retroMaterial.js';

// Enterable buildings. Every house records its front door (BuildingSet.doors);
// the scene exposes the ones near the player (`built.doorsNear(x, z)`). Walking
// into a door builds that building's interior on the spot (seeded by the lot,
// so it is the same room every time), hides the city while you are inside, and
// throws the room away again when you walk back out. Only one interior ever
// exists, and the city is not drawn while you are in it.
//
// Rooms are "believable empty rooms" from a small kit: floor, walls, a beamed
// ceiling, windows that show the time of day, and furniture by use (house,
// shop, tavern, chapel). Lighting follows the clock: daylight through the
// windows by day, hearth and candles at night.

const WALL_TINTS = [0xe8dcc0, 0xdcc8a8, 0xd8d0c0, 0xe0c8b0, 0xc8c0b0];
const CLOTH = [0x7a2e2a, 0x34506e, 0x3e6a44, 0x6a4a2a, 0x84386c, 0xb88a2a];

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const V = (map, o = {}) => new THREE.MeshLambertMaterial({ map, vertexColors: true, ...o });
  MATS = {
    floorWood: floorMat(tex.wood(), { color: 0x9a7a5a }),
    floorStone: floorMat(tex.flagstone(), { color: 0xa09890 }),
    wall: V(tex.plasterPlain()),
    timber: V(tex.plaster(1)),
    stone: V(tex.townStone()),
    wood: V(tex.wood()),
    dark: V(tex.darkStone()),
    cloth: V(tex.cloth ? tex.cloth() : null),
    plain: new THREE.MeshLambertMaterial({ vertexColors: true }),
    door: lambert(tex.door()),
    books: lambert(tex.books ? tex.books() : null),
    window: new THREE.MeshBasicMaterial({ color: 0x1c2840 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff8a30 }),
  };
  return MATS;
}

function tint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** The kind of room behind a door. */
export function interiorKind(door) {
  const t = door.type;
  if (t === 'church') return 'chapel';
  if (t === 'shop' || t === 'arcade') return 'shop';
  if (t === 'tavern') return 'tavern';
  const area = door.lot.w * door.lot.d;
  if ((t === 'hip' || t === 'long') && area > 70) return mulberry(door.lot.seed ?? 1)() < 0.5 ? 'tavern' : 'house';
  return 'house';
}

/**
 * Build the interior for a door. Returns { group, colliders, blockers, inside(x,z),
 * spawn, exit, lights, update(dt, t, dayK), dispose() } in world coordinates.
 */
export function buildInterior(door) {
  const M = mats();
  const lot = door.lot;
  const kind = interiorKind(door);
  const r = mulberry((lot.seed ?? 1) * 31 + 7);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const W = lot.w - 0.7; // inner width (x)
  const D = lot.d - 0.7; // inner depth (z, front = +z)
  const H = kind === 'chapel' ? 6 : kind === 'tavern' ? 3.6 : 3.2;
  const hx = W / 2;
  const hz = D / 2;
  const rot = lot.rot ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // World <-> lot-local.
  const toLocal = (x, z) => {
    const dx = x - lot.x;
    const dz = z - lot.z;
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  };
  const toWorld = (lx, lz) => [lot.x + lx * cos + lz * sin, lot.z - lx * sin + lz * cos];
  const [doorX] = toLocal(door.x, door.z);
  const dX = Math.max(-hx + 0.8, Math.min(hx - 0.8, doorX));

  const buckets = new Map();
  const put = (mat, g, color) => {
    if (color !== undefined || mat.vertexColors) tint(g, color ?? 0xffffff);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(g);
  };
  const colliders = []; // local boxes, converted below
  const box = (mat, w, h, d, x, y, z, color, { solid = false, tile = 1 } = {}) => {
    const g = worldBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile);
    g.translate(x, y, z);
    put(mat, g, color);
    if (solid) colliders.push({ x, z, hx: w / 2, hz: d / 2, h: y + h / 2 });
  };
  const quad = (mat, w, h, x, y, z, a, color) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(a);
    g.translate(x, y, z);
    put(mat, g, color);
  };
  // Keep the walk from the door into the room clear.
  const clearOfDoor = (x, z, rr) => !(Math.abs(x - dX) < 1.2 + rr && z > hz - 2.6 - rr);
  const fits = (x, z, sx, sz) => x - sx >= -hx + 0.05 && x + sx <= hx - 0.05 && z - sz >= -hz + 0.05 && z + sz <= hz - 0.05;

  // ---- Shell: floor, walls (facing in), beamed ceiling -----------------------
  const stoneFloor = kind === 'tavern' || kind === 'shop' || kind === 'chapel' || r() < 0.3;
  const floor = scaleUV(new THREE.PlaneGeometry(W, D), 1);
  floor.rotateX(-Math.PI / 2);
  const fuv = floor.attributes.uv;
  const fpos = floor.attributes.position;
  for (let i = 0; i < fpos.count; i++) fuv.setXY(i, fpos.getX(i) / 2, fpos.getZ(i) / 2);
  put(stoneFloor ? M.floorStone : M.floorWood, floor);
  const wallMat = kind === 'chapel' ? M.stone : r() < 0.35 ? M.timber : M.wall;
  const wallTint = kind === 'chapel' ? 0xc8c0b8 : pick(WALL_TINTS);
  const wall = (w, a, cx, cz) => {
    const g = new THREE.PlaneGeometry(w, H);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 3, (uv.getY(i) * H) / 3);
    g.rotateY(a);
    g.translate(cx, H / 2, cz);
    put(wallMat, g, wallTint);
  };
  wall(W, 0, 0, -hz); // back (faces +z, into the room)
  wall(D, Math.PI / 2, -hx, 0); // left
  wall(D, -Math.PI / 2, hx, 0); // right
  // Front wall, with the door opening (a closed door on its inside face).
  const dw = 1.2;
  const leftW = dX - dw / 2 + hx;
  const rightW = hx - (dX + dw / 2);
  if (leftW > 0.05) wall(leftW, Math.PI, -hx + leftW / 2, hz);
  if (rightW > 0.05) wall(rightW, Math.PI, hx - rightW / 2, hz);
  const lintel = new THREE.PlaneGeometry(dw, H - 2.2);
  lintel.rotateY(Math.PI);
  lintel.translate(dX, 2.2 + (H - 2.2) / 2, hz);
  put(wallMat, lintel, wallTint);
  quad(M.door, dw, 2.2, dX, 1.1, hz - 0.01, Math.PI);
  box(M.wood, dw + 0.3, 0.16, 0.12, dX, 2.28, hz - 0.06, 0xffffff);
  for (const sx of [-1, 1]) box(M.wood, 0.14, 2.3, 0.12, dX + sx * (dw / 2 + 0.07), 1.15, hz - 0.06, 0xffffff);
  // Ceiling and beams.
  const ceil = new THREE.PlaneGeometry(W, D);
  ceil.rotateX(Math.PI / 2);
  ceil.translate(0, H, 0);
  put(kind === 'chapel' ? M.stone : M.wood, ceil, kind === 'chapel' ? 0x8a8480 : 0x7a6a5a);
  if (kind !== 'chapel') for (let x = -hx + 0.9; x < hx; x += 1.6) box(M.wood, 0.22, 0.26, D, x, H - 0.13, 0, 0x6a5040);
  // Skirting.
  for (const [w, x, z, a] of [
    [W, 0, -hz + 0.04, 0],
    [D, -hx + 0.04, 0, 1],
    [D, hx - 0.04, 0, 1],
  ])
    box(M.wood, a ? 0.08 : w, 0.18, a ? w : 0.08, x, 0.09, z, 0x5a4232);

  // ---- Windows (they show the time of day) -------------------------------------
  const winY = kind === 'chapel' ? 3.2 : 1.7;
  const winH = kind === 'chapel' ? 2.6 : 1.0;
  for (const [a, span, off] of [
    [Math.PI / 2, D, -hx + 0.02],
    [-Math.PI / 2, D, hx - 0.02],
  ]) {
    const n = Math.max(1, Math.floor(span / 3));
    for (let i = 0; i < n; i++) {
      const u = -span / 2 + (span * (i + 0.5)) / n;
      if (r() < 0.25) continue;
      quad(M.window, 0.7, winH, off, winY, u, a);
      box(M.stone, 0.12, 0.08, 0.9, off + (a > 0 ? 0.06 : -0.06), winY - winH / 2 - 0.04, u, 0xd8d0c4);
    }
  }
  for (const x of [-hx * 0.5, hx * 0.5]) if (Math.abs(x - dX) > 1.4) quad(M.window, 0.7, winH, x, winY, hz - 0.02, Math.PI);

  // ---- Furniture by kind ---------------------------------------------------------
  const lights = [];
  const flames = [];
  const fire = (x, y, z, s = 1) => {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: false }));
    f.position.set(x, y + 0.25 * s, z);
    f.scale.set(0.45 * s, 0.7 * s, 1);
    flames.push({ s: f, base: s, phase: r() * 10 });
    return f;
  };
  const extra = [];
  const hearth = (x, z, a) => {
    // A stone fireplace against a wall (a = facing angle into the room).
    const g = new THREE.Group();
    const parts = [];
    parts.push(worldBoxUV(new THREE.BoxGeometry(2.0, 1.4, 0.7), 2.0, 1.4, 0.7, 1).translate(0, 0.7, 0));
    parts.push(worldBoxUV(new THREE.BoxGeometry(2.3, 0.2, 0.9), 2.3, 0.2, 0.9, 1).translate(0, 1.5, 0.05));
    parts.push(worldBoxUV(new THREE.BoxGeometry(1.2, H - 1.6, 0.6), 1.2, H - 1.6, 0.6, 1).translate(0, 1.6 + (H - 1.6) / 2, -0.05));
    for (const p of parts) {
      p.rotateY(a);
      p.translate(x, 0, z);
      put(M.stone, p, 0xb0a8a0);
    }
    const mouth = new THREE.PlaneGeometry(1.1, 0.8);
    mouth.rotateY(a);
    mouth.translate(x + Math.sin(a) * 0.36, 0.5, z + Math.cos(a) * 0.36);
    put(M.ember, mouth);
    g.add(fire(x + Math.sin(a) * 0.3, 0.1, z + Math.cos(a) * 0.3, 1.3));
    const l = new THREE.PointLight(0xff8a3a, 7, 14, 1.6);
    l.position.set(x + Math.sin(a) * 1.2, 1.0, z + Math.cos(a) * 1.2);
    lights.push({ l, base: 7, kind: 'fire' });
    g.add(l);
    extra.push(g);
    const [cx, cz] = [x + Math.sin(a) * 0.1, z + Math.cos(a) * 0.1];
    colliders.push({ x: cx, z: cz, hx: Math.abs(Math.cos(a)) * 1.15 + Math.abs(Math.sin(a)) * 0.45, hz: Math.abs(Math.sin(a)) * 1.15 + Math.abs(Math.cos(a)) * 0.45, h: H });
  };
  const candle = (x, y, z) => {
    box(M.plain, 0.08, 0.22, 0.08, x, y + 0.11, z, 0xe8e0c8);
    extra.push(fire(x, y + 0.16, z, 0.35));
  };
  const table = (x, z, w = 1.6, d = 0.9, stools = true) => {
    box(M.wood, w, 0.08, d, x, 0.78, z, 0xc8a080, { solid: true });
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      box(M.wood, 0.08, 0.74, 0.08, x + sx * (w / 2 - 0.1), 0.37, z + sz * (d / 2 - 0.1), 0x8a6a4a);
    if (stools)
      for (const sx of [-1, 1]) box(M.wood, w * 0.9, 0.06, 0.3, x, 0.46, z + sx * (d / 2 + 0.3), 0xa08060, { solid: false });
  };
  const shelf = (x, z, a, w = 1.8, books = false) => {
    const g = [];
    g.push(worldBoxUV(new THREE.BoxGeometry(w, 1.9, 0.35), w, 1.9, 0.35, 1).translate(0, 0.95, 0));
    for (const p of g) {
      p.rotateY(a);
      p.translate(x, 0, z);
      put(M.wood, p, 0x7a5a40);
    }
    for (let k = 0; k < 3; k++) {
      const f = new THREE.PlaneGeometry(w - 0.15, 0.4);
      f.rotateY(a);
      f.translate(x + Math.sin(a) * 0.18, 0.45 + k * 0.55, z + Math.cos(a) * 0.18);
      put(books ? M.books : M.plain, f, books ? undefined : pick([0x8a6a4a, 0x6a8a5a, 0x9a5a4a, 0x5a6a8a]));
    }
    colliders.push({ x, z, hx: Math.abs(Math.cos(a)) * (w / 2) + Math.abs(Math.sin(a)) * 0.2, hz: Math.abs(Math.sin(a)) * (w / 2) + Math.abs(Math.cos(a)) * 0.2, h: 2 });
  };
  const barrel = (x, z, s = 1) => {
    const g = new THREE.CylinderGeometry(0.32 * s, 0.32 * s, 0.85 * s, 8);
    g.translate(x, 0.425 * s, z);
    put(M.wood, scaleUV(g, 1), 0xa07850);
    for (const y of [0.18, 0.67]) box(M.dark, 0.66 * s, 0.05, 0.66 * s, x, y * s, z, 0x505050);
    colliders.push({ x, z, hx: 0.34 * s, hz: 0.34 * s, h: 0.9 * s });
  };
  const crate = (x, z, s = 0.7) => box(M.wood, s, s, s, x, s / 2, z, 0xb89060, { solid: true });
  const rug = (x, z, w, d) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.02, z);
    put(M.plain, g, pick(CLOTH));
  };

  if (kind === 'house') {
    // Bed in a back corner, the hearth on the opposite side wall.
    const bs = r() < 0.5 ? -1 : 1;
    hearth(-bs * (hx - 0.36), -hz * 0.3, bs < 0 ? -Math.PI / 2 : Math.PI / 2);
    const bx = bs * (hx - 0.6);
    if (fits(bx, -hz + 1.1, 0.5, 1.0)) {
      box(M.wood, 1.0, 0.35, 2.0, bx, 0.25, -hz + 1.1, 0x7a5a40, { solid: true });
      box(M.plain, 0.95, 0.12, 1.5, bx, 0.48, -hz + 1.35, pick(CLOTH));
      box(M.plain, 0.8, 0.12, 0.4, bx, 0.5, -hz + 0.35, 0xe8e0d0);
      box(M.wood, 1.0, 0.9, 0.08, bx, 0.45, -hz + 0.06, 0x6a4a30);
      if (fits(bx, -hz + 2.4, 0.5, 0.25)) box(M.wood, 0.9, 0.5, 0.45, bx, 0.25, -hz + 2.4, 0x8a6a4a, { solid: true }); // chest
    }
    if (W > 3.4 && D > 4) {
      table(0, -hz * 0.15, Math.min(1.6, W * 0.35), 0.85);
      candle(0.2, 0.82, -hz * 0.15);
      rug(0, -hz * 0.15, Math.min(2.6, W * 0.55), 1.8);
    }
    if (fits(-bs * (hx - 0.4), -hz + 0.2, 0.9, 0.2)) shelf(-bs * (hx - 1.1), -hz + 0.2, 0, 1.6, r() < 0.4);
  } else if (kind === 'shop') {
    // Counter across the back, shelves of goods behind it, crates and barrels.
    const cz = -hz + 1.6;
    box(M.wood, Math.min(W - 1.2, 3.6), 1.0, 0.6, 0, 0.5, cz, 0x9a7050, { solid: true });
    box(M.wood, Math.min(W - 1.0, 3.8), 0.08, 0.75, 0, 1.04, cz, 0xb89070);
    for (let x = -hx + 1.0; x <= hx - 1.0; x += 2.0) shelf(x, -hz + 0.2, 0, 1.8, r() < 0.3);
    candle(0.6, 1.08, cz);
    for (const sx of [-1, 1]) {
      const x = sx * (hx - 0.5);
      if (clearOfDoor(x, hz - 1.2, 0.4) && fits(x, hz - 1.2, 0.4, 0.4)) barrel(x, hz - 1.2);
      if (fits(x, 0, 0.4, 0.4)) crate(x, 0);
    }
    const l = new THREE.PointLight(0xffb060, 4, 10, 1.6);
    l.position.set(0, H - 0.6, 0);
    extra.push(l);
    lights.push({ l, base: 4, kind: 'lamp' });
    box(M.dark, 0.3, 0.3, 0.3, 0, H - 0.45, 0, 0xffffff);
  } else if (kind === 'tavern') {
    // Bar along one side with barrels behind, tables with benches, a hearth at the back.
    const bs = r() < 0.5 ? -1 : 1;
    const barX = bs * (hx - 1.4);
    box(M.wood, 0.6, 1.05, Math.min(D - 2.4, 4.4), barX, 0.52, -0.4, 0x8a6040, { solid: true });
    box(M.wood, 0.75, 0.08, Math.min(D - 2.2, 4.6), barX, 1.08, -0.4, 0xa87850);
    for (let z = -hz + 0.6; z < hz - 1.4; z += 0.8) if (fits(bs * (hx - 0.4), z, 0.35, 0.35)) barrel(bs * (hx - 0.4), z, 0.9);
    for (let k = 0; k < 4; k++) box(M.plain, 0.1, 0.16, 0.1, barX + (r() - 0.5) * 0.3, 1.2, -1.5 + k * 0.8, 0xc8b8a0); // mugs
    hearth(0, -hz + 0.36, 0);
    const tx = -bs * hx * 0.35;
    for (const tz of [-hz * 0.25, hz * 0.3]) if (clearOfDoor(tx, tz, 1.2) && fits(tx, tz, 0.9, 0.9)) {
      table(tx, tz, 1.6, 0.9);
      candle(tx, 0.82, tz);
    }
    const l = new THREE.PointLight(0xffa050, 4, 12, 1.6);
    l.position.set(0, H - 0.7, hz * 0.2);
    extra.push(l);
    lights.push({ l, base: 4, kind: 'lamp' });
  } else {
    // Chapel: pews in rows, an altar with candles at the back.
    box(M.stone, 2.2, 1.0, 0.9, 0, 0.5, -hz + 0.9, 0xd0c8c0, { solid: true });
    box(M.plain, 2.3, 0.04, 1.0, 0, 1.02, -hz + 0.9, 0xe8e0d0);
    for (const x of [-0.7, 0, 0.7]) candle(x, 1.04, -hz + 0.8);
    for (let z = -hz + 3; z < hz - 2.2; z += 1.3)
      for (const sx of [-1, 1]) {
        const x = sx * Math.min(hx - 1.2, 2.2);
        box(M.wood, Math.min(2.4, hx - 1.0), 0.45, 0.4, x, 0.45, z, 0x6a4a30, { solid: true });
        box(M.wood, Math.min(2.4, hx - 1.0), 0.6, 0.08, x, 0.85, z + 0.2, 0x5a3a28);
      }
    const l = new THREE.PointLight(0xffc080, 5, 16, 1.5);
    l.position.set(0, 2.2, -hz + 2);
    extra.push(l);
    lights.push({ l, base: 5, kind: 'lamp' });
  }

  // ---- Assemble in world space ----------------------------------------------------
  const group = new THREE.Group();
  group.name = 'interior';
  const inner = new THREE.Group();
  inner.position.set(lot.x, lot.y ?? 0, lot.z);
  inner.rotation.y = rot;
  group.add(inner);
  const blockers = [];
  for (const [mat, geos] of buckets) {
    const m = mergedMesh(geos, mat);
    inner.add(m);
    // Walls, stone and the closed door stop the third-person camera.
    if (mat === wallMat || mat === M.stone || mat === M.door) blockers.push(m);
  }
  for (const o of extra) inner.add(o);
  // Walls as colliders (thin boxes just outside the room) + furniture.
  const T = 0.3;
  const worldCols = [
    { x: 0, z: -hz - T / 2, hx: hx + T, hz: T / 2 },
    { x: -hx - T / 2, z: 0, hx: T / 2, hz: hz + T },
    { x: hx + T / 2, z: 0, hx: T / 2, hz: hz + T },
    { x: (-hx + dX - dw / 2) / 2, z: hz + T / 2, hx: Math.max(0.01, (dX - dw / 2 + hx) / 2), hz: T / 2 },
    { x: (hx + dX + dw / 2) / 2, z: hz + T / 2, hx: Math.max(0.01, (hx - dX - dw / 2) / 2), hz: T / 2 },
    { x: dX, z: hz + 0.12, hx: dw / 2 + 0.2, hz: 0.12 }, // the closed door itself (also stops the camera)
    ...colliders,
  ].map((c) => {
    const [wx, wz] = toWorld(c.x, c.z);
    return { cx: wx, cz: wz, hx: c.hx, hz: c.hz, rot, h: c.h };
  });
  const sp = toWorld(dX, hz - 1.0);
  const out = toWorld(door.x === undefined ? dX : doorX, lot.d / 2 + 1.4);
  group.updateMatrixWorld(true);
  return {
    kind,
    group,
    colliders: worldCols,
    blockers,
    // Inside the room (for keeping the player in, with a margin).
    inside: (x, z) => {
      const [lx, lz] = toLocal(x, z);
      return Math.abs(lx) < hx - 0.05 && Math.abs(lz) < hz - 0.05;
    },
    // Walking out through the door?
    atDoor: (x, z) => {
      const [lx, lz] = toLocal(x, z);
      return Math.abs(lx - dX) < dw / 2 + 0.25 && lz > hz - 0.75;
    },
    spawn: { pos: new THREE.Vector3(sp[0], lot.y ?? 0, sp[1]), yaw: rot },
    exit: { pos: new THREE.Vector3(out[0], 0, out[1]), yaw: rot + Math.PI },
    windows: M.window,
    lights,
    update(dt, t, dayK) {
      for (const f of flames) {
        const k = 0.85 + 0.15 * Math.sin(t * 11 + f.phase) + 0.07 * Math.sin(t * 23 + f.phase);
        f.s.scale.set(0.45 * f.base * (0.9 + 0.1 * k), 0.7 * f.base * k, 1);
      }
      for (const L of lights) {
        const flick = L.kind === 'fire' ? 0.85 + 0.15 * Math.sin(t * 7.1) : 1;
        // Hearths burn all day; lamps are mostly lit at night.
        L.l.intensity = L.base * flick * (L.kind === 'fire' ? 1 - dayK * 0.4 : 1 - dayK * 0.75);
      }
    },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.isSprite) o.material.dispose();
      });
    },
  };
}

/**
 * The enter/exit system. `ctx` gives the scene, controller, lights and the fade.
 */
export function createInteriors({ scene, controller, hemi, dirLight, fog, dayNight, fade, toast }) {
  let built = null; // the current scene's build
  let room = null; // { def, door, saved }
  let busy = false;
  let checkT = 0;
  const tmp = new THREE.Color();

  function enter(door) {
    busy = true;
    fade(() => {
      const def = buildInterior(door);
      patchSceneMaterials(def.group);
      refreshSceneMaterials(def.group);
      scene.add(def.group);
      built.root.visible = false;
      const saved = { colliders: controller.colliders, blockers: controller.blockers, floors: controller.floors, walkable: controller.walkable, ground: controller.ground };
      controller.colliders = def.colliders;
      controller.blockers = def.blockers;
      controller.floors = [];
      controller.walkable = def.inside;
      controller.ground = 0;
      controller.pos.copy(def.spawn.pos);
      controller.yaw = controller.facing = def.spawn.yaw;
      controller.pitch = 0.05;
      room = { def, door, saved };
      toast?.(def.kind === 'tavern' ? 'A tavern' : def.kind === 'shop' ? 'A shop' : def.kind === 'chapel' ? 'A chapel' : 'A house');
      busy = false;
    });
  }

  function leave(instant = false) {
    if (!room) return;
    const r = room;
    const go = () => {
      scene.remove(r.def.group);
      r.def.dispose();
      built.root.visible = true;
      Object.assign(controller, { blockers: r.saved.blockers, floors: r.saved.floors, walkable: r.saved.walkable, ground: r.saved.ground });
      controller.colliders = r.saved.colliders;
      if (!instant) {
        controller.pos.copy(r.def.exit.pos);
        controller.yaw = controller.facing = r.def.exit.yaw;
      }
      room = null;
      busy = false;
    };
    if (instant) go();
    else {
      busy = true;
      fade(go);
    }
  }

  return {
    get inside() {
      return !!room;
    },
    get room() {
      return room;
    },
    /** Drop the room without restoring anything (a new scene is being loaded). */
    reset() {
      if (!room) return;
      scene.remove(room.def.group);
      room.def.dispose();
      room = null;
      busy = false;
    },
    /** A new scene was loaded. */
    attach(b) {
      built = b;
    },
    enterDoor: (door) => enter(door),
    update(dt, t) {
      if (!built || busy) return;
      const p = controller.pos;
      if (room) {
        // Lighting inside follows the clock: daylight through the windows by day.
        const dayK = dayNight.state.dayK;
        hemi.color.set(0x6a5444).lerp(tmp.set(0xc8c0b0), dayK);
        hemi.groundColor.set(0x2a2018).lerp(tmp.set(0x5a4c3c), dayK);
        hemi.intensity = 0.9 + 0.9 * dayK;
        dirLight.intensity = 0; // (castShadow left alone: toggling it recompiles materials)
        fog.color.set(0x0a0806);
        room.def.windows.color.set(0x1a2440).lerp(tmp.set(0xc8d8ec), dayK);
        room.def.update(dt, t, dayK);
        if (controller.speed > 0.4 && room.def.atDoor(p.x, p.z)) {
          const fx = -Math.sin(controller.facing);
          const fz = -Math.cos(controller.facing);
          const nx = Math.sin(room.door.rot);
          const nz = Math.cos(room.door.rot);
          if (fx * nx + fz * nz > 0.3) leave();
        }
        return;
      }
      checkT -= dt;
      if (checkT > 0 || !built.doorsNear || controller.speed < 0.4 || controller.carried) return;
      checkT = 0.1;
      const fx = -Math.sin(controller.facing);
      const fz = -Math.cos(controller.facing);
      for (const d of built.doorsNear(p.x, p.z, 12)) {
        const nx = Math.sin(d.rot);
        const nz = Math.cos(d.rot);
        const rx = p.x - d.x;
        const rz = p.z - d.z;
        const dist = rx * nx + rz * nz; // in front of the door (outside) > 0
        const u = rx * nz - rz * nx; // along the facade
        if (dist > -0.2 && dist < 0.95 && Math.abs(u) < d.w / 2 + 0.3 && fx * -nx + fz * -nz > 0.55) {
          enter(d);
          return;
        }
      }
    },
  };
}
