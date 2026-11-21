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
  function buildGround({ px0, px1, py0, py1, waterY, skip = () => false, parapetWhere = () => false }) {
    const gPos = [];
    const gUv = [];
    const qPos = [];
    const qUv = [];
    const parapets = [];
    const land = (px, py) => px >= 0 && py >= 0 && px < W && py < H && !WATER[py * W + px];
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
      while (px < px1) {
        if (!land(px, py)) {
          px++;
          continue;
        }
        const s = px;
        while (px < px1 && land(px, py)) px++;
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

  return { toPx, toZone, isWater, inRegion, waterNear, buildGround, W, H };
}
