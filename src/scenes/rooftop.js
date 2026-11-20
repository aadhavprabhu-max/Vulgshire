import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, shadowy, box, spire, cross, buildSky, flickerTorches, mergedMesh, boxGeo, quadGeo, mulberry } from './kit.js';
import { buildTown } from './town.js';
import { createAlchemist } from '../characters/alchemist.js';

// The alchemist's rooftop (reference 02-alchemist-rooftop.png): a wooden balcony
// high on a stone tower, shelves of glowing potions, a hanging cage lantern and a
// red banner, looking out over a foggy town of spires with tiny lit windows and
// the river winding through it.
//
// Where this tower stands on the map is NOT decided yet (proposal: the Old Town,
// looking north-east across the lake). Heights: balcony deck y = 0, streets y = -48.

const STREET_Y = -48;
const LIGHT_DIR = new THREE.Vector3(-0.6, 0.5, -0.6).normalize();

// The river below: a gentle S-curve crossing the view.
const riverZ = (x) => -150 + 40 * Math.sin(x / 90);
const RIVER_HALF = 16;

function mats() {
  return {
    stone: lambert(tex.stoneWall()),
    darkStone: lambert(tex.darkStone()),
    wood: lambert(tex.wood(), { color: 0xb8a890 }),
    deck: lambert(tex.wood(), { color: 0xa89878 }),
    slate: lambert(tex.slate()),
    iron: lambert(null, { color: 0x1c1a18 }),
    lit: new THREE.MeshBasicMaterial({ map: tex.litWindow() }),
    pane: new THREE.MeshBasicMaterial({ map: tex.lanternPane() }),
    banner: new THREE.MeshLambertMaterial({ map: tex.banner(), alphaTest: 0.5, side: THREE.DoubleSide }),
    water: new THREE.MeshLambertMaterial({ map: tex.water(), color: 0x9aa4c0 }),
    ground: lambert(tex.cobble(), { color: 0x55525a }),
  };
}

// A potion bottle (lathe) in a glowing colour. Unlit material = it glows.
const POTION_COLORS = [0x6cf08a, 0x3ad6c8, 0x9cff6a, 0x48a8ff, 0x7ae0a0];
function bottle(shape, color, h) {
  const profiles = {
    flask: [
      [0, 0],
      [0.45, 0],
      [0.5, 0.3],
      [0.3, 0.6],
      [0.12, 0.7],
      [0.12, 1],
      [0, 1],
    ],
    tall: [
      [0, 0],
      [0.3, 0],
      [0.32, 0.6],
      [0.14, 0.72],
      [0.1, 1],
      [0, 1],
    ],
    round: [
      [0, 0],
      [0.3, 0],
      [0.48, 0.3],
      [0.35, 0.6],
      [0.1, 0.72],
      [0.1, 1],
      [0, 1],
    ],
  }[shape];
  const g = new THREE.LatheGeometry(
    profiles.map(([x, y]) => new THREE.Vector2(x * h * 0.5, y * h)),
    6,
  );
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 }));
  // Dark cork / neck band.
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.06, h * 0.06, h * 0.08, 4), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
  cork.position.y = h;
  m.add(cork);
  return m;
}

function buildRooftop() {
  const M = mats();
  const root = new THREE.Group();
  root.name = 'rooftop';
  const colliders = [];
  const cameraBlockers = [];
  const torches = [];
  const animated = [];

  // ---- The tower ------------------------------------------------------------
  const tower = box(8, 70, 10, M.stone, 6, -25, -1.5);
  root.add(tower);
  cameraBlockers.push(tower);
  root.add(box(9, 0.6, 11, M.darkStone, 6, 10.3, -1.5));
  root.add(spire(6.8, 12, M.slate, 6, 10.6, -1.5));
  colliders.push({ minX: 2, maxX: 10, minZ: -7, maxZ: 4 });
  // A few lit windows on the tower's face below the balcony.
  for (const y of [-8, -16, -24]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), M.lit);
    w.position.set(1.98, y, -4.5);
    w.rotation.y = -Math.PI / 2;
    root.add(w);
  }

  // ---- Balcony deck, brackets, railings --------------------------------------
  root.add(box(5.4, 0.25, 10, M.deck, -0.7, -0.125, -1.75, 1));
  const wood = [];
  for (const z of [-6, -2.5, 1]) {
    const br = boxGeo(0.25, 0.25, 4.2, 0, 0, 0);
    br.rotateZ(0.75);
    br.rotateY(Math.PI / 2);
    br.translate(0.4, -1.5, z);
    wood.push(br);
  }
  // Railing posts and rails along the outer (x = -3.3) and front (z = -6.7) edges.
  for (let z = -6.6; z <= 3.2; z += 1.4) wood.push(boxGeo(0.14, 1.1, 0.14, -3.3, 0.55, z));
  for (let x = -3.3; x <= 2; x += 1.3) wood.push(boxGeo(0.14, 1.1, 0.14, x, 0.55, -6.6));
  for (let x = -3.3; x <= 2; x += 1.3) wood.push(boxGeo(0.14, 1.1, 0.14, x, 0.55, 3.1));
  wood.push(boxGeo(0.18, 0.12, 10, -3.3, 1.1, -1.75), boxGeo(0.1, 0.08, 10, -3.3, 0.55, -1.75));
  wood.push(boxGeo(5.4, 0.12, 0.18, -0.7, 1.1, -6.6), boxGeo(5.4, 0.08, 0.1, -0.7, 0.55, -6.6));
  wood.push(boxGeo(5.4, 0.12, 0.18, -0.7, 1.1, 3.1));
  colliders.push({ minX: -3.8, maxX: -3.1, minZ: -7.2, maxZ: 3.6, h: 1.2 }, { minX: -3.8, maxX: 2.2, minZ: -7.2, maxZ: -6.4, h: 1.2 }, { minX: -3.8, maxX: 2.2, minZ: 2.9, maxZ: 3.6, h: 1.2 });

  // Overhead beam with a big diagonal strut from the tower (like the reference).
  wood.push(boxGeo(5.6, 0.3, 0.3, -0.6, 3.6, -3.4));
  const strut = boxGeo(0.3, 0.3, 4.4, 0, 0, 0);
  strut.rotateX(0.85);
  strut.rotateY(Math.PI / 2);
  strut.translate(0.3, 2.2, -3.4);
  wood.push(strut);
  const woodMesh = mergedMesh(wood, M.wood, { cast: true });
  root.add(woodMesh);

  // Hanging cage lantern.
  const cage = new THREE.Group();
  cage.position.set(-2.2, 2.2, -3.4);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.03), M.iron);
  chain.position.y = 0.8;
  cage.add(chain);
  const cageTop = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 4), M.iron);
  cageTop.position.y = 0.15;
  cage.add(cageTop);
  const cageBot = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), M.iron);
  cageBot.rotation.x = Math.PI;
  cageBot.position.y = -0.75;
  cage.add(cageBot);
  for (const [ox, oz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.03), M.iron);
    bar.position.set(ox * 0.17, -0.25, oz * 0.17);
    cage.add(bar);
  }
  const candle = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame() }));
  candle.position.y = -0.3;
  cage.add(candle);
  const cageLight = new THREE.PointLight(0xffa04a, 3, 10, 2);
  cageLight.position.y = -0.3;
  cage.add(cageLight);
  root.add(cage);
  torches.push({ flame: candle, light: cageLight, base: 3, phase: 1, flameScale: 0.7 });

  // Red patterned banner on the tower wall.
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.8), M.banner);
  banner.position.set(1.96, 3.4, 0.2);
  banner.rotation.y = -Math.PI / 2;
  root.add(banner);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 4), M.iron);
  pole.rotation.x = Math.PI / 2;
  pole.position.set(1.9, 5.32, 0.2);
  root.add(pole);

  // ---- Potion shelves against the tower ----------------------------------------
  const shelf = [];
  const sx = 1.55;
  for (const z of [-5.6, -2.0]) shelf.push(boxGeo(0.7, 2.6, 0.1, sx, 1.3, z));
  for (const y of [0.05, 0.85, 1.65, 2.45]) shelf.push(boxGeo(0.7, 0.07, 3.6, sx, y, -3.8));
  shelf.push(boxGeo(0.06, 2.6, 3.6, sx + 0.33, 1.3, -3.8));
  const shelfMesh = mergedMesh(shelf, M.wood, { cast: true });
  root.add(shelfMesh);
  cameraBlockers.push(shelfMesh);
  colliders.push({ minX: 1.1, maxX: 2.1, minZ: -5.8, maxZ: -1.8, h: 2.7 });
  const rnd = mulberry(4);
  const shapes = ['flask', 'tall', 'round'];
  for (const y of [0.09, 0.89, 1.69]) {
    for (let z = -5.3; z < -2.3; z += 0.32 + rnd() * 0.25) {
      const b = bottle(shapes[Math.floor(rnd() * 3)], POTION_COLORS[Math.floor(rnd() * POTION_COLORS.length)], 0.28 + rnd() * 0.25);
      b.position.set(sx - 0.05 + (rnd() - 0.5) * 0.2, y, z);
      root.add(b);
    }
  }
  const potionLight = new THREE.PointLight(0x5cff9a, 1.6, 5, 2);
  potionLight.position.set(0.9, 1.2, -3.8);
  root.add(potionLight);

  // ---- Workbench with an amber lantern and big glowing flasks (foreground) -----
  root.add(box(1.3, 0.9, 1.6, M.wood, 1.2, 0.45, 0.2, 1));
  colliders.push({ minX: 0.5, maxX: 2, minZ: -0.7, maxZ: 1.1, h: 1.6 });
  const lantern = new THREE.Group();
  lantern.position.set(1.15, 0.9, 0.6);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), M.pane);
  body.position.y = 0.25;
  lantern.add(body);
  const lroof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 4), M.iron);
  lroof.rotation.y = Math.PI / 4;
  lroof.position.y = 0.65;
  lantern.add(lroof);
  const lLight = new THREE.PointLight(0xffa850, 4, 9, 2);
  lLight.position.set(-0.3, 0.4, 0);
  lantern.add(lLight);
  root.add(lantern);
  torches.push({ flame: new THREE.Object3D(), light: lLight, base: 4, phase: 3 });
  for (const [x, z, c, h, sh] of [
    [1.4, -0.3, 0x9cff6a, 0.45, 'flask'],
    [0.85, 0.05, 0x3ad6c8, 0.38, 'round'],
    [1.0, -0.45, 0x6cf08a, 0.3, 'tall'],
  ]) {
    const b = bottle(sh, c, h);
    b.position.set(x, 0.9, z);
    root.add(b);
  }

  // ---- The alchemist, leaning on the front railing --------------------------
  const alch = createAlchemist();
  alch.root.position.set(-1.6, 0, -5.7);
  root.add(alch.root);
  colliders.push({ minX: -2.0, maxX: -1.2, minZ: -6.2, maxZ: -5.2, h: 2 });
  animated.push({ update: (dt, t) => alch.update(dt, t) });

  // ---- The town far below ---------------------------------------------------------
  const nearTower = (x, z, r) => x > -14 - r && x < 18 + r && z > -18 - r && z < 18 + r;
  const inRiver = (x, z, r) => Math.abs(z - riverZ(x)) < RIVER_HALF + r;
  root.add(
    buildTown({
      seed: 7,
      count: 520,
      bounds: [-300, 220, -360, 60],
      groundY: () => STREET_Y,
      avoid: (x, z, r) => nearTower(x, z, r) || inRiver(x, z, r),
      minH: 9,
      maxH: 22,
      minW: 5,
      maxW: 9,
      litChance: 0.4,
      spireChance: 0.07,
    }),
  );
  // Streets.
  const ground = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(1000, 1000), 125), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = STREET_Y;
  root.add(ground);
  // The river: a strip following riverZ(x).
  const pts = [];
  const uvs = [];
  const idx = [];
  const N = 80;
  for (let i = 0; i <= N; i++) {
    const x = -500 + (1000 * i) / N;
    const z = riverZ(x);
    pts.push(x, STREET_Y + 0.1, z - RIVER_HALF, x, STREET_Y + 0.1, z + RIVER_HALF);
    uvs.push(x / 8, 0, x / 8, (2 * RIVER_HALF) / 8);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const river = new THREE.Mesh(rg, M.water);
  root.add(river);

  // Two big landmark spires close by (left of the view, like the reference).
  const lm = [];
  const lmSlate = [];
  const lmLit = [];
  for (const [x, z, w, h, sh] of [
    [-24, -26, 7, 52, 16],
    [-12, -52, 6, 44, 13],
    [-46, -70, 6, 40, 12],
  ]) {
    lm.push(boxGeo(w, h, w, x, STREET_Y + h / 2, z));
    lm.push(boxGeo(w + 1, 0.6, w + 1, x, STREET_Y + h, z));
    const sp = new THREE.ConeGeometry(w * 0.75, sh, 8, 1);
    sp.translate(x, STREET_Y + h + sh / 2, z);
    lmSlate.push(sp);
    for (let k = 0; k < 4; k++) {
      lmLit.push(quadGeo(0.9, 1.6, x + w / 2 + 0.05, STREET_Y + h - 6 - k * 7, z + (k % 2 ? 1.2 : -1.2), Math.PI / 2));
      lmLit.push(quadGeo(0.9, 1.6, x - (k % 2) * 1.5, STREET_Y + h - 4 - k * 8, z + w / 2 + 0.05));
    }
    root.add(cross(M.iron, x, STREET_Y + h + sh, z, 2.2));
  }
  root.add(mergedMesh(lm, M.darkStone), mergedMesh(lmSlate, M.slate), mergedMesh(lmLit, M.lit));

  // Mist layers drifting between the rooftops.
  const mistLayers = [];
  for (const [y, op] of [
    [-38, 0.2],
    [-30, 0.14],
    [-22, 0.08],
  ]) {
    const mt = tex.mist().clone();
    mt.needsUpdate = true;
    mt.repeat.set(8, 8);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshBasicMaterial({ map: mt, color: 0x5a5a72, transparent: true, opacity: op, depthWrite: false, fog: true }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, -200);
    m.renderOrder = 2;
    root.add(m);
    mistLayers.push(mt);
  }

  return {
    root,
    sky: buildSky({ preset: 'overcast' }),
    colliders,
    cameraBlockers,
    spawn: new THREE.Vector3(-0.4, 0, 1.6),
    spawnYaw: 0.42,
    spawnPitch: -0.16,
    lanternIntensity: 2.5,
    env: {
      fog: { color: 0x2c2c3e, density: 0.0058 },
      hemi: { sky: 0x6a7090, ground: 0x18181f, intensity: 1.2 },
      dir: { dir: LIGHT_DIR, color: 0x9aa0c8, intensity: 0.9, shadow: true, extent: 14 },
    },
    update(dt, t) {
      flickerTorches(torches, t);
      for (const a of animated) a.update(dt, t);
      mistLayers.forEach((m, i) => m.offset.set(t * 0.002 * (i + 1), t * 0.001));
      M.water.map.offset.set(t * 0.01, 0);
      cage.rotation.z = Math.sin(t * 0.9) * 0.05;
    },
  };
}

export default {
  id: 'rooftop',
  title: "The Alchemist's Rooftop",
  reference: '02-alchemist-rooftop.png',
  build: buildRooftop,
};
