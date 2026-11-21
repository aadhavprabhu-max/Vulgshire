import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, archPoints, archHole, mergedMesh, boxGeo, lancetGeo, flickerTorches, buildSky, mulberry } from './kit.js';
import { createChunkedTown } from './chunks.js';
import { scatterLots } from './town.js';
import { createMapTerrain } from './mapterrain.js';
import { createMetroLine, bendGroup, bendBox, bendAABB, toMapPx } from './metroline.js';
import { LOCATIONS } from '../data/world.js';
import { buildCastle } from './castle.js';
import { clockFace } from './landmarks.js';
import { createTrain, TRAIN_L, CAR_W, FLOOR } from './train.js';
import { createPerson, PALETTES } from '../characters/people.js';
import { createCrowd, faceToward } from '../characters/crowd.js';
import { createGuard } from '../characters/guard.js';
import METRO from '../data/metro.json';

// THE ANCIENT UNDERGROUND: line II, The Pilgrim's Way (orange).
// One long straight line in its own coordinates: x runs along the track,
// platforms on the -z side (z -9 .. -2.2, top at y = 1), rails at y = 0.
// Between Triflumen and Northern Quays the line leaves the tunnel and crosses
// the north river on a stone viaduct (x 95..175) before going back underground.
// Station looks follow the owner's renders (reference/metro-station-designs.webp).

const LINE = METRO.lines.find((l) => l.id === 'II');
// The real route traced from the owner's map; stations sit at their distance along it.
const ROUTE = createMetroLine('II');
const STATIONS = ROUTE.stations;
export const STATION_X = STATIONS.map((s) => s.s);
const HALL = 28; // half platform length (the train is about 44 m)
const PZ0 = -9; // platform back
const PZ1 = -2.2; // platform edge
const FAR = 3.2; // far wall
const BRIDGE = { x0: 140, x1: 196, waterY: -6, top: 14 }; // where the line crosses the north river (line metres)

function mats() {
  return {
    stone: lambert(tex.hallStone()),
    stoneD: lambert(tex.hallStone(), { color: 0x7a7888, side: THREE.DoubleSide }),
    brick: lambert(tex.brickWarm(), { color: 0xb8a090 }),
    brickD: lambert(tex.brickWarm(), { color: 0x9a8070, side: THREE.DoubleSide }),
    dark: lambert(tex.darkStone()),
    darkD: lambert(tex.darkStone(), { color: 0x8a8890, side: THREE.DoubleSide }),
    green: lambert(tex.darkStone(), { color: 0x6a8a74, side: THREE.DoubleSide }),
    floor: lambert(tex.flagstone(), { color: 0xb0a8a0 }),
    marble: lambert(tex.marble(0)),
    cobble: lambert(tex.cobble(), { color: 0x8a8480 }),
    ballast: lambert(tex.cobble(), { color: 0x4a4440 }),
    wood: lambert(tex.wood(), { color: 0x8a7060 }),
    rail: lambert(null, { color: 0x6a6460 }),
    iron: lambert(null, { color: 0x1e1c1c }),
    gold: lambert(null, { color: 0xb08a40 }),
    coping: lambert(tex.townStone(), { color: 0xd0c8b8 }),
    castle: lambert(tex.castleStone()),
    slate: lambert(tex.slate()),
    lit: new THREE.MeshBasicMaterial({ map: tex.litWindow() }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffa048 }),
    water: new THREE.MeshLambertMaterial({ map: tex.water(), color: 0x8a96c0, emissive: 0x0c1020 }),
    sewer: new THREE.MeshLambertMaterial({ map: tex.water(), color: 0x6a8a70, emissive: 0x081008 }),
    glassP: (s) => new THREE.MeshBasicMaterial({ map: tex.stainedGlass('purple', s), side: THREE.DoubleSide }),
    glassW: (s) => new THREE.MeshBasicMaterial({ map: tex.stainedGlass('warm', s), side: THREE.DoubleSide }),
    banner: new THREE.MeshLambertMaterial({ map: tex.banner(), alphaTest: 0.5, side: THREE.DoubleSide }),
    clock: new THREE.MeshBasicMaterial({ map: clockFace(), transparent: true, alphaTest: 0.5 }),
    statue: lambert(tex.statue(), { flatShading: true }),
  };
}

// Station name board: dark iron frame, cream lettering, the orange line roundel.
const signCache = new Map();
export function signTex(name) {
  if (signCache.has(name)) return signCache.get(name);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1612';
  g.fillRect(0, 0, 256, 40);
  g.fillStyle = '#3a2e22';
  g.fillRect(3, 3, 250, 34);
  g.fillStyle = '#e8dcc0';
  g.fillRect(6, 6, 244, 28);
  g.fillStyle = LINE.colour;
  g.beginPath();
  g.arc(24, 20, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1a1208';
  g.font = 'bold 11px serif';
  g.textAlign = 'center';
  g.fillText('II', 24, 24);
  g.font = 'bold 17px serif';
  g.fillText(name.toUpperCase(), 140, 26);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  signCache.set(name, t);
  return t;
}

// Vault swept along x through an arch profile spanning z0..z1.
function vaultGeo(x0, x1, z0, z1, spring, k) {
  const prof = archPoints(z0, z1, spring, k, 9);
  const pos = [];
  const uv = [];
  const idx = [];
  let u = 0;
  prof.forEach(([z, y], i) => {
    if (i > 0) u += Math.hypot(z - prof[i - 1][0], y - prof[i - 1][1]);
    pos.push(x0, y, z, x1, y, z);
    uv.push(x0 / 2, u / 2, x1 / 2, u / 2);
    if (i < prof.length - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, prof };
}

// Wall in the (z, y) plane at world x, with arched holes given in world z.
function crossWall(x, thick, zA, zB, yTop, holes, mat) {
  const s = new THREE.Shape();
  // Shape x = -world z (so it maps back after rotateY(PI/2)).
  s.moveTo(-zB, -8);
  s.lineTo(-zA, -8);
  s.lineTo(-zA, yTop);
  s.lineTo(-zB, yTop);
  s.lineTo(-zB, -8);
  for (const h of holes) s.holes.push(archHole(-h.z1, -h.z0, h.bottom, h.spring, h.k ?? 0.5));
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 1 }), 0.5);
  g.rotateY(Math.PI / 2);
  g.translate(x - thick / 2, 0, 0);
  return new THREE.Mesh(g, mat);
}

// Wall in the (x, y) plane at world z, extruded toward +z, with arched holes in world x.
function lengthWall(xA, xB, z, thick, y0, y1, holes, mat) {
  const s = new THREE.Shape();
  s.moveTo(xA, y0);
  s.lineTo(xB, y0);
  s.lineTo(xB, y1);
  s.lineTo(xA, y1);
  s.lineTo(xA, y0);
  for (const h of holes) s.holes.push(archHole(h.x0, h.x1, h.bottom, h.spring, h.k ?? 0.8));
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 1 }), 0.5);
  g.translate(0, 0, z);
  return new THREE.Mesh(g, mat);
}

const flameSprite = (flames, x, y, z, scale = 0.7, color = 0xffffff) => {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), color, fog: true }));
  f.position.set(x, y, z);
  flames.push({ flame: f, light: null, base: 0, phase: Math.random() * 9, flameScale: scale });
  return f;
};

function chandelier(root, flames, M, x, y, z, r, n, top) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 4, 16), M.iron);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, y, z);
  root.add(ring);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.05, top - y, 0.05), M.iron);
  chain.position.set(x, (top + y) / 2, z);
  root.add(chain);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    root.add(flameSprite(flames, x + Math.cos(a) * r, y + 0.25, z + Math.sin(a) * r, 0.4));
  }
}

const STYLE = {
  grandhall: { wall: 'stone', vault: 'stoneD', spring: 6.5, k: 0.8, pillar: 'cluster', light: 0xffa850, floor: 'marble' },
  sewers: { wall: 'brick', vault: 'brickD', spring: 3.6, k: 0.5, pillar: 'brick', light: 0xff9a48, floor: 'floor' },
  castle: { wall: 'stone', vault: 'stoneD', spring: 5, k: 0.8, pillar: 'cluster', light: 0xffa050, floor: 'marble' },
  cathedral: { wall: 'stone', vault: 'stoneD', spring: 5.5, k: 0.85, pillar: 'cluster', light: 0xffb060, floor: 'floor', ribs: true },
  fortress: { wall: 'dark', vault: 'darkD', spring: 4.6, k: 0.5, pillar: 'round', light: 0xff9a48, floor: 'floor' },
  crypt: { wall: 'dark', vault: 'green', spring: 4.6, k: 0.75, pillar: 'cluster', light: 0x60ff90, floor: 'floor' },
  citadel: { wall: 'brick', vault: 'brickD', spring: 4.6, k: 0.5, pillar: 'brick', light: 0xffa050, floor: 'floor' },
};

function buildMetro() {
  const M = mats();
  // Built straight in line space under `root`, then bent onto the curve; `world`
  // holds things that already live in world space (city above, people, train).
  const root = new THREE.Group();
  const world = new THREE.Group();
  world.name = 'metro';
  const colliders = [];
  const cameraBlockers = [];
  const floors = [];
  const flames = [];
  const animated = [];
  const portals = [];
  const entries = {};
  const crowd = createCrowd({ root: world, colliders, floors });
  const pendingNPC = [];
  const addNPC = (person, opts) => pendingNPC.push([person, opts]);
  const pr = mulberry(808);
  const P = (o) => createPerson({ rnd: pr, ...o });
  const C = PALETTES.commoner;
  const N = PALETTES.noble;
  const edge = []; // platform-edge colliders, opened where the train's doors are

  // ---- Track along the whole line ------------------------------------------------
  const x0 = -HALL - 10;
  const x1 = STATION_X[STATION_X.length - 1] + HALL + 10;
  const rails = [];
  const sleepers = [];
  for (let x = x0; x < x1; x += 50) {
    const len = Math.min(50, x1 - x);
    for (const rz of [-0.72, 0.72]) rails.push(boxGeo(len, 0.16, 0.12, x + len / 2, 0.22, rz, 0, 1));
  }
  for (let x = x0; x < x1; x += 0.9) {
    if (x > BRIDGE.x0 && x < BRIDGE.x1) {
      sleepers.push(boxGeo(0.25, 0.14, 2.3, x, 0.07, 0, 0, 1));
      continue;
    }
    sleepers.push(boxGeo(0.25, 0.14, 2.3, x, 0.07, 0, 0, 1));
  }
  root.add(mergedMesh(rails, M.rail), mergedMesh(sleepers, M.wood));
  const bed = [];
  for (let x = x0; x < x1; x += 100) {
    const xa = x;
    const xb = Math.min(x + 100, x1);
    if (xb <= BRIDGE.x0 || xa >= BRIDGE.x1) bed.push(boxGeo(xb - xa, 0.1, 6, (xa + xb) / 2, -0.05, 0, 0, 2));
    else {
      if (xa < BRIDGE.x0) bed.push(boxGeo(BRIDGE.x0 - xa, 0.1, 6, (xa + BRIDGE.x0) / 2, -0.05, 0, 0, 2));
      if (xb > BRIDGE.x1) bed.push(boxGeo(xb - BRIDGE.x1, 0.1, 6, (xb + BRIDGE.x1) / 2, -0.05, 0, 0, 2));
    }
  }
  root.add(mergedMesh(bed, M.ballast));

  // ---- Stations ---------------------------------------------------------------------
  STATIONS.forEach((st, i) => {
    const X = STATION_X[i];
    const S = STYLE[st.style];
    const wallM = M[S.wall];
    const xa = X - HALL;
    const xb = X + HALL;
    // Platform with a pale coping stone along the edge.
    root.add(mergedMesh([boxGeo(2 * HALL, 1, PZ1 - PZ0, X, 0.5, (PZ0 + PZ1) / 2, 0, 2)], M[S.floor]));
    root.add(mergedMesh([boxGeo(2 * HALL, 0.08, 0.35, X, 1.02, PZ1 - 0.17, 0, 1)], M.coping));
    floors.push({ minX: xa, maxX: xb, minZ: PZ0, maxZ: PZ1, y: 1 });
    for (let ex = xa; ex < xb - 0.01; ex += 2.8) {
      const c = { minX: ex, maxX: Math.min(xb, ex + 2.8), minZ: PZ1 - 0.05, maxZ: PZ1 + 0.3, y0: 0.5, station: i };
      edge.push(c);
      colliders.push(c);
    }
    // Back wall with the exit archway, far wall, vault, end walls with tunnel mouths.
    const back = lengthWall(xa, xb, PZ0 - 1, 1, 0, S.spring + 0.3, [{ x0: X - 1.8, x1: X + 1.8, bottom: 1, spring: 3.4 }], wallM);
    back.userData.blocker = true;
    root.add(back);
    root.add(mergedMesh([boxGeo(2 * HALL, S.spring + 0.3, 1, X, (S.spring + 0.3) / 2, FAR + 0.5, 0, 2)], wallM));
    const { geo, prof } = vaultGeo(xa, xb, PZ0, FAR, S.spring, S.k);
    root.add(new THREE.Mesh(geo, M[S.vault]));
    const apex = prof[Math.floor(prof.length / 2)][1];
    for (const ex of [xa, xb]) root.add(crossWall(ex, 1, PZ0 - 1, FAR + 1, apex + 0.6, [{ z0: -2.6, z1: 2.6, bottom: -0.1, spring: 3.4 }], wallM));
    colliders.push(
      { minX: xa - 2, maxX: xa + 0.6, minZ: PZ0 - 1, maxZ: PZ1 - 0.1 },
      { minX: xb - 0.6, maxX: xb + 2, minZ: PZ0 - 1, maxZ: PZ1 - 0.1 },
      { minX: xa, maxX: X - 1.8, minZ: PZ0 - 1, maxZ: PZ0 },
      { minX: X + 1.8, maxX: xb, minZ: PZ0 - 1, maxZ: PZ0 },
      { minX: X - 2.6, maxX: X - 1.8, minZ: PZ0 - 6, maxZ: PZ0 },
      { minX: X + 1.8, maxX: X + 2.6, minZ: PZ0 - 6, maxZ: PZ0 },
    );
    // The stair up to the street: steps rising into warm light.
    const steps = [];
    for (let k = 0; k < 10; k++) steps.push(boxGeo(3.6, 0.35, 0.5, X, 1 + 0.175 + k * 0.35, PZ0 - 1.25 - k * 0.5, 0, 1));
    root.add(mergedMesh(steps, M.floor));
    const sw = [boxGeo(0.4, 8, 6, X - 2, 4, PZ0 - 3.5, 0, 1), boxGeo(0.4, 8, 6, X + 2, 4, PZ0 - 3.5, 0, 1), boxGeo(4.4, 0.4, 6, X, 5.6, PZ0 - 3.5, 0, 1)];
    root.add(mergedMesh(sw, wallM));
    const up = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4), M.glow);
    up.position.set(X, 6, PZ0 - 6.3);
    root.add(up);
    portals.push({ minX: X - 1.8, maxX: X + 1.8, minZ: PZ0 - 2.2, maxZ: PZ0 - 0.6, maxY: 4, to: 'bridge', entry: 'metro-' + st.id });
    entries['st-' + st.id] = { pos: new THREE.Vector3(X + 3, 1, PZ0 + 2.2), yaw: -Math.PI / 2 + 0.6, pitch: 0.1 };
    // Name boards: on the back wall and over the far wall, facing the platform.
    for (const sx of [-20, -7, 7, 20]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.75), new THREE.MeshBasicMaterial({ map: signTex(st.name) }));
      b.position.set(X + sx, 3.1, PZ0 + 0.03);
      root.add(b);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.75), b.material);
      f.position.set(X + sx, 3.3, FAR - 0.03);
      f.rotation.y = Math.PI;
      root.add(f);
    }
    // Pillars down the platform.
    const pil = [];
    const pilCap = [];
    for (let px = xa + 8; px < xb - 4; px += 12) {
      if (Math.abs(px - X) < 4) continue;
      if (S.pillar === 'round') {
        const c = new THREE.CylinderGeometry(0.9, 1.0, S.spring, 10);
        c.translate(px, 1 + S.spring / 2 - 0.5, -5.6);
        pil.push(scaleUV(c, 1.5));
      } else if (S.pillar === 'brick') {
        pil.push(boxGeo(1.2, S.spring, 1.2, px, 1 + S.spring / 2 - 0.5, -5.6, 0, 1));
      } else {
        for (const [ox, oz] of [
          [-0.3, -0.3],
          [0.3, -0.3],
          [-0.3, 0.3],
          [0.3, 0.3],
          [0, 0],
        ]) {
          const c = new THREE.CylinderGeometry(0.22, 0.24, S.spring, 6);
          c.translate(px + ox, 1 + S.spring / 2 - 0.5, -5.6 + oz);
          pil.push(c);
        }
      }
      pilCap.push(boxGeo(1.6, 0.35, 1.6, px, S.spring + 0.4, -5.6, 0, 1), boxGeo(1.5, 0.3, 1.5, px, 1.15, -5.6, 0, 1));
      colliders.push({ minX: px - 0.85, maxX: px + 0.85, minZ: -6.45, maxZ: -4.75 });
      root.add(flameSprite(flames, px, 3.2, -4.75, 0.6, S.light === 0x60ff90 ? 0x70ff90 : 0xffffff));
    }
    root.add(mergedMesh(pil, wallM, { cast: true }), mergedMesh(pilCap, M.coping));
    // Wall sconces along the back wall.
    for (let sx = xa + 6; sx < xb; sx += 8) if (Math.abs(sx - X) > 3) root.add(flameSprite(flames, sx, 2.6, PZ0 + 0.25, 0.55, S.light === 0x60ff90 ? 0x70ff90 : 0xffffff));
    // Ribs for the cathedral-style vault.
    if (S.ribs) {
      const ribs = [];
      for (let rx = xa + 5; rx < xb; rx += 10)
        ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(prof.map(([z, y]) => new THREE.Vector3(rx, y - 0.1, z))), 18, 0.16, 4, false));
      root.add(mergedMesh(ribs, M.coping));
    }
    // Lights.
    for (const lx of [-18, 0, 18]) {
      const l = new THREE.PointLight(S.light, S.style === 'crypt' ? 10 : 16, 34, 1.5);
      l.position.set(X + lx, S.spring - 0.5, -4);
      root.add(l);
    }

    // ---- Per-station character (from the renders) ----
    const people = (n, make, spread = 40) => {
      for (let k = 0; k < n; k++) {
        const px = X - spread / 2 + pr() * spread;
        const pz = -7.8 + pr() * 4.6;
        if (Math.abs(px - X) < 3 || Math.abs(((px - xa - 8) % 12 + 12) % 12) < 1.4) continue;
        addNPC(make(), { pos: [px, pz], facing: faceToward(px, pz, px + (pr() - 0.5) * 6, 0), mode: pr() < 0.4 ? 'talk' : 'idle' });
      }
    };
    const townsfolk = () => P({ outfit: pr() < 0.4 ? 'servant' : pr() < 0.5 ? 'gown' : 'doublet', hat: ['none', 'hood', 'coif', 'cap', 'chaperon'][Math.floor(pr() * 5)], carry: pr() < 0.3 ? 'basket' : null, main: C[Math.floor(pr() * C.length)] });
    if (st.style === 'grandhall') {
      // Clock tower and twin staircases on the back wall (Grand Hall Transit).
      const tw = [boxGeo(6, S.spring + 3, 1.2, X, (S.spring + 3) / 2, PZ0 + 0.1, 0, 1)];
      root.add(mergedMesh(tw, M.coping));
      const spire = new THREE.Mesh(new THREE.ConeGeometry(3, 3.5, 4), M.slate);
      spire.rotation.y = Math.PI / 4;
      spire.position.set(X, S.spring + 4.6, PZ0 + 0.6);
      root.add(spire);
      const cl = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), M.clock);
      cl.position.set(X, S.spring - 0.6, PZ0 + 0.75);
      root.add(cl);
      const st2 = [];
      for (const sd of [-1, 1])
        for (let k = 0; k < 14; k++) st2.push(boxGeo(1.4, 0.4 * (k + 1), 2, X + sd * (4.5 + k * 0.9), 1 + 0.2 * (k + 1), PZ0 + 1.1, 0, 1));
      root.add(mergedMesh(st2, M.floor));
      for (const sd of [-1, 1]) colliders.push({ minX: X + sd * 4 - (sd > 0 ? 0 : 13), maxX: X + sd * 4 + (sd > 0 ? 13 : 0), minZ: PZ0, maxZ: PZ0 + 2.2 });
      for (const cx of [-18, 0, 18]) chandelier(root, flames, M, X + cx, S.spring - 0.5, -3.5, 1.3, 10, apex);
      people(14, townsfolk, 48);
      addNPC(P({ outfit: 'servant', hat: 'cap', carry: 'basket' }), { path: [[X - 22, -7], [X + 22, -7]], speed: 0.8, wait: 3 });
    } else if (st.style === 'sewers') {
      // A channel of green water along the back wall with a wooden rail; dripping stalactites.
      const ch = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(2 * HALL, 1.4), 0.5), M.sewer);
      ch.rotation.x = -Math.PI / 2;
      ch.position.set(X, 1.03, PZ0 + 0.7);
      root.add(ch);
      const rail = [];
      for (let rx = xa + 1; rx < xb; rx += 2) {
        if (Math.abs(rx - X) < 2.4) continue;
        rail.push(boxGeo(0.1, 1, 0.1, rx, 1.5, PZ0 + 1.5, 0, 1));
      }
      rail.push(boxGeo(HALL - 2.4, 0.1, 0.1, (xa + X - 2.4) / 2, 2, PZ0 + 1.5, 0, 1), boxGeo(HALL - 2.4, 0.1, 0.1, (xb + X + 2.4) / 2, 2, PZ0 + 1.5, 0, 1));
      rail.push(boxGeo(3.6, 0.1, 1.5, X, 1.08, PZ0 + 0.75, 0, 1)); // plank bridge to the stairs
      root.add(mergedMesh(rail, M.wood));
      colliders.push({ minX: xa, maxX: X - 2.2, minZ: PZ0, maxZ: PZ0 + 1.55 }, { minX: X + 2.2, maxX: xb, minZ: PZ0, maxZ: PZ0 + 1.55 });
      const drips = [];
      const dr = mulberry(77);
      for (let k = 0; k < 70; k++) {
        const c = new THREE.ConeGeometry(0.08 + dr() * 0.1, 0.4 + dr() * 0.9, 4);
        c.rotateX(Math.PI);
        const zz = PZ0 + 0.5 + dr() * 11;
        c.translate(xa + dr() * 2 * HALL, S.spring + 0.8 + Math.sin(((zz - PZ0) / 12.2) * Math.PI) * 1.2, zz);
        drips.push(c);
      }
      root.add(mergedMesh(drips, M.dark));
      people(6, townsfolk);
    } else if (st.style === 'castle') {
      // Stained glass lancets and royal banners (Nox Castle Station).
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const w = new THREE.Mesh(lancetGeo(1.6, 3.6), k % 2 ? M.glassP(k + 40) : M.glassW(k + 40));
        w.position.set(X + k * 7, 1.2, PZ0 + 0.03);
        root.add(w);
      }
      for (let k = -4; k <= 4; k++) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.8), M.banner);
        b.position.set(X + k * 6 + 3, apex - 2, -3 + (k % 2) * 2);
        root.add(b);
      }
      people(5, () => P({ outfit: pr() < 0.5 ? 'robe' : 'gown', hat: ['veil', 'beret', 'chaperon'][Math.floor(pr() * 3)], main: N[Math.floor(pr() * N.length)] }));
      const g = createGuard();
      addNPC({ root: g.root, update: (dt, t, s) => g.update(dt, s), setMode() {} }, { path: [[X - 22, -7.6], [X + 22, -7.6]], speed: 0.9, wait: 4 });
    } else if (st.style === 'cathedral') {
      // Chandeliers down the nave and crowds of pilgrims (Cathedral Depths).
      for (let cx = -18; cx <= 18; cx += 12) chandelier(root, flames, M, X + cx, S.spring + 0.6, -3.4, 1.2, 8, apex);
      people(14, () => P({ outfit: pr() < 0.6 ? 'robe' : 'priest', hat: pr() < 0.7 ? 'hood' : 'coif', main: [0x3a3028, 0x2a2a2a, 0x4a3a2a, 0x302830][Math.floor(pr() * 4)], carry: pr() < 0.2 ? 'candle' : null }), 48);
    } else if (st.style === 'fortress') {
      // Iron gates in blind arches and guards on watch (Fortress Subway).
      const bars = [];
      for (const gx of [-22, -12, 12, 22]) {
        for (let b = -1.2; b <= 1.2; b += 0.3) bars.push(boxGeo(0.06, 3, 0.06, X + gx + b, 2.5, PZ0 + 0.15, 0, 1));
        bars.push(boxGeo(2.6, 0.1, 0.1, X + gx, 2, PZ0 + 0.15, 0, 1), boxGeo(2.6, 0.1, 0.1, X + gx, 3.6, PZ0 + 0.15, 0, 1));
        const dk = new THREE.Mesh(lancetGeo(2.6, 3.4), new THREE.MeshBasicMaterial({ color: 0x0a0a0c }));
        dk.position.set(X + gx, 1, PZ0 + 0.02);
        root.add(dk);
      }
      root.add(mergedMesh(bars, M.iron));
      for (const gx of [-12, 12]) {
        const g = createGuard();
        addNPC({ root: g.root, update: (dt, t, s) => g.update(dt, s), setMode() {} }, { pos: [X + gx, -8], facing: 0 });
      }
      people(6, townsfolk);
    } else if (st.style === 'crypt') {
      // Green braziers, a statue in a niche and gated alcoves (Crypt of the Exiled).
      for (const bx of [-21, -7, 7, 21]) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.15, 0.4, 8), M.iron);
        br.position.set(X + bx, 2.1, PZ0 + 0.9);
        root.add(br);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1, 5), M.iron);
        leg.position.set(X + bx, 1.5, PZ0 + 0.9);
        root.add(leg);
        root.add(flameSprite(flames, X + bx, 2.7, PZ0 + 0.9, 1.1, 0x60ff90));
        colliders.push({ minX: X + bx - 0.45, maxX: X + bx + 0.45, minZ: PZ0, maxZ: PZ0 + 1.4 });
      }
      const fig = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.5, 0], [0.4, 1.2], [0.3, 2], [0.36, 2.2], [0.15, 2.5], [0, 2.55]].map(([a, b]) => new THREE.Vector2(a, b)), 7), M.statue);
      fig.position.set(X + 14, 1.6, PZ0 + 0.5);
      root.add(fig);
      for (const sd of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.9), M.statue);
        wing.position.set(X + 14 + sd * 0.5, 3.4, PZ0 + 0.3);
        wing.rotation.z = sd * 0.4;
        root.add(wing);
      }
      root.add(mergedMesh([boxGeo(1.4, 0.6, 1.2, X + 14, 1.3, PZ0 + 0.6, 0, 1)], M.coping));
      colliders.push({ minX: X + 13.2, maxX: X + 14.8, minZ: PZ0, maxZ: PZ0 + 1.3 });
      people(5, () => P({ outfit: 'robe', hat: 'hood', main: [0x2a3028, 0x302a28][Math.floor(pr() * 2)] }));
    } else if (st.style === 'citadel') {
      // Lamp posts, benches and crates (Citadel Square), a portcullis at the far end.
      const lamps = [];
      const benches = [];
      for (let lx = -24; lx <= 24; lx += 12) {
        lamps.push(boxGeo(0.12, 3, 0.12, X + lx, 2.5, -3.4, 0, 1));
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.34), M.lit);
        l.position.set(X + lx, 4.2, -3.4);
        root.add(l);
        colliders.push({ minX: X + lx - 0.2, maxX: X + lx + 0.2, minZ: -3.6, maxZ: -3.2 });
        if (lx < 20) benches.push(boxGeo(2.2, 0.1, 0.5, X + lx + 6, 1.48, -8.2, 0, 1), boxGeo(0.1, 0.45, 0.45, X + lx + 5, 1.23, -8.2, 0, 1), boxGeo(0.1, 0.45, 0.45, X + lx + 7, 1.23, -8.2, 0, 1));
        if (lx < 20) colliders.push({ minX: X + lx + 4.9, maxX: X + lx + 7.1, minZ: -8.5, maxZ: -7.9, h: 1.6 });
      }
      root.add(mergedMesh(lamps, M.iron), mergedMesh(benches, M.wood));
      const crates = [boxGeo(0.9, 0.9, 0.9, X - 25, 1.45, -7.8, 0, 1), boxGeo(0.8, 0.8, 0.8, X - 24, 1.4, -6.8, 0.3, 1), boxGeo(0.7, 0.7, 0.7, X - 25, 2.25, -7.8, 0.2, 1)];
      root.add(mergedMesh(crates, M.wood));
      colliders.push({ minX: X - 25.6, maxX: X - 23.5, minZ: -8.4, maxZ: -6.3 });
      people(9, () => P({ outfit: pr() < 0.5 ? 'doublet' : 'robe', hat: ['beret', 'chaperon', 'cap', 'none'][Math.floor(pr() * 4)], main: N[Math.floor(pr() * N.length)], carry: pr() < 0.3 ? 'scroll' : null }), 48);
    }
  });

  // ---- Tunnels between stations (lantern-lit) ----------------------------------
  const tun = [];
  const tunVault = [];
  const tunnel = (xa, xb) => {
    const len = xb - xa;
    if (len <= 0) return;
    for (const sz of [-1, 1]) tun.push(boxGeo(len, 3.4, 0.6, (xa + xb) / 2, 1.7, sz * 2.9, 0, 2));
    const v = new THREE.CylinderGeometry(3.2, 3.2, len, 10, 1, true, 0, Math.PI);
    v.rotateZ(Math.PI / 2); // axis along x, the half-dome on top
    v.scale(1, 0.9, 1);
    v.translate((xa + xb) / 2, 3.4, 0);
    tunVault.push(scaleUV(v, 1));
    for (let lx = xa + 10; lx < xb - 5; lx += 22) root.add(flameSprite(flames, lx, 2.6, -2.5, 0.45));
  };
  for (let i = 0; i < STATION_X.length - 1; i++) {
    const a = STATION_X[i] + HALL;
    const b = STATION_X[i + 1] - HALL;
    if (i === 0) {
      tunnel(a, BRIDGE.x0);
      tunnel(BRIDGE.x1, b);
    } else tunnel(a, b);
  }
  tunnel(-HALL - 30, -HALL);
  tunnel(STATION_X[STATION_X.length - 1] + HALL, STATION_X[STATION_X.length - 1] + HALL + 30);
  root.add(mergedMesh(tun, M.darkD), mergedMesh(tunVault, M.darkD));

  // ---- The river crossing: out of the tunnel, over the north river, back under ----
  // Line space: tunnel-mouth cliffs and the viaduct. World space: the water, the
  // city on the banks (from the map) and the Crownkeep, all where they really are.
  const ZONE = LOCATIONS.zones.find((z) => z.id === 'north-river-crossing');
  const TER = createMapTerrain(ZONE.originPx);
  const nearLine = (x, z, hint) => ROUTE.toLine(x, z, hint);
  const cut = (x, z) => {
    // The river channel the viaduct crosses (the map's road bridge there is ignored).
    const q = nearLine(x, z, (BRIDGE.x0 + BRIDGE.x1) / 2);
    return q.s > BRIDGE.x0 - 2 && q.s < BRIDGE.x1 + 2 && Math.abs(q.d) < 34;
  };
  {
    const { x0: bx0, x1: bx1, waterY, top } = BRIDGE;
    const water = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(1800, 1400), 220), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(250, waterY, 150);
    world.add(water);
    // The banks: land from the map raised to street level, quay walls down to the water.
    const [mx, my] = toMapPx(...ROUTE.toWorld((bx0 + bx1) / 2, 0));
    const terr = TER.buildGround({
      px0: Math.round(mx - 170),
      px1: Math.round(mx + 170),
      py0: Math.round(my - 150),
      py1: Math.round(my + 120),
      waterY: waterY - top - 1,
      waterAt: cut,
      noQuay: (x, z) => {
        const q = nearLine(x, z, (bx0 + bx1) / 2);
        return Math.abs(q.d) < 22 && (Math.abs(q.s - bx0) < 8 || Math.abs(q.s - bx1) < 8);
      },
    });
    terr.ground.translate(0, top, 0);
    terr.quays.translate(0, top, 0);
    const ground = new THREE.Mesh(terr.ground, M.cobble);
    world.add(ground, new THREE.Mesh(terr.quays, M.stone));
    // Tunnel mouths: cliff faces across the line at both ends of the viaduct.
    for (const cx of [bx0, bx1]) {
      root.add(crossWall(cx, 2, -22, 22, top, [{ z0: -2.9, z1: 2.9, bottom: -0.2, spring: 3.4 }], M.stone));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.35, 4, 12, Math.PI), M.coping);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(cx + (cx === bx0 ? 1.05 : -1.05), 3.4, 0);
      root.add(ring);
    }
    // The viaduct: deck, arches into the river, parapets with lanterns.
    const len = bx1 - bx0;
    const deck = new THREE.Shape();
    deck.moveTo(bx0, waterY - 1);
    deck.lineTo(bx1, waterY - 1);
    deck.lineTo(bx1, 0);
    deck.lineTo(bx0, 0);
    deck.lineTo(bx0, waterY - 1);
    const spans = 4;
    for (let k = 0; k < spans; k++) {
      const a = bx0 + (len * k) / spans + 1.2;
      const b = bx0 + (len * (k + 1)) / spans - 1.2;
      deck.holes.push(archHole(a, b, waterY - 0.9, -2.6, 0.5));
    }
    const dg = scaleUV(new THREE.ExtrudeGeometry(deck, { depth: 6.4, bevelEnabled: false }), 0.5);
    dg.translate(0, 0, -3.2);
    root.add(new THREE.Mesh(dg, M.stone));
    const par = [];
    for (const sz of [-1, 1]) {
      par.push(boxGeo(len, 1.1, 0.4, (bx0 + bx1) / 2, 0.55, sz * 3, 0, 1));
      for (let k = 0; k <= spans; k++) par.push(boxGeo(0.8, 1.6, 0.8, bx0 + (len * k) / spans, 0.8, sz * 3, 0, 1));
    }
    root.add(mergedMesh(par, M.coping));
    for (let k = 1; k < spans; k++) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 5), M.iron);
        post.position.set(bx0 + (len * k) / spans, 2.2, sz * 3);
        root.add(post);
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), M.lit);
        l.position.set(bx0 + (len * k) / spans, 3.6, sz * 3);
        root.add(l);
      }
      const pl = new THREE.PointLight(0xffa050, 10, 20, 1.6);
      pl.position.set(bx0 + (len * k) / spans, 3.6, 0);
      root.add(pl);
    }
    // The city on the banks (far detail) and the Crownkeep on its hill, where they really are.
    const [cxw, czw] = ROUTE.toWorld((bx0 + bx1) / 2, 0);
    const lots = scatterLots({
      seed: 4242,
      count: 700,
      bounds: [cxw - 320, cxw + 320, czw - 260, czw + 160],
      avoid: (x, z, r) => {
        if (TER.waterNear(x, z, r + 2) || cut(x, z) || Math.hypot(x - 205, z) < 95 + r) return true;
        const q = nearLine(x, z);
        return Math.abs(q.d) < 16 + r && q.s > -60 && q.s < 1060;
      },
    }).map((l) => ({ ...l, y: top }));
    const town = createChunkedTown({ lots, root: world, cell: 250, near: 0, far: 700, litChance: 0.4 });
    town.update(cxw, czw);
    const keep = new THREE.Group();
    const castle = buildCastle({ castle: M.castle, slate: M.slate, lit: M.lit }, 0, top);
    castle.group.position.set(0, -top, 0);
    keep.add(castle.group);
    keep.position.set(205, top, 0);
    keep.rotation.y = -Math.PI / 2;
    keep.scale.setScalar(1.45);
    world.add(keep);
    animated.push(...castle.animated);
  }

  // ---- The train ----------------------------------------------------------------------
  // ---- Bend the line onto the real curve; convert physics to world space --------
  const bent = bendGroup(ROUTE, root);
  world.add(bent.group);
  cameraBlockers.push(...bent.blockers);
  const worldColliders = [];
  for (const c of colliders) {
    if (c.maxX - c.minX <= 3.01) {
      const [part] = bendBox(ROUTE, c);
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ']) delete c[k];
      Object.assign(c, part); // in place, so edge colliders keep their identity
      worldColliders.push(c);
    } else worldColliders.push(...bendBox(ROUTE, c));
  }
  colliders.length = 0;
  colliders.push(...worldColliders);
  const worldFloors = floors.flatMap((f) => bendBox(ROUTE, f, 3));
  floors.length = 0;
  floors.push(...worldFloors);
  for (let k = 0; k < portals.length; k++) portals[k] = bendAABB(ROUTE, portals[k]);
  for (const key of Object.keys(entries)) {
    const e = entries[key];
    const [x, z] = ROUTE.toWorld(e.pos.x, e.pos.z);
    entries[key] = { pos: new THREE.Vector3(x, e.pos.y, z), yaw: ROUTE.yawToWorld(e.pos.x, e.yaw), pitch: e.pitch };
  }
  for (const [person, o] of pendingNPC) {
    const opts = { ...o };
    if (o.pos) {
      opts.pos = ROUTE.toWorld(o.pos[0], o.pos[1]);
      opts.facing = ROUTE.yawToWorld(o.pos[0], o.facing ?? 0);
    }
    if (o.path) opts.path = o.path.map(([a, b]) => ROUTE.toWorld(a, b));
    crowd.add(person, opts);
  }

  // ---- The train (each car follows the curve) ------------------------------------
  const train = createTrain();
  world.add(train.group);
  cameraBlockers.push(...train.blockers);
  const carFloors = train.cars.map(() => ({ cx: 0, cz: 0, hx: 6.9, hz: 1.3, rot: 0, y: FLOOR }));
  floors.push(...carFloors);
  const T = { x: STATION_X[1] + 20, v: 0, dir: -1, target: 0, mode: 'move', t: 0, doors: 0 };
  const ACC = 1.6;
  const VMAX = 16;
  let riding = false;
  let wasFirst = false;

  function nextTarget() {
    if (T.target === STATION_X.length - 1) T.dir = -1;
    if (T.target === 0) T.dir = 1;
    T.target += T.dir;
    T.mode = 'move';
  }
  function updateTrain(dt) {
    const x0 = T.x;
    if (T.mode === 'move') {
      const goal = STATION_X[T.target];
      const rem = goal - T.x;
      const dist = Math.abs(rem);
      const brake = (T.v * T.v) / (2 * ACC);
      if (dist <= brake + 0.05) T.v = Math.max(0.6, T.v - ACC * dt);
      else T.v = Math.min(VMAX, T.v + ACC * dt);
      const step = Math.min(dist, T.v * dt);
      T.x += Math.sign(rem) * step;
      if (dist - step < 0.02) {
        T.x = goal;
        T.v = 0;
        T.mode = 'dwell';
        T.t = 0;
      }
    } else {
      T.t += dt;
      const open = T.t < 1.2 ? T.t / 1.2 : T.t < 9.2 ? 1 : T.t < 10.4 ? 1 - (T.t - 9.2) / 1.2 : 0;
      T.doors = open;
      train.setDoors(open);
      if (T.t > 10.8) nextTarget();
    }
    if (T.mode === 'move') {
      T.doors = 0;
      train.setDoors(0);
    }
    train.placeOnCurve(ROUTE.frame, T.x);
    train.cars.forEach((c, k) => {
      const f = ROUTE.frame(T.x + c.offset);
      // The floor reaches out over the platform gap while the doors are open.
      const [fx, fz] = ROUTE.toWorld(T.x + c.offset, T.doors > 0.5 ? -0.55 : 0);
      Object.assign(carFloors[k], { cx: fx, cz: fz, rot: f.rot, hz: T.doors > 0.5 ? 1.85 : 1.3 });
    });
    return T.x - x0;
  }

  let hint = 0;
  return {
    root: world,
    sky: buildSky({ moonDir: new THREE.Vector3(0.5, 0.35, -0.8).normalize(), moonSize: 30, horizon: 0x0a0a12 }),
    colliders,
    cameraBlockers,
    floors,
    portals,
    entries,
    spawn: entries['st-triflumen'].pos.clone(),
    spawnYaw: entries['st-triflumen'].yaw,
    spawnPitch: 0.1,
    lanternIntensity: 2.6,
    env: {
      fog: { color: 0x0a0a12, density: 0.024 },
      hemi: { sky: 0x56567a, ground: 0x241c14, intensity: 2.1 },
      dir: { dir: new THREE.Vector3(0.5, 0.6, -0.6).normalize(), color: 0x9aa8ff, intensity: 0.5, shadow: false },
    },
    // Arriving from the street: send the train toward this station so the wait is short.
    onEnter(entry) {
      const i = STATIONS.findIndex((s) => 'st-' + s.id === (entry || 'st-triflumen'));
      if (i < 0) return;
      const from = i < STATION_X.length - 1 ? i + 1 : i - 1;
      T.x = STATION_X[i] + (STATION_X[from] - STATION_X[i]) * 0.55;
      T.target = i;
      T.dir = Math.sign(STATION_X[i] - STATION_X[from]);
      T.mode = 'move';
      T.v = 10;
    },
    // Where the player is on the city map (interpolated between stations).
    mapPos(p) {
      return toMapPx(p.x, p.z);
    },
    debug: { T, edge, ROUTE },
    stationAt(x, z) {
      const q = ROUTE.toLine(x, z ?? 0);
      const i = STATION_X.findIndex((sx) => Math.abs(sx - q.s) < HALL);
      return i >= 0 ? STATIONS[i] : null;
    },
    update(dt, t, ctx) {
      flickerTorches(flames, t);
      // Thin fog outdoors over the river, thick fog in the tunnels.
      if (ctx?.scene?.fog && ctx.camera) {
        const q = ROUTE.toLine(ctx.camera.position.x, ctx.camera.position.z, hint);
        hint = q.s;
        const cx = Math.abs(q.d) < 60 ? q.s : -999;
        const out = cx > BRIDGE.x0 - 8 && cx < BRIDGE.x1 + 8 ? 1 : cx > BRIDGE.x0 - 40 && cx < BRIDGE.x1 + 40 ? 0.4 : 0;
        ctx.scene.fog.density = 0.024 - 0.019 * out;
      }
      for (const a of animated) a.update(dt, t);
      const dx = updateTrain(dt);
      // Open the platform edge where the doors are.
      const docked = T.mode === 'dwell' && T.doors > 0.5;
      for (const c of edge) c.y0 = docked && c.s0 >= T.x - TRAIN_L / 2 && c.s1 <= T.x + TRAIN_L / 2 ? 999 : 0.5;
      const c = ctx?.controller;
      if (c) {
        const p = c.pos;
        // Work in line space: s along the track, d across it.
        const q = ROUTE.toLine(p.x, p.z, T.x);
        const inside = Math.abs(q.s - (T.x - dx)) < TRAIN_L / 2 - 0.3 && q.d > -1.6 && q.d < CAR_W / 2 && p.y > 0.6;
        if (inside) {
          const s0 = q.s;
          let s1 = s0 + dx;
          let d1 = q.d;
          if (T.doors < 0.5) d1 = Math.max(-CAR_W / 2 + 0.3, Math.min(CAR_W / 2 - 0.3, d1));
          s1 = Math.max(T.x - TRAIN_L / 2 + 0.5, Math.min(T.x + TRAIN_L / 2 - 0.5, s1));
          const [nx, nz] = ROUTE.toWorld(s1, d1);
          p.x = nx;
          p.z = nz;
          // Turn with the train on curves.
          const turn = ROUTE.frame(s1).rot - ROUTE.frame(s0).rot;
          c.yaw += Math.atan2(Math.sin(turn), Math.cos(turn));
          c.facing = c.yaw;
          if (!riding) {
            wasFirst = c.firstPerson;
            if (!wasFirst) c.setFirstPerson(true);
          }
        } else if (riding && !wasFirst) c.setFirstPerson(false);
        riding = inside;
      }
      crowd.update(dt, t, ctx?.player);
    },
  };
}

export default {
  id: 'metro',
  title: 'The Ancient Underground',
  reference: 'metro-station-designs.webp, metro-train-design.webp',
  build: buildMetro,
};
