import * as THREE from 'three';
import MASKS from '../data/mapmasks.json';
import { LOCATIONS } from '../data/world.js';

// Terrain read straight from the final map: the water mask (lake + rivers) and
// the owner's outlined walkable district. Built by tools/build_masks.py.
//
// Zone coordinates: x = east, z = south, metres; one map pixel = K metres.

export const K = LOCATIONS.metresPerPixel * LOCATIONS.gameScale; // 1.4 m per map px
const [W, H] = MASKS.size;

function decode(rows) {
  const m = new Uint8Array(W * H);
  rows.forEach((runs, y) => {
    for (const [a, b] of runs) m.fill(1, y * W + a, y * W + b);
  });
  return m;
}
const WATER = decode(MASKS.water);
const REGION = decode(MASKS.northShore);

export function createMapTerrain(originPx) {
  const [ox, oy] = originPx;
  const toPx = (x, z) => [Math.floor(x / K + ox), Math.floor(z / K + oy)];
  const toZone = (px, py) => [(px - ox) * K, (py - oy) * K];
  const at = (m, x, z) => {
    const [px, py] = toPx(x, z);
    if (px < 0 || py < 0 || px >= W || py >= H) return 0;
    return m[py * W + px];
  };
  const isWater = (x, z) => at(WATER, x, z) === 1;
  const inRegion = (x, z) => at(REGION, x, z) === 1;
  // True if there is water within r metres (samples a ring + centre).
  const waterNear = (x, z, r) => {
    if (isWater(x, z)) return true;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (isWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true;
      if (isWater(x + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5)) return true;
    }
    return false;
  };

  /**
   * Ground (land only, merged row runs), quay walls along every shore, low
   * parapets on walkable shores, all inside the map pixel box [px0..px1)x[py0..py1).
   */
  function buildGround({ px0, px1, py0, py1, waterY, skip = () => false, parapetWhere = () => false, waterAt = null, noQuay = null, noGround = null, maxRun = 64 }) {
    const gPos = [];
    const gUv = [];
    const qPos = [];
    const qUv = [];
    const parapets = [];
    // Land test, optionally with extra water carved in (cached per pixel).
    const bw = px1 - px0 + 2;
    const cache = new Int8Array(bw * (py1 - py0 + 2));
    const land = (px, py) => {
      if (px < 0 || py < 0 || px >= W || py >= H || WATER[py * W + px]) return false;
      if (!waterAt) return true;
      const ci = (py - py0 + 1) * bw + (px - px0 + 1);
      if (ci < 0 || ci >= cache.length || px < px0 - 1 || px > px1) return !waterAt(...toZone(px + 0.5, py + 0.5));
      if (!cache[ci]) cache[ci] = waterAt(...toZone(px + 0.5, py + 0.5)) ? 2 : 1;
      return cache[ci] === 1;
    };
    const quad = (pos, uv, a, b, c, d, ua, ub, uc, ud) => {
      for (const [p, u] of [
        [a, ua],
        [b, ub],
        [c, uc],
        [a, ua],
        [c, uc],
        [d, ud],
      ]) {
        pos.push(...p);
        uv.push(...u);
      }
    };
    for (let py = py0; py < py1; py++) {
      // Ground: runs of land pixels in this row.
      let px = px0;
      // Runs are capped at maxRun pixels: no kilometre-long sliver triangles
      // (they snap and interpolate badly). noGround cuts holes (e.g. under a
      // bridge deck) without adding quay walls.
      const solid = (x) => land(x, py) && !(noGround && noGround(...toZone(x + 0.5, py + 0.5)));
      while (px < px1) {
        if (!solid(px)) {
          px++;
          continue;
        }
        const s = px;
        while (px < px1 && solid(px) && px - s < maxRun) px++;
        const [x0, z0] = toZone(s, py);
        const [x1, z1] = toZone(px, py + 1);
        quad(gPos, gUv, [x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0 / 2, z0 / 2], [x0 / 2, z1 / 2], [x1 / 2, z1 / 2], [x1 / 2, z0 / 2]);
      }
      // Quay walls: land/water edges facing north/south (merged along x) ...
      for (const dir of [-1, 1]) {
        let qx = px0;
        while (qx < px1) {
          const edge = (x) => land(x, py) && !land(x, py + dir);
          if (!edge(qx)) {
            qx++;
            continue;
          }
          const s = qx;
          while (qx < px1 && edge(qx)) qx++;
          const zz = toZone(0, dir > 0 ? py + 1 : py)[1];
          const xa = toZone(s, 0)[0];
          const xb = toZone(qx, 0)[0];
          const len = xb - xa;
          if (noQuay && noQuay((xa + xb) / 2, zz)) continue;
          if (dir > 0) quad(qPos, qUv, [xa, 0, zz], [xa, waterY - 1, zz], [xb, waterY - 1, zz], [xb, 0, zz], [xa / 2, 0], [xa / 2, 2.5], [xb / 2, 2.5], [xb / 2, 0]);
          else quad(qPos, qUv, [xb, 0, zz], [xb, waterY - 1, zz], [xa, waterY - 1, zz], [xa, 0, zz], [xb / 2, 0], [xb / 2, 2.5], [xa / 2, 2.5], [xa / 2, 0]);
          const mid = (xa + xb) / 2;
          const zIn = zz - dir * 0.35;
          if (parapetWhere(mid, zIn) && !skip(mid, zIn)) parapets.push([mid, zIn, len, 0.5]);
        }
      }
      // ... and facing east/west (one pixel tall each).
      for (let x = px0; x < px1; x++) {
        for (const dir of [-1, 1]) {
          if (!land(x, py) || land(x + dir, py)) continue;
          const xx = toZone(dir > 0 ? x + 1 : x, 0)[0];
          const [, za] = toZone(0, py);
          const [, zb] = toZone(0, py + 1);
          if (noQuay && noQuay(xx, (za + zb) / 2)) continue;
          if (dir > 0) quad(qPos, qUv, [xx, 0, zb], [xx, waterY - 1, zb], [xx, waterY - 1, za], [xx, 0, za], [zb / 2, 0], [zb / 2, 2.5], [za / 2, 2.5], [za / 2, 0]);
          else quad(qPos, qUv, [xx, 0, za], [xx, waterY - 1, za], [xx, waterY - 1, zb], [xx, 0, zb], [za / 2, 0], [za / 2, 2.5], [zb / 2, 2.5], [zb / 2, 0]);
          const xIn = xx - dir * 0.35;
          const mz = (za + zb) / 2;
          if (parapetWhere(xIn, mz) && !skip(xIn, mz)) parapets.push([xIn, mz, 0.5, zb - za]);
        }
      }
    }
    const geo = (pos, uv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    };
    return { ground: geo(gPos, gUv), quays: geo(qPos, qUv), parapets };
  }

  /** Water surface only where the map has water (row runs), minus `skip` areas. */
  function buildWater({ px0, px1, py0, py1, y, skip = () => false }) {
    const pos = [];
    const uv = [];
    const ok = (px, py) => px >= 0 && py >= 0 && px < W && py < H && WATER[py * W + px] && !skip(...toZone(px + 0.5, py + 0.5));
    for (let py = py0; py < py1; py++) {
      let px = px0;
      while (px < px1) {
        if (!ok(px, py)) {
          px++;
          continue;
        }
        const s = px;
        while (px < px1 && ok(px, py)) px++;
        const [x0, z0] = toZone(s, py);
        const [x1, z1] = toZone(px, py + 1);
        for (const [x, z] of [
          [x0, z0],
          [x0, z1],
          [x1, z1],
          [x0, z0],
          [x1, z1],
          [x1, z0],
        ]) {
          pos.push(x, y, z);
          uv.push(x / 8, z / 8);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  return { toPx, toZone, isWater, inRegion, waterNear, buildGround, buildWater, W, H };
}
