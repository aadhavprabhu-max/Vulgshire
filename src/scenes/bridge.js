import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, archHole, shadowy, box, spire, buildSky, flickerTorches, mergedMesh, boxGeo, merlonGeos, floorMat, LAYER } from './kit.js';
import { street, lotsAlongStreets, streetGeometry, scatterLots } from './town.js';
import { createMapTerrain } from './mapterrain.js';
import { createChunkedTown } from './chunks.js';
import { buildStation, buildCathedralExterior, buildGuildhall } from './landmarks.js';
import { signTex, crossWall } from './metro.js';
import { createService } from './trainservice.js';
import { createTrain } from './train.js';
import { createMetroLine, bendGroup, bendBox, railY, PROFILE } from './metroline.js';
import METRO from '../data/metro.json';
import { smokeColumn, embers } from './fx.js';
import { buildCastle } from './castle.js';
import { createGuard } from '../characters/guard.js';
import { createPerson, PALETTES } from '../characters/people.js';
import { createCrowd, faceToward } from '../characters/crowd.js';
import { mulberry } from './kit.js';
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

const WATER_Y = -4; // lake and river surface
const CASTLE = { x: 205, z: 0, top: 12, r: 55, slope: 34 }; // Crownkeep hill (map px ~812,167)
const STORM_DIR = new THREE.Vector3(0.95, 0.5, -0.2).normalize(); // dim backlight from behind the keep

function mats() {
  return {
    stone: lambert(tex.stoneWall()),
    castle: lambert(tex.castleStone()),
    cobble: lambert(tex.cobble()),
    ground: floorMat(tex.cobble()),
    paving: floorMat(tex.flagstone(), { color: 0xc8c0b8 }, 1),
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

function buildZone() {
  const M = mats();
  const root = new THREE.Group();
  root.name = 'north-river-crossing';
  const colliders = [];
  const cameraBlockers = [];
  const animated = [];
  const torches = [];

  // ---- Terrain from the map: land, lake, rivers, quays -----------------------
  const T = createMapTerrain(ZONE.originPx);
  const BRIDGE_BOX = { x0: -31, x1: 31, z0: -4.2, z1: 4.2 };
  const inBridge = (x, z) => x > BRIDGE_BOX.x0 && x < BRIDGE_BOX.x1 && z > BRIDGE_BOX.z0 && z < BRIDGE_BOX.z1;
  const inPrecinct = (x, z) => Math.hypot(x - CASTLE.x, z - CASTLE.z) < CASTLE.r + CASTLE.slope + 3;
  const land = (x, z) => !T.isWater(x, z);
  // The Pilgrim's Way runs in the open here: a slot (cutting + viaduct) in the ground.
  const ROUTE = createMetroLine('II');
  const OPEN = PROFILE.open;
  const slotBox = (() => {
    const xs = [];
    const zs = [];
    for (let s2 = OPEN[0] - 2; s2 <= OPEN[1] + 2; s2 += 2) {
      const [x, z] = ROUTE.toWorld(s2, 0);
      xs.push(x);
      zs.push(z);
    }
    return [Math.min(...xs) - 6, Math.max(...xs) + 6, Math.min(...zs) - 6, Math.max(...zs) + 6];
  })();
  const slot = (x, z) => {
    if (x < slotBox[0] || x > slotBox[1] || z < slotBox[2] || z > slotBox[3]) return false;
    const q = ROUTE.toLine(x, z);
    return q.s > OPEN[0] - 1 && q.s < OPEN[1] + 1 && Math.abs(q.d) < 3.4;
  };
  // Keep houses and props out of the cutting (with r metres of margin).
  const slotNear = (x, z, r) => {
    if (x < slotBox[0] - r - 20 || x > slotBox[1] + r + 20 || z < slotBox[2] - r - 20 || z > slotBox[3] + r + 20) return false;
    const q = ROUTE.toLine(x, z);
    return q.s > OPEN[0] - 25 - r && q.s < OPEN[1] + 25 + r && Math.abs(q.d) < 5.5 + r;
  };
  const walkable = (x, z) => inBridge(x, z) || (T.inRegion(x, z) && land(x, z) && !inPrecinct(x, z) && !slot(x, z));
  // Water only where the map has water (so the slot never floods).
  const water = new THREE.Mesh(T.buildWater({ px0: 300, px1: 1470, py0: 0, py1: 760, y: WATER_Y, skip: slot }), M.water);
  root.add(water);
  {
    const terr = T.buildGround({
      px0: 330,
      px1: 1440,
      py0: 10,
      py1: 720,
      waterY: WATER_Y,
      skip: (x, z) => Math.abs(z) < 6.5 && Math.abs(x) < 33,
      parapetWhere: (x, z) => T.inRegion(x, z),
      waterAt: slot,
      noGround: (x, z) => Math.abs(x) < 27 && Math.abs(z) < 3.5, // the bridge deck has its own surface
    });
    const ground = new THREE.Mesh(terr.ground, M.ground);
    ground.receiveShadow = true;
    root.add(ground);
    root.add(new THREE.Mesh(terr.quays, M.stone));
    const par = terr.parapets.map(([cx, cz, sx, sz]) => boxGeo(sx, 0.85, sz, cx, 0.42, cz, 0, 1));
    if (par.length) root.add(mergedMesh(par, M.stone));
  }
  // Moored boats along the north shore.
  {
    const boats = [];
    let made = 0;
    for (let x = -300; x < 900 && made < 22; x += 23) {
      for (let z = 200; z < 460; z += 2) {
        if (T.isWater(x, z) && !T.isWater(x, z - 3)) {
          if (Math.abs(x) > 40) boats.push(boxGeo(1.8, 0.7, 6, x + 1, WATER_Y + 0.25, z + 4.5, 0.2 * Math.sin(x), 1));
          made++;
          break;
        }
      }
    }
    if (boats.length) root.add(mergedMesh(boats, M.wood));
  }

  // ---- The bridge (map px ~643..687 at y 167) -------------------------------
  const BX = 27; // half length incl. abutments
  const HALF = 3.5;
  root.add(box(2 * BX, 1.2, 2 * HALF, M.ground, 0, -0.58, 0)); // deck top at +2 cm, ground cut out beneath
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

  // ---- The north city wall along the outlined district's northern edge -----
  {
    const pts = [];
    for (let mx = 440; mx <= 1312; mx += 6) {
      let my = -1;
      for (let yy = 40; yy < 300; yy++) {
        const [zx, zz] = T.toZone(mx, yy);
        if (T.inRegion(zx + 0.7, zz + 0.7)) {
          my = yy;
          break;
        }
      }
      if (my > 0) pts.push(T.toZone(mx, my - 2));
    }
    const wall = [];
    const merl = [];
    const towers = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len > 25) continue;
      const rot = Math.atan2(-(bz - az), bx - ax);
      wall.push(boxGeo(len + 0.6, 10, 2.6, 0, 0, 0, 0, 2).rotateY(rot).translate((ax + bx) / 2, 5, (az + bz) / 2));
      merl.push(...merlonGeos(len, 0, 10, 0, 0, { w: 0.9, h: 1, d: 0.7, gap: 0.8 }).map((g) => g.rotateY(rot).translate((ax + bx) / 2, 0, (az + bz) / 2)));
      if (i % 12 === 0) towers.push([ax, az]);
    }
    root.add(mergedMesh(wall, M.stone, { cast: true }), mergedMesh(merl, M.stone));
    for (const [tx, tz] of towers) {
      const t = shadowy(new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(3.6, 4, 16, 8), 2), M.stone));
      t.position.set(tx, 8, tz);
      root.add(t);
      root.add(spire(4.6, 7, M.slate, tx, 16, tz, 8));
    }
  }

  // ---- Streets (traced from the final map's west and east banks) -------------
  const S = (pts, hw) => street(pts.map(([mx, my]) => T.toZone(mx, my)), hw);
  const streets = [
    street([[-BX - 7, 0], [-48, 4], [-62, 14], [-80, 30], [-105, 46], [-130, 60], [-175, 82]], 4.5), // main road SW toward the Old Town
    street([[-BX - 7, -1], [-55, -9], [-90, -12], [-125, -14], [-175, -12]], 3.5), // west road
    street([[-38, -40], [-70, -36], [-105, -33], [-140, -38], [-175, -36]], 3), // street under the north wall
    street([[-95, -78], [-92, -33], [-90, -12], [-92, 20], [-105, 46], [-112, 95]], 3), // north-south street
    street([[-148, -78], [-140, -38], [-132, -14], [-130, 60]], 3),
    street([[-20, 52], [-48, 64], [-82, 84], [-95, 110]], 2.6), // south lane
    street([[-62, 14], [-50, 36], [-30, 46]], 2.4), // alley off the market square
    street([[-70, -36], [-62, -20], [-55, -9]], 2.4),
    street([[BX, 0], [60, -2], [100, 0]], 4.5), // castle road (east bank)
    street([[45, -70], [55, -30], [60, -2], [66, 40], [80, 80]], 3),
    // Traced from the final map (map pixels), west of the river...
    S([[440, 290], [500, 283], [560, 283], [620, 283], [690, 287]], 4),
    S([[462, 280], [510, 250], [555, 226], [592, 203]], 3.2),
    S([[540, 140], [540, 200], [543, 283]], 3),
    S([[445, 355], [500, 362], [560, 372], [615, 372], [655, 350], [690, 325]], 4),
    S([[600, 283], [603, 330], [610, 372]], 3),
    S([[470, 200], [510, 200], [540, 200], [575, 212]], 2.6),
    S([[470, 150], [466, 230], [462, 330]], 2.6),
    // ... the lake shore, the castle's south side and the cathedral ...
    S([[700, 318], [760, 322], [820, 330], [880, 336], [940, 346], [1000, 360]], 4.5),
    S([[735, 300], [780, 300], [830, 305], [870, 320]], 3.2),
    S([[890, 190], [892, 260], [895, 330]], 3.4),
    S([[895, 185], [950, 180], [1005, 190]], 3),
    // ... and the Merchants' Quarter.
    S([[1010, 212], [1090, 232], [1160, 268], [1230, 310], [1295, 352]], 3.4),
    S([[1010, 300], [1100, 302], [1160, 310]], 3),
    S([[1000, 360], [1080, 362], [1160, 364], [1240, 366], [1300, 370]], 5),
    S([[1020, 150], [1020, 250], [1022, 360]], 3),
    S([[1100, 180], [1102, 270], [1110, 360]], 3),
    S([[1040, 420], [1120, 412], [1200, 420], [1280, 425]], 3),
    S([[1238, 312], [1240, 380], [1242, 440]], 3),
    S([[1160, 364], [1165, 420]], 2.6),
  ];
  const squares = [
    { x: -62, z: 14, r: 13 }, // market square
    { x: 60, z: -2, r: 9 },
  ];
  // Landmarks (map px): Grand Central Station, the Great Cathedral, the Guildhall.
  const [stX, stZ] = T.toZone(550, 310);
  const station = buildStation({ x: stX, z: stZ });
  const [caX] = T.toZone(945, 0);
  const cathedral = buildCathedralExterior({ x: caX, z: T.toZone(0, 294)[1] });
  const [ghX, ghZ] = T.toZone(1172, 318);
  const guild = buildGuildhall({ x: ghX, z: ghZ });
  const landmarks = [station, cathedral, guild];
  for (const l of landmarks) {
    root.add(l.group);
    colliders.push(...l.colliders);
    torches.push(...l.flames);
  }
  const inFootprint = (x, z, r) => landmarks.some(({ footprint: [a, b, c, d] }) => x > a - r && x < b + r && z > c - r && z < d + r);

  // ---- The Ancient Underground: station entrances and the river viaduct ------------
  const metroEntries = {};
  const metroPortals = [];
  {
    const SM = { stone: lambert(tex.townStone(), { color: 0xc8c0b4 }), roof: lambert(tex.slate()), dark: new THREE.MeshBasicMaterial({ color: 0x0c0a08 }), glow: new THREE.MeshBasicMaterial({ color: 0xffa048 }) };
    // Triflumen: down through Grand Central Station's great doors.
    const fz = stZ + 16;
    metroPortals.push({ minX: stX - 3.4, maxX: stX + 3.4, minZ: fz + 4.6, maxZ: fz + 5.4, to: 'metro', entry: 'st-triflumen' });
    metroEntries['metro-triflumen'] = { pos: new THREE.Vector3(stX, 0, fz + 9), yaw: Math.PI, pitch: 0.12 };
    const clearSpot = (x, z) => {
      for (const dz of [0, 1.5, 3, 4.5])
        for (const dx of [-3, 0, 3]) if (!walkable(x + dx, z + dz) || inFootprint(x + dx, z + dz, 0)) return false;
      return true;
    };
    for (const st of METRO.stations) {
      if (st.id === 'triflumen') continue;
      let [x, z] = T.toZone(st.mapPx[0], st.mapPx[1]);
      // Nearest clear, walkable spot (spiral search).
      let found = clearSpot(x, z) ? [x, z] : null;
      for (let rr = 3; !found && rr < 90; rr += 3)
        for (let a = 0; a < 24 && !found; a++) {
          const cx = x + Math.cos((a / 24) * Math.PI * 2) * rr;
          const cz = z + Math.sin((a / 24) * Math.PI * 2) * rr;
          if (clearSpot(cx, cz)) found = [cx, cz];
        }
      if (!found) continue;
      [x, z] = found;
      // A small stone kiosk with a pointed opening (facing +z) and the line roundel.
      const k = new THREE.Group();
      k.position.set(x, 0, z);
      const parts = [boxGeo(5.2, 3.6, 0.5, 0, 1.8, -2.25, 0, 1), boxGeo(0.5, 3.6, 4.5, -2.35, 1.8, 0, 0, 1), boxGeo(0.5, 3.6, 4.5, 2.35, 1.8, 0, 0, 1), boxGeo(5.2, 0.7, 0.5, 0, 3.25, 2.0, 0, 1)];
      k.add(mergedMesh(parts, SM.stone, { cast: true }));
      const rf = new THREE.ConeGeometry(4.2, 2.4, 4);
      rf.rotateY(Math.PI / 4);
      rf.scale(1, 1, 0.9);
      rf.translate(0, 4.8, 0);
      k.add(new THREE.Mesh(rf, SM.roof));
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 3.4), SM.dark);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(0, 0.12, 0); // above every paving layer
      k.add(hole);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), SM.glow);
      glow.position.set(0, 0.6, -1.95);
      k.add(glow);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.72), new THREE.MeshBasicMaterial({ map: signTex(st.name) }));
      sign.position.set(0, 3.25, 2.27);
      k.add(sign);
      root.add(k);
      const tf = torchFlame(x - 2.9, 2.6, z + 2.3, false, 1.0);
      root.add(tf.group);
      torches.push(tf);
      colliders.push({ minX: x - 2.6, maxX: x + 2.6, minZ: z - 2.5, maxZ: z - 2.0 }, { minX: x - 2.6, maxX: x - 2.1, minZ: z - 2.5, maxZ: z + 2.25 }, { minX: x + 2.1, maxX: x + 2.6, minZ: z - 2.5, maxZ: z + 2.25 });
      metroPortals.push({ minX: x - 2, maxX: x + 2, minZ: z - 1.9, maxZ: z + 0.6, to: 'metro', entry: 'st-' + st.id });
      metroEntries['metro-' + st.id] = { pos: new THREE.Vector3(x, 0, z + 5), yaw: Math.PI, pitch: 0.12 };
      landmarks.push({ footprint: [x - 4, x + 4, z - 4, z + 7] });
    }
  }
  // The open-air stretch of the Pilgrim's Way (shared heights with the metro scene):
  // out of a tunnel mouth, up a walled cutting, over the river on a viaduct at
  // street level, down a cutting and back into a tunnel.
  const viaduct = (() => {
    const [b0, b1] = PROFILE.bridge;
    const lr = new THREE.Group();
    const bed = [boxGeo(OPEN[1] - OPEN[0] + 40, 0.1, 7, (OPEN[0] + OPEN[1]) / 2, -0.05, 0, 0, 2)];
    lr.add(mergedMesh(bed, lambert(tex.cobble(), { color: 0x4a4440 })));
    const rails = [];
    const sleepers = [];
    for (const rz of [-0.72, 0.72]) rails.push(boxGeo(OPEN[1] - OPEN[0] + 40, 0.16, 0.12, (OPEN[0] + OPEN[1]) / 2, 0.22, rz, 0, 1));
    for (let x = OPEN[0] - 20; x < OPEN[1] + 20; x += 0.9) sleepers.push(boxGeo(0.25, 0.14, 2.3, x, 0.07, 0, 0, 1));
    lr.add(mergedMesh(rails, M.iron), mergedMesh(sleepers, M.wood));
    // Tunnel mouths with stone rings, and a dark tunnel behind each.
    for (const [cx, dirn] of [
      [OPEN[0], -1],
      [OPEN[1], 1],
    ]) {
      lr.add(crossWall(cx, 1.6, -9, 9, -railY(cx) + 0.2, [{ z0: -2.9, z1: 2.9, bottom: -0.2, spring: 3.4 }], M.stone));
      const tun = [];
      for (const sz of [-1, 1]) tun.push(boxGeo(20, 6, 0.6, cx + dirn * 10, 3, sz * 2.9, 0, 2));
      tun.push(boxGeo(20, 0.3, 6.4, cx + dirn * 10, 6.15, 0, 0, 2));
      lr.add(mergedMesh(tun, lambert(tex.darkStone(), { color: 0x3a3840 })));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.3, 4, 12, Math.PI), M.stone);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(cx - dirn * 0.85, 3.4, 0);
      lr.add(ring);
    }
    // The viaduct: deck and low arches over the river, parapets with lanterns.
    const len = b1 - b0;
    const deck = new THREE.Shape();
    deck.moveTo(b0, WATER_Y - 1);
    deck.lineTo(b1, WATER_Y - 1);
    deck.lineTo(b1, -0.1);
    deck.lineTo(b0, -0.1);
    deck.lineTo(b0, WATER_Y - 1);
    const spans = 7;
    for (let k = 0; k < spans; k++) deck.holes.push(archHole(b0 + (len * k) / spans + 1.1, b0 + (len * (k + 1)) / spans - 1.1, WATER_Y - 0.9, WATER_Y - 0.5, 0.5));
    const dg = scaleUV(new THREE.ExtrudeGeometry(deck, { depth: 6.6, bevelEnabled: false }), 0.5);
    dg.translate(0, 0, -3.3);
    lr.add(new THREE.Mesh(dg, M.stone));
    const par = [];
    for (const sz of [-1, 1]) {
      par.push(boxGeo(len, 1.1, 0.4, (b0 + b1) / 2, 0.55, sz * 3.3, 0, 1));
      for (let k = 0; k <= spans; k++) par.push(boxGeo(0.8, 1.6, 0.8, b0 + (len * k) / spans, 0.8, sz * 3.3, 0, 1));
    }
    lr.add(mergedMesh(par, M.stone));
    for (let k = 1; k < spans; k += 2)
      for (const sz of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), M.lit);
        l.position.set(b0 + (len * k) / spans, 2.6, sz * 3.3);
        lr.add(l);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 5), M.iron);
        post.position.set(b0 + (len * k) / spans, 1.6, sz * 3.3);
        lr.add(post);
      }
    root.add(bendGroup(ROUTE, lr).group);
    // A train shuttling through: the same 1D service as the metro, between two
    // stops hidden in the tunnels.
    const train = createTrain();
    root.add(train.group);
    const svc = createService({ stops: [OPEN[0] - 70, OPEN[1] + 70], dwell: 6 });
    return { train, svc };
  })();
  // Paving: streets and squares on their own layers, all with world-space UVs so
  // overlaps (street crossings, squares) look identical wherever they meet.
  const paving = streets.map((s) => streetGeometry(s, LAYER.street));
  for (const q of squares) {
    const g = new THREE.CircleGeometry(q.r, 16);
    g.rotateX(-Math.PI / 2);
    g.translate(q.x, LAYER.square, q.z);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) g.attributes.uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
    paving.push(g);
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

  // ---- Buildings: varied houses lining every street, infill behind (chunked LOD) ---
  const okLand = (x, z) => T.inRegion(x, z) && land(x, z) && !inPrecinct(x, z);
  const blocked = (x, z, r) =>
    !okLand(x, z) ||
    T.waterNear(x, z, r + 3) ||
    (Math.abs(z) < 7 + r && x > -BX - 9 && x < BX + 2) ||
    squares.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + r) ||
    inFootprint(x, z, r) ||
    slotNear(x, z, r) ||
    (x > 92 - r && x < 106 + r && Math.abs(z) < 92);
  const lots = lotsAlongStreets({ seed: 5, streets, blocked, infillBounds: [-330, 915, -140, 425], infillCount: 4200 });
  // District palettes for the house kit: richer colours in the Merchants'
  // Quarter, more stone near the Crownkeep.
  for (const l of lots) l.district = Math.hypot(l.x - ghX, l.z - ghZ) < 170 ? 'merchant' : l.x > 60 && l.x < 190 && l.z < 40 ? 'castle' : 'default';
  for (const l of lots) colliders.push({ cx: l.x, cz: l.z, hx: l.w / 2 + 0.35, hz: l.d / 2 + 0.35, rot: l.rot });
  const town = createChunkedTown({ lots, root, near: 150, far: 520, litChance: 0.38 });

  // ---- Street life: market stalls, carts, barrels, lamps, townsfolk ----------
  const life = streetLife({ M, streets, squares, colliders, root, BX, inBounds: (x, z) => walkable(x, z) && walkable(x + 1.5, z) && walkable(x - 1.5, z), T });
  animated.push(life);
  // The rest of the city beyond the district (far LOD only, chunked so it culls).
  const skyLots = scatterLots({
    seed: 31,
    count: 1100,
    bounds: [-470, 1080, -260, 640],
    avoid: (x, z, r) => (T.inRegion(x, z) && !inPrecinct(x, z)) || T.waterNear(x, z, r + 2) || inPrecinct(x, z) || inFootprint(x, z, r) || slotNear(x, z, r) || z < -150,
  });
  const skyline = createChunkedTown({ lots: skyLots, root, cell: 250, near: 0, far: 640, litChance: 0.3 });

  // ---- Zone boundary: invisible walls + wooden barricades where streets leave ----
  const fence = [];
  const inside = (x, z) => walkable(x, z);
  for (const s of streets) {
    for (const [[ax, az], [bx, bz]] of s.segs) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 0.5) {
        const x = ax + ((bx - ax) * t) / len;
        const z = az + ((bz - az) * t) / len;
        const xn = ax + ((bx - ax) * (t + 0.5)) / len;
        const zn = az + ((bz - az) * (t + 0.5)) / len;
        if (inside(x, z) === inside(xn, zn)) continue;
        if (T.isWater(x, z) || T.isWater(xn, zn) || inPrecinct(x, z) || inPrecinct(xn, zn)) continue;
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
    const col = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, dynamic: true };
    colliders.push(col);
    return { ...g, dir: 1, speed: 1.05 + i * 0.05, col };
  });

  let streamed = false;
  const staticBlockers = cameraBlockers.length;
  // A cloister door on the cathedral's east transept (a dark arched opening).
  {
    const cd = cathedral.cloisterDoor;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4), new THREE.MeshBasicMaterial({ color: 0x1a1410 }));
    door.rotation.y = Math.PI / 2;
    door.position.set(cd.x + 0.02, 2, cd.z);
    root.add(door);
    const t = torchFlame(cd.x + 0.6, 3.4, cd.z + 2.2, false, 1.1);
    root.add(t.group);
    torches.push(t);
  }

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
      ...metroEntries,
      // Out of the cathedral / cloister: on the steps, facing the square.
      cathedral: { pos: new THREE.Vector3(cathedral.door.x, 0, cathedral.door.z + 4), yaw: Math.PI, pitch: 0.1 },
      cloister: { pos: new THREE.Vector3(cathedral.cloisterDoor.x + 3, 0, cathedral.cloisterDoor.z), yaw: -Math.PI / 2, pitch: 0.1 },
    },
    portals: [
      ...portals,
      ...metroPortals,
      { minX: cathedral.door.x - 3, maxX: cathedral.door.x + 3, minZ: cathedral.door.z - 0.6, maxZ: cathedral.door.z + 0.9, to: 'cathedral', entry: 'door' },
      { minX: cathedral.cloisterDoor.x - 0.6, maxX: cathedral.cloisterDoor.x + 1.1, minZ: cathedral.cloisterDoor.z - 2, maxZ: cathedral.cloisterDoor.z + 2, to: 'cloister', entry: 'door' },
    ],
    walkable,
    // Where the player is on the city map.
    mapPos(p) {
      return T.toPx(p.x, p.z);
    },
    lanternIntensity: 3,
    debug: { viaduct, town, skyline },
    env: {
      fog: { color: 0x170d20, density: 0.0052 },
      hemi: { sky: 0x6a4a9a, ground: 0x4a2814, intensity: 1.8 },
      dir: { dir: STORM_DIR, color: 0x9a7ad8, intensity: 1.0, shadow: true, extent: 45, target: new THREE.Vector3(-10, 0, 0) },
    },
    update(dt, t, ctx) {
      flickerTorches(torches, t);
      // The street-side train: one 1D service, every car derived from its distance.
      if (viaduct) {
        viaduct.svc.update(dt);
        const S = viaduct.svc.state;
        viaduct.train.place(ROUTE.frame, railY, S.distance, { dir: S.dir, travelled: S.travelled });
        viaduct.train.setDoors(0);
      }
      // Stream detailed houses near the player; far ones stay simple.
      if (ctx?.player) {
        // Hide flames, lamps and small props that are far away (each is a draw call).
        for (const tch of torches) {
          const o = tch.group || tch.flame;
          if (!o || !o.parent) continue;
          if (!tch._p) tch._p = o.getWorldPosition(new THREE.Vector3());
          o.visible = Math.hypot(tch._p.x - ctx.player.x, tch._p.z - ctx.player.z) < 150;
        }
        town.update(ctx.player.x, ctx.player.z, { force: !streamed });
        skyline.update(ctx.player.x, ctx.player.z);
        streamed = true;
        cameraBlockers.length = staticBlockers;
        cameraBlockers.push(...town.blockers);
      }
      // Open the gate when the monk comes near; close it when he leaves.
      const near = ctx && Math.hypot(ctx.player.x - GX, ctx.player.z) < 16;
      for (const l of leaves) {
        l.open += ((near ? 1 : 0) - l.open) * Math.min(1, dt * 1.6);
        l.hinge.rotation.y = -l.sz * l.open * 1.45;
      }
      for (const a of animated) a.update(dt, t, ctx?.player);
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

// Market stalls around the well, props along the street edges, and townsfolk.
function streetLife({ M, streets, squares, colliders, root, BX, inBounds, T }) {
  const rnd = mulberry(2024);
  const wood = [];
  const iron = [];
  const goods = [];
  const lampFlames = [];
  const awnings = [];
  const AWN = [0xb43a32, 0x3a7038, 0x384c94, 0xb88a2a, 0x84386c];
  const awnMat = (hex) => new THREE.MeshLambertMaterial({ map: tex.awning(), color: hex, side: THREE.DoubleSide });
  const goodsMat = new THREE.MeshLambertMaterial({ map: tex.flowerBox() });
  const place = (g, x, z, rot) => g.rotateY(rot).translate(x, 0, z);

  // Market stalls in a ring around the well, facing it.
  const sq = squares[0];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = sq.x + Math.cos(a) * 9.2;
    const z = sq.z + Math.sin(a) * 9.2;
    const rot = Math.atan2(sq.x - x, sq.z - z); // local +z faces the well
    wood.push(place(boxGeo(2.6, 0.9, 1.0, 0, 0.45, 0.2, 0, 1), x, z, rot));
    for (const [px, pz] of [[-1.25, -0.5], [1.25, -0.5], [-1.25, 0.65], [1.25, 0.65]]) wood.push(place(boxGeo(0.1, pz < 0 ? 2.5 : 2.1, 0.1, px, pz < 0 ? 1.25 : 1.05, pz, 0, 1), x, z, rot));
    goods.push(place(boxGeo(2.3, 0.2, 0.75, 0, 1.0, 0.2, 0, 1), x, z, rot));
    const aw = new THREE.PlaneGeometry(3, 1.6);
    aw.rotateX(-Math.PI / 2 + 0.3);
    aw.translate(0, 2.3, 0.1);
    const awm = new THREE.Mesh(aw, awnMat(AWN[i % AWN.length]));
    awm.rotation.y = rot;
    awm.position.set(x, 0, z);
    root.add(awm);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    colliders.push({ cx: x + 0.2 * s, cz: z + 0.2 * c, hx: 1.4, hz: 0.75, rot });
    for (let k = 0; k < 3; k++) wood.push(place(boxGeo(0.6, 0.6, 0.6, -0.8 + k * 0.8, 0.3, -1.0, rnd() * 0.4, 1), x, z, rot));
  }

  // Props along the edges of the streets.
  const near = (x, z) => squares.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + 2) || (Math.abs(z) < 8 && x > -BX - 12 && x < BX + 4) || x > 90;
  for (const s of streets) {
    let side = 1;
    for (const [[ax, az], [bx, bz]] of s.segs) {
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (let t = 6 + rnd() * 6; t < len - 6; t += 11 + rnd() * 8) {
        side = -side;
        const off = s.halfWidth - 0.8;
        const x = ax + ux * t - uz * off * side;
        const z = az + uz * t + ux * off * side;
        if (!inBounds(x, z) || near(x, z)) continue;
        const rot = Math.atan2(ux, uz);
        const kind = Math.floor(rnd() * 5);
        if (kind === 0) {
          // A cluster of barrels.
          for (const [dx, dz] of [[0, 0], [0.62, 0.1], [0.3, -0.55]]) {
            const g = new THREE.CylinderGeometry(0.3, 0.27, 0.85, 8);
            g.translate(dx, 0.43, dz);
            wood.push(place(g, x, z, rot));
          }
          colliders.push({ minX: x - 0.7, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.7, h: 1 });
        } else if (kind === 1) {
          // Stacked crates.
          wood.push(place(boxGeo(0.8, 0.8, 0.8, 0, 0.4, 0, 0, 1), x, z, rot));
          wood.push(place(boxGeo(0.7, 0.7, 0.7, 0.05, 1.15, 0.05, 0.3, 1), x, z, rot));
          wood.push(place(boxGeo(0.6, 0.6, 0.6, 0.7, 0.3, 0.1, 0.5, 1), x, z, rot));
          colliders.push({ minX: x - 0.6, maxX: x + 1.1, minZ: z - 0.6, maxZ: z + 0.6, h: 1.5 });
        } else if (kind === 2) {
          // A hand cart.
          wood.push(place(boxGeo(1.1, 0.4, 1.8, 0, 0.75, 0, 0, 1), x, z, rot));
          wood.push(place(boxGeo(0.08, 0.08, 1.4, -0.4, 0.7, 1.4, 0, 1), x, z, rot));
          wood.push(place(boxGeo(0.08, 0.08, 1.4, 0.4, 0.7, 1.4, 0, 1), x, z, rot));
          for (const sd of [-1, 1]) {
            const wh = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 10);
            wh.rotateZ(Math.PI / 2);
            wh.translate(sd * 0.62, 0.45, -0.1);
            iron.push(place(wh, x, z, rot));
          }
          goods.push(place(boxGeo(0.9, 0.2, 1.4, 0, 1.05, 0, 0, 1), x, z, rot));
          colliders.push({ cx: x, cz: z, hx: 0.75, hz: 1.4, rot: rot, h: 1.2 });
        } else if (kind === 3) {
          // A bench.
          wood.push(place(boxGeo(1.8, 0.08, 0.45, 0, 0.48, 0, 0, 1), x, z, rot + Math.PI / 2));
          for (const dx of [-0.75, 0.75]) wood.push(place(boxGeo(0.1, 0.45, 0.4, dx, 0.23, 0, 0, 1), x, z, rot + Math.PI / 2));
          colliders.push({ cx: x, cz: z, hx: 0.95, hz: 0.3, rot: rot + Math.PI / 2, h: 0.6 });
        } else {
          // An iron lamp post with a glowing lantern.
          const p = new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6);
          p.translate(0, 1.6, 0);
          iron.push(place(p, x, z, 0));
          iron.push(place(boxGeo(0.5, 0.06, 0.06, 0.22, 3.15, 0, 0, 1), x, z, rot));
          const lan = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), M.lit);
          const c = Math.cos(rot);
          const sn = Math.sin(rot);
          lan.position.set(x + 0.42 * c, 2.9, z - 0.42 * sn);
          root.add(lan);
          const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
          f.position.set(x + 0.42 * c, 2.93, z - 0.42 * sn);
          root.add(f);
          lampFlames.push({ flame: f, light: null, base: 0, phase: rnd() * 9, flameScale: 0.35 });
          colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });
        }
      }
    }
  }
  root.add(mergedMesh(wood, M.wood, { cast: true }));
  root.add(mergedMesh(iron, M.iron));
  root.add(mergedMesh(goods, goodsMat));
  void awnings;

  // Townsfolk walking the streets and gathered around the market.
  const crowd = createCrowd({ root, colliders, floors: [] });
  const pr = mulberry(31337);
  const C = PALETTES.commoner;
  const folk = () => {
    const outfit = pr() < 0.45 ? 'servant' : pr() < 0.5 ? 'gown' : 'doublet';
    const hat = ['none', 'hood', 'coif', 'cap', 'chaperon'][Math.floor(pr() * 5)];
    const carry = pr() < 0.4 ? ['basket', 'basket', 'scroll'][Math.floor(pr() * 3)] : null;
    return createPerson({ rnd: pr, outfit, hat, carry, main: C[Math.floor(pr() * C.length)] });
  };
  const routes = [
    [[-36, -2], [-55, -9], [-90, -12], [-125, -14]],
    [[-40, -40], [-70, -36], [-105, -33], [-140, -38]],
    [[-92, -33], [-90, -12], [-92, 20], [-105, 46]],
    [[-80, 30], [-105, 46], [-130, 60]],
    [[-20, 52], [-48, 64], [-82, 84]],
    [[30, 1.2], [60, 1.5], [86, 1.2]],
    [[45, -68], [55, -30], [60, -2], [66, 40], [78, 76]],
    ...[10, 13, 17, 23, 21, 19, 12].map((i) => streets[i].points.filter(([x, z]) => inBounds(x, z))),
    streets[17].points.slice(2).filter(([x, z]) => inBounds(x, z)),
    streets[23].points.slice(1).filter(([x, z]) => inBounds(x, z)),
  ];
  void T;
  for (const path of routes) if (path.length > 1) crowd.add(folk(), { path, speed: 0.75 + pr() * 0.5, wait: 2 + pr() * 4 });
  // A slow loop around the well.
  const loop = Array.from({ length: 10 }, (_, i) => [sq.x + Math.cos((i / 10) * Math.PI * 2) * 5.6, sq.z + Math.sin((i / 10) * Math.PI * 2) * 5.6]);
  crowd.add(folk(), { path: loop, loop: true, speed: 0.6, wait: 0 });
  // Merchants behind their stalls and gossips by the well.
  for (let i = 0; i < 6; i += 2) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = sq.x + Math.cos(a) * 10.4;
    const z = sq.z + Math.sin(a) * 10.4;
    crowd.add(folk(), { pos: [x, z], facing: faceToward(x, z, sq.x, sq.z), mode: 'talk' });
  }
  crowd.add(folk(), { pos: [sq.x - 2.4, sq.z - 2.2], facing: faceToward(sq.x - 2.4, sq.z - 2.2, sq.x - 1.2, sq.z - 3.1), mode: 'talk' });
  crowd.add(folk(), { pos: [sq.x - 1.2, sq.z - 3.1], facing: faceToward(sq.x - 1.2, sq.z - 3.1, sq.x - 2.4, sq.z - 2.2), mode: 'idle' });

  return {
    update(dt, t, player) {
      flickerTorches(lampFlames, t);
      crowd.update(dt, t, player);
    },
  };
}

export default {
  id: 'bridge',
  title: 'The North Shore',
  reference: '03-burning-castle-bridge.png',
  build: buildZone,
};
