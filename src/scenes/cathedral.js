import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, archPoints, archHole, shadowy, box, flickerTorches, mergedMesh, boxGeo, lancetGeo, mulberry } from './kit.js';

// Inside the Great Cathedral (reference 04-cathedral-interior.png): the view from
// the west gallery down a tall gothic nave, past rows of pews, to a rose window
// over five stained-glass lancets. Coloured light shafts fall across the floor.
//
// Heights: gallery floor y = 0, nave floor y = -9, vault springs at y = 18.

const FLOOR = -9;
const NAVE = 7.6; // inner half-width of the nave
const AISLE = 13; // outer aisle wall
const ARC_T = 1.2; // arcade wall thickness
const WEST = 5;
const EAST = -62;
const VAULT_SPRING = 18;
const BAY = 7;
const LIGHT_DIR = new THREE.Vector3(-0.55, -0.75, 0.2).normalize(); // shafts: down and to the left

function mats() {
  return {
    stone: lambert(tex.stoneWall(), { color: 0xa8a0b0 }),
    darkStone: lambert(tex.darkStone()),
    vault: lambert(tex.darkStone(), { color: 0x8c8498, side: THREE.DoubleSide }),
    rib: lambert(tex.column(), { color: 0x9a92a4 }),
    column: lambert(tex.column(), { color: 0xa49cac }),
    floor: lambert(tex.tileFloor()),
    pew: lambert(tex.wood(), { color: 0xffe2c8 }),
    cloth: lambert(null, { color: 0x8a8090 }),
    bronze: lambert(tex.statue(), { color: 0xb07050, flatShading: true }),
    iron: lambert(null, { color: 0x2a2624 }),
    glassP: (seed) => new THREE.MeshBasicMaterial({ map: tex.stainedGlass('purple', seed), side: THREE.DoubleSide }),
    glassW: (seed) => new THREE.MeshBasicMaterial({ map: tex.stainedGlass('warm', seed), side: THREE.DoubleSide }),
  };
}

// The pointed vault cross-section (x, y) points from one springing to the other.
function vaultProfile() {
  return archPoints(-NAVE, NAVE, VAULT_SPRING, 0.8, 9);
}

// A surface swept along Z through the vault profile.
function vaultGeo(z0, z1) {
  const prof = vaultProfile();
  const pos = [];
  const uv = [];
  const idx = [];
  let u = 0;
  prof.forEach(([x, y], i) => {
    if (i > 0) u += Math.hypot(x - prof[i - 1][0], y - prof[i - 1][1]);
    pos.push(x, y, z0, x, y, z1);
    uv.push(u / 2, z0 / 2, u / 2, z1 / 2);
    if (i < prof.length - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A low-poly rib following a polyline (square tube).
function ribGeo(points, r = 0.28) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, points.length * 2, r, 4, false);
}

// End wall (east or west) whose top follows the vault.
function endWall(z, M, thickness = 1.5) {
  const s = new THREE.Shape();
  s.moveTo(-AISLE, FLOOR);
  s.lineTo(AISLE, FLOOR);
  s.lineTo(AISLE, 6);
  s.lineTo(NAVE, 6);
  for (const [x, y] of vaultProfile().slice().reverse()) s.lineTo(x, y + 0.6);
  s.lineTo(-NAVE, 6);
  s.lineTo(-AISLE, 6);
  s.lineTo(-AISLE, FLOOR);
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false }), 0.5);
  g.translate(0, 0, z < 0 ? z - thickness : z);
  return shadowy(new THREE.Mesh(g, M.stone));
}

function buildCathedral() {
  const M = mats();
  const root = new THREE.Group();
  root.name = 'cathedral';
  const colliders = [];
  const cameraBlockers = [];
  const flames = [];
  const rnd = mulberry(17);

  // ---- Floor, end walls, aisle walls and ceilings --------------------------
  const floor = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(2 * AISLE, WEST - EAST), 0.5), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR, (WEST + EAST) / 2);
  floor.receiveShadow = true;
  root.add(floor);
  const east = endWall(EAST, M);
  const west = endWall(WEST, M);
  root.add(east, west);
  cameraBlockers.push(west);
  const aisle = [];
  for (const s of [-1, 1]) {
    aisle.push(boxGeo(1.2, 15, WEST - EAST, s * (AISLE + 0.6), FLOOR + 7.5, (WEST + EAST) / 2));
    aisle.push(boxGeo(AISLE - NAVE - ARC_T, 0.6, WEST - EAST, s * (NAVE + ARC_T + (AISLE - NAVE - ARC_T) / 2), 6.3, (WEST + EAST) / 2));
  }
  root.add(mergedMesh(aisle, M.darkStone));

  // ---- Arcades between nave and aisles (pointed arches, clustered piers) ----
  const bays = [];
  for (let z = -2; z - BAY >= EAST + 4; z -= BAY) bays.push([z, z - BAY]);
  for (const s of [-1, 1]) {
    const shp = new THREE.Shape();
    shp.moveTo(EAST, FLOOR - 0.5);
    shp.lineTo(WEST, FLOOR - 0.5);
    shp.lineTo(WEST, VAULT_SPRING);
    shp.lineTo(EAST, VAULT_SPRING);
    shp.lineTo(EAST, FLOOR - 0.5);
    // Shape X = world Z here; arches between piers (pier width 1.6).
    for (const [za, zb] of bays) shp.holes.push(archHole(zb + 0.8, za - 0.8, FLOOR - 0.3, 0, 0.8));
    const g = scaleUV(new THREE.ExtrudeGeometry(shp, { depth: ARC_T, bevelEnabled: false }), 0.5);
    const m = shadowy(new THREE.Mesh(g, M.stone));
    // Map shape (x -> world z, y -> y), extrusion -> world x.
    m.rotation.y = -Math.PI / 2;
    m.position.x = s > 0 ? NAVE + ARC_T : -NAVE; // occupies [NAVE, NAVE + ARC_T] mirrored
    root.add(m);
    cameraBlockers.push(m);
  }
  // Clustered shafts on each pier, running up to the vault.
  const shafts = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i <= bays.length; i++) {
      const z = i < bays.length ? bays[i][0] : bays[bays.length - 1][1];
      const x = s * (NAVE - 0.18);
      const c = new THREE.CylinderGeometry(0.28, 0.28, VAULT_SPRING - FLOOR, 6);
      scaleUV(c, 3);
      c.translate(x, (VAULT_SPRING + FLOOR) / 2, z);
      shafts.push(c);
      shafts.push(boxGeo(0.9, 0.4, 0.9, x, VAULT_SPRING - 0.2, z, 0, 1));
      shafts.push(boxGeo(0.9, 0.5, 0.9, x, FLOOR + 0.25, z, 0, 1));
    }
    // String courses.
    shafts.push(boxGeo(0.4, 0.3, WEST - EAST, s * (NAVE - 0.1), 1.2, (WEST + EAST) / 2));
    shafts.push(boxGeo(0.4, 0.3, WEST - EAST, s * (NAVE - 0.1), 6.8, (WEST + EAST) / 2));
  }
  root.add(mergedMesh(shafts, M.column, { cast: true }));

  // ---- Vault and ribs ---------------------------------------------------------
  const vault = new THREE.Mesh(vaultGeo(WEST, EAST), M.vault);
  root.add(vault);
  const ribs = [];
  const prof = vaultProfile();
  const zs = [...bays.map((b) => b[0]), bays[bays.length - 1][1]];
  for (const z of zs) ribs.push(ribGeo(prof.map(([x, y]) => [x, y - 0.1, z])));
  // Diagonal ribs across each bay.
  for (const [za, zb] of bays) {
    for (const dir of [1, -1]) {
      const pts = prof.map(([x, y], i) => {
        const t = i / (prof.length - 1);
        return [x, y - 0.1, dir > 0 ? za + (zb - za) * t : zb + (za - zb) * t];
      });
      ribs.push(ribGeo(pts, 0.2));
    }
  }
  // Ridge rib.
  const apex = prof[Math.floor(prof.length / 2)][1];
  ribs.push(ribGeo([
    [0, apex - 0.2, WEST],
    [0, apex - 0.2, (WEST + EAST) / 2],
    [0, apex - 0.2, EAST],
  ]));
  root.add(mergedMesh(ribs, M.rib));

  // ---- Stained glass: clerestory lancets, aisle windows, east end, rose ------
  const glass = [];
  bays.forEach(([za, zb], i) => {
    const zc = (za + zb) / 2;
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(lancetGeo(2.3, 7.5), s > 0 && i % 2 ? M.glassW(i) : M.glassP(i));
      g.position.set(s * (NAVE - 0.02), 8.6, zc);
      g.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      root.add(g);
      glass.push(g);
      // Aisle window (seen through the arcade).
      const a = new THREE.Mesh(lancetGeo(2.0, 6.5), s > 0 ? M.glassW(i + 7) : M.glassP(i + 7));
      a.position.set(s * (AISLE - 0.02), FLOOR + 3, zc);
      a.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      root.add(a);
    }
  });
  // East end: five lancets and the rose window.
  for (const [x, w, h, y] of [
    [-2.4, 1.5, 10, FLOOR + 8],
    [0, 1.5, 10.5, FLOOR + 8],
    [2.4, 1.5, 10, FLOOR + 8],
    [-5.2, 1.2, 12, FLOOR + 6],
    [5.2, 1.2, 12, FLOOR + 6],
  ]) {
    const g = new THREE.Mesh(lancetGeo(w, h), Math.abs(x) > 4 ? M.glassP(31) : M.glassW(x + 40));
    g.position.set(x, y, EAST + 0.02);
    root.add(g);
  }
  const rose = new THREE.Mesh(new THREE.CircleGeometry(3.6, 16), new THREE.MeshBasicMaterial({ map: tex.rose('purple'), transparent: true, alphaTest: 0.5 }));
  rose.position.set(0, 13.4, EAST + 0.02);
  root.add(rose);
  // The big round window right beside the gallery (left of the view).
  const bigRose = new THREE.Mesh(new THREE.CircleGeometry(3.4, 16), new THREE.MeshBasicMaterial({ map: tex.rose('warm'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  bigRose.position.set(-NAVE + 0.02, 6.2, -0.6);
  bigRose.rotation.y = Math.PI / 2;
  root.add(bigRose);

  // ---- Light shafts and coloured pools on the floor ---------------------------
  const shaftMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, map: tex.shaft(), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const poolMat = (seed) =>
    new THREE.MeshBasicMaterial({ map: tex.stainedGlass('warm', seed), transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const shaftColors = [0xb08cff, 0xffb0d0, 0x9ab0ff, 0xffd0a0];
  bays.forEach(([za, zb], i) => {
    if (i % 2) return;
    const zc = (za + zb) / 2;
    const start = new THREE.Vector3(NAVE - 0.1, 9.5, zc);
    const t = (FLOOR - start.y) / LIGHT_DIR.y;
    const end = start.clone().addScaledVector(LIGHT_DIR, t);
    const len = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const beam = new THREE.Group();
    for (const rot of [0, Math.PI / 2]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, len), shaftMat(shaftColors[i % 4], 0.035));
      p.rotation.y = rot;
      beam.add(p);
    }
    beam.position.copy(mid);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), LIGHT_DIR.clone().negate());
    beam.renderOrder = 5;
    root.add(beam);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.5), poolMat(i));
    pool.rotation.x = -Math.PI / 2;
    pool.rotation.z = 0.5;
    pool.position.set(end.x, FLOOR + 0.04, end.z);
    pool.renderOrder = 4;
    root.add(pool);
  });
  // Pool of light before the altar steps.
  const altarPool = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), poolMat(50));
  altarPool.rotation.x = -Math.PI / 2;
  altarPool.position.set(0, FLOOR + 0.04, EAST + 12);
  root.add(altarPool);

  // Soft fill down the nave, standing in for light bouncing from the windows.
  for (const z of [-14, -30, -46]) {
    const fill = new THREE.PointLight(0xc8b8ff, 30, 34, 1.4);
    fill.position.set(2, 4, z);
    root.add(fill);
  }

  // ---- Pews -------------------------------------------------------------------
  const pews = [];
  for (let z = -10; z > EAST + 14; z -= 1.55) {
    for (const [x0, x1] of [
      [-6.4, -1.3],
      [1.3, 6.4],
    ]) {
      const w = x1 - x0;
      const cx = (x0 + x1) / 2;
      pews.push(boxGeo(w, 0.1, 0.5, cx, FLOOR + 0.48, z, 0, 1));
      pews.push(boxGeo(w, 0.75, 0.08, cx, FLOOR + 0.8, z + 0.28, 0, 1));
      pews.push(boxGeo(0.1, 1.05, 0.62, x0, FLOOR + 0.52, z + 0.04, 0, 1));
      pews.push(boxGeo(0.1, 1.05, 0.62, x1, FLOOR + 0.52, z + 0.04, 0, 1));
    }
  }
  root.add(mergedMesh(pews, M.pew, { cast: true }));

  // ---- Altar, steps, candelabra, urn ----------------------------------------------
  root.add(box(2 * NAVE, 0.35, 10, M.stone, 0, FLOOR + 0.175, EAST + 5));
  root.add(box(2 * NAVE, 0.35, 7, M.stone, 0, FLOOR + 0.525, EAST + 3.5));
  root.add(box(3.4, 1.1, 1.3, M.stone, 0, FLOOR + 1.25, EAST + 3.2, 1));
  root.add(box(3.6, 0.06, 1.5, M.cloth, 0, FLOOR + 1.83, EAST + 3.2, 1));

  const candelabrum = (x, z, h, arms) => {
    const g = new THREE.Group();
    g.position.set(x, FLOOR, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 5), M.iron);
    stem.position.y = h / 2;
    g.add(stem);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 5), M.iron);
    foot.position.y = 0.15;
    g.add(foot);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12 + (arms - 1) * 0.28, 0.05, 0.05), M.iron);
    bar.position.y = h;
    g.add(bar);
    for (let i = 0; i < arms; i++) {
      const cx = (i - (arms - 1) / 2) * 0.28;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4), M.cloth);
      c.position.set(cx, h + 0.15, 0);
      g.add(c);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
      f.position.set(cx, h + 0.36, 0);
      g.add(f);
      flames.push({ flame: f, light: null, base: 0, phase: rnd() * 10, flameScale: 0.4 });
    }
    const l = new THREE.PointLight(0xffa04a, 4, 12, 2);
    l.position.y = h + 0.5;
    g.add(l);
    flames.push({ flame: new THREE.Object3D(), light: l, base: 4, phase: rnd() * 10 });
    root.add(g);
  };
  candelabrum(-2.4, EAST + 3.2, 2.6, 5);
  candelabrum(2.4, EAST + 3.2, 2.6, 5);
  candelabrum(6.6, -22, 2.4, 3);
  candelabrum(-6.6, -36, 2.4, 3);

  const urnProfile = [
    [0, 0],
    [0.5, 0],
    [0.4, 0.3],
    [0.75, 0.9],
    [0.8, 1.3],
    [0.5, 1.8],
    [0.42, 2.0],
    [0.6, 2.2],
    [0, 2.25],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const urn = shadowy(new THREE.Mesh(new THREE.LatheGeometry(urnProfile, 8), M.bronze));
  urn.position.set(9.6, FLOOR + 0.6, -24);
  root.add(urn);
  root.add(box(1.8, 0.6, 1.8, M.stone, 9.6, FLOOR + 0.3, -24, 1));

  // ---- West gallery with an arcaded balustrade ---------------------------------
  root.add(box(2 * NAVE, 1.0, WEST + 2.6, M.stone, 0, -0.5, (WEST - 2.6) / 2));
  const bal = new THREE.Shape();
  const L = 2 * NAVE;
  bal.moveTo(-L / 2, 0);
  bal.lineTo(L / 2, 0);
  bal.lineTo(L / 2, 1.0);
  bal.lineTo(-L / 2, 1.0);
  bal.lineTo(-L / 2, 0);
  const n = 12;
  const pw = 0.3;
  const span = (L - (n + 1) * pw) / n;
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + pw + i * (span + pw);
    bal.holes.push(archHole(x0, x0 + span, 0.18, 0.55, 0.75));
  }
  const balGeo = scaleUV(new THREE.ExtrudeGeometry(bal, { depth: 0.3, bevelEnabled: false }), 0.5);
  const balMesh = shadowy(new THREE.Mesh(balGeo, M.stone));
  balMesh.position.z = -2.6;
  root.add(balMesh);
  root.add(box(L + 0.2, 0.14, 0.5, M.darkStone, 0, 1.07, -2.45, 1));
  {
    const exit = new THREE.Mesh(lancetGeo(2.6, 3.8), new THREE.MeshBasicMaterial({ color: 0x241a14 }));
    exit.rotation.y = Math.PI;
    exit.position.set(0, 0, WEST - 0.02);
    root.add(exit);
    const glow = new THREE.PointLight(0xffa050, 2.5, 6, 2);
    glow.position.set(0, 2.6, WEST - 1);
    root.add(glow);
  }
  cameraBlockers.push(balMesh);
  colliders.push(
    { minX: -NAVE - 1, maxX: NAVE + 1, minZ: -3, maxZ: -2.2, h: 1.2 },
    { minX: -NAVE - 2, maxX: -NAVE + 0.3, minZ: -3, maxZ: WEST + 1 },
    { minX: NAVE - 0.3, maxX: NAVE + 2, minZ: -3, maxZ: WEST + 1 },
    { minX: -NAVE - 2, maxX: NAVE + 2, minZ: WEST - 0.2, maxZ: WEST + 2 },
  );

  return {
    root,
    sky: null,
    colliders,
    cameraBlockers,
    entries: { door: { pos: new THREE.Vector3(-4, 0, -1.3), yaw: -0.2, pitch: -0.27 } },
    // The door in the west wall behind the gallery leads back out to the square.
    portals: [{ minX: -2, maxX: 2, minZ: WEST - 1.0, maxZ: WEST + 1, to: 'bridge', entry: 'cathedral' }],
    spawn: new THREE.Vector3(-4, 0, -1.3),
    spawnYaw: -0.2,
    spawnPitch: -0.27,
    lanternIntensity: 2,
    env: {
      fog: { color: 0x241e32, density: 0.014 },
      hemi: { sky: 0x8a7cbc, ground: 0x40323a, intensity: 3.0 },
      dir: { dir: LIGHT_DIR.clone().negate(), color: 0xb09ae0, intensity: 0.7, shadow: false },
    },
    update(dt, t) {
      flickerTorches(flames, t);
    },
  };
}

export default {
  id: 'cathedral',
  title: 'The Great Cathedral',
  reference: '04-cathedral-interior.png',
  build: buildCathedral,
};
