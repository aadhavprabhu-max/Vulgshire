import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, archHole, shadowy, box, spire, buildSky, flickerTorches, mergedMesh, boxGeo, merlonGeos } from './kit.js';
import { buildTown, street, lotsAlongStreets, buildLots, streetGeometry } from './town.js';
import { smokeColumn, embers } from './fx.js';
import { buildCastle } from './castle.js';
import { createGuard } from '../characters/guard.js';
import { LOCATIONS } from '../data/world.js';

// WALKABLE ZONE: "North River Crossing" (reference 03 for the look).
// Laid out from the final map around the stone bridge over the NORTH river,
// west of the Crownkeep. See docs/map-locations.png and src/data/locations.json.
//
// Zone coordinates: x = east, z = south, 1 map pixel = 1.4 m (map scale x 1/4),
// origin at the bridge centre (map px 665,167). Everything walkable is at y = 0.
// The river surface is at y = -6 between stone quays.

const ZONE = LOCATIONS.zones.find((z) => z.id === 'north-river-crossing');
const K = LOCATIONS.metresPerPixel * LOCATIONS.gameScale; // 1.4 m per map px
const px = ([x, y]) => [(x - ZONE.originPx[0]) * K, (y - ZONE.originPx[1]) * K];

// River centreline traced from the map (map px), flowing south into the lake.
const RIVER_PX = [
  [636, -20],
  [650, 80],
  [665, 130],
  [665, 165],
  [675, 192],
  [690, 220],
  [710, 250],
  [735, 300],
];
const RW = 21; // river half-width (map: ~30 px wide)
const WATER_Y = -6;
const BOUNDS = { x0: -155, x1: 98, z0: -78, z1: 88 }; // walkable area
const CASTLE = { x: 205, z: 0, top: 12, r: 55, slope: 34 }; // Crownkeep hill (map px ~812,167)
const STORM_DIR = new THREE.Vector3(0.95, 0.5, -0.2).normalize(); // dim backlight from behind the keep

// Dense river samples [x, z] in zone metres.
function riverSamples() {
  const curve = new THREE.CatmullRomCurve3(
    RIVER_PX.map((p) => {
      const [x, z] = px(p);
      return new THREE.Vector3(x, 0, z);
    }),
  );
  return curve.getSpacedPoints(160).map((v) => [v.x, v.z]);
}

function mats() {
  return {
    stone: lambert(tex.stoneWall()),
    castle: lambert(tex.castleStone()),
    cobble: lambert(tex.cobble()),
    paving: lambert(tex.flagstone(), { color: 0xc8c0b8 }),
    slate: lambert(tex.slate()),
    rock: lambert(tex.darkStone(), { color: 0x6a6070 }),
    wood: lambert(tex.wood()),
    gateWood: lambert(tex.wood(), { color: 0x9a8070 }),
    iron: lambert(null, { color: 0x1e1c1c }),
    lit: new THREE.MeshBasicMaterial({ map: tex.litWindow() }),
    gateGlow: new THREE.MeshBasicMaterial({ color: 0xff9a40 }),
    water: new THREE.MeshLambertMaterial({ map: tex.water(), color: 0xa0a8d8, emissive: 0x120c22 }),
  };
}

// Extruded gate block: width along X, passage along Z (rotate for other axes).
function gateBlock(width, height, depth, archW, archSpring, mat, yBase = -9) {
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

function torchFlame(x, y, z, withLight, scale = 1.6) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
  g.add(flame);
  let light = null;
  if (withLight) {
    light = new THREE.PointLight(0xff8c3a, 8, 16, 2);
    light.position.y = 0.2;
    g.add(light);
  }
  return { group: g, flame, light, base: 8, phase: Math.random() * 10, flameScale: scale };
}

function postTorch(x, z, M, withLight) {
  const t = torchFlame(x, 3.15, z, withLight);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.7, 5), M.wood);
  post.position.set(x, 1.85, z);
  post.castShadow = true;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.22, 5), M.iron);
  cup.position.set(x, 2.8, z);
  return { ...t, extra: [post, cup] };
}

// Flat ribbon between two polylines at heights yL / yR.
function ribbon(left, right, yL, yR, uvScale = 0.5) {
  const pos = [];
  const uv = [];
  let acc = 0;
  for (let i = 0; i < left.length - 1; i++) {
    const seg = Math.hypot(left[i + 1][0] - left[i][0], left[i + 1][1] - left[i][1]);
    const span = Math.hypot(left[i][0] - right[i][0], left[i][1] - right[i][1], yL - yR);
    const q = [
      [left[i][0], yL, left[i][1], acc, 0],
      [right[i][0], yR, right[i][1], acc, span],
      [right[i + 1][0], yR, right[i + 1][1], acc + seg, span],
      [left[i + 1][0], yL, left[i + 1][1], acc + seg, 0],
    ];
    acc += seg;
    for (const k of [0, 2, 1, 0, 3, 2]) {
      pos.push(q[k][0], q[k][1], q[k][2]);
      uv.push(q[k][3] * uvScale, q[k][4] * uvScale);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Vertical wall strip along a polyline from y0 (top) to y1 (bottom).
function wallStrip(line, y0, y1, flip) {
  const pos = [];
  const uv = [];
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    const q = [
      [ax, y0, az, acc, 0],
      [ax, y1, az, acc, y0 - y1],
      [bx, y1, bz, acc + seg, y0 - y1],
      [bx, y0, bz, acc + seg, 0],
    ];
    acc += seg;
    for (const k of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
      pos.push(q[k][0], q[k][1], q[k][2]);
      uv.push(q[k][3] / 2, q[k][4] / 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function buildZone() {
  const M = mats();
  const root = new THREE.Group();
  root.name = 'north-river-crossing';
  const colliders = [];
  const cameraBlockers = [];
  const animated = [];
  const torches = [];

  // ---- River -------------------------------------------------------------
  const river = riverSamples();
  const riverDist = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < river.length - 1; i++) {
      const [ax, az] = river[i];
      const [bx, bz] = river[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return d;
  };
  // Unit normals pointing to the EAST bank (flow runs south, +z).
  const normals = river.map((_, i) => {
    const [ax, az] = river[Math.max(0, i - 1)];
    const [bx, bz] = river[Math.min(river.length - 1, i + 1)];
    const l = Math.hypot(bx - ax, bz - az);
    return [(bz - az) / l, -(bx - ax) / l];
  });
  const offset = (off) => river.map(([x, z], i) => [x + normals[i][0] * off, z + normals[i][1] * off]);
  const water = new THREE.Mesh(ribbon(offset(-RW - 1), offset(RW + 1), WATER_Y, WATER_Y, 0.25), M.water);
  root.add(water);
  // Quay walls and the paved quay tops.
  root.add(mergedMesh([wallStrip(offset(-RW), 0, WATER_Y - 1, true), wallStrip(offset(RW), 0, WATER_Y - 1, false)], M.stone)); // both face the water
  root.add(mergedMesh([ribbon(offset(-RW - 3.2), offset(-RW), 0.02, 0.02), ribbon(offset(RW), offset(RW + 3.2), 0.02, 0.02)], M.paving));

  // Low quay parapets with colliders (gap where the bridge lands).
  const parapets = [];
  for (const side of [-1, 1]) {
    const line = offset(side * (RW + 0.35));
    for (let i = 0; i < line.length - 1; i += 2) {
      const [ax, az] = line[i];
      const [bx, bz] = line[Math.min(line.length - 1, i + 2)];
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (Math.abs(mz) < 5.2) continue; // bridge abutment
      const len = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(bx - ax, bz - az) + Math.PI / 2; // local x runs along the segment
      parapets.push(boxGeo(len + 0.1, 0.9, 0.5, 0, 0, 0, 0, 1).rotateY(rot).translate(mx, 0.45, mz));
      colliders.push({ cx: mx, cz: mz, hx: len / 2 + 0.05, hz: 0.3, rot, h: 1 });
    }
  }
  root.add(mergedMesh(parapets, M.stone, { cast: true }));
  // Moored boats.
  const boats = [];
  for (const [i, side] of [
    [30, -1],
    [44, 1],
    [104, -1],
    [118, 1],
  ]) {
    const [x, z] = river[i];
    const n = normals[i];
    const rot = Math.atan2(n[0], n[1]) + Math.PI / 2;
    boats.push(boxGeo(1.8, 0.7, 6, 0, 0, 0, 0, 1).rotateY(rot).translate(x + n[0] * side * (RW - 3), WATER_Y + 0.25, z + n[1] * side * (RW - 3)));
  }
  root.add(mergedMesh(boats, M.wood));

  // ---- Ground (cobbles everywhere except over the river) -----------------
  {
    const cell = 2;
    const pos = [];
    const uv = [];
    for (let x = -270; x < 190; x += cell) {
      for (let z = -150; z < 210; z += cell) {
        if (riverDist(x + 1, z + 1) < RW + 1.5) continue;
        const q = [
          [x, z],
          [x, z + cell],
          [x + cell, z + cell],
          [x + cell, z],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          pos.push(q[k][0], 0, q[k][1]);
          uv.push(q[k][0] / 2, q[k][1] / 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, M.cobble);
    ground.receiveShadow = true;
    root.add(ground);
  }

  // ---- The bridge (map px ~643..687 at y 167) -------------------------------
  const BX = 27; // half length incl. abutments
  const HALF = 3.5;
  root.add(box(2 * BX, 1.2, 2 * HALF, M.cobble, 0, -0.6, 0));
  {
    const s = new THREE.Shape();
    s.moveTo(-BX, -9);
    s.lineTo(BX, -9);
    s.lineTo(BX, -1.2);
    s.lineTo(-BX, -1.2);
    s.lineTo(-BX, -9);
    const piers = [-15.4, -7.7, 0, 7.7, 15.4];
    const edges = [-22, ...piers, 22];
    for (let i = 0; i < edges.length - 1; i++) {
      const xa = edges[i] + (i === 0 ? 0 : 1);
      const xb = edges[i + 1] - (i === edges.length - 2 ? 0 : 1);
      s.holes.push(archHole(xa, xb, -8.9, -5, 0.5));
    }
    const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: 2 * HALF + 1, bevelEnabled: false }), 0.5);
    g.translate(0, 0, -(HALF + 0.5));
    const arches = new THREE.Mesh(g, M.stone);
    arches.receiveShadow = true;
    root.add(arches);
    const cut = [];
    for (const p of piers) for (const sz of [-1, 1]) cut.push(boxGeo(1.6, 6, 1.6, p, WATER_Y + 1, sz * (HALF + 1.2), Math.PI / 4));
    root.add(mergedMesh(cut, M.stone));
  }
  const bp = [];
  const bm = [];
  for (const sz of [-1, 1]) {
    bp.push(boxGeo(2 * BX, 2.2, 0.6, 0, -0.1, sz * (HALF + 0.3)));
    bm.push(...merlonGeos(2 * BX, 0, 1.0, sz * (HALF + 0.3), 0));
    colliders.push({ minX: -BX, maxX: BX, minZ: sz > 0 ? HALF : -HALF - 0.6, maxZ: sz > 0 ? HALF + 0.6 : -HALF, h: 1.6 });
  }
  root.add(mergedMesh(bp, M.stone, { cast: true }), mergedMesh(bm, M.stone, { cast: true }));
  // Seal the corners where the quay parapets meet the bridge, so nobody slips onto the river.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) colliders.push({ minX: sx < 0 ? -BX : 18.5, maxX: sx < 0 ? -18.5 : BX, minZ: sz < 0 ? -6.5 : 3.5, maxZ: sz < 0 ? -3.5 : 6.5, h: 1.6 });
  // Bridge torches on posts; two of them trail blocky smoke columns.
  [-20, -10, 0, 10, 20].forEach((x, i) => {
    for (const sz of [-1, 1]) {
      const tx = x + (sz > 0 ? 5 : 0);
      if (tx > BX - 1) continue;
      const t = postTorch(tx, sz * (HALF + 0.3), M, (i + (sz > 0 ? 1 : 0)) % 2 === 0);
      root.add(t.group, ...t.extra);
      torches.push(t);
      if ((i === 1 && sz < 0) || (i === 2 && sz > 0)) {
        const smoke = smokeColumn({ x: tx, y: 3.4, z: sz * (HALF + 0.3), height: 16, puffs: 16, size: 1.3 });
        root.add(smoke.group);
        animated.push(smoke);
      }
    }
  });
  // West bridge tower (the camera starts in its passage, like the reference).
  const towerW = gateBlock(12, 13, 7, 6.4, 3.6, M.stone);
  towerW.rotation.y = Math.PI / 2;
  towerW.position.x = -BX - 3.5;
  root.add(towerW);
  cameraBlockers.push(towerW);
  root.add(mergedMesh([...merlonGeos(12, -BX - 0.3, 13, 0, Math.PI / 2), ...merlonGeos(12, -BX - 6.7, 13, 0, Math.PI / 2)], M.stone));
  root.add(spire(4.6, 8, M.slate, -BX - 3.5, 13.6, 0));
  colliders.push({ minX: -BX - 7, maxX: -BX, minZ: -6, maxZ: -3.15 }, { minX: -BX - 7, maxX: -BX, minZ: 3.15, maxZ: 6 });
  for (const sz of [-1, 1]) {
    const t = torchFlame(-BX - 1.2, 2.7, sz * 2.4, sz < 0);
    root.add(t.group);
    torches.push(t);
  }

  // ---- North city wall on the west bank (map y ~ 110) -----------------------
  {
    const wz = -82;
    const wx0 = -175;
    const bank = offset(-RW).reduce((best, p) => (Math.abs(p[1] - wz) < Math.abs(best[1] - wz) ? p : best));
    const wx1 = bank[0] - 1;
    const len = wx1 - wx0;
    root.add(box(len, 10, 3, M.stone, (wx0 + wx1) / 2, 5, wz));
    root.add(mergedMesh(merlonGeos(len, (wx0 + wx1) / 2, 10, wz + 1.2, 0, { w: 0.9, h: 1, d: 0.7, gap: 0.8 }), M.stone));
    for (const tx of [-150, -110, -70, wx1 - 2]) {
      const t = shadowy(new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(3.6, 4, 16, 8), 2), M.stone));
      t.position.set(tx, 8, wz);
      root.add(t);
      root.add(spire(4.6, 7, M.slate, tx, 16, wz, 8));
    }
    colliders.push({ minX: wx0, maxX: wx1 + 4, minZ: wz - 2, maxZ: wz + 1.6 });
  }

  // ---- Streets (traced from the final map's west and east banks) -------------
  const westLane = street(offset(-RW - 6.5).filter(([, z]) => z > -80 && z < 100), 3);
  const eastLane = street(offset(RW + 6.5).filter(([, z]) => z > -100 && z < 100), 3);
  const streets = [
    street([[-BX - 7, 0], [-48, 4], [-62, 14], [-80, 30], [-105, 46], [-130, 60], [-175, 82]], 4.5), // main road SW toward the Old Town
    street([[-BX - 7, -1], [-55, -9], [-90, -12], [-125, -14], [-175, -12]], 3.5), // west road
    street([[-38, -40], [-70, -36], [-105, -33], [-140, -38], [-175, -36]], 3), // street under the north wall
    street([[-95, -78], [-92, -33], [-90, -12], [-92, 20], [-105, 46], [-112, 95]], 3), // north-south street
    street([[-148, -78], [-140, -38], [-132, -14], [-130, 60]], 3),
    street([[-20, 52], [-48, 64], [-82, 84], [-95, 110]], 2.6), // south lane
    street([[-62, 14], [-50, 36], [-30, 46]], 2.4), // alley off the market square
    street([[-70, -36], [-62, -20], [-55, -9]], 2.4),
    westLane,
    street([[BX, 0], [60, -2], [100, 0]], 4.5), // castle road (east bank)
    eastLane,
    street([[45, -70], [55, -30], [60, -2], [66, 40], [80, 80]], 3),
  ];
  const squares = [
    { x: -62, z: 14, r: 13 }, // market square
    { x: 60, z: -2, r: 9 },
  ];
  const paving = streets.map((s) => streetGeometry(s, 0.015));
  for (const q of squares) {
    const g = new THREE.CircleGeometry(q.r, 16);
    g.rotateX(-Math.PI / 2);
    g.translate(q.x, 0.016, q.z);
    paving.push(scaleUV(g, q.r));
  }
  root.add(mergedMesh(paving, M.paving));

  // Market square: a well with a wooden frame and a torch.
  const well = shadowy(new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(1.4, 1.5, 0.9, 8), 1), M.stone));
  well.position.set(-62, 0.45, 14);
  root.add(well);
  root.add(box(0.15, 2.2, 0.15, M.wood, -63.2, 1.1, 14, 1), box(0.15, 2.2, 0.15, M.wood, -60.8, 1.1, 14, 1), box(2.6, 0.15, 0.15, M.wood, -62, 2.2, 14, 1));
  colliders.push({ cx: -62, cz: 14, hx: 1.5, hz: 1.5, rot: 0, h: 1 });
  const sqTorch = torchFlame(-62, 2.6, 16.2, true, 1.2);
  root.add(sqTorch.group);
  torches.push(sqTorch);

  // ---- Buildings: varied houses lining every street, infill behind --------------
  const inZone = (x, z) => x > -200 && x < 112 && z > -80 && z < 130;
  const nearCastle = (x, z, r) => Math.hypot(x - CASTLE.x, z - CASTLE.z) < CASTLE.r + CASTLE.slope + 8 + r;
  const blocked = (x, z, r) =>
    !inZone(x, z) ||
    riverDist(x, z) < RW + 4 + r ||
    (Math.abs(z) < 7 + r && x > -BX - 9 && x < BX + 2) ||
    squares.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + r) ||
    nearCastle(x, z, r) ||
    x > 92 - r;
  const lots = lotsAlongStreets({ seed: 5, streets, blocked, infillBounds: [-200, 112, -78, 130], infillCount: 120 });
  const built = buildLots(lots, 77, { litChance: 0.38 });
  root.add(built.group);
  colliders.push(...built.colliders);
  // Distant districts beyond the zone (skyline only).
  root.add(
    buildTown({
      seed: 31,
      count: 260,
      bounds: [-330, 200, -260, 300],
      avoid: (x, z, r) => inZone(x, z) || riverDist(x, z) < RW + 4 + r || nearCastle(x, z, r) || (x > 92 && x < 320 && Math.abs(z) < 140), // castle precinct stays clear
    }),
  );

  // ---- Zone boundary: invisible walls + wooden barricades where streets leave ----
  const { x0, x1, z0, z1 } = BOUNDS;
  colliders.push(
    { minX: x0 - 2, maxX: x0, minZ: z0 - 10, maxZ: z1 + 10 },
    { minX: x1 + 12, maxX: x1 + 14, minZ: z0 - 10, maxZ: z1 + 10 }, // east: behind the gate; walls close the rest
    { minX: x0 - 10, maxX: x1 + 10, minZ: z0 - 2, maxZ: z0 },
    { minX: x0 - 10, maxX: x1 + 10, minZ: z1, maxZ: z1 + 2 },
  );
  const fence = [];
  const inside = (x, z) => x > x0 && x < x1 && z > z0 && z < z1;
  for (const s of streets) {
    for (const [[ax, az], [bx, bz]] of s.segs) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 0.5) {
        const x = ax + ((bx - ax) * t) / len;
        const z = az + ((bz - az) * t) / len;
        const xn = ax + ((bx - ax) * (t + 0.5)) / len;
        const zn = az + ((bz - az) * (t + 0.5)) / len;
        if (inside(x, z) === inside(xn, zn)) continue;
        if (x > 90 && Math.abs(z) < 8) continue; // the castle road runs on through the open gate
        const rot = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
        const w = s.halfWidth * 2 + 1;
        fence.push(boxGeo(w, 0.18, 0.12, 0, 0, 0, 0, 1).rotateY(rot).translate(x, 0.6, z));
        fence.push(boxGeo(w, 0.18, 0.12, 0, 0, 0, 0, 1).rotateY(rot).translate(x, 1.1, z));
        for (let k = -1; k <= 1; k++) fence.push(boxGeo(0.2, 1.4, 0.2, 0, 0, 0, 0, 1).translate((k * w) / 2.2, 0.7, 0).rotateY(rot).translate(x, 0, z));
      }
    }
  }
  if (fence.length) root.add(mergedMesh(fence, M.wood));

  // ---- East bank: castle road, gatehouse, the Crownkeep on its hill ------------
  const GX = 100;
  const gate = gateBlock(16, 15, 8, 5, 4.2, M.castle);
  gate.rotation.y = Math.PI / 2;
  gate.position.x = GX;
  root.add(gate);
  cameraBlockers.push(gate);
  root.add(mergedMesh(merlonGeos(16, GX - 3.7, 15, 0, Math.PI / 2), M.castle));
  for (const sz of [-1, 1]) {
    const tw = shadowy(new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(3.4, 3.8, 29, 8), 2), M.castle));
    tw.position.set(GX, 5.5, sz * 9.5);
    root.add(tw);
    root.add(spire(4.4, 9, M.slate, GX, 20, sz * 9.5, 8));
    for (let k = 0; k < 3; k++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), M.lit);
      w.position.set(GX - 3.85, 6 + k * 4.2, sz * 9.5);
      w.rotation.y = -Math.PI / 2;
      root.add(w);
    }
  }
  // Curtain wall running north and south from the gatehouse along the hill foot.
  for (const sz of [-1, 1]) {
    root.add(box(3, 11, 80, M.castle, GX + 2, 5.5, sz * 48));
    colliders.push({ minX: GX - 4, maxX: GX + 6, minZ: sz < 0 ? -90 : 2.5, maxZ: sz < 0 ? -2.5 : 90 });
  }
  // The gate itself: two oak leaves that swing inward as you approach.
  const leaves = [];
  const leafGeo = new THREE.BoxGeometry(0.35, 4.6, 2.5);
  leafGeo.translate(0, 2.3, -1.25 * 1); // hinge on one edge
  for (const sz of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(GX + 1.6, 0, sz * 2.5);
    const leaf = new THREE.Mesh(leafGeo, M.gateWood);
    leaf.scale.z = sz; // mirror so both hinge outward
    leaf.castShadow = true;
    hinge.add(leaf);
    for (const y of [1.0, 3.4]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 2.5), M.iron);
      band.position.set(0, y, -1.25 * sz);
      hinge.add(band);
    }
    root.add(hinge);
    leaves.push({ hinge, sz, open: 0 });
  }
  // Warm torchlight spilling from the inner ward through the gate.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 6.5), M.gateGlow);
  glow.rotation.y = -Math.PI / 2;
  glow.position.set(GX + 9, 3.2, 0);
  root.add(glow);
  const gateLight = new THREE.PointLight(0xff8a30, 18, 26, 1.6);
  gateLight.position.set(GX - 5, 3, 0);
  root.add(gateLight);
  const innerLight = new THREE.PointLight(0xff9a48, 14, 18, 1.6);
  innerLight.position.set(GX + 6, 3.5, 0);
  root.add(innerLight);
  // Walking through the open gate leads inside the Crownkeep.
  const portals = [{ minX: GX + 3.5, maxX: GX + 12, minZ: -2.5, maxZ: 2.5, to: 'crownkeep', entry: 'gate' }];
  colliders.push({ minX: GX + 7, maxX: GX + 8, minZ: -3, maxZ: 3 }); // backstop behind the portal
  for (const sz of [-1, 1]) {
    const t = torchFlame(GX - 4.3, 3.2, sz * 3.4, false, 1.4);
    root.add(t.group);
    torches.push(t);
  }

  const hill = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(CASTLE.r, CASTLE.r + CASTLE.slope, CASTLE.top, 12, 1), 6), M.rock);
  hill.position.set(CASTLE.x, CASTLE.top / 2, CASTLE.z);
  root.add(hill);
  const castle = buildCastle(M, 0, CASTLE.top);
  const keep = new THREE.Group();
  keep.position.set(CASTLE.x, CASTLE.top, CASTLE.z);
  keep.rotation.y = -Math.PI / 2; // facade faces west, toward the bridge
  keep.scale.setScalar(1.45);
  castle.group.position.set(0, -CASTLE.top, 0);
  keep.add(castle.group);
  root.add(keep);
  animated.push(...castle.animated);
  const em = embers({ count: 160, area: [0, CASTLE.top + 14, 10, 70, 18, 30], rise: 30, size: 2 });
  castle.group.add(em.group);
  animated.push(em);

  // ---- Guards patrolling between the west tower and the gatehouse --------------
  const guards = [
    { x: -12, z: -1.1 },
    { x: -13, z: 1.1 },
    { x: 8, z: 0.9 },
    { x: 40, z: -1.4 },
  ].map(({ x, z }, i) => {
    const g = createGuard();
    g.root.position.set(x, 0, z);
    root.add(g.root);
    const col = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    colliders.push(col);
    return { ...g, dir: 1, speed: 1.05 + i * 0.05, col };
  });

  return {
    root,
    sky: buildSky({ moonDir: new THREE.Vector3(0.9, 0.42, 0.28).normalize(), moonSize: 30, horizon: 0x170d20 }),
    colliders,
    cameraBlockers,
    spawn: new THREE.Vector3(-25, 0, -0.9),
    spawnYaw: -Math.PI / 2 + 0.03,
    spawnPitch: 0.2,
    entries: {
      // Coming back out of the Crownkeep: just outside the gate, facing the bridge.
      gate: { pos: new THREE.Vector3(GX - 7, 0, 0), yaw: Math.PI / 2, pitch: 0.12 },
    },
    portals,
    lanternIntensity: 3,
    env: {
      fog: { color: 0x170d20, density: 0.0052 },
      hemi: { sky: 0x6a4a9a, ground: 0x4a2814, intensity: 1.8 },
      dir: { dir: STORM_DIR, color: 0x9a7ad8, intensity: 1.0, shadow: true, extent: 45, target: new THREE.Vector3(-10, 0, 0) },
    },
    update(dt, t, ctx) {
      flickerTorches(torches, t);
      // Open the gate when the monk comes near; close it when he leaves.
      const near = ctx && Math.hypot(ctx.player.x - GX, ctx.player.z) < 16;
      for (const l of leaves) {
        l.open += ((near ? 1 : 0) - l.open) * Math.min(1, dt * 1.6);
        l.hinge.rotation.y = -l.sz * l.open * 1.45;
      }
      for (const a of animated) a.update(dt, t);
      water.material.map.offset.set(t * 0.004, t * 0.01);
      for (const g of guards) {
        g.root.position.x += g.dir * g.speed * dt;
        if (g.root.position.x > GX - 8 && g.dir > 0) g.dir = -1;
        if (g.root.position.x < -BX + 2 && g.dir < 0) g.dir = 1;
        g.root.rotation.y = g.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.update(dt, g.speed);
        const { x, z } = g.root.position;
        Object.assign(g.col, { minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, h: 2.1 });
      }
    },
  };
}

export default {
  id: 'bridge',
  title: 'North River Crossing',
  reference: '03-burning-castle-bridge.png',
  build: buildZone,
};
