import * as THREE from 'three';
import { BuildingSet, pickArchetype } from './buildings.js';
import { mulberry } from './kit.js';

// Town layout helpers built on BuildingSet (varied buildings).
//  - buildTown(): random scatter for distant skylines (no colliders needed).
//  - Streets + lotsAlongStreets(): walkable districts where houses line the streets.

const pickType = (rnd, churchChance, towerBias = 0) => {
  const r = rnd();
  if (r < churchChance) return 'church';
  if (r < churchChance + towerBias) return 'tower';
  return pickArchetype(rnd());
};

/** Scatter varied houses in a rectangle (skylines, distant districts). */
export function buildTown({ seed, count, bounds, groundY = () => 0, avoid = () => false, minW = 5, maxW = 9, litChance = 0.32, spireChance = 0.05, towerBias = 0.06, collide = false }) {
  const rnd = mulberry(seed);
  const set = new BuildingSet(seed + 1, { litChance, detail: 'low' }); // distant skyline: fewer details
  const [x0, x1, z0, z1] = bounds;
  const placed = [];
  let tries = 0;
  let made = 0;
  while (made < count && tries < count * 12) {
    tries++;
    const type = pickType(rnd, spireChance, towerBias);
    const big = type === 'church';
    const w = big ? 14 + rnd() * 4 : type === 'tower' ? 5 + rnd() * 1.5 : minW + rnd() * (maxW - minW);
    const d = big ? 18 + rnd() * 4 : type === 'tower' ? w : minW + rnd() * (maxW - minW);
    const x = x0 + rnd() * (x1 - x0);
    const z = z0 + rnd() * (z1 - z0);
    const r = Math.max(w, d) * 0.6;
    if (avoid(x, z, r)) continue;
    if (placed.some(([px, pz, pr]) => (px - x) ** 2 + (pz - z) ** 2 < (pr + r) ** 2)) continue;
    placed.push([x, z, r]);
    made++;
    set.add({ x, z, y: groundY(x, z), rot: (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.5, w, d, type, collide });
  }
  const built = set.build();
  return collide ? built : built.group;
}

// ---- Streets ---------------------------------------------------------------

/** A street: polyline of [x, z] points with a half-width. */
export function street(points, halfWidth) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) segs.push([points[i], points[i + 1]]);
  return { points, halfWidth, segs };
}

function distToSeg(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function distToStreet(px, pz, s) {
  let d = Infinity;
  for (const [a, b] of s.segs) d = Math.min(d, distToSeg(px, pz, a, b));
  return d;
}

// Oriented-rectangle overlap (separating axis test) for lots.
function corners(l, pad = 0) {
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  const hx = l.w / 2 + pad;
  const hz = l.d / 2 + pad;
  return [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ].map(([x, z]) => [l.x + x * c + z * s, l.z - x * s + z * c]);
}
function overlaps(a, b) {
  const A = corners(a, 0.1);
  const B = corners(b, 0.1);
  for (const poly of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % 4];
      const nx = z2 - z1;
      const nz = x1 - x2;
      const proj = (P) => P.map(([x, z]) => x * nx + z * nz);
      const pa = proj(A);
      const pb = proj(B);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

/**
 * Line both sides of each street with varied buildings facing it, then infill
 * the blocks behind. `blocked(x, z, r)` marks areas that must stay free
 * (river, squares, the bridge, outside the district...).
 */
export function lotsAlongStreets({ seed, streets, blocked = () => false, infillBounds = null, infillCount = 0, churchChance = 0.03, towerBias = 0.08 }) {
  const rnd = mulberry(seed);
  const lots = [];
  // Spatial hash so thousands of lots can be checked quickly.
  const GRID = 24;
  const grid = new Map();
  const cellsOf = (l) => {
    const r = Math.hypot(l.w, l.d) / 2 + 0.5;
    const out = [];
    for (let gx = Math.floor((l.x - r) / GRID); gx <= Math.floor((l.x + r) / GRID); gx++)
      for (let gz = Math.floor((l.z - r) / GRID); gz <= Math.floor((l.z + r) / GRID); gz++) out.push(gx * 7919 + gz);
    return out;
  };
  const neighbours = (l) => {
    const set = new Set();
    for (const k of cellsOf(l)) for (const o of grid.get(k) || []) set.add(o);
    return set;
  };
  // Only streets passing near a lot matter for it.
  const nearStreets = (l) => streets.filter((s) => distToStreet(l.x, l.z, s) < s.halfWidth + Math.hypot(l.w, l.d));
  const clearOfStreets = (lot) =>
    ((ns) => corners(lot).concat([[lot.x, lot.z]]).every(([cx, cz]) => ns.every((s) => distToStreet(cx, cz, s) > s.halfWidth + 0.3)))(nearStreets(lot));
  const tryLot = (lot) => {
    if (blocked(lot.x, lot.z, Math.max(lot.w, lot.d) * 0.55)) return false;
    if (corners(lot).some(([cx, cz]) => blocked(cx, cz, 0))) return false;
    if (!clearOfStreets(lot)) return false;
    for (const o of neighbours(lot)) if (overlaps(o, lot)) return false;
    lot.seed = 1 + lots.length * 31 + seed;
    lots.push(lot);
    for (const k of cellsOf(lot)) {
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(lot);
    }
    return true;
  };

  for (const s of streets) {
    for (const [[ax, az], [bx, bz]] of s.segs) {
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (const side of [-1, 1]) {
        const nx = -uz * side;
        const nz = ux * side;
        let t = rnd() * 2;
        while (t < len) {
          const type = pickType(rnd, churchChance, towerBias);
          const w = type === 'church' ? 14 : type === 'tower' ? 5.5 : 5.5 + rnd() * 4.5;
          const d = type === 'church' ? 20 : type === 'tower' ? 5.5 : 7 + rnd() * 5;
          const setback = s.halfWidth + d / 2 + 0.4 + rnd() * 0.5;
          const cx = ax + ux * (t + w / 2) + nx * setback;
          const cz = az + uz * (t + w / 2) + nz * setback;
          // Front (+z local) faces the street: rotate local +z onto -n.
          const rot = Math.atan2(-nx, -nz);
          const ok = tryLot({ x: cx, z: cz, w, d, rot, type });
          t += ok ? w + 0.05 : 2.5;
        }
      }
    }
  }
  if (infillBounds) {
    const [x0, x1, z0, z1] = infillBounds;
    for (let i = 0; i < infillCount; i++) {
      const w = 6 + rnd() * 5;
      const d = 6 + rnd() * 6;
      tryLot({ x: x0 + rnd() * (x1 - x0), z: z0 + rnd() * (z1 - z0), w, d, rot: rnd() * Math.PI, type: pickType(rnd, 0, towerBias) });
    }
  }
  return lots;
}

/** Build a list of lots into merged meshes + colliders. */
export function buildLots(lots, seed, opts = {}) {
  const set = new BuildingSet(seed, opts);
  for (const l of lots) set.add(l);
  return set.build();
}

// Flat street surface following a polyline (for paving strips).
export function streetGeometry(s, y = 0.02) {
  const pos = [];
  const uv = [];
  for (const [[ax, az], [bx, bz]] of s.segs) {
    const len = Math.hypot(bx - ax, bz - az);
    const nx = (-(bz - az) / len) * s.halfWidth;
    const nz = ((bx - ax) / len) * s.halfWidth;
    const quad = [
      [ax + nx, az + nz],
      [ax - nx, az - nz],
      [bx - nx, bz - nz],
      [bx + nx, bz + nz],
    ];
    for (const i of [0, 2, 1, 0, 3, 2]) {
      pos.push(quad[i][0], y, quad[i][1]);
      uv.push(quad[i][0] / 2, quad[i][1] / 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Scatter lots (for skylines) without streets: returns lots with seeds. */
export function scatterLots({ seed, count, bounds, avoid = () => false, minW = 5, maxW = 9, spireChance = 0.04, towerBias = 0.06 }) {
  const rnd = mulberry(seed);
  const [x0, x1, z0, z1] = bounds;
  const lots = [];
  const GRID = 30;
  const grid = new Map();
  const key = (x, z) => Math.floor(x / GRID) * 7919 + Math.floor(z / GRID);
  for (let tries = 0; tries < count * 6 && lots.length < count; tries++) {
    const type = pickType(rnd, spireChance, towerBias);
    const big = type === 'church';
    const w = big ? 14 + rnd() * 4 : type === 'tower' ? 5.5 : minW + rnd() * (maxW - minW);
    const d = big ? 18 + rnd() * 4 : type === 'tower' ? w : minW + rnd() * (maxW - minW);
    const x = x0 + rnd() * (x1 - x0);
    const z = z0 + rnd() * (z1 - z0);
    const r = Math.max(w, d) * 0.62;
    if (avoid(x, z, r)) continue;
    let clash = false;
    for (let gx = -1; gx <= 1 && !clash; gx++)
      for (let gz = -1; gz <= 1 && !clash; gz++)
        for (const o of grid.get(key(x + gx * GRID, z + gz * GRID)) || []) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) clash = true;
    if (clash) continue;
    const lot = { x, z, w, d, r, type, rot: (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.5, seed: 90001 + lots.length * 17 + seed };
    lots.push(lot);
    if (!grid.has(key(x, z))) grid.set(key(x, z), []);
    grid.get(key(x, z)).push(lot);
  }
  return lots;
}
