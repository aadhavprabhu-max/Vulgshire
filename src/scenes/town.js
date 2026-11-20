import * as THREE from 'three';
import { tex } from '../retro/textures.js';
import { boxGeo, gableGeo, quadGeo, mergedMesh, mulberry } from './kit.js';

// Procedural medieval town: half-timbered houses with gable roofs, rows of
// small windows (some lit amber), and the occasional church tower with a spire.
// Everything is merged into a handful of meshes so hundreds of houses stay cheap.

const shared = {};
function materials() {
  if (shared.walls) return shared;
  shared.walls = [0, 1, 2].map((v) => new THREE.MeshLambertMaterial({ map: tex.plaster(v) }));
  shared.stone = new THREE.MeshLambertMaterial({ map: tex.darkStone() });
  shared.roof = new THREE.MeshLambertMaterial({ map: tex.roofTile() });
  shared.slate = new THREE.MeshLambertMaterial({ map: tex.slate() });
  shared.lit = new THREE.MeshBasicMaterial({ map: tex.litWindow() });
  shared.dark = new THREE.MeshBasicMaterial({ map: tex.windowDark() });
  return shared;
}

/**
 * @param {object} o
 * @param {number} o.seed
 * @param {number} o.count       target number of houses
 * @param {number[]} o.bounds    [x0, x1, z0, z1]
 * @param {(x:number,z:number)=>number} o.groundY
 * @param {(x:number,z:number,r:number)=>boolean} [o.avoid]  return true to skip a spot
 */
export function buildTown({ seed, count, bounds, groundY, avoid = () => false, minH = 6, maxH = 12, minW = 4, maxW = 8, litChance = 0.3, spireChance = 0.05, gridAngle = 0 }) {
  const M = materials();
  const rnd = mulberry(seed);
  const [x0, x1, z0, z1] = bounds;
  const walls = [[], [], []];
  const stone = [];
  const roofs = [];
  const slate = [];
  const lit = [];
  const dark = [];
  const placed = [];

  const addWindows = (cx, cz, w, d, baseY, h, rot, litP) => {
    // Windows on all four faces, one row per ~3 m storey.
    const floors = Math.max(1, Math.floor((h - 1) / 3));
    const faces = [
      [0, d / 2, w, 0],
      [Math.PI, d / 2, w, 0],
      [Math.PI / 2, w / 2, d, 0],
      [-Math.PI / 2, w / 2, d, 0],
    ];
    for (const [fa, off, span] of faces) {
      const n = Math.max(1, Math.floor(span / 2.2));
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < n; i++) {
          if (rnd() < 0.25) continue;
          const u = -span / 2 + (span / n) * (i + 0.5);
          const y = baseY + 1.8 + f * 3;
          // Local face position, then rotate by the house angle + face angle.
          const a = rot + fa;
          const px = cx + Math.sin(a) * (off + 0.03) + Math.cos(a) * u;
          const pz = cz + Math.cos(a) * (off + 0.03) - Math.sin(a) * u;
          (rnd() < litP ? lit : dark).push(quadGeo(0.6, 0.9, px, y, pz, a));
        }
      }
    }
  };

  let tries = 0;
  let made = 0;
  while (made < count && tries < count * 12) {
    tries++;
    const x = x0 + rnd() * (x1 - x0);
    const z = z0 + rnd() * (z1 - z0);
    const isSpire = rnd() < spireChance;
    const w = isSpire ? 5 + rnd() * 2 : minW + rnd() * (maxW - minW);
    const d = isSpire ? w : minW + rnd() * (maxW - minW);
    const r = Math.max(w, d) * 0.62;
    if (avoid(x, z, r)) continue;
    if (placed.some(([px, pz, pr]) => (px - x) ** 2 + (pz - z) ** 2 < (pr + r) ** 2)) continue;
    placed.push([x, z, r]);
    made++;
    const gy = groundY(x, z);
    const rot = gridAngle + (rnd() - 0.5) * 0.5 + (rnd() < 0.5 ? 0 : Math.PI / 2);
    if (isSpire) {
      const h = maxH * 1.8 + rnd() * maxH * 1.4;
      stone.push(boxGeo(w, h, d, x, gy + h / 2, z, rot));
      const sp = new THREE.ConeGeometry(w * 0.72, h * 0.55, 4, 1);
      sp.rotateY(Math.PI / 4 + rot);
      sp.translate(x, gy + h + h * 0.275, z);
      slate.push(sp);
      addWindows(x, z, w, d, gy + h - 6, 5, rot, 0.5);
      continue;
    }
    const h = minH + rnd() * (maxH - minH);
    walls[Math.floor(rnd() * 3)].push(boxGeo(w, h, d, x, gy + h / 2, z, rot));
    const rise = 2 + rnd() * 2.5;
    (rnd() < 0.75 ? roofs : slate).push(gableGeo(w, d, rise, x, gy + h, z, rot, 0.35));
    addWindows(x, z, w, d, gy, h, rot, litChance);
  }

  const g = new THREE.Group();
  g.name = 'town';
  walls.forEach((list, i) => list.length && g.add(mergedMesh(list, M.walls[i])));
  if (stone.length) g.add(mergedMesh(stone, M.stone));
  if (roofs.length) g.add(mergedMesh(roofs, M.roof));
  if (slate.length) g.add(mergedMesh(slate, M.slate));
  if (lit.length) g.add(mergedMesh(lit, M.lit));
  if (dark.length) g.add(mergedMesh(dark, M.dark));
  return g;
}
