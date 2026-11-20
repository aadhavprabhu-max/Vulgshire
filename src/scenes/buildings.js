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

let MATS = null;
function materials() {
  if (MATS) return MATS;
  const L = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra });
  MATS = {
    plaster: L(tex.plasterPlain()),
    timber: L(tex.plaster(0)),
    timber2: L(tex.plaster(2)),
    stone: L(tex.stoneWall()),
    dark: L(tex.darkStone()),
    roof: L(tex.roofTile()),
    slate: L(tex.slate()),
    wood: L(tex.wood()),
    cloth: L(tex.awning(), { side: THREE.DoubleSide }),
    door: new THREE.MeshLambertMaterial({ map: tex.door() }),
    lit: new THREE.MeshBasicMaterial({ map: tex.litWindow() }),
    unlit: new THREE.MeshBasicMaterial({ map: tex.windowDark() }),
  };
  return MATS;
}

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
  constructor(seed = 1, { litChance = 0.32 } = {}) {
    this.rnd = mulberry(seed);
    this.litChance = litChance;
    this.buckets = {};
    this.colliders = [];
  }

  pick(list) {
    return list[Math.floor(this.rnd() * list.length)];
  }

  /**
   * Add one building. Local frame: footprint w (x) × d (z), street-facing front at +z.
   * @param {{x:number,z:number,y?:number,rot?:number,w:number,d:number,type?:string,collide?:boolean}} lot
   */
  add(lot) {
    const r = this.rnd;
    const { x, z, w, d } = lot;
    const y = lot.y ?? 0;
    const rot = lot.rot ?? 0;
    const type = lot.type || this.pick(ARCHETYPES);
    const M = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
    const out = [];
    const put = (key, geo, color) => {
      if (color !== undefined) tint(geo, color);
      geo.applyMatrix4(M);
      (this.buckets[key] ||= []).push(geo);
      out.push(geo);
    };
    const box = (key, bw, bh, bd, bx, by, bz, color, tile = 2) => {
      const g = worldBoxUV(new THREE.BoxGeometry(bw, bh, bd), bw, bh, bd, tile);
      g.translate(bx, by, bz);
      put(key, g, color);
    };
    const quad = (key, qw, qh, qx, qy, qz, a) => {
      const g = new THREE.PlaneGeometry(qw, qh);
      g.rotateY(a);
      g.translate(qx, qy, qz);
      put(key, g);
    };
    // Windows on the four faces, one row per storey.
    const windows = (bw, bd, y0, h, { lit = this.litChance, ww = 0.62, wh = 0.95, skipGroundFront = false } = {}) => {
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
            quad(r() < lit ? 'lit' : 'unlit', ww, wh, Math.sin(a) * (off + 0.03) + Math.cos(a) * u, wy, Math.cos(a) * (off + 0.03) - Math.sin(a) * u, a);
          }
        }
      }
    };
    const door = (bw, bd, wide = false) => {
      const dx = (r() - 0.5) * (bw - 2.4);
      quad('door', wide ? 1.8 : 1.1, 2.1, dx, 1.05, bd / 2 + 0.04, 0);
      box('dark', (wide ? 1.8 : 1.1) + 0.3, 0.2, 0.15, dx, 2.2, bd / 2 + 0.05, 0xffffff, 1);
    };
    const chimney = (cx, cy, cz) => box('dark', 0.6, 1.8, 0.6, cx, cy, cz, this.pick(STONE), 1);
    const roofKey = r() < 0.72 ? 'roof' : 'slate';
    const roofTint = roofKey === 'roof' ? this.pick(ROOF) : this.pick(SLATE);
    const wall = this.pick(PLASTER);

    let h = 0;
    switch (type) {
      case 'gable':
      case 'stepped': {
        h = 6.5 + r() * 5;
        box('plaster', w, h, d, 0, h / 2, 0, wall);
        const rise = w * (0.55 + r() * 0.25);
        put(roofKey, gableGeo(d, w, rise, true).translate(0, h, 0), roofTint);
        if (type === 'stepped') {
          // Stepped (crow-stepped) gable rising above the front eaves.
          const steps = 3 + Math.floor(r() * 2);
          for (let i = 0; i < steps; i++) {
            const sw = w * (1 - (i + 1) / (steps + 1.2));
            box('plaster', sw, rise / steps + 0.15, 0.45, 0, h + (rise / steps) * (i + 0.5), d / 2 - 0.2, wall);
          }
          box('dark', w + 0.2, 0.25, 0.5, 0, h + 0.1, d / 2 - 0.15, 0xffffff, 1);
        }
        quad(r() < this.litChance ? 'lit' : 'unlit', 0.6, 0.9, 0, h + rise * 0.3, d / 2 + 0.25, 0);
        windows(w, d, 0, h, { skipGroundFront: true });
        door(w, d);
        if (r() < 0.6) chimney(w * 0.25, h + rise * 0.55, -d * 0.2);
        break;
      }
      case 'long': {
        h = 5.5 + r() * 3.5;
        box('plaster', w, h, d, 0, h / 2, 0, wall);
        const rise = d * (0.42 + r() * 0.15);
        put(roofKey, gableGeo(w, d, rise, false).translate(0, h, 0), roofTint);
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
        windows(w, d, 0, h, { skipGroundFront: true });
        door(w, d);
        if (r() < 0.7) chimney(-w * 0.3, h + rise * 0.6, -d * 0.1);
        break;
      }
      case 'jetty': {
        const g1 = 3.2;
        const g2 = 3 + r() * 3.5;
        h = g1 + g2;
        box(r() < 0.5 ? 'stone' : 'plaster', w, g1, d, 0, g1 / 2, 0, r() < 0.5 ? this.pick(STONE) : wall);
        // Upper floors overhang the street (jettied), half-timbered.
        box(r() < 0.5 ? 'timber' : 'timber2', w + 0.5, g2, d + 0.7, 0, g1 + g2 / 2, 0.25, this.pick(TIMBER));
        box('wood', w + 0.6, 0.25, d + 0.8, 0, g1, 0.25, 0xffffff, 1);
        const alongZ = r() < 0.5;
        const rise = (alongZ ? w : d) * (0.6 + r() * 0.2);
        const roof = alongZ ? gableGeo(d + 0.7, w + 0.5, rise, true) : gableGeo(w + 0.5, d + 0.7, rise, false);
        roof.translate(0, h, 0.25);
        put(roofKey, roof, roofTint);
        windows(w + 0.5, d + 0.7, g1, g2);
        door(w, d);
        if (r() < 0.6) chimney(w * 0.3, h + rise * 0.5, 0);
        break;
      }
      case 'hip': {
        h = 7 + r() * 4;
        const stoneBase = r() < 0.5;
        box(stoneBase ? 'stone' : 'plaster', w, h, d, 0, h / 2, 0, stoneBase ? this.pick(STONE) : wall);
        box('dark', w + 0.3, 0.35, d + 0.3, 0, h, 0, 0xffffff, 1);
        const hg = hipGeo(w, d, Math.min(w, d) * 0.5);
        hg.translate(0, h + 0.15, 0);
        put(roofKey, hg, roofTint);
        windows(w, d, 0, h, { skipGroundFront: true });
        door(w, d, true);
        chimney(-w * 0.3, h + 1.2, 0);
        chimney(w * 0.3, h + 1.2, 0);
        break;
      }
      case 'tower': {
        h = 12 + r() * 7;
        box('stone', w, h, d, 0, h / 2, 0, this.pick(STONE));
        box('dark', w + 0.4, 0.5, d + 0.4, 0, h, 0, 0xffffff, 1);
        const pg = pyramidGeo(w, d, 4 + r() * 5);
        pg.translate(0, h + 0.25, 0);
        put('slate', pg, this.pick(SLATE));
        windows(w, d, 0, h, { ww: 0.5, wh: 1.1, lit: this.litChance * 0.7, skipGroundFront: true });
        door(w, d);
        break;
      }
      case 'shop': {
        h = 6 + r() * 4;
        box('plaster', w, h, d, 0, h / 2, 0, wall);
        const alongZ = r() < 0.5;
        const rise = (alongZ ? w : d) * 0.55;
        put(roofKey, (alongZ ? gableGeo(d, w, rise, true) : gableGeo(w, d, rise, false)).translate(0, h, 0), roofTint);
        // Wide shop front with a lit display window and a sloping cloth awning.
        quad('lit', w * 0.35, 1.3, -w * 0.22, 1.5, d / 2 + 0.04, 0);
        quad('door', 1.6, 2.2, w * 0.25, 1.1, d / 2 + 0.04, 0);
        const aw = new THREE.PlaneGeometry(w * 0.9, 1.8);
        scaleUV(aw, 2);
        aw.rotateX(-Math.PI / 2 + 0.45);
        aw.translate(0, 2.9, d / 2 + 0.8);
        put('cloth', aw, this.pick(AWNING));
        windows(w, d, 0, h, { skipGroundFront: true });
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
        for (let i = 0; i < 4; i++) quad('lit', 0.8, 2.4, -w * 0.12 + w * 0.35 + 0.03, 4 + (i % 2) * 0.2, -d * 0.12 - nl / 2 + nl * ((i + 0.5) / 4), Math.PI / 2);
        quad('door', 1.6, 2.6, w * 0.3, 1.3, d / 2 - 0.27, 0);
        break;
      }
      default:
        throw new Error('unknown building type ' + type);
    }
    if (lot.collide !== false) {
      const pad = type === 'jetty' ? 0.15 : 0;
      this.colliders.push({ cx: x, cz: z, hx: w / 2 + pad, hz: d / 2 + pad, rot });
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
      if (['plaster', 'timber', 'timber2', 'stone'].includes(key)) blockers.push(mesh);
    }
    return { group, blockers, colliders: this.colliders };
  }
}
