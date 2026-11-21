import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, archPoints, archHole, shadowy, box, gableRoof, spire, cross, lancet, rotY, makeTorch, crossedSprites, mulberry, buildSky, flickerTorches } from './kit.js';

// The moonlit cloister (reference: reference/screenshots/01-moonlit-cloister.png).
// A square garden ringed by a pointed-arch arcade and a covered walkway,
// with a church and twin-spired tower behind, a pyramid spire on one corner,
// a statue on a pedestal, glowing flower beds and a big full moon.

// Layout (metres). Garden spans [-G, G]; arcade G..B; walkway B..C; outer wall C..D.
const G = 7;
const ARC_T = 0.5;
const WALK = 3.5;
const B = G + ARC_T;
const C = B + WALK;
const D = C + 0.6;
const SPRING = 3.1; // arch springline
const ARC_TOP = 5.4; // top of arcade wall / walkway ceiling
const PLINTH = 0.45; // low wall under the arches
const WALL_H = 7.2; // outer wall height

// Side frames: build everything as if on the north side, then rotate.
const SIDES = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };

export const MOON_DIR = new THREE.Vector3(0.62, 0.56, -0.62).normalize();

function mats() {
  return {
    stone: lambert(tex.stoneWall()),
    // "Baked" shade for surfaces under the walkway roof: hemisphere light
    // can't be occluded, so we darken these materials like a lightmap would.
    stoneShade: lambert(tex.stoneWall(), { color: 0x5a5a6c }),
    floorShade: lambert(tex.flagstone(), { color: 0x66667a }),
    darkStone: lambert(tex.darkStone()),
    column: lambert(tex.column()),
    floor: lambert(tex.flagstone()),
    slate: lambert(tex.slate(), { side: THREE.DoubleSide }),
    wood: lambert(tex.wood(), { color: 0x777788 }),
    grass: lambert(tex.grass()),
    soil: lambert(tex.soil()),
    statue: lambert(tex.statue(), { flatShading: true }),
    window: new THREE.MeshBasicMaterial({ map: tex.windowDark() }),
    iron: lambert(null, { color: 0x1e1c1c }),
  };
}

// Pointed-arch arcade wall of length L with n bays (middle bay is a doorway).
function arcadeWall(L, n, mat) {
  const p = 0.62; // pier width
  const s = (L - (n + 1) * p) / n;
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -0.3);
  shape.lineTo(L / 2, -0.3);
  shape.lineTo(L / 2, ARC_TOP);
  shape.lineTo(-L / 2, ARC_TOP);
  shape.lineTo(-L / 2, -0.3);
  const piers = [];
  const door = Math.floor(n / 2);
  const bays = [];
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + p + i * (s + p);
    const x1 = x0 + s;
    shape.holes.push(archHole(x0, x1, i === door ? -0.2 : PLINTH, SPRING, 0.8));
    bays.push([x0, x1, i === door]);
  }
  const traceries = bays.filter((b) => !b[2]).map(([x0, x1]) => tracery(x0, x1, mat));
  for (let i = 0; i <= n; i++) piers.push(-L / 2 + p / 2 + i * (s + p));
  const g = scaleUV(new THREE.ExtrudeGeometry(shape, { depth: ARC_T, bevelEnabled: false, curveSegments: 1 }), 0.5);
  return { mesh: shadowy(new THREE.Mesh(g, mat)), piers, bays, pierW: p, traceries };
}

// Plate tracery filling one arch: two lancets and a round window above them.
function tracery(x0, x1, mat) {
  const mid = (x0 + x1) / 2;
  const outline = new THREE.Shape();
  outline.moveTo(x0, PLINTH);
  for (const [x, y] of archPoints(x0, x1, SPRING, 0.8)) outline.lineTo(x, y);
  outline.lineTo(x1, PLINTH);
  outline.lineTo(x0, PLINTH);
  const m = 0.08; // half mullion width
  const e = 0.06; // frame strip
  outline.holes.push(archHole(x0 + e, mid - m, PLINTH + 0.02, SPRING + 0.1, 0.8));
  outline.holes.push(archHole(mid + m, x1 - e, PLINTH + 0.02, SPRING + 0.1, 0.8));
  // Oculus between the lancet tips and the main apex.
  const lancetApex = archPoints(x0 + e, mid - m, SPRING + 0.1, 0.8)[7][1];
  const apex = archPoints(x0, x1, SPRING, 0.8)[7][1];
  const cy = (lancetApex + apex) / 2;
  const rad = Math.min(0.3, (apex - lancetApex) / 2 - 0.07);
  const ring = new THREE.Path();
  ring.absarc(mid, cy, rad, 0, Math.PI * 2, false);
  outline.holes.push(ring);
  const g = scaleUV(new THREE.ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: false, curveSegments: 8 }), 0.5);
  return shadowy(new THREE.Mesh(g, mat));
}

// Transverse rib arch spanning the walkway (frames the view like the big
// foreground arch in the reference).
function ribArch(mat) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.3);
  shape.lineTo(WALK, -0.3);
  shape.lineTo(WALK, ARC_TOP);
  shape.lineTo(0, ARC_TOP);
  shape.lineTo(0, -0.3);
  shape.holes.push(archHole(0.28, WALK - 0.28, -0.2, 2.9, 0.8));
  const g = scaleUV(new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false }), 0.5);
  return shadowy(new THREE.Mesh(g, mat));
}

function buildCloister() {
  const M = mats();
  const root = new THREE.Group();
  root.name = 'cloister';
  const colliders = []; // axis-aligned XZ boxes { minX, maxX, minZ, maxZ }
  const cameraBlockers = [];

  // Collider defined in north-local coordinates, rotated into the side's frame.
  const addCollider = (angle, x0, x1, z0, z1) => {
    const c = Math.round(Math.cos(angle));
    const s = Math.round(Math.sin(angle));
    const pts = [
      [x0, z0],
      [x1, z1],
    ].map(([x, z]) => [x * c + z * s, -x * s + z * c]);
    colliders.push({
      minX: Math.min(pts[0][0], pts[1][0]),
      maxX: Math.max(pts[0][0], pts[1][0]),
      minZ: Math.min(pts[0][1], pts[1][1]),
      maxZ: Math.max(pts[0][1], pts[1][1]),
    });
  };

  // ---- Ground ---------------------------------------------------------
  const groundSize = 120;
  const ground = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(groundSize, groundSize), groundSize / 2), M.floor);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const grass = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(2 * G, 2 * G), G), M.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.02;
  grass.receiveShadow = true;
  root.add(grass);

  // Garden paths (cross + central square), slightly raised flagstones.
  const pathMat = M.floor;
  for (const [w, d] of [
    [2 * G, 1.6],
    [1.6, 2 * G],
  ]) {
    const pth = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(w, d), 1), pathMat);
    pth.rotation.x = -Math.PI / 2;
    pth.position.y = 0.04;
    pth.receiveShadow = true;
    root.add(pth);
  }
  const plaza = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(4.6, 4.6), 2.3), pathMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.05;
  plaza.receiveShadow = true;
  root.add(plaza);

  // ---- Four sides: arcade, ribs, walkway ceiling, roof, outer wall ------
  for (const [side, angle] of Object.entries(SIDES)) {
    const g = new THREE.Group();
    g.rotation.y = angle;
    root.add(g);
    const longSide = side === 'N' || side === 'S';
    const L = longSide ? 2 * B : 2 * G;
    const arc = arcadeWall(L, 5, M.stone);
    arc.mesh.position.z = -B; // extrudes +z from -B to -G
    g.add(arc.mesh);
    cameraBlockers.push(arc.mesh);
    for (const tr of arc.traceries) {
      tr.position.z = -B + ARC_T / 2 - 0.06;
      g.add(tr);
    }

    // Colliders: arcade wall except the doorway bay; pier stubs inside the door.
    for (const [x0, x1, isDoor] of arc.bays) {
      if (isDoor) {
        addCollider(angle, x0 - arc.pierW, x0, -B, -G);
        addCollider(angle, x1, x1 + arc.pierW, -B, -G);
      } else {
        addCollider(angle, x0 - arc.pierW, x1 + arc.pierW, -B, -G);
      }
    }

    // Cornice on top of the arcade and a string course at the springline.
    g.add(box(L + 0.3, 0.34, ARC_T + 0.3, M.darkStone, 0, ARC_TOP + 0.17, -B + (ARC_T + 0.3) / 2 - 0.02));
    // Colonettes with capitals on the garden face of each pier.
    for (const x of arc.piers) {
      const col = shadowy(new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(0.12, 0.12, SPRING - PLINTH, 6), 1), M.column));
      col.position.set(x, PLINTH + (SPRING - PLINTH) / 2, -G + 0.12);
      g.add(col);
      g.add(box(0.36, 0.2, 0.3, M.darkStone, x, SPRING + 0.08, -G + 0.1));
      g.add(box(0.34, PLINTH, 0.3, M.darkStone, x, PLINTH / 2, -G + 0.1));
    }

    // Transverse ribs across the walkway at every pier.
    for (const x of arc.piers) {
      const rib = ribArch(M.stoneShade);
      rib.rotation.y = Math.PI / 2;
      rib.position.set(x - 0.13, 0, -B);
      g.add(rib);
      cameraBlockers.push(rib);
    }

    // Walkway ceiling (wood) and lean-to slate roof above it.
    const span = longSide ? 2 * C : 2 * B;
    g.add(box(span, 0.12, WALK, M.wood, 0, ARC_TOP + 0.06, -(B + C) / 2, 2));
    const walkFloor = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(span, WALK), 0.5), M.floorShade);
    walkFloor.rotation.x = -Math.PI / 2;
    walkFloor.position.set(0, 0.01 + (longSide ? 0.002 : 0), -(B + C) / 2);
    walkFloor.receiveShadow = true;
    g.add(walkFloor);
    const roofLen = longSide ? 2 * D + 0.6 : 2 * B;
    const z0 = -D - 0.2;
    const y0 = WALL_H + 0.15;
    const z1 = -G + 0.55;
    const y1 = ARC_TOP + 0.4;
    const run = Math.hypot(z1 - z0, y1 - y0);
    const roof = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(roofLen, run), 1), M.slate);
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    roof.rotation.x = -Math.PI / 2 + Math.atan2(y0 - y1, z1 - z0);
    g.add(roof);

    // Outer wall.
    const wallLen = longSide ? 2 * D : 2 * C;
    const wall = box(wallLen, WALL_H, D - C, M.stoneShade, 0, WALL_H / 2, -(C + D) / 2);
    g.add(wall);
    cameraBlockers.push(wall);
    addCollider(angle, -wallLen / 2, wallLen / 2, -D, -C);
    // Rib legs against the outer wall (the arcade side is covered by the arcade collider).
    for (const x of arc.piers) addCollider(angle, x - 0.17, x + 0.17, -C, -C + 0.28);
  }

  // ---- Statue on a pedestal (centre of the garden) ---------------------
  const statue = new THREE.Group();
  statue.add(box(1.5, 0.3, 1.5, M.darkStone, 0, 0.15, 0));
  statue.add(box(1.2, 1.2, 1.2, M.stone, 0, 0.9, 0, 1.2));
  statue.add(box(1.45, 0.22, 1.45, M.darkStone, 0, 1.6, 0));
  const robeProfile = [
    [0.0, 0],
    [0.46, 0],
    [0.42, 0.5],
    [0.34, 1.1],
    [0.3, 1.5],
    [0.36, 1.75],
    [0.2, 1.95],
    [0.0, 2.0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const figure = shadowy(new THREE.Mesh(new THREE.LatheGeometry(robeProfile, 7), M.statue));
  figure.position.y = 1.71;
  statue.add(figure);
  const head = shadowy(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), M.statue));
  head.position.set(0, 3.88, 0.02);
  statue.add(head);
  const hood = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.55, 6), M.statue));
  hood.position.set(0, 3.95, -0.06);
  statue.add(hood);
  // Arms folded holding a book.
  statue.add(box(0.62, 0.18, 0.3, M.statue, 0, 3.05, 0.26, 1));
  statue.add(box(0.36, 0.44, 0.1, M.statue, 0, 3.1, 0.44, 1));
  statue.rotation.y = Math.PI * 0.85; // faces the south door
  statue.scale.setScalar(1.15);
  root.add(statue);
  colliders.push({ minX: -0.95, maxX: 0.95, minZ: -0.95, maxZ: 0.95 });

  // ---- Flower beds -----------------------------------------------------
  const beds = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // L-shaped bed per quadrant = two rectangles.
      beds.push([sx * 2.6, sx * 6.3, sz * 1.1, sz * 6.3]);
      beds.push([sx * 1.1, sx * 2.6, sz * 2.6, sz * 6.3]);
    }
  }
  const flowerSpots = { white: [], blue: [], bush: [] };
  const rnd = mulberry(77);
  for (const [ax, bx, az, bz] of beds) {
    const x0 = Math.min(ax, bx);
    const x1 = Math.max(ax, bx);
    const z0 = Math.min(az, bz);
    const z1 = Math.max(az, bz);
    const w = x1 - x0;
    const d = z1 - z0;
    const soil = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(w, d), 1), M.soil);
    soil.rotation.x = -Math.PI / 2;
    soil.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    soil.receiveShadow = true;
    root.add(soil);
    // Low stone curb.
    const ch = 0.22;
    const ct = 0.14;
    root.add(box(w, ch, ct, M.darkStone, (x0 + x1) / 2, ch / 2, z0, 1));
    root.add(box(w, ch, ct, M.darkStone, (x0 + x1) / 2, ch / 2, z1, 1));
    root.add(box(ct, ch, d, M.darkStone, x0, ch / 2, (z0 + z1) / 2, 1));
    root.add(box(ct, ch, d, M.darkStone, x1, ch / 2, (z0 + z1) / 2, 1));
    colliders.push({ minX: x0 - 0.05, maxX: x1 + 0.05, minZ: z0 - 0.05, maxZ: z1 + 0.05, h: 1 });
    const area = w * d;
    for (let i = 0; i < area * 2.6; i++) {
      const p = [x0 + 0.15 + rnd() * (w - 0.3), z0 + 0.15 + rnd() * (d - 0.3)];
      (rnd() < 0.7 ? flowerSpots.white : flowerSpots.blue).push(p);
    }
    for (let i = 0; i < area * 2.2; i++) flowerSpots.bush.push([x0 + 0.3 + rnd() * (w - 0.6), z0 + 0.3 + rnd() * (d - 0.6)]);
  }
  root.add(crossedSprites(flowerSpots.bush, new THREE.MeshLambertMaterial({ map: tex.bush(), alphaTest: 0.5, side: THREE.DoubleSide }), 0.4, 0.75, rnd));
  const glowWhite = new THREE.MeshBasicMaterial({ map: tex.flower('white'), alphaTest: 0.5, side: THREE.DoubleSide, color: 0xc6cde6 });
  const glowBlue = new THREE.MeshBasicMaterial({ map: tex.flower('blue'), alphaTest: 0.5, side: THREE.DoubleSide, color: 0x8f9cd0 });
  root.add(crossedSprites(flowerSpots.white, glowWhite, 0.35, 0.6, rnd));
  root.add(crossedSprites(flowerSpots.blue, glowBlue, 0.45, 0.8, rnd));

  // ---- Background architecture -----------------------------------------
  // Church nave north of the cloister, with clerestory windows facing us.
  const churchZ = -D - 7;
  root.add(box(28, 13, 12, M.stone, -2, 6.5, churchZ));
  root.add(gableRoof(28.6, 12, 6, M.slate, -2, 13, churchZ));
  for (let i = 0; i < 5; i++) {
    const win = lancet(1.2, 3.4, M.window);
    win.position.set(-12 + i * 4.6, 8.6, churchZ + 6.02);
    root.add(win);
  }
  // Twin-spired tower at the church's west end.
  const tx = -11;
  const tz = churchZ + 1;
  root.add(box(6, 24, 6, M.stone, tx, 12, tz));
  root.add(box(6.6, 0.5, 6.6, M.darkStone, tx, 24.25, tz));
  for (const [ox, oz, h, r] of [
    [-1.8, 1.8, 11, 1.3],
    [1.8, 1.8, 12, 1.3],
    [-1.8, -1.8, 6, 0.7],
    [1.8, -1.8, 6, 0.7],
  ]) {
    root.add(box(r * 1.4, 2.2, r * 1.4, M.stone, tx + ox, 25.6, tz + oz, 1));
    root.add(spire(r, h, M.slate, tx + ox, 26.7, tz + oz));
  }
  for (const [ox, oz] of [
    [-1.4, 3.02],
    [1.4, 3.02],
  ]) {
    const belfry = lancet(1.1, 3.6, M.window);
    belfry.position.set(tx + ox, 18, tz + oz);
    root.add(belfry);
  }

  // Pyramid spire with a cross on the north-east corner of the cloister.
  const cx = C - 0.4;
  const cz = -(C - 0.4);
  root.add(box(3.6, 3.4, 3.6, M.stone, cx, WALL_H + 1.4, cz));
  root.add(box(4.0, 0.3, 4.0, M.darkStone, cx, WALL_H + 3.2, cz));
  root.add(spire(2.9, 9, M.slate, cx, WALL_H + 3.3, cz));
  root.add(cross(M.iron, cx, WALL_H + 12.2, cz, 1.2));

  // Lower buildings around the other sides.
  root.add(box(10, 10, 30, M.stone, D + 5.5, 5, 0));
  root.add(rotY(gableRoof(30, 10, 4.5, M.slate, 0, 10, 0), D + 5.5, 0));
  root.add(box(10, 9, 30, M.stone, -D - 5.5, 4.5, 0));
  root.add(rotY(gableRoof(30, 10, 4.5, M.slate, 0, 9, 0), -D - 5.5, 0));
  root.add(box(30, 9, 9, M.stone, 0, 4.5, D + 5));
  root.add(gableRoof(30, 9, 4, M.slate, 0, 9, D + 5));

  // Distant city spires, mostly swallowed by fog.
  const rr = mulberry(91);
  for (let i = 0; i < 14; i++) {
    const a = rr() * Math.PI * 2;
    const dist = 38 + rr() * 30;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const h = 10 + rr() * 16;
    root.add(box(4, h, 4, M.darkStone, x, h / 2, z, 2));
    root.add(spire(2.2, 6 + rr() * 8, M.slate, x, h, z));
  }

  // ---- Wall torches ----------------------------------------------------
  const torches = [];
  for (const [side, angle] of Object.entries(SIDES)) {
    if (side === 'S') continue; // the south walk is lit by the monk's lantern
    const g = new THREE.Group();
    g.rotation.y = angle;
    root.add(g);
    const t = makeTorch(M.iron);
    t.group.position.set(0, 2.4, -C + 0.05);
    g.add(t.group);
    torches.push(t);
  }

  {
    const exit = new THREE.Mesh(lancet(2.2, 3.4, new THREE.MeshBasicMaterial({ color: 0x1c140e })).geometry, new THREE.MeshBasicMaterial({ color: 0x1c140e }));
    exit.rotation.y = Math.PI / 2;
    exit.position.set(-C + 0.02, 0, 0);
    root.add(exit);
  }

  return {
    root,
    sky: buildSky({ moonDir: MOON_DIR, moonSize: 34, horizon: 0x0c1228 }),
    colliders,
    cameraBlockers,
    entries: { door: { pos: new THREE.Vector3(-8.5, 0, 0), yaw: -Math.PI / 2, pitch: 0.15 } },
    // A door in the west walk leads back out beside the cathedral.
    portals: [{ minX: -C - 0.5, maxX: -C + 0.75, minZ: -1.4, maxZ: 1.4, to: 'bridge', entry: 'cloister' }],
    spawn: new THREE.Vector3(0.2, 0, 4.4),
    spawnYaw: -0.5,
    spawnPitch: 0.22,
    env: {
      fog: { color: 0x0c1228, density: 0.028 },
      hemi: { sky: 0x5466a8, ground: 0x14141f, intensity: 2.3 },
      dir: { dir: MOON_DIR, color: 0xbfd0ff, intensity: 2.6, shadow: true, extent: 26 },
    },
    update(dt, t) {
      flickerTorches(torches, t);
    },
  };
}

export default {
  id: 'cloister',
  title: 'The Moonlit Cloister',
  reference: '01-moonlit-cloister.png',
  build: buildCloister,
};
