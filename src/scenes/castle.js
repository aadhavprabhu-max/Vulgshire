import * as THREE from 'three';
import { scaleUV, tex } from '../retro/textures.js';
import { mergedMesh, boxGeo, merlonGeos, quadGeo, mulberry } from './kit.js';
import { smokeColumn, fireCluster } from './fx.js';
import { landmarkMaterial } from '../retro/retroMaterial.js';

// The Crownkeep, after docs/keep_reference.png (a crop of reference 03): a dense
// cluster of tall gothic towers, each a square shaft, an octagonal belfry and a
// needle spire with pinnacles; a great spire just right of centre, a tall lit
// royal tower on the right, smaller spires and round turrets to the left, steep
// palace roofs, and a crenellated curtain wall with a gatehouse in front.
// Warm light comes from within (lit lancets, glowing belfries); at night the
// roofs burn, smoke rises and embers drift (setNight).
//
// Local frame: facade towards +z, x to the viewer's right, `top` = hill top.

/** Where the Crownkeep stands (North Shore coordinates), shared by every scene. */
export const CROWNKEEP = { x: 205, z: 0, top: 12, r: 66, slope: 40, scale: 1.8 };
export const CROWNKEEP_PRECINCT = CROWNKEEP.r + CROWNKEEP.slope + 3; // houses keep out
// Height scale of the towers: the great spire tops out around 140 m in the
// North Shore (x1.45), towering over the town but still framed from the bridge.
const TS = 0.555; // shafts and belfries
const SS = 0.66; // needle spires (tall and thin, like the reference)
const FOOT = 12; // footings below the hill top (so nothing floats on the slope)
export function buildCastle(M, cz, top) {
  const group = new THREE.Group();
  const animated = [];
  const stone = [];
  const roofs = [];
  const lit = [];
  const dark = [];
  const rnd = mulberry(321);
  // Thinner fog than the town, so the keep reads across the city like in the reference.
  const mat = {
    stone: landmarkMaterial(M.castle.clone(), 0.45),
    roof: landmarkMaterial(M.slate.clone(), 0.45),
    lit: landmarkMaterial(M.lit.clone(), 0.45),
    dark: landmarkMaterial(new THREE.MeshBasicMaterial({ color: 0x17110f }), 0.45),
  };
  mat.lit.userData.glow = true; // windows dim by day (day/night cycle)
  // Lighter slate and a faint violet self-glow: the needle spires must read as
  // silhouettes against the night sky (the reference's purple sky does this).
  mat.roof.color.set(0xc4bcd8);
  mat.roof.emissive.set(0x2c2440);
  mat.stone.emissive.set(0x1c1418);

  const win = (x, y, z, rotY, w = 0.9, h = 2.0, chance = 0.6) => (rnd() < chance ? lit : dark).push(quadGeo(w, h, x, y, z, rotY));
  // Windows on one face of a box (centre x,z; half sizes hx,hz), rows from y0 every dy.
  const faceWindows = (x, z, hx, hz, y0, y1, dy, chance, { w = 0.9, h = 2.0, step = 2.6 } = {}) => {
    for (const [a, off, span] of [
      [0, hz, hx],
      [Math.PI, hz, hx],
      [Math.PI / 2, hx, hz],
      [-Math.PI / 2, hx, hz],
    ]) {
      const n = Math.max(1, Math.floor((span * 2) / step));
      for (let y = y0; y < y1; y += dy)
        for (let i = 0; i < n; i++) {
          const u = -span + ((span * 2) / n) * (i + 0.5);
          win(x + Math.sin(a) * (off + 0.06) + Math.cos(a) * u, y, z + Math.cos(a) * (off + 0.06) - Math.sin(a) * u, a, w, h, a === 0 ? chance : chance * 0.8);
        }
    }
  };
  const cone = (r, h, x, y, z, sides = 8) => {
    const g = new THREE.ConeGeometry(r, h, sides, 1);
    if (sides === 4) g.rotateY(Math.PI / 4);
    else g.rotateY(Math.PI / sides);
    g.translate(x, y + h / 2, z);
    roofs.push(scaleUV(g, 2));
  };
  const pinnacle = (x, y, z, s = 1) => {
    stone.push(boxGeo(0.7 * s, 1.2 * s, 0.7 * s, x, y + 0.6 * s, z, 0, 1));
    cone(0.42 * s, 3.2 * s, x, y + 1.2 * s, z, 4);
  };
  const glows = [];
  // A gothic tower: square shaft, corner buttresses and pinnacles, an octagonal
  // belfry full of lit lancets, and a needle spire with little lit lucarnes.
  const tower = (x, z, w, h, belfry, spire, chance = 0.5) => {
    h *= TS;
    belfry *= TS;
    spire *= SS;
    const y0 = top - FOOT; // footings run down into the hill
    stone.push(boxGeo(w, h + FOOT, w, x, y0 + (h + FOOT) / 2, z));
    for (const [ox, oz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      stone.push(boxGeo(w * 0.2, h * 0.82, w * 0.2, x + ox * (w / 2 + w * 0.04), y0 + (h * 0.82) / 2 + FOOT, z + oz * (w / 2 + w * 0.04), 0, 1));
      pinnacle(x + ox * (w / 2 - 0.2), top + h, z + oz * (w / 2 - 0.2), Math.max(0.8, w / 9));
    }
    faceWindows(x, z, w / 2, w / 2, top + 5, top + h - 3, 5.2, chance, { w: Math.min(1.1, w * 0.11), h: 2.4 });
    const rb = w * 0.4;
    const bg = new THREE.CylinderGeometry(rb, rb * 1.06, belfry, 8);
    bg.rotateY(Math.PI / 8);
    bg.translate(x, top + h + belfry / 2, z);
    stone.push(scaleUV(bg, 2));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = rb * Math.cos(Math.PI / 8) + 0.05;
      win(x + Math.sin(a) * rr, top + h + belfry * 0.5, z + Math.cos(a) * rr, a, Math.min(1.2, rb * 0.55), belfry * 0.55, 0.85);
    }
    const sr = rb * 1.0;
    cone(sr, spire, x, top + h + belfry, z, 8);
    // Lucarnes a quarter of the way up the spire, lit from inside.
    const ly = top + h + belfry + spire * 0.22;
    const lr = sr * (1 - 0.22) + 0.08;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 8;
      win(x + Math.sin(a) * lr, ly, z + Math.cos(a) * lr, a, Math.max(0.5, rb * 0.25), Math.max(0.9, rb * 0.45), 0.9);
    }
    stone.push(boxGeo(0.25, 2.4, 0.25, x, top + h + belfry + spire + 1.0, z, 0, 1)); // finial
    glows.push([x, top + h + belfry * 0.5, z, rb * 2.4]);
    return { x, z, w, shaftTop: top + h, belfryTop: top + h + belfry, rb };
  };
  // A round turret with a conical cap.
  const turret = (x, z, r, h, cap, chance = 0.5) => {
    h *= 0.85;
    cap *= 0.9;
    const g = new THREE.CylinderGeometry(r, r * 1.08, h + FOOT, 10);
    g.translate(x, top - FOOT + (h + FOOT) / 2, z);
    stone.push(scaleUV(g, 2));
    const ring = new THREE.CylinderGeometry(r + 0.5, r + 0.5, 1.2, 10);
    ring.translate(x, top + h, z);
    stone.push(scaleUV(ring, 2));
    cone(r + 0.9, cap, x, top + h + 0.6, z, 10);
    for (let y = top + 5; y < top + h - 2; y += 5.5)
      for (let k = 0; k < 3; k++) {
        const a = -0.7 + k * 0.7;
        win(x + Math.sin(a) * (r + 0.08), y, z + Math.cos(a) * (r + 0.08), a, 0.8, 1.8, chance);
      }
  };
  // A palace range: steep gabled roof (ridge along x), pinnacles along the ridge.
  const hall = (x, z, w, d, h, rise, chance = 0.6) => {
    h *= 0.65;
    rise *= 0.8;
    const info = { x, z, w, d, eaves: top + h, rise, roofAt: (dz) => top + h + rise * Math.max(0, 1 - Math.abs(dz) / (d / 2 + 0.6)) };
    stone.push(boxGeo(w, h + FOOT, d, x, top - FOOT + (h + FOOT) / 2, z));
    const s = new THREE.Shape();
    s.moveTo(-d / 2 - 0.6, 0);
    s.lineTo(d / 2 + 0.6, 0);
    s.lineTo(0, rise);
    s.lineTo(-d / 2 - 0.6, 0);
    const rg = scaleUV(new THREE.ExtrudeGeometry(s, { depth: w + 1.2, bevelEnabled: false }), 0.5);
    rg.translate(0, 0, -(w + 1.2) / 2);
    rg.rotateY(Math.PI / 2);
    rg.translate(x, top + h, z);
    roofs.push(rg);
    for (let px = x - w / 2 + 3; px <= x + w / 2 - 3; px += 6) cone(0.5, 5, px, top + h + rise - 0.6, z, 4);
    for (const sx of [-1, 1]) pinnacle(x + sx * (w / 2), top + h, z + d / 2, 1.2);
    faceWindows(x, z, w / 2, d / 2, top + 4, top + h - 2, 4.6, chance, { w: 1.1, h: 2.8, step: 3.2 });
    // Dormers (lit) on the front slope.
    for (let px = x - w / 2 + 4; px <= x + w / 2 - 4; px += 7) {
      stone.push(boxGeo(1.6, 2.2, 1.6, px, top + h + rise * 0.3, z + d / 4, 0, 1));
      cone(1.3, 2.2, px, top + h + rise * 0.3 + 1.1, z + d / 4, 4);
      win(px, top + h + rise * 0.3, z + d / 4 + 0.85, 0, 0.7, 1.2, 0.7);
    }
    return info;
  };

  // ---- Curtain wall and gatehouse (front) --------------------------------------
  // (kept within about 58 m of the hill centre, so it never reaches the houses)
  const wallZ = cz + 36;
  const WT = top + 16; // wall walk
  stone.push(boxGeo(80, 16 + FOOT, 3.4, 0, top - FOOT + (16 + FOOT) / 2, wallZ));
  const mer = merlonGeos(80, 0, WT, wallZ + 1.3, 0, { w: 1.0, h: 1.2, d: 0.8, gap: 0.9 });
  for (const x of [-24, 24]) {
    stone.push(boxGeo(9, 24 + FOOT, 9, x, top - FOOT + (24 + FOOT) / 2, wallZ));
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pinnacle(x + ox * 4.2, top + 24, wallZ + oz * 4.2, 1.1);
    faceWindows(x, wallZ, 4.5, 4.5, top + 6, top + 22, 5, 0.5);
  }
  turret(-40, wallZ, 4.4, 22, 13, 0.4);
  turret(40, wallZ, 4.4, 20, 12, 0.4);
  turret(-8, wallZ + 1.5, 3.6, 24, 12, 0.5); // gatehouse towers
  turret(8, wallZ + 1.5, 3.6, 24, 12, 0.5);
  stone.push(boxGeo(12, 18 + FOOT, 5, 0, top - FOOT + (18 + FOOT) / 2, wallZ + 1)); // gatehouse block
  dark.push(quadGeo(5, 8, 0, top + 4, wallZ + 3.56)); // gate passage
  for (let x = -36; x <= 36; x += 6) if (Math.abs(x) > 13 && Math.abs(Math.abs(x) - 24) > 6) win(x, top + 9, wallZ + 1.76, 0, 0.6, 1.3, 0.45);

  // ---- The palace ranges ----------------------------------------------------------
  const hallW = hall(-31, cz + 22, 34, 12, 22, 13, 0.6);
  const hallC = hall(8, cz + 16, 36, 22, 28, 17, 0.7);
  hall(-20, cz - 14, 26, 12, 24, 13, 0.5);
  hall(28, cz - 16, 24, 12, 20, 12, 0.5);

  // ---- The towers: great spire just right of centre, royal tower on the right ----
  const great = tower(10, cz + 2, 13, 66, 15, 56, 0.55); // the Great Spire (tallest)
  const royal = tower(37, cz + 10, 15, 58, 13, 36, 0.75); // the Royal Tower (block of light)
  const westSpire = tower(-6, cz + 6, 8.5, 48, 9, 32, 0.5);
  const tw4 = tower(-24, cz + 4, 6.5, 38, 7, 24, 0.5);
  tower(-38, cz + 12, 5.5, 31, 6, 19, 0.45);
  tower(-45, cz - 4, 6.5, 40, 7, 26, 0.45);
  tower(-30, cz - 16, 5.5, 29, 6, 18, 0.4);
  tower(24, cz - 6, 7.5, 45, 8, 27, 0.5);
  tower(50, cz - 4, 6, 33, 6.5, 21, 0.5);
  tower(22, cz + 26, 5.5, 34, 6, 19, 0.5);
  tower(2, cz - 22, 9, 42, 8, 26, 0.45);
  tower(-14, cz - 24, 6, 31, 6, 18, 0.4);
  tower(36, cz - 24, 6.5, 36, 7, 21, 0.4);
  turret(-46, cz + 22, 3.6, 27, 13, 0.5);
  turret(-15, cz + 26, 3.2, 31, 14, 0.5);
  turret(47, cz + 22, 3.6, 25, 12, 0.5);
  turret(-52, cz - 16, 3.4, 22, 11, 0.4);

  group.add(mergedMesh(stone, mat.stone, { cast: false }));
  group.add(mergedMesh(mer, mat.stone));
  group.add(mergedMesh(roofs, mat.roof));
  group.add(mergedMesh(lit, mat.lit));
  group.add(mergedMesh(dark, mat.dark));

  // ---- Light from within: warm glows in the belfries (always), fill lights ------
  const glowMat = new THREE.SpriteMaterial({ map: tex.halo(), color: 0xff9a40, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, fog: true });
  glows.map(([x, y, z, s]) => {
    const sp = new THREE.Sprite(glowMat);
    sp.position.set(x, y, z);
    sp.scale.set(s, s * 1.2, 1);
    group.add(sp);
    return sp;
  });
  const fills = [
    [-22, top + 12, wallZ + 16],
    [24, top + 12, wallZ + 16],
  ].map(([x, y, z]) => {
    const l = new THREE.PointLight(0xff7a2a, 260, 170, 1.3);
    l.position.set(x, y, z);
    l.userData.dnSkip = true; // setNight dims these
    group.add(l);
    return l;
  });

  // ---- Night fires on the roofs and walls, smoke, braziers -----------------------
  const night = [];
  const fires = [
    [-24, hallW.roofAt(3), hallW.z + 3, 6, true],
    [16, hallC.roofAt(8), hallC.z + 8, 5, false],
    [great.x, great.belfryTop + 0.3, great.z + great.rb, 3.5, false],
    [westSpire.x, westSpire.shaftTop + 0.3, westSpire.z + westSpire.w / 2, 3, false],
    [royal.x, royal.shaftTop + 0.3, royal.z + royal.w / 2, 4, true],
    [-34, WT + 0.2, wallZ + 1.2, 5, true],
    [36, WT + 0.2, wallZ + 1.2, 4, false],
    [2, hallC.roofAt(2), hallC.z - 2, 7, false],
    [tw4.x, tw4.shaftTop + 0.3, tw4.z + tw4.w / 2, 3, false],
  ];
  for (const [x, y, z, spread, light] of fires) {
    const f = fireCluster({ x, y, z, spread, flames: Math.round(spread * 1.8), size: 2.6 + spread * 0.25, light: light ? { intensity: 160, distance: 120, decay: 1.2 } : null });
    group.add(f.group);
    animated.push(f);
    night.push(f.group);
  }
  // Braziers along the curtain wall.
  for (const x of [-36, -15, 15, 36]) {
    const f = fireCluster({ x, y: WT + 0.4, z: wallZ + 1.3, spread: 0.6, flames: 2, size: 1.4 });
    group.add(f.group);
    animated.push(f);
    night.push(f.group);
  }
  for (const [x, z, h, y] of [
    [-24, hallW.z + 3, 34, hallW.roofAt(3) + 3],
    [great.x, great.z + great.rb, 32, great.belfryTop + 3.5],
    [royal.x, royal.z + royal.w / 2, 30, royal.shaftTop + 3.5],
  ]) {
    const s = smokeColumn({ x, y, z, height: h, puffs: 14, size: 3.6, sway: 4, speed: 2.4, tint: 0x9a8c9c });
    group.add(s.group);
    animated.push(s);
    night.push(s.group);
  }

  let nightK = 1;
  return {
    group,
    animated,
    /** 0 = full day (no fires, smoke or embers; dim glows), 1 = full night. */
    setNight(k) {
      if (Math.abs(k - nightK) < 0.002) return;
      nightK = k;
      const on = k > 0.08;
      for (const o of night) {
        o.visible = on;
        o.scale.setScalar(0.35 + 0.65 * Math.min(1, k * 1.4));
      }
      glowMat.opacity = 0.08 + 0.27 * k;
      for (const l of fills) l.intensity = 40 + 220 * k;
    },
    get nightK() {
      return nightK;
    },
    nightObjects: night,
  };
}
