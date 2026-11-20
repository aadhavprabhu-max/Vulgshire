import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, archHole, shadowy, box, spire, buildSky, flickerTorches, mergedMesh, boxGeo, merlonGeos, quadGeo, mulberry } from './kit.js';
import { buildTown } from './town.js';
import { smokeColumn, embers, fireCluster } from './fx.js';
import { createGuard } from '../characters/guard.js';

// The torch-lit bridge to the burning castle (reference 03-burning-castle-bridge.png).
// Placement on the final map: the stone bridge over the NORTH river, just west of
// the Crownkeep (the royal fortress on high ground). The river runs across the
// view and flows south into the lake; the monk walks east (-Z here) toward the keep.
//
// Heights: bridge deck y = 0, river surface y = -9, town banks y = -3,
// castle hill top y = +12.

const DECK_W = 7;
const HALF = DECK_W / 2;
const Z_START = 16;
const Z_END = -72;
const WATER_Y = -9;
const BANK_Y = -3;
const RIVER_NEAR = -10; // river spans z in [RIVER_FAR, RIVER_NEAR]
const RIVER_FAR = -62;
const HILL = { x: 0, z: -168, r: 55, top: 12, slope: 34 };
const STORM_DIR = new THREE.Vector3(-0.25, 0.55, -1).normalize(); // dim backlight from behind the castle

function hillY(x, z) {
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  if (d > HILL.r + HILL.slope) return BANK_Y;
  if (d < HILL.r) return HILL.top;
  const t = (d - HILL.r) / HILL.slope;
  return HILL.top + (BANK_Y - HILL.top) * t;
}

function mats() {
  return {
    stone: lambert(tex.stoneWall()),
    castle: lambert(tex.castleStone()),
    darkStone: lambert(tex.darkStone()),
    cobble: lambert(tex.cobble()),
    slate: lambert(tex.slate()),
    rock: lambert(tex.darkStone(), { color: 0x6a6070 }),
    soil: lambert(tex.cobble(), { color: 0x6a645c }),
    wood: lambert(tex.wood()),
    iron: lambert(null, { color: 0x1e1c1c }),
    lit: new THREE.MeshBasicMaterial({ map: tex.litWindow() }),
    gateGlow: new THREE.MeshBasicMaterial({ color: 0xff9a40 }),
    water: new THREE.MeshLambertMaterial({ map: tex.water(), color: 0xa0a8d8, emissive: 0x120c22 }),
  };
}

// Extruded gate block (width along X, depth along Z) with a pointed arch passage.
function gateBlock(width, height, depth, archW, archSpring, mat, yBase = -14) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, yBase);
  s.lineTo(width / 2, yBase);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.lineTo(-width / 2, yBase);
  s.holes.push(archHole(-archW / 2, archW / 2, -0.2, archSpring, 0.8));
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), 0.5);
  g.translate(0, 0, -depth / 2);
  return shadowy(new THREE.Mesh(g, mat));
}

// Torch on a wooden post (stands on the parapet).
function postTorch(x, z, M, withLight = true) {
  const g = new THREE.Group();
  g.position.set(x, 1.0, z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.7, 5), M.wood);
  post.position.y = 0.85;
  post.castShadow = true;
  g.add(post);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.22, 5), M.iron);
  cup.position.y = 1.8;
  g.add(cup);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
  flame.position.y = 2.15;
  g.add(flame);
  // Only every other torch casts real light (keeps the light count sane).
  let light = null;
  if (withLight) {
    light = new THREE.PointLight(0xff8c3a, 8, 16, 2);
    light.position.y = 2.3;
    g.add(light);
  }
  return { group: g, flame, light, base: 8, phase: Math.random() * 10, flameScale: 1.6 };
}

function buildBridge() {
  const M = mats();
  const root = new THREE.Group();
  root.name = 'bridge';
  const colliders = [];
  const cameraBlockers = [];
  const animated = [];
  const torches = [];

  // ---- Bridge deck, parapets, crenellations --------------------------------
  const len = Z_START - Z_END;
  const midZ = (Z_START + Z_END) / 2;
  root.add(box(DECK_W, 1.4, len, M.cobble, 0, -0.7, midZ));
  const parapets = [];
  const merlons = [];
  for (const s of [-1, 1]) {
    parapets.push(boxGeo(0.6, 2.4, len, s * (HALF + 0.3), -0.2, midZ));
    merlons.push(...merlonGeos(len, s * (HALF + 0.3), 1.0, midZ, Math.PI / 2));
    // Outer string course under the parapet.
    parapets.push(boxGeo(0.3, 0.3, len, s * (HALF + 0.7), -1.25, midZ));
    colliders.push({ minX: s > 0 ? HALF : -HALF - 0.6, maxX: s > 0 ? HALF + 0.6 : -HALF, minZ: Z_END, maxZ: Z_START });
  }
  const parapetMesh = mergedMesh(parapets, M.stone, { cast: true });
  root.add(parapetMesh, mergedMesh(merlons, M.stone, { cast: true }));
  cameraBlockers.push(parapetMesh);

  // ---- Piers and arches under the deck --------------------------------------
  const piers = [];
  const pierZs = [];
  for (let z = 4; z > Z_END; z -= 12) pierZs.push(z);
  for (const z of pierZs) {
    piers.push(boxGeo(DECK_W + 1.2, 14, 3, 0, -7.4, z));
    // Diamond cutwaters at the waterline.
    for (const s of [-1, 1]) piers.push(boxGeo(2.1, 9, 2.1, s * (HALF + 0.9), WATER_Y + 1.5, z, Math.PI / 4));
  }
  root.add(mergedMesh(piers, M.stone, { cast: false }));
  for (let i = 0; i < pierZs.length - 1; i++) {
    const za = pierZs[i] - 1.5;
    const zb = pierZs[i + 1] + 1.5;
    const span = za - zb;
    const s = new THREE.Shape();
    s.moveTo(0, -14);
    s.lineTo(span, -14);
    s.lineTo(span, -1.4);
    s.lineTo(0, -1.4);
    s.lineTo(0, -14);
    s.holes.push(archHole(0, span, -13.9, WATER_Y + 0.5, 0.6));
    const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: DECK_W + 0.8, bevelEnabled: false }), 0.5);
    const m = new THREE.Mesh(g, M.stone);
    m.receiveShadow = true;
    m.rotation.y = Math.PI / 2; // shape u -> -z, extrude -> +x
    m.position.set(-(DECK_W + 0.8) / 2, 0, za);
    root.add(m);
  }

  // ---- Gate tower at the start (the monk begins inside its passage) ---------
  const gateNear = gateBlock(13, 13, 7, 5.2, 3.6, M.stone);
  gateNear.position.z = 11.5;
  root.add(gateNear);
  cameraBlockers.push(gateNear);
  root.add(mergedMesh([...merlonGeos(13, 0, 13, 8.3, 0), ...merlonGeos(13, 0, 13, 14.7, 0)], M.stone));
  colliders.push({ minX: -8, maxX: -2.55, minZ: 8, maxZ: 15 }, { minX: 2.55, maxX: 8, minZ: 8, maxZ: 15 }, { minX: -8, maxX: 8, minZ: 14.6, maxZ: 16 });
  // Torches inside the gate passage.
  for (const s of [-1, 1]) {
    const t = postTorch(s * 2.2, 9.2, M);
    t.group.position.y = 0;
    t.group.children[0].visible = false; // wall-mounted: hide the post
    t.flame.position.y = 2.6;
    t.light.position.y = 2.7;
    root.add(t.group);
    torches.push(t);
  }

  // ---- Torches on posts along both parapets, two with smoke columns ---------
  const torchZs = [-4, -16, -28, -40, -52, -64, -76];
  torchZs.forEach((z, i) => {
    for (const s of [-1, 1]) {
      const t = postTorch(s * (HALF + 0.3), z + (s > 0 ? 6 : 0), M, (i + (s > 0 ? 1 : 0)) % 2 === 0);
      root.add(t.group);
      torches.push(t);
      if ((i === 1 && s < 0) || (i === 2 && s > 0)) {
        const smoke = smokeColumn({ x: s * (HALF + 0.3), y: 3.4, z: z + (s > 0 ? 6 : 0), height: 16, puffs: 16, size: 1.3 });
        root.add(smoke.group);
        animated.push(smoke);
      }
    }
  });

  // ---- Gatehouse at the far end: twin round towers, glowing passage --------
  const gz = Z_END - 3;
  const gateFar = gateBlock(16, 15, 8, 5, 4.2, M.castle);
  gateFar.position.z = gz;
  root.add(gateFar);
  root.add(mergedMesh(merlonGeos(16, 0, 15, gz + 3.7, 0), M.castle));
  for (const s of [-1, 1]) {
    const tw = shadowy(new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(3.4, 3.8, 34, 8), 2), M.castle));
    tw.position.set(s * 9.5, 3, gz); // spans y -14..20
    root.add(tw);
    root.add(spire(4.4, 9, M.slate, s * 9.5, 20, gz, 8));
    for (let k = 0; k < 3; k++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), M.lit);
      w.position.set(s * 9.5, 6 + k * 4.2, gz + 3.85);
      root.add(w);
    }
  }
  // Warm light glowing through the closed gate.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 6.5), M.gateGlow);
  glow.position.set(0, 3.2, gz - 0.5);
  root.add(glow);
  const gateLight = new THREE.PointLight(0xff8a30, 18, 26, 1.6);
  gateLight.position.set(0, 3, gz + 5);
  root.add(gateLight);
  colliders.push({ minX: -9, maxX: 9, minZ: gz - 4, maxZ: gz + 3.2 });

  // ---- River, quays, banks --------------------------------------------------
  const water = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(900, RIVER_NEAR - RIVER_FAR + 4), 0.25), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_Y, (RIVER_NEAR + RIVER_FAR) / 2);
  root.add(water);
  const quays = [];
  for (const z of [RIVER_NEAR, RIVER_FAR]) quays.push(boxGeo(900, BANK_Y - WATER_Y + 3, 1.2, 0, (BANK_Y + WATER_Y - 3) / 2, z + (z === RIVER_NEAR ? 0.6 : -0.6)));
  root.add(mergedMesh(quays, M.stone));
  const nearBank = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(900, 260), 130), M.soil);
  nearBank.rotation.x = -Math.PI / 2;
  nearBank.position.set(0, BANK_Y, RIVER_NEAR + 130);
  nearBank.receiveShadow = true;
  root.add(nearBank);
  const farBank = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(900, 300), 150), M.soil);
  farBank.rotation.x = -Math.PI / 2;
  farBank.position.set(0, BANK_Y, RIVER_FAR - 150);
  root.add(farBank);
  // Amber reflections of the fires and torches, streaking across the water.
  const refl = [];
  const rr = mulberry(5);
  for (let i = 0; i < 26; i++) {
    const x = (rr() - 0.5) * 70;
    const g = new THREE.PlaneGeometry(0.3 + rr() * 0.6, 4 + rr() * 14);
    g.rotateX(-Math.PI / 2);
    g.translate(x, WATER_Y + 0.05, RIVER_FAR + 4 + rr() * (RIVER_NEAR - RIVER_FAR - 8));
    refl.push(g);
  }
  const reflMat = new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const reflMesh = mergedMesh(refl, reflMat);
  root.add(reflMesh);

  // ---- Castle hill and the Crownkeep ------------------------------------------
  const hill = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(HILL.r, HILL.r + HILL.slope, HILL.top - BANK_Y, 12, 1), 6), M.rock);
  hill.position.set(HILL.x, (HILL.top + BANK_Y) / 2, HILL.z);
  hill.receiveShadow = true;
  root.add(hill);

  // Build the keep at map scale, then enlarge it around the hill top so it
  // dominates the skyline like the reference.
  const castle = buildCastle(M, HILL.z, HILL.top);
  const keep = new THREE.Group();
  keep.position.set(HILL.x, HILL.top, HILL.z);
  keep.scale.setScalar(1.45);
  castle.group.position.set(-HILL.x, -HILL.top, -HILL.z);
  keep.add(castle.group);
  root.add(keep);
  animated.push(...castle.animated);

  // ---- Town on both banks and up the hill's skirts ---------------------------
  const avoidRiverAndRoads = (x, z, r) =>
    (z + r > RIVER_FAR - 2 && z - r < RIVER_NEAR + 2) || // river
    Math.abs(x) < 10 + r || // bridge approach / main road
    Math.hypot(x - HILL.x, z - HILL.z) < HILL.r + 10 + r || (Math.abs(x) < 26 + r && z < RIVER_FAR && z > Z_END - 40); // castle hill top and gate approach
  root.add(
    buildTown({ seed: 11, count: 150, bounds: [-170, 170, RIVER_NEAR + 3, 90], groundY: () => BANK_Y, avoid: avoidRiverAndRoads, minH: 6, maxH: 13, litChance: 0.35 }),
  );
  root.add(
    buildTown({ seed: 23, count: 190, bounds: [-200, 200, -230, RIVER_FAR - 3], groundY: hillY, avoid: avoidRiverAndRoads, minH: 6, maxH: 12, litChance: 0.4, spireChance: 0.06 }),
  );

  // ---- Guards patrolling the bridge ---------------------------------------------
  const guards = [
    { x: -1.1, z: -8 },
    { x: 1.1, z: -9 },
    { x: 0.9, z: -24 },
    { x: -1.3, z: -44 },
  ].map(({ x, z }, i) => {
    const g = createGuard();
    g.root.position.set(x, 0, z);
    root.add(g.root);
    const col = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    colliders.push(col);
    return { ...g, dir: -1, speed: 1.05 + i * 0.05, col };
  });

  // Embers over the burning castle.
  const em = embers({ count: 160, area: [0, HILL.top + 14, HILL.z + 10, 70, 18, 30], rise: 30, size: 2 });
  root.add(em.group);
  animated.push(em);

  return {
    root,
    sky: buildSky({ preset: 'storm' }),
    colliders,
    cameraBlockers,
    spawn: new THREE.Vector3(-0.8, 0, 3),
    spawnYaw: 0.03,
    spawnPitch: 0.2,
    lanternIntensity: 3,
    env: {
      fog: { color: 0x2a1736, density: 0.0052 },
      hemi: { sky: 0x6a4a9a, ground: 0x4a2814, intensity: 1.8 },
      dir: { dir: STORM_DIR, color: 0x9a7ad8, intensity: 1.0, shadow: true, extent: 40, target: new THREE.Vector3(0, 0, -30) },
    },
    update(dt, t) {
      flickerTorches(torches, t);
      for (const a of animated) a.update(dt, t);
      water.material.map.offset.set(t * 0.004, t * 0.01);
      reflMat.opacity = 0.28 + 0.06 * Math.sin(t * 3.1);
      for (const g of guards) {
        g.root.position.z += g.dir * g.speed * dt;
        if (g.root.position.z < Z_END + 6 && g.dir < 0) g.dir = 1;
        if (g.root.position.z > 4 && g.dir > 0) g.dir = -1;
        g.root.rotation.y = g.dir < 0 ? 0 : Math.PI;
        g.update(dt, g.speed);
        const { x, z } = g.root.position;
        Object.assign(g.col, { minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
      }
    },
  };
}

// The Crownkeep: curtain wall with round towers, a tall gothic palace with a
// forest of spires, rows of amber-lit windows, braziers, and fires on the roofs.
function buildCastle(M, cz, top) {
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

export default {
  id: 'bridge',
  title: 'The Bridge to the Crownkeep',
  reference: '03-burning-castle-bridge.png',
  build: buildBridge,
};
