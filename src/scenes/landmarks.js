import * as THREE from 'three';
import { tex, scaleUV } from '../retro/textures.js';
import { lambert, shadowy, box, spire, mergedMesh, boxGeo, merlonGeos, lancetGeo, cross, floorMat, LAYER } from './kit.js';

// Hero landmarks of the North Shore. Each builder returns
// { group, colliders, footprint: [x0, x1, z0, z1], flames, portals }.

function mats() {
  return {
    stone: lambert(tex.hallStone()),
    pale: lambert(tex.townStone(), { color: 0xd8d0c4 }),
    dark: lambert(tex.darkStone()),
    slate: lambert(tex.slate()),
    copper: lambert(tex.slate(), { color: 0x6a9a84 }),
    paving: floorMat(tex.flagstone(), { color: 0xc8c0b8 }, 2),
    wood: lambert(tex.wood(), { color: 0x9a8070 }),
    iron: lambert(null, { color: 0x1e1c1c }),
    gold: lambert(null, { color: 0xb08a40 }),
    lit: new THREE.MeshBasicMaterial({ map: tex.litWindow() }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffa048 }),
    glassWarm: (s) => new THREE.MeshBasicMaterial({ map: tex.stainedGlass('warm', s), side: THREE.DoubleSide }),
    glassCool: (s) => new THREE.MeshBasicMaterial({ map: tex.stainedGlass('purple', s), side: THREE.DoubleSide }),
    rose: new THREE.MeshBasicMaterial({ map: tex.rose('warm'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    clock: new THREE.MeshBasicMaterial({ map: clockFace(), transparent: true, alphaTest: 0.5 }),
    water: new THREE.MeshLambertMaterial({ map: tex.water(), color: 0x9aa8d8, emissive: 0x101828 }),
  };
}

// A pale, softly lit clock dial with Roman-ish ticks and iron hands.
let _clock = null;
export function clockFace() {
  if (_clock) return _clock;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#e8d8a8';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = 3;
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillStyle = '#2a1e14';
    g.fillRect(32 + Math.cos(a) * 24 - 1, 32 + Math.sin(a) * 24 - 2, 3, 4);
  }
  g.strokeStyle = '#1a120c';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(32, 32);
  g.lineTo(32, 14);
  g.moveTo(32, 32);
  g.lineTo(44, 38);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  _clock = t;
  return t;
}

const flame = (list, x, y, z, scale = 0.8) => {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
  f.position.set(x, y, z);
  list.push({ flame: f, light: null, base: 0, phase: Math.random() * 9, flameScale: scale });
  return f;
};

// Lantern post: iron post with a glowing box lantern and a flame.
function lanternPost(M, group, flames, x, z, h = 3.6) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 6), M.iron);
  p.position.set(x, h / 2, z);
  group.add(p);
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), M.lit);
  l.position.set(x, h + 0.2, z);
  group.add(l);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 4), M.iron);
  cap.rotation.y = Math.PI / 4;
  cap.position.set(x, h + 0.6, z);
  group.add(cap);
  group.add(flame(flames, x, h + 0.25, z, 0.35));
}

/** Grand Central Station: the great gothic hall where every metro line meets. Front faces +z. */
export function buildStation({ x, z }) {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const flames = [];
  const W = 60;
  const D = 32;
  const H = 18;
  const stone = [];
  const pale = [];
  const slate = [];
  // Main hall with a steep roof and a crown of pinnacled buttresses.
  stone.push(boxGeo(W, H, D, 0, H / 2, 0));
  pale.push(boxGeo(W + 0.6, 0.8, D + 0.6, 0, 0.4, 0, 0, 1)); // plinth
  pale.push(boxGeo(W + 0.8, 0.5, D + 0.8, 0, H, 0, 0, 1)); // cornice
  const rs = new THREE.Shape();
  rs.moveTo(-D / 2 - 0.6, 0);
  rs.lineTo(D / 2 + 0.6, 0);
  rs.lineTo(0, 15);
  rs.lineTo(-D / 2 - 0.6, 0);
  const roof = scaleUV(new THREE.ExtrudeGeometry(rs, { depth: W + 1, bevelEnabled: false }), 0.5);
  roof.translate(0, 0, -(W + 1) / 2);
  roof.rotateY(Math.PI / 2);
  roof.translate(0, H + 0.2, 0);
  slate.push(roof);
  for (let i = 0; i <= 8; i++) {
    const bx = -W / 2 + (W * i) / 8;
    for (const sz of [-1, 1]) {
      pale.push(boxGeo(1.4, H + 2, 2.4, bx, (H + 2) / 2, sz * (D / 2 + 1.1), 0, 1));
      const pin = new THREE.ConeGeometry(0.7, 4, 4);
      pin.rotateY(Math.PI / 4);
      pin.translate(bx, H + 4, sz * (D / 2 + 1.1));
      slate.push(pin);
    }
  }
  // Tall warm lancets between the buttresses on both long sides.
  for (let i = 0; i < 8; i++) {
    const wx = -W / 2 + (W * (i + 0.5)) / 8;
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(lancetGeo(2.6, 10), M.glassWarm(i + (sz > 0 ? 0 : 8)));
      w.position.set(wx, 4, sz * (D / 2 + 0.03));
      if (sz < 0) w.rotation.y = Math.PI;
      g.add(w);
    }
  }
  // The grand frontispiece: a deep pointed portal, rose window, clock and twin turrets.
  const fz = D / 2;
  stone.push(boxGeo(22, 30, 5, 0, 15, fz + 2));
  pale.push(...merlonGeos(22, 0, 30, fz + 4.4, 0, { w: 1, h: 1.2, d: 0.8, gap: 0.9 }));
  for (let k = 0; k < 4; k++) pale.push(boxGeo(10.5 - k * 1.2, 0.6, 0.6, 0, 1 + k * 0.4, fz + 4.8 + k * 0.6, 0, 1)); // steps
  const portal = new THREE.Mesh(lancetGeo(7.5, 12), M.glow);
  portal.position.set(0, 0.2, fz + 4.55);
  g.add(portal);
  for (const [w, h, dz] of [
    [9.5, 14, 4.52],
    [8.5, 13, 4.53],
  ]) {
    const arch = new THREE.Mesh(lancetGeo(w, h), M.pale);
    arch.position.set(0, 0, fz + dz - 0.01);
    g.add(arch);
  }
  const rose = new THREE.Mesh(new THREE.CircleGeometry(4, 20), M.rose);
  rose.position.set(0, 19, fz + 4.55);
  g.add(rose);
  for (const sd of [-1, 1]) {
    const t = new THREE.CylinderGeometry(2.6, 2.9, 36, 8);
    t.translate(sd * 12.5, 18, fz + 2.5);
    stone.push(scaleUV(t, 2));
    const c = new THREE.ConeGeometry(3.4, 12, 8);
    c.translate(sd * 12.5, 42, fz + 2.5);
    slate.push(c);
    for (let k = 0; k < 4; k++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6), M.lit);
      w.position.set(sd * 12.5, 8 + k * 7, fz + 5.45);
      g.add(w);
    }
  }
  // The clock tower rising behind the portal, with four clock faces and a copper spire.
  const tz = fz - 4;
  stone.push(boxGeo(11, 52, 11, 0, 26, tz));
  pale.push(boxGeo(12.4, 1, 12.4, 0, 52.5, tz, 0, 1));
  for (const [a, ox, oz] of [
    [0, 0, 5.56],
    [Math.PI, 0, -5.56],
    [Math.PI / 2, 5.56, 0],
    [-Math.PI / 2, -5.56, 0],
  ]) {
    const cl = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), M.clock);
    cl.rotation.y = a;
    cl.position.set(ox, 42, tz + oz);
    g.add(cl);
    const bel = new THREE.Mesh(lancetGeo(2.4, 5), M.dark);
    bel.rotation.y = a;
    bel.position.set(ox * 1.001, 46, tz + oz * 1.001);
    g.add(bel);
  }
  const sp = new THREE.ConeGeometry(7.6, 26, 8);
  sp.translate(0, 53 + 13, tz);
  g.add(mergedMesh([sp], M.copper));
  for (const [ox, oz] of [
    [-5, -5],
    [5, -5],
    [-5, 5],
    [5, 5],
  ]) {
    const p = new THREE.ConeGeometry(0.8, 6, 4);
    p.translate(ox, 56, tz + oz);
    slate.push(p);
  }
  g.add(cross(M.iron, 0, 79, tz, 2.2));
  g.add(shadowy(mergedMesh(stone, M.stone, { cast: true })));
  g.add(mergedMesh(pale, M.pale, { cast: true }));
  g.add(mergedMesh(slate, M.slate));

  // The plaza in front: paving, lantern posts, benches and a warm glow at the doors.
  const plaza = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(56, 26), 14), M.paving);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, LAYER.plaza, fz + 18);
  g.add(plaza);
  for (let k = -2; k <= 2; k++) {
    lanternPost(M, g, flames, k * 10, fz + 9);
    lanternPost(M, g, flames, k * 10, fz + 29);
  }
  const doorLight = new THREE.PointLight(0xffa050, 26, 30, 1.6);
  doorLight.position.set(0, 4, fz + 8);
  g.add(doorLight);
  for (const sd of [-1, 1]) {
    g.add(flame(flames, sd * 5, 6.5, fz + 4.7, 1.2));
  }
  const benches = [];
  for (const bx of [-15, -5, 5, 15]) {
    benches.push(boxGeo(2.4, 0.1, 0.5, bx, 0.48, fz + 19));
    benches.push(boxGeo(0.12, 0.45, 0.45, bx - 1.1, 0.23, fz + 19), boxGeo(0.12, 0.45, 0.45, bx + 1.1, 0.23, fz + 19));
  }
  g.add(mergedMesh(benches, M.wood));
  const colliders = [
    { minX: x - W / 2 - 1.8, maxX: x + W / 2 + 1.8, minZ: z - D / 2 - 2.4, maxZ: z + D / 2 + 1 },
    { minX: x - 15.5, maxX: x + 15.5, minZ: z + fz, maxZ: z + fz + 4.6 },
  ];
  for (const bx of [-15, -5, 5, 15]) colliders.push({ minX: x + bx - 1.3, maxX: x + bx + 1.3, minZ: z + fz + 18.7, maxZ: z + fz + 19.3, h: 0.6 });
  for (let k = -2; k <= 2; k++)
    for (const pz of [fz + 9, fz + 29]) colliders.push({ minX: x + k * 10 - 0.2, maxX: x + k * 10 + 0.2, minZ: z + pz - 0.2, maxZ: z + pz + 0.2 });
  return { group: g, colliders, flames, footprint: [x - W / 2 - 4, x + W / 2 + 4, z - D / 2 - 4, z + fz + 32] };
}

/** The Great Cathedral (exterior), with its square and fountain. Facade faces +z. */
export function buildCathedralExterior({ x, z }) {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const flames = [];
  const stone = [];
  const pale = [];
  const slate = [];
  const L = 78; // nave length (facade at local z = 0, apse toward -z)
  const NW = 26;
  const NH = 26;
  // Nave + aisles + transept + apse.
  stone.push(boxGeo(NW, NH, L, 0, NH / 2, -L / 2));
  stone.push(boxGeo(NW + 16, 14, L - 10, 0, 7, -L / 2 - 2));
  stone.push(boxGeo(60, NH, 18, 0, NH / 2, -L * 0.62));
  const apse = new THREE.CylinderGeometry(NW / 2, NW / 2, NH, 10, 1, false, Math.PI / 2, Math.PI);
  apse.translate(0, NH / 2, -L);
  stone.push(scaleUV(apse, 2));
  const roof = (len, wid, rise, ox, oy, oz, alongZ) => {
    const s = new THREE.Shape();
    s.moveTo(-wid / 2 - 0.5, 0);
    s.lineTo(wid / 2 + 0.5, 0);
    s.lineTo(0, rise);
    s.lineTo(-wid / 2 - 0.5, 0);
    const r = scaleUV(new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }), 0.5);
    r.translate(0, 0, -len / 2);
    if (!alongZ) r.rotateY(Math.PI / 2);
    r.translate(ox, oy, oz);
    slate.push(r);
  };
  roof(L, NW, 16, 0, NH, -L / 2, true);
  roof(60, 18, 13, 0, NH, -L * 0.62, false);
  // Flying buttresses with pinnacles along both sides.
  for (let i = 0; i < 8; i++) {
    const bz = -8 - i * 8.5;
    if (Math.abs(bz + L * 0.62) < 10) continue;
    for (const sd of [-1, 1]) {
      pale.push(boxGeo(2, 20, 2.4, sd * (NW / 2 + 9), 10, bz, 0, 1));
      const fly = new THREE.BoxGeometry(9, 0.8, 1.2);
      fly.rotateZ(sd * 0.55);
      fly.translate(sd * (NW / 2 + 4.6), 19, bz);
      pale.push(fly);
      const pin = new THREE.ConeGeometry(0.9, 6, 4);
      pin.rotateY(Math.PI / 4);
      pin.translate(sd * (NW / 2 + 9), 23, bz);
      slate.push(pin);
      const win = new THREE.Mesh(lancetGeo(2.6, 9), M.glassCool(i + (sd > 0 ? 8 : 0)));
      win.position.set(sd * (NW / 2 + 8.03), 3, bz + 4.2);
      win.rotation.y = sd * Math.PI / 2;
      g.add(win);
      const cw = new THREE.Mesh(lancetGeo(2.2, 7), M.glassCool(i + 20));
      cw.position.set(sd * (NW / 2 + 0.03), 15, bz + 4.2);
      cw.rotation.y = sd * Math.PI / 2;
      g.add(cw);
    }
  }
  // West front: twin towers with tall spires, a great rose window and three portals.
  for (const sd of [-1, 1]) {
    stone.push(boxGeo(12, 56, 12, sd * 15, 28, -3));
    pale.push(boxGeo(13, 1, 13, sd * 15, 56.5, -3, 0, 1));
    const sp = new THREE.ConeGeometry(6.4, 34, 8);
    sp.translate(sd * 15, 57 + 17, -3);
    slate.push(sp);
    for (const [ox, oz] of [
      [-5.5, -5.5],
      [5.5, -5.5],
      [-5.5, 5.5],
      [5.5, 5.5],
    ]) {
      const p = new THREE.ConeGeometry(0.7, 7, 4);
      p.translate(sd * 15 + ox, 60.5, -3 + oz);
      slate.push(p);
    }
    for (let k = 0; k < 3; k++) {
      const w = new THREE.Mesh(lancetGeo(2.4, 6), k === 2 ? M.dark : M.glassCool(30 + k + (sd > 0 ? 3 : 0)));
      w.position.set(sd * 15, 18 + k * 12, 3.03);
      g.add(w);
    }
    const sideDoor = new THREE.Mesh(lancetGeo(4, 7.5), M.glow);
    sideDoor.position.set(sd * 15, 0.1, 3.05);
    g.add(sideDoor);
    g.add(cross(M.iron, sd * 15, 91, -3, 2.4));
  }
  stone.push(boxGeo(NW - 6, NH + 8, 4, 0, (NH + 8) / 2, 1)); // centre gable front
  const rose = new THREE.Mesh(new THREE.CircleGeometry(6.5, 24), M.rose);
  rose.position.set(0, 21, 3.05);
  g.add(rose);
  for (const [w, h, dz] of [
    [11, 15, 3.04],
    [9.5, 13.5, 3.05],
  ]) {
    const arch = new THREE.Mesh(lancetGeo(w, h), M.pale);
    arch.position.set(0, 0, dz);
    g.add(arch);
  }
  const portal = new THREE.Mesh(lancetGeo(7, 11), M.glow);
  portal.position.set(0, 0.05, 3.07);
  g.add(portal);
  for (let k = 0; k < 4; k++) pale.push(boxGeo(36 - k * 2, 0.5, 1.2, 0, 0.25 + k * 0.0, 4 + k * 1.2 - 0.6 * k, 0, 1));
  g.add(shadowy(mergedMesh(stone, M.stone, { cast: true })));
  g.add(mergedMesh(pale, M.pale, { cast: true }));
  g.add(mergedMesh(slate, M.slate));

  // The square with a round fountain and lantern posts.
  const sqz = 52;
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(34, 28), M.paving);
  scaleUV(plaza.geometry, 17);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, LAYER.plaza, sqz);
  g.add(plaza);
  const fx = -10;
  const fzz = sqz + 6;
  const basin = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(5, 5.3, 0.9, 16, 1, true), 1), M.pale);
  basin.position.set(fx, 0.45, fzz);
  g.add(basin);
  const wat = new THREE.Mesh(new THREE.CircleGeometry(4.9, 16), M.water);
  wat.rotation.x = -Math.PI / 2;
  wat.position.set(fx, 0.7, fzz);
  g.add(wat);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3.2, 8), M.pale);
  col.position.set(fx, 2, fzz);
  g.add(col);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.6, 0.6, 10), M.pale);
  bowl.position.set(fx, 3.4, fzz);
  g.add(bowl);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    lanternPost(M, g, flames, Math.cos(a) * 28, sqz + Math.sin(a) * 28);
  }
  const doorLight = new THREE.PointLight(0xffa050, 30, 34, 1.6);
  doorLight.position.set(0, 5, 10);
  g.add(doorLight);
  const colliders = [
    { minX: x - NW / 2 - 10, maxX: x + NW / 2 + 10, minZ: z - L - NW / 2, maxZ: z + 3 },
    { minX: x - 30, maxX: x + 30, minZ: z - L * 0.62 - 9, maxZ: z - L * 0.62 + 9 },
    { minX: x - 21.5, maxX: x + 21.5, minZ: z - 9, maxZ: z + 3.2 },
    { cx: x + fx, cz: z + fzz, hx: 5.3, hz: 5.3, rot: 0, h: 1 },
  ];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    colliders.push({ minX: x + Math.cos(a) * 28 - 0.2, maxX: x + Math.cos(a) * 28 + 0.2, minZ: z + sqz + Math.sin(a) * 28 - 0.2, maxZ: z + sqz + Math.sin(a) * 28 + 0.2 });
  }
  return {
    group: g,
    colliders,
    flames,
    footprint: [x - 34, x + 34, z - L - NW / 2 - 4, z + sqz + 34],
    door: { x, z: z + 3.6 },
    cloisterDoor: { x: x + 30.5, z: z - L * 0.62 },
  };
}

/** The Merchants' Guildhall: a broad arcaded hall with a lookout tower. Front faces +z. */
export function buildGuildhall({ x, z }) {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const flames = [];
  const stone = [];
  const pale = [];
  const slate = [];
  const W = 32;
  const D = 18;
  stone.push(boxGeo(W, 13, D, 0, 6.5, 0));
  pale.push(boxGeo(W + 0.4, 0.5, D + 0.4, 0, 13, 0, 0, 1));
  for (let k = 0; k <= 8; k++) pale.push(boxGeo(0.8, 4.2, 0.8, -W / 2 + (W * k) / 8, 2.1, D / 2 + 1.6, 0, 1));
  pale.push(boxGeo(W + 0.8, 0.8, 3.4, 0, 4.6, D / 2 + 1.5, 0, 1));
  const hip = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  hip.rotateY(Math.PI / 4);
  hip.scale(W + 1.5, 9, D + 1.5);
  hip.translate(0, 13 + 4.5, 0);
  slate.push(scaleUV(hip, 3));
  stone.push(boxGeo(8, 30, 8, W / 2 - 4, 15, -2));
  pale.push(...merlonGeos(8.6, W / 2 - 4, 30, 2.3, 0, { w: 0.8, h: 1, d: 0.7, gap: 0.7 }));
  const cap = new THREE.ConeGeometry(5.6, 12, 4);
  cap.rotateY(Math.PI / 4);
  cap.translate(W / 2 - 4, 37, -2);
  g.add(mergedMesh([cap], M.copper));
  for (let k = 0; k < 8; k++) {
    for (const yy of [7, 10.5]) {
      const w = new THREE.Mesh(lancetGeo(1.3, 2.4), M.lit);
      w.position.set(-W / 2 + (W * (k + 0.5)) / 8, yy - 1.2, D / 2 + 0.03);
      g.add(w);
    }
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), M.glow);
    sh.position.set(-W / 2 + (W * (k + 0.5)) / 8, 1.6, D / 2 + 0.03);
    g.add(sh);
  }
  g.add(shadowy(mergedMesh(stone, M.stone, { cast: true })));
  g.add(mergedMesh(pale, M.pale, { cast: true }));
  g.add(mergedMesh(slate, M.slate));
  for (const sd of [-1, 1]) lanternPost(M, g, flames, sd * 12, D / 2 + 6);
  const colliders = [{ minX: x - W / 2 - 0.5, maxX: x + W / 2 + 0.5, minZ: z - D / 2, maxZ: z + D / 2 + 0.4 }];
  for (let k = 0; k <= 8; k++) colliders.push({ minX: x - W / 2 + (W * k) / 8 - 0.45, maxX: x - W / 2 + (W * k) / 8 + 0.45, minZ: z + D / 2 + 1.15, maxZ: z + D / 2 + 2.05 });
  return { group: g, colliders, flames, footprint: [x - W / 2 - 4, x + W / 2 + 4, z - D / 2 - 4, z + D / 2 + 9] };
}
