import * as THREE from 'three';
import { tex, worldBoxUV, scaleUV } from '../retro/textures.js';
import { mergedMesh, mulberry } from './kit.js';

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
  return MATS;
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

export const ARCHETYPES = ['gable', 'stepped', 'long', 'jetty', 'hip', 'tower', 'shop'];

export class BuildingSet {
  /** detail: 'high' (walkable streets) or 'low' (distant skylines). */
  constructor(seed = 1, { litChance = 0.32, detail = 'high' } = {}) {
    this.rnd = mulberry(seed);
    this.litChance = litChance;
    this.high = detail === 'high';
    this.buckets = {};
    this.colliders = [];
  }

  pick(list) {
    return list[Math.floor(this.rnd() * list.length)];
  }

  /**
   * Add one building. Local frame: footprint w (x) x d (z), street-facing front at +z.
   * @param {{x:number,z:number,y?:number,rot?:number,w:number,d:number,type?:string,collide?:boolean}} lot
   */
  add(lot) {
    const r = this.rnd;
    const hi = this.high;
    const { x, z, w, d } = lot;
    const y = lot.y ?? 0;
    const rot = lot.rot ?? 0;
    const type = lot.type || this.pick(ARCHETYPES);
    const M = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
    const put = (key, geo, color) => {
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
    const faceBox = (key, bw, bh, bd, a, u, off, by, color, tile = 1) => {
      const g = worldBoxUV(new THREE.BoxGeometry(bw, bh, bd), bw, bh, bd, tile);
      g.rotateY(a);
      g.translate(Math.sin(a) * off + Math.cos(a) * u, by, Math.cos(a) * off - Math.sin(a) * u);
      put(key, g, color);
    };
    const quad = (key, qw, qh, qx, qy, qz, a) => {
      const g = new THREE.PlaneGeometry(qw, qh);
      g.rotateY(a);
      g.translate(qx, qy, qz);
      put(key, g);
    };
    const shutterTint = this.pick(SHUTTER);
    const trimTint = this.pick(TRIM);
    const shutters = hi && r() < 0.55;
    const boxes = hi && r() < 0.3;

    // Windows on the four faces, one row per storey, with stone sills and
    // lintels, painted shutters (some open, some closed) and flower boxes.
    const windows = (bw, bd, y0, h, { lit = this.litChance, ww = 0.62, wh = 0.95, skipGroundFront = false, trim = true } = {}) => {
      const floors = Math.max(1, Math.floor((h - 0.6) / 3));
      const faces = [
        [0, bd / 2, bw],
        [Math.PI, bd / 2, bw],
        [Math.PI / 2, bw / 2, bd],
        [-Math.PI / 2, bw / 2, bd],
      ];
      for (const [a, off, span] of faces) {
        const n = Math.max(1, Math.floor(span / 2.1));
        for (let f = 0; f < floors; f++) {
          if (skipGroundFront && f === 0 && a === 0) continue;
          for (let i = 0; i < n; i++) {
            if (r() < 0.2) continue;
            const u = -span / 2 + (span / n) * (i + 0.5);
            const wy = y0 + 1.7 + f * 3;
            const closed = shutters && r() < 0.2;
            if (!closed) quad(r() < lit ? 'lit' : 'unlit', ww, wh, Math.sin(a) * (off + 0.03) + Math.cos(a) * u, wy, Math.cos(a) * (off + 0.03) - Math.sin(a) * u, a);
            if (!hi) {
              faceBox('trim', ww + 0.2, 0.1, 0.16, a, u, off + 0.06, wy - wh / 2 - 0.05, trimTint);
              continue;
            }
            if (trim) {
              faceBox('trim', ww + 0.24, 0.12, 0.2, a, u, off + 0.08, wy - wh / 2 - 0.06, trimTint); // sill
              faceBox('trim', ww + 0.2, 0.14, 0.1, a, u, off + 0.04, wy + wh / 2 + 0.07, trimTint); // lintel
              faceBox('trim', 0.08, wh, 0.08, a, u - ww / 2 - 0.04, off + 0.03, wy, trimTint); // jambs
              faceBox('trim', 0.08, wh, 0.08, a, u + ww / 2 + 0.04, off + 0.03, wy, trimTint);
            }
            if (shutters) {
              if (closed) faceBox('shutter', ww + 0.04, wh, 0.05, a, u, off + 0.05, wy, shutterTint);
              else for (const sd of [-1, 1]) faceBox('shutter', ww / 2, wh, 0.04, a, u + sd * (ww * 0.75 + 0.1), off + 0.04, wy, shutterTint);
            }
            if (boxes && f > 0 && r() < 0.5) {
              faceBox('wood', ww + 0.1, 0.18, 0.22, a, u, off + 0.18, wy - wh / 2 - 0.2, 0xffffff);
              faceBox('flowers', ww, 0.12, 0.2, a, u, off + 0.2, wy - wh / 2 - 0.05, 0xffffff);
            }
          }
        }
      }
    };
    const door = (bw, bd, wide = false) => {
      const dw = wide ? 1.8 : 1.1;
      const dx = (r() - 0.5) * (bw - 2.6);
      quad('door', dw, 2.1, dx, 1.05, bd / 2 + 0.04, 0);
      box('dark', dw + 0.3, 0.22, 0.18, dx, 2.2, bd / 2 + 0.06, 0xffffff, 1);
      if (hi) {
        box('trim', 0.18, 2.3, 0.16, dx - dw / 2 - 0.09, 1.15, bd / 2 + 0.05, trimTint, 1); // jambs
        box('trim', 0.18, 2.3, 0.16, dx + dw / 2 + 0.09, 1.15, bd / 2 + 0.05, trimTint, 1);
        box('trim', dw + 0.6, 0.16, 0.5, dx, 0.08, bd / 2 + 0.25, trimTint, 1); // step
        if (r() < 0.3) {
          // A small lantern beside the door.
          box('dark', 0.05, 0.05, 0.3, dx + dw / 2 + 0.45, 2.45, bd / 2 + 0.15, 0xffffff, 1);
          box('lit', 0.18, 0.26, 0.18, dx + dw / 2 + 0.45, 2.25, bd / 2 + 0.3);
        }
      }
      return dx;
    };
    const chimney = (cx, cy, cz) => {
      box('dark', 0.6, 1.8, 0.6, cx, cy, cz, this.pick(STONE), 1);
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
      if (!hi || r() > 0.4) return;
      for (const sx of [-1, 1]) {
        for (let yy = 0.6, k = 0; yy < h - 0.3; yy += 0.55, k++) {
          const long = k % 2 === 0;
          box('trim', long ? 0.55 : 0.32, 0.5, 0.1, sx * (bw / 2 - (long ? 0.27 : 0.16)), yy + 0.25, bd / 2 + 0.05, trimTint, 1);
          box('trim', 0.1, 0.5, long ? 0.32 : 0.55, sx * (bw / 2 + 0.05), yy + 0.25, bd / 2 - (long ? 0.16 : 0.27), trimTint, 1);
        }
      }
    };
    const stringCourses = (bw, bd, h) => {
      if (!hi || r() > 0.45) return;
      for (let yy = 3; yy < h - 1; yy += 3) box('trim', bw + 0.14, 0.14, bd + 0.14, 0, yy, 0, trimTint, 1);
    };
    const ridge = (len, alongZ, top) => {
      if (!hi) return;
      if (alongZ) box('dark', 0.24, 0.18, len + 0.7, 0, top + 0.05, 0, 0x8a7a70, 1);
      else box('dark', len + 0.7, 0.18, 0.24, 0, top + 0.05, 0, 0x8a7a70, 1);
    };
    // A projecting bay (oriel) window on the upper floor, with its own little roof.
    const oriel = (bw, bd, yb) => {
      if (!hi || bw < 6 || r() > 0.2) return;
      const ow = 1.9;
      const od = 0.75;
      box('plaster', ow, 2.2, od, 0, yb + 1.1, bd / 2 + od / 2, this.pick(PLASTER));
      const cor = new THREE.ConeGeometry(0.75, 0.9, 4, 1);
      cor.rotateY(Math.PI / 4);
      cor.rotateX(Math.PI);
      cor.scale(1.25, 1, 0.5);
      cor.translate(0, yb - 0.45, bd / 2 + od / 2);
      put('trim', cor, trimTint);
      const rf = pyramidGeo(ow - 0.4, od, 0.8);
      rf.translate(0, yb + 2.2, bd / 2 + od / 2);
      put('slate', rf, this.pick(SLATE));
      quad(r() < this.litChance + 0.15 ? 'lit' : 'unlit', 0.7, 1.1, 0, yb + 1.1, bd / 2 + od + 0.02, 0);
      for (const sd of [-1, 1]) quad(r() < this.litChance ? 'lit' : 'unlit', 0.4, 1.0, sd * (ow / 2 + 0.02), yb + 1.1, bd / 2 + od / 2, sd * Math.PI / 2);
    };
    // A wooden balcony on the first floor.
    const balcony = (bw, bd, yb) => {
      if (!hi || bw < 6 || r() > 0.18) return;
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
      return this.pick(['timber', 'timber2', 'timber3']);
    };
    const roofKey = r() < 0.72 ? 'roof' : 'slate';
    const roofTint = roofKey === 'roof' ? this.pick(ROOF) : this.pick(SLATE);
    const wall = this.pick(PLASTER);

    let h = 0;
    switch (type) {
      case 'gable':
      case 'stepped': {
        h = 6.5 + r() * 5;
        const wk = type === 'stepped' ? 'plaster' : wallKind('plaster');
        const timber = wk !== 'plaster';
        box(wk, w, h, d, 0, h / 2, 0, timber ? this.pick(TIMBER) : wall, 3);
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
        box(wk, w, h, d, 0, h / 2, 0, timber ? this.pick(TIMBER) : wall, 3);
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
        box(stoneGround ? 'stone' : 'plaster', w, g1, d, 0, g1 / 2, 0, stoneGround ? this.pick(STONE) : wall, 3);
        // Upper floors overhang the street (jettied), half-timbered, on carved brackets.
        box(this.pick(['timber', 'timber2', 'timber3']), w + 0.5, g2, d + 0.7, 0, g1 + g2 / 2, 0.25, this.pick(TIMBER), 3);
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
        box(stoneBase ? 'stone' : 'plaster', w, h, d, 0, h / 2, 0, stoneBase ? this.pick(STONE) : wall, 3);
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
        box('stone', w, h, d, 0, h / 2, 0, this.pick(STONE), 3);
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
        put('slate', pg, this.pick(SLATE));
        windows(w, d, 0, h, { ww: 0.5, wh: 1.1, lit: this.litChance * 0.7, skipGroundFront: true });
        door(w, d);
        break;
      }
      case 'shop': {
        h = 6 + r() * 4;
        const wk = wallKind('plaster');
        const timber = wk !== 'plaster';
        box(wk, w, h, d, 0, h / 2, 0, timber ? this.pick(TIMBER) : wall, 3);
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
          box('shutter', 0.06, 0.6, 0.8, w / 2 - 0.6, 3.1, d / 2 + 0.75, this.pick(AWNING), 1);
        }
        quad('door', 1.6, 2.2, w * 0.25, 1.1, d / 2 + 0.04, 0);
        const aw = new THREE.PlaneGeometry(w * 0.9, 1.8);
        scaleUV(aw, 2);
        aw.rotateX(-Math.PI / 2 + 0.45);
        aw.translate(0, 2.9, d / 2 + 0.8);
        put('cloth', aw, this.pick(AWNING));
        windows(w, d, 0, h, { skipGroundFront: true, trim: !timber });
        if (r() < 0.5) chimney(-w * 0.25, h + rise * 0.5, 0);
        break;
      }
      case 'church': {
        h = 10 + r() * 3;
        const nl = d * 0.75;
        box('stone', w * 0.7, h, nl, -w * 0.12, h / 2, -d * 0.12, this.pick(STONE));
        const rg = gableGeo(nl, w * 0.7, w * 0.45, true);
        rg.translate(-w * 0.12, h, -d * 0.12);
        put('slate', rg, this.pick(SLATE));
        const tw = Math.min(5, w * 0.3);
        const th = h * 2.2;
        box('stone', tw, th, tw, w * 0.3, th / 2, d / 2 - tw / 2 - 0.3, this.pick(STONE));
        const sg = pyramidGeo(tw, tw, th * 0.6);
        sg.translate(w * 0.3, th, d / 2 - tw / 2 - 0.3);
        put('slate', sg, this.pick(SLATE));
        if (hi) for (let k = 0; k < 4; k++) box('trim', 0.5, h * 0.8, 0.6, -w * 0.12 + w * 0.35 + 0.2, h * 0.4, -d * 0.12 - nl / 2 + nl * (k / 3), trimTint, 1); // buttresses
        for (let i = 0; i < 4; i++) quad('lit', 0.8, 2.4, -w * 0.12 + w * 0.35 + 0.03, 4 + (i % 2) * 0.2, -d * 0.12 - nl / 2 + nl * ((i + 0.5) / 4), Math.PI / 2);
        quad('door', 1.6, 2.6, w * 0.3, 1.3, d / 2 - 0.27, 0);
        break;
      }
      default:
        throw new Error('unknown building type ' + type);
    }
    if (lot.collide !== false) {
      const pad = type === 'jetty' ? 0.15 : 0;
      this.colliders.push({ cx: x, cz: z, hx: w / 2 + pad + 0.1, hz: d / 2 + pad + 0.1, rot });
    }
    return { type, height: h };
  }

  /** Merge everything into a group. blockers = wall meshes (for camera raycasts). */
  build() {
    const M = materials();
    const group = new THREE.Group();
    group.name = 'buildings';
    const blockers = [];
    for (const [key, geos] of Object.entries(this.buckets)) {
      const mesh = mergedMesh(geos, M[key], { cast: false });
      group.add(mesh);
      if (['plaster', 'timber', 'timber2', 'timber3', 'stone'].includes(key)) blockers.push(mesh);
    }
    return { group, blockers, colliders: this.colliders };
  }
}
