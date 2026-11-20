import * as THREE from 'three';
import { scaleUV } from '../retro/textures.js';
import { mergedMesh, boxGeo, merlonGeos, quadGeo, mulberry } from './kit.js';
import { smokeColumn, fireCluster } from './fx.js';

// The Crownkeep: curtain wall with round towers, a tall gothic palace with a
// forest of spires, rows of amber-lit windows, braziers, and fires on the roofs.
export function buildCastle(M, cz, top) {
  const group = new THREE.Group();
  const animated = [];
  const castleGeos = [];
  const merlons = [];
  const lit = [];
  const spires = [];
  const rnd = mulberry(321);

  const litGrid = (x, z, w, y0, rows, cols, rotY = 0, chance = 0.75) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rnd() > chance) continue;
        const u = -w / 2 + (w / cols) * (c + 0.5);
        const px = x + Math.cos(rotY) * u;
        const pz = z - Math.sin(rotY) * u;
        lit.push(quadGeo(0.9, 1.6, px, y0 + r * 3.4, pz, rotY));
      }
    }
  };
  const tower = (x, z, w, h, spireH) => {
    castleGeos.push(boxGeo(w, h, w, x, top + h / 2, z));
    merlons.push(...merlonGeos(w + 0.6, x, top + h, z + w / 2, 0, { w: 0.8, h: 0.9, d: 0.8, gap: 0.7 }));
    merlons.push(...merlonGeos(w + 0.6, x, top + h, z - w / 2, 0, { w: 0.8, h: 0.9, d: 0.8, gap: 0.7 }));
    merlons.push(...merlonGeos(w + 0.6, x + w / 2, top + h, z, Math.PI / 2, { w: 0.8, h: 0.9, d: 0.8, gap: 0.7 }));
    merlons.push(...merlonGeos(w + 0.6, x - w / 2, top + h, z, Math.PI / 2, { w: 0.8, h: 0.9, d: 0.8, gap: 0.7 }));
    const sp = new THREE.ConeGeometry(w * 0.55, spireH, 4, 1);
    sp.rotateY(Math.PI / 4);
    sp.translate(x, top + h + spireH / 2, z);
    spires.push(sp);
    // Corner pinnacles.
    for (const [ox, oz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const p = new THREE.ConeGeometry(0.45, spireH * 0.35, 4, 1);
      p.translate(x + (ox * w) / 2, top + h + 0.9 + spireH * 0.175, z + (oz * w) / 2);
      spires.push(p);
    }
    litGrid(x, z + w / 2 + 0.05, w, top + 4, Math.floor(h / 3.4) - 1, Math.max(1, Math.floor(w / 2.6)), 0, 0.6);
  };

  // Curtain wall facing the bridge, with a gate house in the middle.
  const wallZ = cz + 40;
  castleGeos.push(boxGeo(96, 12, 3, 0, top + 6, wallZ));
  merlons.push(...merlonGeos(96, 0, top + 12, wallZ + 1.2, 0, { w: 0.9, h: 1.0, d: 0.7, gap: 0.8 }));
  for (const x of [-48, -24, 24, 48]) {
    const g = new THREE.CylinderGeometry(4, 4.4, 20, 8);
    scaleUV(g, 2);
    g.translate(x, top + 10, wallZ);
    castleGeos.push(g);
    const sp = new THREE.ConeGeometry(5.2, 10, 8, 1);
    sp.translate(x, top + 25, wallZ);
    spires.push(sp);
    lit.push(quadGeo(0.8, 1.4, x, top + 13, wallZ + 4.45));
  }
  // Main palace block with a steep roof.
  castleGeos.push(boxGeo(46, 24, 26, 0, top + 12, cz + 6));
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-14, 0);
  roofShape.lineTo(14, 0);
  roofShape.lineTo(0, 13);
  roofShape.lineTo(-14, 0);
  const roof = scaleUV(new THREE.ExtrudeGeometry(roofShape, { depth: 47, bevelEnabled: false }), 0.5);
  roof.translate(0, 0, -23.5);
  roof.rotateY(Math.PI / 2);
  roof.translate(0, top + 24, cz + 6);
  spires.push(roof);
  litGrid(0, cz + 19.05, 42, top + 5, 5, 12, 0, 0.7);
  // Great central tower and a crowd of spired towers (like the reference skyline).
  tower(4, cz + 10, 11, 46, 26);
  tower(-17, cz + 14, 7, 32, 15);
  tower(21, cz + 16, 7, 28, 14);
  tower(-29, cz + 2, 6, 24, 12);
  tower(31, cz, 7, 36, 17);
  tower(-8, cz - 6, 8, 40, 20);
  tower(15, cz - 10, 6, 30, 15);
  tower(-24, cz - 12, 5, 22, 11);
  tower(36, cz + 24, 5, 18, 10);
  tower(-38, cz + 22, 5, 16, 9);

  group.add(mergedMesh(castleGeos, M.castle, { cast: false }));
  group.add(mergedMesh(merlons, M.castle));
  group.add(mergedMesh(spires, M.slate));
  group.add(mergedMesh(lit, M.lit));

  // Fires on the roofs and battlements, washing the stone in amber.
  const fires = [
    [-12, top + 24, cz + 19, 6, true],
    [14, top + 24, cz + 18, 5, false],
    [4, top + 47, cz + 16, 4, true],
    [-17, top + 33, cz + 18, 3, false],
    [21, top + 29, cz + 20, 3, false],
    [-30, top + 12.5, wallZ + 1, 5, true],
    [34, top + 12.5, wallZ + 1, 4, false],
    [0, top + 37, cz + 6, 7, false],
    [-8, top + 41, cz - 2, 3, false],
  ];
  for (const [x, y, z, spread, light] of fires) {
    const f = fireCluster({ x, y, z, spread, flames: Math.round(spread * 1.8), size: 2.6 + spread * 0.25, light: light ? { intensity: 160, distance: 120, decay: 1.2 } : null });
    group.add(f.group);
    animated.push(f);
  }
  // Braziers along the curtain wall (steady amber glow).
  for (const x of [-36, -12, 12, 36]) {
    const f = fireCluster({ x, y: top + 12.4, z: wallZ + 1.2, spread: 0.6, flames: 2, size: 1.4 });
    group.add(f.group);
    animated.push(f);
  }
  // Big warm fill lights in front of the facade.
  for (const [x, y, z] of [
    [-20, top + 10, wallZ + 14],
    [22, top + 10, wallZ + 14],
  ]) {
    const l = new THREE.PointLight(0xff7a2a, 260, 160, 1.3);
    l.position.set(x, y, z);
    group.add(l);
  }
  // Smoke rising from the blaze.
  for (const [x, z, h] of [
    [-12, cz + 19, 34],
    [4, cz + 16, 30],
    [-30, wallZ + 1, 26],
  ]) {
    const s = smokeColumn({ x, y: x === 4 ? top + 50 : top + 28, z, height: h, puffs: 14, size: 3.6, sway: 4, speed: 2.4, tint: 0x9a8c9c });
    group.add(s.group);
    animated.push(s);
  }
  return { group, animated };
}

