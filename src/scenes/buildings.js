import * as THREE from 'three';
import { tex, worldBoxUV, scaleUV } from '../retro/textures.js';
import { mergedMesh, mulberry } from './kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { packAtlas, atlasMaterial, setTile } from '../retro/atlas.js';

// Varied medieval buildings. Every building is a different combination of:
// archetype (gabled townhouse, stepped gable, long house with dormers, jettied
// timber house, hip-roofed merchant house, tower house, shop with awning,
// church), size, pastel plaster colour, roof material/tint, chimneys, doors and
// lit windows. All geometry is merged per material, with per-building colour
// carried in vertex colours, so a whole district is a dozen draw calls.

const PLASTER = [0xe6c88c, 0xece0c4, 0xdcaaa0, 0xbcc8a6, 0xaab8c8, 0xf2eee2, 0xe4aa8a, 0xecd48c, 0xccbcdc, 0xd8c0a8];
const TIMBER = [0xffffff, 0xf2e2c8, 0xe6dcd6, 0xe8d0b8];
const ROOF = [0xffffff, 0xd8a490, 0xb48a7a, 0xe8bca4, 0x9a7a72];
const SLATE = [0xffffff, 0xb8c0d0, 0x9aa0b0];
const AWNING = [0xb43a32, 0x3a7038, 0x384c94, 0xb88a2a, 0x84386c];
const STONE = [0xffffff, 0xe0d8cc, 0xc8c4c8];
const SHUTTER = [0x3e6a44, 0x7a2e2a, 0x34506e, 0x6a4a2a, 0x4a4a3a, 0x8a6a2a];
const TRIM = [0xffffff, 0xe8e0d0, 0xd8ccb8];

let MATS = null;
function materials() {
  if (MATS) return MATS;
  const L = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra });
  MATS = {
    plaster: L(tex.plasterPlain()),
    timber: L(tex.plaster(0)),
    timber2: L(tex.plaster(1)),
    timber3: L(tex.plaster(2)),
    stone: L(tex.townStone()),
    trim: L(tex.townStone()),
    dark: L(tex.darkStone()),
    roof: L(tex.roofTile()),
    slate: L(tex.slate()),
    wood: L(tex.wood()),
    shutter: L(tex.wood()),
    flowers: L(tex.flowerBox()),
    cloth: L(tex.awning(), { side: THREE.DoubleSide }),
    door: new THREE.MeshLambertMaterial({ map: tex.door() }),
    lit: new THREE.MeshBasicMaterial({ map: tex.litWindow() }),
    unlit: new THREE.MeshBasicMaterial({ map: tex.windowDark() }),
  };
  // One atlas for every opaque building texture: a chunk of houses then needs
  // only a wall mesh, a detail mesh, awnings and the two window meshes.
  const texFor = {
    plaster: tex.plasterPlain(),
    timber: tex.plaster(0),
    timber2: tex.plaster(1),
    timber3: tex.plaster(2),
    stone: tex.townStone(),
    trim: tex.townStone(),
    dark: tex.darkStone(),
    roof: tex.roofTile(),
    slate: tex.slate(),
    wood: tex.wood(),
    shutter: tex.wood(),
    flowers: tex.flowerBox(),
    door: tex.door(),
  };
  const atlas = packAtlas(Object.values(texFor));
  MATS.atlas = atlasMaterial(atlas.texture);
  MATS.tileOf = Object.fromEntries(Object.entries(texFor).map(([k, t]) => [k, atlas.rect(t)]));
  return MATS;
}

const WALL_KEYS = ['plaster', 'timber', 'timber2', 'timber3', 'stone'];

/** The shared lit-window material (the day/night cycle dims it by day). */
export function buildingMaterials() {
  return materials();
}

// Merge geometries keeping the atlas attributes.
function mergeKeep(geos, material) {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'tile'].includes(name)) g.deleteAttribute(name);
  const mesh = new THREE.Mesh(mergeGeometries(flat, false), material);
  mesh.receiveShadow = true;
  return mesh;
}

// Per-building colour, stored as vertex colours so merged meshes keep it.
function tint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Roof prism (gable ends at both ends). Ridge along local X if !alongZ.
function gableGeo(len, width, rise, alongZ, overhang = 0.35) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2 - overhang, 0);
  s.lineTo(width / 2 + overhang, 0);
  s.lineTo(0, rise);
  s.lineTo(-width / 2 - overhang, 0);
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: len + overhang * 2, bevelEnabled: false }), 0.5);
  g.translate(0, 0, -(len + overhang * 2) / 2);
  if (!alongZ) g.rotateY(Math.PI / 2);
  return g;
}

// Hip roof over a w × d footprint (ridge along the longer side).
function hipGeo(w, d, rise, overhang = 0.35) {
  const swap = d > w;
  const W = (swap ? d : w) / 2 + overhang;
  const D = (swap ? w : d) / 2 + overhang;
  const rx = Math.max(0.01, W - D);
  const A = [-W, 0, -D];
  const B = [W, 0, -D];
  const C = [W, 0, D];
  const E = [-W, 0, D];
  const R1 = [-rx, rise, 0];
  const R2 = [rx, rise, 0];
  const tris = [E, C, R2, E, R2, R1, B, A, R1, B, R1, R2, A, E, R1, C, B, R2];
  const pos = [];
  const uv = [];
  for (const [x, y, z] of tris) {
    pos.push(x, y, z);
    uv.push((x + z) / 2, (y + Math.abs(z)) / 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (swap) g.rotateY(Math.PI / 2);
  return g;
}

function pyramidGeo(w, d, rise) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w + 0.5, rise, d + 0.5);
  g.translate(0, rise / 2, 0);
  return scaleUV(g, 3);
}

// Mansard: steep lower slopes from the eaves up to an inset ring (the flatter
// top is a separate shallow hip). Footprint w x d, height `steep`.
function mansardGeo(w, d, steep, inset, overhang = 0.25) {
  const W = w / 2 + overhang;
  const D = d / 2 + overhang;
  const w2 = w / 2 - inset;
  const d2 = d / 2 - inset;
  const lo = [[-W, -D], [W, -D], [W, D], [-W, D]];
  const hi = [[-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]];
  const pos = [];
  const uv = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const a = [lo[i][0], 0, lo[i][1]];
    const b = [lo[j][0], 0, lo[j][1]];
    const c = [hi[j][0], steep, hi[j][1]];
    const e = [hi[i][0], steep, hi[i][1]];
    const along = i % 2 === 0 ? 0 : 2; // u along the edge
    for (const p of [a, c, b, a, e, c]) {
      pos.push(...p);
      uv.push((along === 0 ? p[0] : p[2]) / 2, p[1] / 1.6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// A box with its two front (+z) corners cut at 45 degrees, walls UV'd 3 m per tile.
function chamferGeo(w, h, d, cut) {
  const W = w / 2;
  const D = d / 2;
  const ring = [[-W, -D], [W, -D], [W, D - cut], [W - cut, D], [-W + cut, D], [-W, D - cut]];
  const pos = [];
  const uv = [];
  let run = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    // Outward-facing wall quad (ring is clockwise seen from above with +z down).
    const q = [[x0, 0, z0, run], [x1, 0, z1, run + len], [x1, h, z1, run + len], [x0, h, z0, run]];
    for (const k of [0, 2, 1, 0, 3, 2]) {
      pos.push(q[k][0], q[k][1], q[k][2]);
      uv.push(q[k][3] / 3, q[k][1] / 3);
    }
    run += len;
  }
  // Flat top cap (hidden under the roof, closes the box).
  for (let i = 1; i < ring.length - 1; i++)
    for (const k of [0, i + 1, i]) {
      pos.push(ring[k][0], h, ring[k][1]);
      uv.push(ring[k][0] / 3, ring[k][1] / 3);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * The modular house kit's knobs. Weights are relative; add a body or roof by
 * adding a case in BuildingSet.addKit and a weight here.
 */
export const KIT = {
  bodies: { box: 4, L: 2, chamfer: 1.2, jetty: 2, tower: 0.5 },
  roofs: { gable: 4, hip: 2, mansard: 1.4, shed: 0.8, stepped: 1.2 },
  height: [6, 12.5], // metres to the eaves
  addons: { dormer: 0.45, bay: 0.25, balcony: 0.2, chimney: 0.65, chimney2: 0.25, extStair: 0.3, shop: 0.12, sign: 0.12 },
  palettes: {
    default: { walls: PLASTER, stone: 0.12 },
    merchant: { walls: [0xe6c88c, 0xecd48c, 0xf2eee2, 0xdcaaa0, 0xe4aa8a, 0xccbcdc], stone: 0.2 },
    castle: { walls: [0xd8d0c4, 0xc8c0b4, 0xe0d8cc, 0xbcc8a6], stone: 0.45 },
  },
};

export const ARCHETYPES = ['gable', 'stepped', 'long', 'jetty', 'hip', 'tower', 'shop', 'arcade', 'turret', 'baroque', 'kit'];

// Weighted archetype choice: most houses come from the kit; the hand-made
// archetypes stay in the mix for their special silhouettes.
export const ARCHETYPE_WEIGHTS = { kit: 9, gable: 1, stepped: 1, long: 1, jetty: 0.6, hip: 1, tower: 0.5, shop: 1, arcade: 0.6, turret: 0.6, baroque: 0.6 };
export function pickArchetype(u) {
  let sum = 0;
  for (const v of Object.values(ARCHETYPE_WEIGHTS)) sum += v;
  let x = u * sum;
  for (const [k, v] of Object.entries(ARCHETYPE_WEIGHTS)) if ((x -= v) < 0) return k;
  return 'kit';
}

export class BuildingSet {
  /** detail: 'high' (walkable streets) or 'low' (distant skylines). */
  constructor(seed = 1, { litChance = 0.32, detail = 'high' } = {}) {
    this.rnd = mulberry(seed);
    this.litChance = litChance;
    this.high = detail === 'high';
    this.min = detail === 'min'; // far LOD: shells, roofs and lit windows only
    this.buckets = {};
    this.colliders = [];
    this.doors = []; // world-space front doors: { x, z, rot, w, lot }
  }

  pick(list) {
    return list[Math.floor(this.rnd() * list.length)];
  }

  /**
   * Add one building. Local frame: footprint w (x) x d (z), street-facing front at +z.
   * @param {{x:number,z:number,y?:number,rot?:number,w:number,d:number,type?:string,collide?:boolean}} lot
   */
  add(lot) {
    // Per-lot random streams, so near and far versions of a house match:
    // `r` decides shape and colour, `rd` decides the small details.
    const r = lot.seed !== undefined ? mulberry(lot.seed) : this.rnd;
    const rd = lot.seed !== undefined ? mulberry(lot.seed * 7 + 13) : this.rnd;
    const pick = (list) => list[Math.floor(r() * list.length)];
    const hi = this.high;
    const minimal = this.min;
    const { x, z, w, d } = lot;
    const y = lot.y ?? 0;
    const rot = lot.rot ?? 0;
    const type = lot.type || pick(ARCHETYPES);
    const M = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
    // Far LOD: collapse everything into four materials (walls, stone, roofs, lights).
    const MIN_KEY = { plaster: 'plaster', timber: 'plaster', timber2: 'plaster', timber3: 'plaster', roof: 'roof', slate: 'roof', lit: 'lit' };
    const put = (key, geo, color) => {
      if (this.min) {
        key = MIN_KEY[key] || 'stone';
        if (key !== 'lit' && color === undefined) color = key === 'stone' ? 0x6a5a4a : 0xffffff;
        if (key === 'roof' && color !== undefined && !geo.userData.slate) color = color;
      }
      if (color !== undefined) tint(geo, color);
      geo.applyMatrix4(M);
      (this.buckets[key] ||= []).push(geo);
    };
    const box = (key, bw, bh, bd, bx, by, bz, color, tile = 2) => {
      const g = worldBoxUV(new THREE.BoxGeometry(bw, bh, bd), bw, bh, bd, tile);
      g.translate(bx, by, bz);
      put(key, g, color);
    };
    // A box rotated to sit on face `a` (0 = front +z, PI = back, +-PI/2 = sides):
    // u = along the face, off = distance of its centre from the building centre.
    const faceBox = (key, bw, bh, bd, a, u, off, by, color, tile = 1, cx = 0, cz = 0) => {
      const g = worldBoxUV(new THREE.BoxGeometry(bw, bh, bd), bw, bh, bd, tile);
      g.rotateY(a);
      g.translate(cx + Math.sin(a) * off + Math.cos(a) * u, by, cz + Math.cos(a) * off - Math.sin(a) * u);
      put(key, g, color);
    };
    const quad = (key, qw, qh, qx, qy, qz, a) => {
      const g = new THREE.PlaneGeometry(qw, qh);
      g.rotateY(a);
      g.translate(qx, qy, qz);
      put(key, g);
    };
    const shutterTint = pick(SHUTTER);
    const trimTint = pick(TRIM);
    const shutters = rd() < 0.55 && hi;
    const boxes = rd() < 0.3 && hi;

    // Windows on the four faces, one row per storey, with stone sills and
    // lintels, painted shutters (some open, some closed) and flower boxes.
    const windows = (bw, bd, y0, h, { lit = this.litChance, ww = 0.62, wh = 0.95, skipGroundFront = false, trim = true, cx = 0, cz = 0, skipFaces = [] } = {}) => {
      const floors = Math.max(1, Math.floor((h - 0.6) / 3));
      const faces = [
        [0, bd / 2, bw],
        [Math.PI, bd / 2, bw],
        [Math.PI / 2, bw / 2, bd],
        [-Math.PI / 2, bw / 2, bd],
      ];
      for (const [a, off, span] of faces) {
        if (skipFaces.includes(a)) continue;
        const n = Math.max(1, Math.floor(span / 2.1));
        for (let f = 0; f < floors; f++) {
          if (skipGroundFront && f === 0 && a === 0) continue;
          for (let i = 0; i < n; i++) {
            if (rd() < 0.2) continue;
            const u = -span / 2 + (span / n) * (i + 0.5);
            const wy = y0 + 1.7 + f * 3;
            const closed = rd() < 0.2 && shutters;
            const isLit = rd() < lit;
            const flower = rd() < 0.5;
            if (!closed && (isLit || !minimal)) quad(isLit ? 'lit' : 'unlit', ww, wh, cx + Math.sin(a) * (off + 0.03) + Math.cos(a) * u, wy, cz + Math.cos(a) * (off + 0.03) - Math.sin(a) * u, a);
            if (minimal) continue;
            const fb = (key, bw2, bh2, bd2, uu, oo, yy, col) => faceBox(key, bw2, bh2, bd2, a, uu, oo, yy, col, 1, cx, cz);
            if (!hi) {
              fb('trim', ww + 0.2, 0.1, 0.16, u, off + 0.06, wy - wh / 2 - 0.05, trimTint);
              continue;
            }
            if (trim) {
              fb('trim', ww + 0.24, 0.12, 0.2, u, off + 0.08, wy - wh / 2 - 0.06, trimTint); // sill
              fb('trim', ww + 0.2, 0.14, 0.1, u, off + 0.04, wy + wh / 2 + 0.07, trimTint); // lintel
              fb('trim', 0.08, wh, 0.08, u - ww / 2 - 0.04, off + 0.03, wy, trimTint); // jambs
              fb('trim', 0.08, wh, 0.08, u + ww / 2 + 0.04, off + 0.03, wy, trimTint);
            }
            if (shutters) {
              if (closed) fb('shutter', ww + 0.04, wh, 0.05, u, off + 0.05, wy, shutterTint);
              else for (const sd of [-1, 1]) fb('shutter', ww / 2, wh, 0.04, u + sd * (ww * 0.75 + 0.1), off + 0.04, wy, shutterTint);
            }
            if (boxes && f > 0 && flower) {
              fb('wood', ww + 0.1, 0.18, 0.22, u, off + 0.18, wy - wh / 2 - 0.2, 0xffffff);
              fb('flowers', ww, 0.12, 0.2, u, off + 0.2, wy - wh / 2 - 0.05, 0xffffff);
            }
          }
        }
      }
    };
    // The front door (recorded in world space so buildings can be entered).
    let doorLocal = null;
    const markDoor = (dx, dz, dw) => {
      if (!doorLocal) doorLocal = { x: dx, z: dz, w: dw };
    };
    const door = (bw, bd, wide = false, cx = 0, cz = 0) => {
      const dw = wide ? 1.8 : 1.1;
      const dx = cx + (r() - 0.5) * (bw - 2.6);
      const fz = cz + bd / 2;
      quad('door', dw, 2.1, dx, 1.05, fz + 0.04, 0);
      box('dark', dw + 0.3, 0.22, 0.18, dx, 2.2, fz + 0.06, 0xffffff, 1);
      if (hi) {
        box('trim', 0.18, 2.3, 0.16, dx - dw / 2 - 0.09, 1.15, fz + 0.05, trimTint, 1); // jambs
        box('trim', 0.18, 2.3, 0.16, dx + dw / 2 + 0.09, 1.15, fz + 0.05, trimTint, 1);
        box('trim', dw + 0.6, 0.16, 0.5, dx, 0.08, fz + 0.25, trimTint, 1); // step
        if (rd() < 0.3) {
          // A small lantern beside the door.
          box('dark', 0.05, 0.05, 0.3, dx + dw / 2 + 0.45, 2.45, fz + 0.15, 0xffffff, 1);
          box('lit', 0.18, 0.26, 0.18, dx + dw / 2 + 0.45, 2.25, fz + 0.3);
        }
      }
      markDoor(dx, fz, dw);
      return dx;
    };
    const chimney = (cx, cy, cz) => {
      box('dark', 0.6, 1.8, 0.6, cx, cy, cz, pick(STONE), 1);
      if (hi) box('trim', 0.75, 0.15, 0.75, cx, cy + 0.95, cz, 0xb0a8a0, 1);
      if (hi) {
        const pot = new THREE.CylinderGeometry(0.12, 0.15, 0.45, 6);
        pot.translate(cx, cy + 1.25, cz);
        put('roof', pot, 0xc08070);
      }
    };
    // Stone plinth (base course) and front corner quoins.
    const plinth = (bw, bd, hh = 0.55) => box('trim', bw + 0.16, hh, bd + 0.16, 0, hh / 2, 0, trimTint, 1);
    const quoins = (bw, bd, h) => {
      if (rd() > 0.4 || !hi) return;
      for (const sx of [-1, 1]) {
        for (let yy = 0.6, k = 0; yy < h - 0.3; yy += 0.55, k++) {
          const long = k % 2 === 0;
          box('trim', long ? 0.55 : 0.32, 0.5, 0.1, sx * (bw / 2 - (long ? 0.27 : 0.16)), yy + 0.25, bd / 2 + 0.05, trimTint, 1);
          box('trim', 0.1, 0.5, long ? 0.32 : 0.55, sx * (bw / 2 + 0.05), yy + 0.25, bd / 2 - (long ? 0.16 : 0.27), trimTint, 1);
        }
      }
    };
    const stringCourses = (bw, bd, h) => {
      if (rd() > 0.45 || !hi) return;
      for (let yy = 3; yy < h - 1; yy += 3) box('trim', bw + 0.14, 0.14, bd + 0.14, 0, yy, 0, trimTint, 1);
    };
    const ridge = (len, alongZ, top) => {
      if (!hi) return;
      if (alongZ) box('dark', 0.24, 0.18, len + 0.7, 0, top + 0.05, 0, 0x8a7a70, 1);
      else box('dark', len + 0.7, 0.18, 0.24, 0, top + 0.05, 0, 0x8a7a70, 1);
    };
    // A projecting bay (oriel) window on the upper floor, with its own little roof.
    const oriel = (bw, bd, yb) => {
      if (rd() > 0.2 || !hi || bw < 6) return;
      const ow = 1.9;
      const od = 0.75;
      box('plaster', ow, 2.2, od, 0, yb + 1.1, bd / 2 + od / 2, pick(PLASTER));
      const cor = new THREE.ConeGeometry(0.75, 0.9, 4, 1);
      cor.rotateY(Math.PI / 4);
      cor.rotateX(Math.PI);
      cor.scale(1.25, 1, 0.5);
      cor.translate(0, yb - 0.45, bd / 2 + od / 2);
      put('trim', cor, trimTint);
      const rf = pyramidGeo(ow - 0.4, od, 0.8);
      rf.translate(0, yb + 2.2, bd / 2 + od / 2);
      put('slate', rf, pick(SLATE));
      quad(rd() < this.litChance + 0.15 ? 'lit' : 'unlit', 0.7, 1.1, 0, yb + 1.1, bd / 2 + od + 0.02, 0);
      for (const sd of [-1, 1]) quad(rd() < this.litChance ? 'lit' : 'unlit', 0.4, 1.0, sd * (ow / 2 + 0.02), yb + 1.1, bd / 2 + od / 2, sd * Math.PI / 2);
    };
    // A wooden balcony on the first floor.
    const balcony = (bw, bd, yb) => {
      if (rd() > 0.18 || !hi || bw < 6) return;
      const bwid = Math.min(3.2, bw * 0.5);
      box('wood', bwid, 0.15, 0.8, 0, yb, bd / 2 + 0.4, 0xffffff, 1);
      box('wood', bwid, 0.08, 0.08, 0, yb + 0.95, bd / 2 + 0.78, 0xffffff, 1);
      for (let k = 0; k <= 6; k++) box('wood', 0.06, 0.9, 0.06, -bwid / 2 + (bwid * k) / 6, yb + 0.5, bd / 2 + 0.78, 0xffffff, 1);
      for (const sd of [-1, 1]) {
        const br = new THREE.BoxGeometry(0.1, 0.1, 1.0);
        br.rotateX(0.7);
        br.translate(sd * (bwid / 2 - 0.2), yb - 0.35, bd / 2 + 0.35);
        put('wood', br, 0xffffff);
      }
    };
    const wallKind = (base) => {
      if (base !== 'plaster' || r() > 0.38) return base;
      return pick(['timber', 'timber2', 'timber3']);
    };
    const roofKey = r() < 0.72 ? 'roof' : 'slate';
    const roofTint = roofKey === 'roof' ? pick(ROOF) : pick(SLATE);
    const wall = pick(PLASTER);

    let h = 0;
    let kitInfo = null;
    switch (type) {
      case 'kit': {
        kitInfo = this.addKit({ lot, r, rd, pick, hi, minimal, box, put, quad, faceBox, windows, door, chimney, plinth, quoins, stringCourses, ridge, oriel, balcony, wallKind, roofKey, roofTint, trimTint, markDoor });
        h = kitInfo.height;
        break;
      }
      case 'gable':
      case 'stepped': {
        h = 6.5 + r() * 5;
        const wk = type === 'stepped' ? 'plaster' : wallKind('plaster');
        const timber = wk !== 'plaster';
        box(wk, w, h, d, 0, h / 2, 0, timber ? pick(TIMBER) : wall, 3);
        plinth(w, d, timber ? 0.9 : 0.55);
        if (!timber) quoins(w, d, h);
        if (!timber) stringCourses(w, d, h);
        const rise = w * (0.55 + r() * 0.25);
        put(roofKey, gableGeo(d, w, rise, true).translate(0, h, 0), roofTint);
        ridge(d, true, h + rise);
        if (type === 'stepped') {
          // Stepped (crow-stepped) gable rising above the front eaves, with coping stones.
          const steps = 3 + Math.floor(r() * 2);
          for (let i = 0; i < steps; i++) {
            const sw = w * (1 - (i + 1) / (steps + 1.2));
            box('plaster', sw, rise / steps + 0.15, 0.45, 0, h + (rise / steps) * (i + 0.5), d / 2 - 0.2, wall);
            if (hi) box('trim', sw + 0.12, 0.12, 0.55, 0, h + (rise / steps) * (i + 1) + 0.12, d / 2 - 0.2, trimTint, 1);
          }
          box('dark', w + 0.2, 0.25, 0.5, 0, h + 0.1, d / 2 - 0.15, 0xffffff, 1);
        }
        quad(r() < this.litChance ? 'lit' : 'unlit', 0.6, 0.9, 0, h + rise * 0.3, d / 2 + 0.25, 0);
        windows(w, d, 0, h, { skipGroundFront: true, trim: !timber });
        door(w, d);
        oriel(w, d, 3.4);
        if (r() < 0.6) chimney(w * 0.25, h + rise * 0.55, -d * 0.2);
        break;
      }
      case 'long': {
        h = 5.5 + r() * 3.5;
        const wk = wallKind('plaster');
        const timber = wk !== 'plaster';
        box(wk, w, h, d, 0, h / 2, 0, timber ? pick(TIMBER) : wall, 3);
        plinth(w, d, timber ? 0.9 : 0.55);
        if (!timber) quoins(w, d, h);
        const rise = d * (0.42 + r() * 0.15);
        put(roofKey, gableGeo(w, d, rise, false).translate(0, h, 0), roofTint);
        ridge(w, false, h + rise);
        const dormers = w > 8 ? 2 : 1;
        for (let i = 0; i < dormers; i++) {
          const dx = dormers === 1 ? 0 : (i - 0.5) * w * 0.5;
          const dz = d / 4;
          const dy = h + rise * 0.3;
          box('plaster', 1.4, 1.4, 1.6, dx, dy + 0.3, dz, wall);
          const dg = gableGeo(1.6, 1.4, 0.9, true, 0.15);
          dg.translate(dx, dy + 1.0, dz);
          put(roofKey, dg, roofTint);
          quad(r() < this.litChance ? 'lit' : 'unlit', 0.55, 0.8, dx, dy + 0.35, dz + 0.82, 0);
        }
        windows(w, d, 0, h, { skipGroundFront: true, trim: !timber });
        const dx = door(w, d);
        if (Math.abs(dx) > 1.6) balcony(w, d, 3.0);
        else oriel(w, d, 3.4);
        if (r() < 0.7) chimney(-w * 0.3, h + rise * 0.6, -d * 0.1);
        break;
      }
      case 'jetty': {
        const g1 = 3.2;
        const g2 = 3 + r() * 3.5;
        h = g1 + g2;
        const stoneGround = r() < 0.5;
        box(stoneGround ? 'stone' : 'plaster', w, g1, d, 0, g1 / 2, 0, stoneGround ? pick(STONE) : wall, 3);
        // Upper floors overhang the street (jettied), half-timbered, on carved brackets.
        box(pick(['timber', 'timber2', 'timber3']), w + 0.5, g2, d + 0.7, 0, g1 + g2 / 2, 0.25, pick(TIMBER), 3);
        box('wood', w + 0.6, 0.25, d + 0.8, 0, g1, 0.25, 0xffffff, 1);
        if (hi) {
          for (let bx = -w / 2 + 0.4; bx <= w / 2 - 0.3; bx += 1.1) {
            const br = new THREE.BoxGeometry(0.14, 0.14, 0.75);
            br.rotateX(0.75);
            br.translate(bx, g1 - 0.3, d / 2 + 0.22);
            put('wood', br, 0xffffff);
          }
        }
        const alongZ = r() < 0.5;
        const rise = (alongZ ? w : d) * (0.6 + r() * 0.2);
        const roof = alongZ ? gableGeo(d + 0.7, w + 0.5, rise, true) : gableGeo(w + 0.5, d + 0.7, rise, false);
        roof.translate(0, h, 0.25);
        put(roofKey, roof, roofTint);
        if (hi) {
          if (alongZ) box('dark', 0.24, 0.18, d + 1.4, 0, h + rise + 0.05, 0.25, 0x8a7a70, 1);
          else box('dark', w + 1.2, 0.18, 0.24, 0, h + rise + 0.05, 0.25, 0x8a7a70, 1);
        }
        windows(w + 0.5, d + 0.7, g1, g2, { trim: false });
        windows(w, d, 0, g1, { skipGroundFront: true, trim: stoneGround });
        door(w, d);
        if (r() < 0.6) chimney(w * 0.3, h + rise * 0.5, 0);
        break;
      }
      case 'hip': {
        h = 7 + r() * 4;
        const stoneBase = r() < 0.5;
        box(stoneBase ? 'stone' : 'plaster', w, h, d, 0, h / 2, 0, stoneBase ? pick(STONE) : wall, 3);
        plinth(w, d);
        if (!stoneBase) {
          quoins(w, d, h);
          stringCourses(w, d, h);
        }
        box('dark', w + 0.3, 0.35, d + 0.3, 0, h, 0, 0xffffff, 1);
        const hg = hipGeo(w, d, Math.min(w, d) * 0.5);
        hg.translate(0, h + 0.15, 0);
        put(roofKey, hg, roofTint);
        windows(w, d, 0, h, { skipGroundFront: true });
        door(w, d, true);
        balcony(w, d, 3.0);
        chimney(-w * 0.3, h + 1.2, 0);
        chimney(w * 0.3, h + 1.2, 0);
        break;
      }
      case 'tower': {
        h = 12 + r() * 7;
        box('stone', w, h, d, 0, h / 2, 0, pick(STONE), 3);
        box('dark', w + 0.4, 0.5, d + 0.4, 0, h, 0, 0xffffff, 1);
        if (hi) {
          // Machicolation-like corbel band under the roof.
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2;
            const span = k % 2 ? d : w;
            for (let u = -span / 2 + 0.3; u <= span / 2 - 0.2; u += 0.6) faceBox('trim', 0.25, 0.4, 0.25, a, u, (k % 2 ? w : d) / 2 + 0.12, h - 0.45, trimTint);
          }
        }
        const pg = pyramidGeo(w, d, 4 + r() * 5);
        pg.translate(0, h + 0.25, 0);
        put('slate', pg, pick(SLATE));
        windows(w, d, 0, h, { ww: 0.5, wh: 1.1, lit: this.litChance * 0.7, skipGroundFront: true });
        door(w, d);
        break;
      }
      case 'shop': {
        h = 6 + r() * 4;
        const wk = wallKind('plaster');
        const timber = wk !== 'plaster';
        box(wk, w, h, d, 0, h / 2, 0, timber ? pick(TIMBER) : wall, 3);
        plinth(w, d, timber ? 0.9 : 0.55);
        const alongZ = r() < 0.5;
        const rise = (alongZ ? w : d) * 0.55;
        put(roofKey, (alongZ ? gableGeo(d, w, rise, true) : gableGeo(w, d, rise, false)).translate(0, h, 0), roofTint);
        ridge(alongZ ? d : w, alongZ, h + rise);
        // Wide shop front: a lit display window with a stone surround, a door,
        // a sloping cloth awning and a hanging sign on an iron bracket.
        quad('lit', w * 0.35, 1.3, -w * 0.22, 1.5, d / 2 + 0.04, 0);
        if (hi) {
          box('trim', w * 0.35 + 0.3, 0.16, 0.3, -w * 0.22, 0.78, d / 2 + 0.12, trimTint, 1);
          box('wood', 0.12, 1.4, 0.12, -w * 0.22 - w * 0.175 - 0.06, 1.5, d / 2 + 0.06, 0xffffff, 1);
          box('wood', 0.12, 1.4, 0.12, -w * 0.22 + w * 0.175 + 0.06, 1.5, d / 2 + 0.06, 0xffffff, 1);
          box('dark', 0.06, 0.06, 1.1, w / 2 - 0.6, 3.6, d / 2 + 0.55, 0xffffff, 1);
          box('shutter', 0.06, 0.6, 0.8, w / 2 - 0.6, 3.1, d / 2 + 0.75, pick(AWNING), 1);
        }
        quad('door', 1.6, 2.2, w * 0.25, 1.1, d / 2 + 0.04, 0);
        markDoor(w * 0.25, d / 2, 1.6);
        const aw = new THREE.PlaneGeometry(w * 0.9, 1.8);
        scaleUV(aw, 2);
        aw.rotateX(-Math.PI / 2 + 0.45);
        aw.translate(0, 2.9, d / 2 + 0.8);
        put('cloth', aw, pick(AWNING));
        windows(w, d, 0, h, { skipGroundFront: true, trim: !timber });
        if (r() < 0.5) chimney(-w * 0.25, h + rise * 0.5, 0);
        break;
      }
      case 'arcade': {
        // Arcaded ground floor (a covered walk behind stone arches), plaster above.
        h = 8 + r() * 4;
        const deep = 1.6;
        box('plaster', w, h - 3.4, d, 0, 3.4 + (h - 3.4) / 2, 0, wall, 3);
        box('stone', w, 3.4, d - deep, 0, 1.7, -deep / 2, pick(STONE), 3);
        box('trim', w + 0.1, 0.5, deep, 0, 3.15, d / 2 - deep / 2, trimTint, 1);
        const nArch = Math.max(2, Math.round(w / 2.4));
        for (let k = 0; k <= nArch; k++) box('trim', 0.45, 2.9, 0.45, -w / 2 + 0.22 + ((w - 0.44) * k) / nArch, 1.45, d / 2 - 0.22, trimTint, 1);
        if (!minimal) for (let k = 0; k < nArch; k++) quad(rd() < 0.5 ? 'lit' : 'unlit', 0.9, 1.3, -w / 2 + ((w * (k + 0.5)) / nArch), 1.6, d / 2 - deep + 0.03, 0);
        quad('door', 1.1, 2.1, 0, 1.05, d / 2 - deep + 0.04, 0);
        markDoor(0, d / 2, 1.1);
        plinth(w, d, 0.3);
        stringCourses(w, d, h);
        const rise = w * (0.5 + r() * 0.2);
        put(roofKey, gableGeo(d, w, rise, true).translate(0, h, 0), roofTint);
        ridge(d, true, h + rise);
        windows(w, d, 3.4, h - 3.4);
        if (r() < 0.6) chimney(-w * 0.25, h + rise * 0.5, -d * 0.2);
        break;
      }
      case 'turret': {
        // A townhouse with a round corner turret and a tall conical cap.
        h = 8 + r() * 4;
        const wk = wallKind('plaster');
        const timber = wk !== 'plaster';
        box(wk, w, h, d, 0, h / 2, 0, timber ? pick(TIMBER) : wall, 3);
        plinth(w, d, timber ? 0.9 : 0.55);
        const rise = d * (0.45 + r() * 0.15);
        put(roofKey, gableGeo(w, d, rise, false).translate(0, h, 0), roofTint);
        ridge(w, false, h + rise);
        const side = r() < 0.5 ? -1 : 1;
        const tr = 1.3;
        const tx = side * (w / 2);
        const tz = d / 2;
        const tw = new THREE.CylinderGeometry(tr, tr, h - 3, 8);
        tw.translate(tx, 3 + (h - 3) / 2, tz);
        put('plaster', scaleUV(tw, 1.5), timber ? 0xe8e0d0 : wall);
        const cor = new THREE.ConeGeometry(tr, 1.6, 8);
        cor.rotateX(Math.PI);
        cor.translate(tx, 2.2, tz);
        put('trim', cor, trimTint);
        const cap = new THREE.ConeGeometry(tr + 0.25, 4.5, 8);
        cap.translate(tx, h + 2.25, tz);
        put('slate', scaleUV(cap, 2), pick(SLATE));
        if (hi) box('dark', 0.08, 1.2, 0.08, tx, h + 5, tz, 0xffffff, 1);
        for (let k = 0; k < Math.floor((h - 3) / 3); k++) quad(rd() < this.litChance ? 'lit' : 'unlit', 0.45, 0.9, tx + side * 0.2, 4.8 + k * 3, tz + tr + 0.02, 0);
        windows(w, d, 0, h, { skipGroundFront: true, trim: !timber });
        door(w, d);
        if (r() < 0.6) chimney(-side * w * 0.25, h + rise * 0.5, 0);
        break;
      }
      case 'baroque': {
        // Prague-style decorated gable: pilasters, cornices and a scrolled, stepped top.
        h = 9 + r() * 4;
        box('plaster', w, h, d, 0, h / 2, 0, wall, 3);
        plinth(w, d, 0.7);
        const rise = w * 0.6;
        put(roofKey, gableGeo(d, w, rise, true).translate(0, h, 0), roofTint);
        ridge(d, true, h + rise);
        box('trim', w + 0.3, 0.3, 0.5, 0, h - 0.1, d / 2 - 0.1, trimTint, 1); // main cornice
        if (hi) for (const ux of [-w / 2 + 0.2, -w / 6, w / 6, w / 2 - 0.2]) box('trim', 0.3, h - 0.8, 0.12, ux, (h - 0.8) / 2 + 0.5, d / 2 + 0.06, trimTint, 1); // pilasters
        // Two-tier gable with curved shoulders and a little pediment.
        const g1 = w * 0.75;
        box('plaster', g1, rise * 0.45, 0.5, 0, h + rise * 0.22, d / 2 - 0.2, wall);
        box('trim', g1 + 0.2, 0.18, 0.6, 0, h + rise * 0.45, d / 2 - 0.2, trimTint, 1);
        const g2 = w * 0.4;
        box('plaster', g2, rise * 0.35, 0.5, 0, h + rise * 0.62, d / 2 - 0.2, wall);
        const ped = new THREE.ConeGeometry(g2 * 0.7, rise * 0.25, 3);
        ped.rotateZ(0);
        ped.scale(1, 1, 0.3);
        ped.translate(0, h + rise * 0.92, d / 2 - 0.2);
        put('trim', ped, trimTint);
        if (hi) {
          for (const sd of [-1, 1]) {
            // Volutes (scrolls) on the gable shoulders, and stone urns.
            const v = new THREE.TorusGeometry(0.35, 0.12, 4, 8, Math.PI * 1.5);
            v.translate(sd * (g1 / 2 - 0.1), h + rise * 0.5, d / 2 - 0.05);
            put('trim', v, trimTint);
            const urn = new THREE.CylinderGeometry(0.12, 0.2, 0.5, 6);
            urn.translate(sd * (g1 / 2 + 0.2), h + rise * 0.45 + 0.35, d / 2 - 0.2);
            put('trim', urn, trimTint);
          }
        }
        quad(rd() < this.litChance + 0.2 ? 'lit' : 'unlit', 0.8, 1.1, 0, h + rise * 0.25, d / 2 + 0.06, 0);
        windows(w, d, 0, h, { skipGroundFront: true });
        door(w, d, true);
        break;
      }
      case 'church': {
        h = 10 + r() * 3;
        const nl = d * 0.75;
        box('stone', w * 0.7, h, nl, -w * 0.12, h / 2, -d * 0.12, pick(STONE));
        const rg = gableGeo(nl, w * 0.7, w * 0.45, true);
        rg.translate(-w * 0.12, h, -d * 0.12);
        put('slate', rg, pick(SLATE));
        const tw = Math.min(5, w * 0.3);
        const th = h * 2.2;
        box('stone', tw, th, tw, w * 0.3, th / 2, d / 2 - tw / 2 - 0.3, pick(STONE));
        const sg = pyramidGeo(tw, tw, th * 0.6);
        sg.translate(w * 0.3, th, d / 2 - tw / 2 - 0.3);
        put('slate', sg, pick(SLATE));
        if (hi) for (let k = 0; k < 4; k++) box('trim', 0.5, h * 0.8, 0.6, -w * 0.12 + w * 0.35 + 0.2, h * 0.4, -d * 0.12 - nl / 2 + nl * (k / 3), trimTint, 1); // buttresses
        for (let i = 0; i < 4; i++) quad('lit', 0.8, 2.4, -w * 0.12 + w * 0.35 + 0.03, 4 + (i % 2) * 0.2, -d * 0.12 - nl / 2 + nl * ((i + 0.5) / 4), Math.PI / 2);
        quad('door', 1.6, 2.6, w * 0.3, 1.3, d / 2 - 0.27, 0);
        markDoor(w * 0.3, d / 2, 1.6);
        break;
      }
      default:
        throw new Error('unknown building type ' + type);
    }
    if (doorLocal) {
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      this.doors.push({ x: x + c * doorLocal.x + sn * doorLocal.z, z: z - sn * doorLocal.x + c * doorLocal.z, rot, w: doorLocal.w, lot, type: kitInfo?.use || type });
    }
    if (lot.collide !== false) {
      const pad = type === 'jetty' ? 0.15 : 0;
      this.colliders.push({ cx: x, cz: z, hx: w / 2 + pad + 0.1, hz: d / 2 + pad + 0.1, rot });
    }
    return { type, height: h, kit: kitInfo };
  }

  /**
   * The modular house kit: a seeded body + roof + add-ons + colours (see KIT).
   * Pieces are plain low-poly shapes; variety comes from combining them.
   */
  addKit(c) {
    const { lot, r, rd, pick, hi, box, put, quad, windows, door, chimney, plinth, quoins, stringCourses, ridge, oriel, balcony, wallKind, roofKey, roofTint, trimTint, markDoor } = c;
    const { w, d } = lot;
    const pal = KIT.palettes[lot.district] || KIT.palettes.default;
    const wall = pick(pal.walls);
    const weighted = (table) => {
      let sum = 0;
      for (const v of Object.values(table)) sum += v;
      let x = r() * sum;
      for (const [k, v] of Object.entries(table)) if ((x -= v) < 0) return k;
      return Object.keys(table)[0];
    };
    // Body: fit the footprint; narrow lots can't take an L.
    let body = weighted(KIT.bodies);
    if (lot.kitBody) body = lot.kitBody; // design/debug override
    if (body === 'L' && (w < 7 || d < 7)) body = 'box';
    if (body === 'tower' && Math.max(w, d) > 7.5) body = 'box';
    const [hMin, hMax] = KIT.height;
    let h = body === 'tower' ? 11 + r() * 6 : hMin + r() * (hMax - hMin);
    h = Math.max(3.4, Math.round(h / 0.5) * 0.5);
    const wk = body === 'tower' ? 'stone' : wallKind(r() < pal.stone ? 'stone' : 'plaster');
    const timber = wk.startsWith('timber');
    const wallCol = wk === 'stone' ? pick(STONE) : timber ? pick(TIMBER) : wall;
    // Roof, compatible with the body.
    let roof = weighted(KIT.roofs);
    if (lot.kitRoof) roof = lot.kitRoof;
    if (body === 'tower') roof = r() < 0.5 ? 'spire' : 'pyramid';
    if (body === 'chamfer' && (roof === 'gable' || roof === 'stepped' || roof === 'shed')) roof = r() < 0.5 ? 'hip' : 'mansard';
    if (body === 'L') roof = 'cross';
    if (roof === 'spire' && body !== 'tower') roof = 'gable';
    const rk = roof === 'mansard' || roof === 'spire' || roof === 'pyramid' ? (r() < 0.6 ? 'slate' : roofKey) : roofKey;
    const rt = rk === 'slate' ? pick(SLATE) : roofTint;
    const eavesToStreet = r() < 0.5; // gable ridge parallel to the street?

    const gableRoof = (bw, bd, top, cx, cz, alongZ, rise) => {
      const g = alongZ ? gableGeo(bd, bw, rise, true) : gableGeo(bw, bd, rise, false);
      put(rk, g.translate(cx, top, cz), rt);
      if (hi) {
        if (alongZ) box('dark', 0.24, 0.18, bd + 0.7, cx, top + rise + 0.05, cz, 0x8a7a70, 1);
        else box('dark', bw + 0.7, 0.18, 0.24, cx, top + rise + 0.05, cz, 0x8a7a70, 1);
      }
    };
    const dormers = (bw, bd, top, rise, cx, cz) => {
      // Small gabled dormers on the street-side slope (ridge parallel to the street).
      const n = bw > 8 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const dx = cx + (n === 1 ? 0 : (i - 0.5) * bw * 0.5);
        const dz = cz + bd / 4;
        const dy = top + rise * 0.3;
        box('plaster', 1.4, 1.4, 1.6, dx, dy + 0.3, dz, wall);
        put(rk, gableGeo(1.6, 1.4, 0.9, true, 0.15).translate(dx, dy + 1.0, dz), rt);
        quad(r() < this.litChance ? 'lit' : 'unlit', 0.55, 0.8, dx, dy + 0.35, dz + 0.82, 0);
      }
    };
    const roofOn = (kind, bw, bd, top, cx, cz) => {
      // Returns the roof's height above `top` (for chimneys).
      switch (kind) {
        case 'gable':
        case 'stepped': {
          const along = kind === 'stepped' ? true : !eavesToStreet;
          const rise = (along ? bw : bd) * (0.5 + r() * 0.25);
          gableRoof(bw, bd, top, cx, cz, along, rise);
          if (kind === 'stepped') {
            const steps = 3 + Math.floor(r() * 2);
            for (let i = 0; i < steps; i++) {
              const sw = bw * (1 - (i + 1) / (steps + 1.2));
              box('plaster', sw, rise / steps + 0.15, 0.45, cx, top + (rise / steps) * (i + 0.5), cz + bd / 2 - 0.2, wk === 'stone' ? 0xd8d0c4 : wallCol);
              if (hi) box('trim', sw + 0.12, 0.12, 0.55, cx, top + (rise / steps) * (i + 1) + 0.12, cz + bd / 2 - 0.2, trimTint, 1);
            }
          } else if (!along && r() < KIT.addons.dormer) dormers(bw, bd, top, rise, cx, cz);
          if (along) quad(r() < this.litChance ? 'lit' : 'unlit', 0.6, 0.9, cx, top + rise * 0.3, cz + bd / 2 + 0.25, 0);
          return rise;
        }
        case 'hip': {
          const rise = Math.min(bw, bd) * (0.45 + r() * 0.15);
          box('dark', bw + 0.3, 0.3, bd + 0.3, cx, top, cz, 0xffffff, 1);
          put(rk, hipGeo(bw, bd, rise).translate(cx, top + 0.15, cz), rt);
          return rise;
        }
        case 'mansard': {
          const steep = 2.2 + r() * 0.6;
          const inset = 0.9;
          box('dark', bw + 0.3, 0.3, bd + 0.3, cx, top, cz, 0xffffff, 1);
          put(rk, mansardGeo(bw, bd, steep, inset).translate(cx, top + 0.15, cz), rt);
          const up = Math.min(bw, bd) * 0.18;
          put(rk, hipGeo(bw - inset * 2, bd - inset * 2, up, 0.05).translate(cx, top + 0.15 + steep, cz), rt);
          // Dormers through the steep lower slope (front), one per bay.
          const n = Math.max(1, Math.floor(bw / 2.6));
          for (let i = 0; i < n; i++) {
            const dx = cx - bw / 2 + (bw * (i + 0.5)) / n;
            box('plaster', 1.0, 1.3, 0.9, dx, top + 1.05, cz + bd / 2 - 0.2, wallCol);
            put(rk, gableGeo(0.9, 1.0, 0.55, true, 0.1).translate(dx, top + 1.7, cz + bd / 2 - 0.2), rt);
            quad(r() < this.litChance ? 'lit' : 'unlit', 0.5, 0.75, dx, top + 1.05, cz + bd / 2 + 0.26, 0);
          }
          return steep + up;
        }
        case 'shed': {
          // Lean-to: one slope falling towards the street, gable infill at the sides.
          const rise = bd * (0.45 + r() * 0.15);
          const len = Math.hypot(bd + 0.8, rise);
          const g = worldBoxUV(new THREE.BoxGeometry(bw + 0.6, 0.16, len), bw + 0.6, 0.16, len, 2);
          g.rotateX(Math.atan2(rise, bd + 0.8));
          g.translate(cx, top + rise / 2 + 0.08, cz);
          put(rk, g, rt);
          const tri = new THREE.BufferGeometry();
          const zb = cz - bd / 2;
          const zf = cz + bd / 2;
          const yR = top + rise * ((bd + 0.4) / (bd + 0.8));
          const P = [];
          const U = [];
          for (const sx of [-1, 1]) {
            const xx = cx + sx * bw / 2;
            const tr = sx > 0 ? [[xx, top, zf], [xx, top, zb], [xx, yR, zb]] : [[xx, top, zb], [xx, top, zf], [xx, yR, zb]];
            for (const [px, py, pz] of tr) {
              P.push(px, py, pz);
              U.push(pz / 3, py / 3);
            }
          }
          // Back wall strip up to the high eave.
          for (const [px, py, pz] of [[cx + bw / 2, top, zb], [cx - bw / 2, top, zb], [cx - bw / 2, yR, zb], [cx + bw / 2, top, zb], [cx - bw / 2, yR, zb], [cx + bw / 2, yR, zb]]) {
            P.push(px, py, pz);
            U.push(px / 3, py / 3);
          }
          tri.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
          tri.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
          tri.computeVertexNormals();
          put(wk, tri, wallCol);
          return rise;
        }
        case 'pyramid': {
          const rise = 4 + r() * 4;
          box('dark', bw + 0.4, 0.5, bd + 0.4, cx, top, cz, 0xffffff, 1);
          put('slate', pyramidGeo(bw, bd, rise).translate(cx, top + 0.25, cz), pick(SLATE));
          return rise;
        }
        case 'spire': {
          const rise = 6 + r() * 5;
          box('dark', bw + 0.4, 0.5, bd + 0.4, cx, top, cz, 0xffffff, 1);
          const cone = new THREE.ConeGeometry(Math.max(bw, bd) * 0.62, rise, 8);
          cone.rotateY(Math.PI / 8);
          put('slate', scaleUV(cone, 2).translate(cx, top + 0.25 + rise / 2, cz), pick(SLATE));
          if (hi) box('dark', 0.08, 1.4, 0.08, cx, top + rise + 0.8, cz, 0xffffff, 1);
          return rise;
        }
      }
      return 1;
    };

    let doorSet = false;
    switch (body) {
      case 'box':
      case 'tower': {
        box(wk, w, h, d, 0, h / 2, 0, wallCol, 3);
        plinth(w, d, timber ? 0.9 : 0.55);
        if (!timber) quoins(w, d, h);
        if (!timber && body === 'box') stringCourses(w, d, h);
        const rise = roofOn(roof, w, d, h, 0, 0);
        windows(w, d, 0, h, { skipGroundFront: true, trim: !timber, lit: body === 'tower' ? this.litChance * 0.7 : this.litChance });
        if (body === 'box' && (roof === 'gable' || roof === 'hip') && r() < KIT.addons.bay) oriel(w, d, 3.4);
        else if (body === 'box' && r() < KIT.addons.balcony) balcony(w, d, 3.0);
        if (body === 'box' && r() < KIT.addons.chimney) chimney(w * 0.28, h + Math.min(rise, 2.5) * 0.6, -d * 0.15);
        if (body === 'box' && r() < KIT.addons.chimney2) chimney(-w * 0.28, h + Math.min(rise, 2.5) * 0.6, -d * 0.15);
        break;
      }
      case 'chamfer': {
        const cut = Math.min(1.4, Math.min(w, d) * 0.2);
        put(wk, chamferGeo(w, h, d, cut), wallCol);
        if (hi) put('trim', chamferGeo(w + 0.16, timber ? 0.9 : 0.55, d + 0.16, cut + 0.05), trimTint);
        const rise = roofOn(roof === 'mansard' ? 'mansard' : 'hip', w, d, h, 0, 0);
        // Front/back windows only across the uncut width; side windows stop before the cut.
        windows(w - 2 * cut - 0.4, d, 0, h, { skipGroundFront: true, trim: !timber, ww: 0.55, skipFaces: [Math.PI / 2, -Math.PI / 2] });
        windows(w, d - cut - 0.4, 0, h, { trim: !timber, ww: 0.55, cz: -(cut + 0.4) / 2, skipFaces: [0, Math.PI] });
        // Windows on the cut corners.
        for (const sx of [-1, 1]) {
          const fx = sx * (w / 2 - cut / 2) + sx * 0.04;
          for (let y = 4.7; y < h - 1; y += 3) quad(rd() < this.litChance ? 'lit' : 'unlit', 0.5, 0.9, fx, y, d / 2 - cut / 2 + 0.04, sx * Math.PI / 4);
        }
        if (r() < KIT.addons.chimney) chimney(0, h + rise * 0.6, -d * 0.2);
        break;
      }
      case 'jetty': {
        const g1 = 3.2;
        const g2 = Math.max(3, h - g1);
        h = g1 + g2;
        const stoneGround = r() < 0.5;
        box(stoneGround ? 'stone' : 'plaster', w, g1, d, 0, g1 / 2, 0, stoneGround ? pick(STONE) : wall, 3);
        const tk = pick(['timber', 'timber2', 'timber3']);
        box(tk, w + 0.5, g2, d + 0.7, 0, g1 + g2 / 2, 0.25, pick(TIMBER), 3);
        box('wood', w + 0.6, 0.25, d + 0.8, 0, g1, 0.25, 0xffffff, 1);
        if (hi)
          for (let bx = -w / 2 + 0.4; bx <= w / 2 - 0.3; bx += 1.1) {
            const br = new THREE.BoxGeometry(0.14, 0.14, 0.75);
            br.rotateX(0.75);
            br.translate(bx, g1 - 0.3, d / 2 + 0.22);
            put('wood', br, 0xffffff);
          }
        const jr = roof === 'mansard' || roof === 'hip' ? 'hip' : roof === 'shed' ? 'shed' : 'gable';
        const rise = roofOn(jr, w + 0.5, d + 0.7, h, 0, 0.25);
        windows(w + 0.5, d + 0.7, g1, g2, { trim: false, cz: 0.25 });
        windows(w, d, 0, g1, { skipGroundFront: true, trim: stoneGround });
        if (r() < KIT.addons.chimney) chimney(w * 0.3, h + Math.min(rise, 2.5) * 0.5, 0);
        break;
      }
      case 'L': {
        // A back range across the plot and a wing coming forward on one side; the
        // open corner in front of the back range is a little yard with a stair.
        const side = r() < 0.5 ? -1 : 1;
        const d1 = d * (0.45 + r() * 0.1);
        const w2 = w * (0.4 + r() * 0.1);
        const h2 = Math.max(3.4, h * (0.7 + r() * 0.25));
        const bz = -d / 2 + d1 / 2;
        const wx = side * (w / 2 - w2 / 2);
        const wz = -d / 2 + d1 + (d - d1) / 2;
        box(wk, w, h, d1, 0, h / 2, bz, wallCol, 3);
        box(wk, w2, h2, d - d1, wx, h2 / 2, wz, wallCol, 3);
        plinth(w, d1, 0.55);
        const riseA = (d1 + 0.0) * (0.45 + r() * 0.15);
        gableRoof(w, d1, h, 0, bz, false, riseA);
        const riseB = w2 * (0.55 + r() * 0.2);
        gableRoof(w2, d - d1 + 0.35, h2, wx, wz + 0.17, true, riseB);
        quad(r() < this.litChance ? 'lit' : 'unlit', 0.55, 0.85, wx, h2 + riseB * 0.3, d / 2 + 0.25, 0);
        windows(w, d1, 0, h, { skipGroundFront: true, trim: !timber, cz: bz });
        windows(w2, d - d1, 0, h2, { skipGroundFront: true, trim: !timber, cx: wx, cz: wz, skipFaces: [Math.PI] });
        // Door into the back range from the yard, and an outside stair up to a
        // first-floor door along the back range's front wall.
        const yardX = -side * (w2 / 2);
        const yw = w - w2;
        const fz = -d / 2 + d1;
        if (yw > 2.6) {
          const dx = yardX - side * yw * 0.25;
          quad('door', 1.1, 2.1, dx, 1.05, fz + 0.04, 0);
          box('dark', 1.4, 0.22, 0.18, dx, 2.2, fz + 0.06, 0xffffff, 1);
          markDoor(dx, d / 2, 1.1);
          doorSet = true;
          if (h > 6 && yw >= 4.8 && r() < KIT.addons.extStair + 0.4 && hi) {
            const sx = yardX + side * (yw / 2 - 0.9);
            const nSteps = 10;
            for (let i = 0; i < nSteps; i++) box('wood', 0.95, 0.12, 0.32, sx - side * (i * 0.32), 0.3 * (i + 1), fz + 0.6, 0xffffff, 1);
            box('wood', 1.3, 0.15, 1.1, sx - side * (nSteps * 0.32 + 0.4), 3.05, fz + 0.6, 0xffffff, 1);
            for (let i = 0; i <= nSteps; i += 2) box('wood', 0.06, 0.9, 0.06, sx - side * (i * 0.32), 0.3 * i + 0.75, fz + 1.08, 0xffffff, 1);
            quad('door', 0.95, 2.0, sx - side * (nSteps * 0.32 + 0.4), 4.1, fz + 0.04, 0);
          }
        }
        if (r() < KIT.addons.chimney) chimney(-wx * 0.6, h + riseA * 0.6, bz);
        break;
      }
    }
    // Shop fronts, signs and awnings on some street houses.
    const isShop = (body === 'box' || body === 'jetty') && r() < KIT.addons.shop;
    if (!doorSet) {
      if (isShop) {
        const sx = -w * 0.22;
        quad('lit', w * 0.34, 1.25, sx, 1.5, d / 2 + 0.04 + (body === 'jetty' ? 0 : 0), 0);
        if (hi) box('trim', w * 0.34 + 0.3, 0.16, 0.3, sx, 0.8, d / 2 + 0.12, trimTint, 1);
        const aw = new THREE.PlaneGeometry(w * 0.85, 1.6);
        scaleUV(aw, 2);
        aw.rotateX(-Math.PI / 2 + 0.45);
        aw.translate(0, 2.85, d / 2 + 0.75);
        put('cloth', aw, pick(AWNING));
        quad('door', 1.4, 2.2, w * 0.25, 1.1, d / 2 + 0.04, 0);
        markDoor(w * 0.25, d / 2, 1.4);
      } else if (body === 'chamfer') {
        const cut = Math.min(1.4, Math.min(w, d) * 0.2);
        door(w - 2 * cut, d, r() < 0.5);
      } else door(w, d);
    }
    if (hi && (isShop || r() < KIT.addons.sign) && (body === 'box' || body === 'jetty')) {
      box('dark', 0.06, 0.06, 1.1, w / 2 - 0.6, 3.6, d / 2 + 0.55, 0xffffff, 1);
      box('shutter', 0.06, 0.6, 0.8, w / 2 - 0.6, 3.1, d / 2 + 0.75, pick(AWNING), 1);
    }
    const use = isShop ? 'shop' : (w * d > 75 && body !== 'tower') ? (r() < 0.35 ? 'tavern' : 'house') : 'house';
    return { height: h, body, roof, use };
  }

  /** Merge everything into a group. blockers = wall meshes (for camera raycasts). */
  build() {
    const M = materials();
    const group = new THREE.Group();
    group.name = 'buildings';
    const blockers = [];
    const walls = [];
    const rest = [];
    for (const [key, geos] of Object.entries(this.buckets)) {
      const rect = M.tileOf[key];
      if (rect) {
        for (const g of geos) setTile(g, rect);
        (WALL_KEYS.includes(key) ? walls : rest).push(...geos);
        continue;
      }
      const mesh = mergedMesh(geos, M[key], { cast: false });
      mesh.name = key;
      group.add(mesh);
    }
    if (walls.length) {
      const m = mergeKeep(walls, M.atlas);
      m.name = 'walls';
      group.add(m);
      blockers.push(m);
    }
    if (rest.length) {
      const m = mergeKeep(rest, M.atlas);
      m.name = 'details';
      group.add(m);
    }
    return { group, blockers, colliders: this.colliders, doors: this.doors };
  }
}
