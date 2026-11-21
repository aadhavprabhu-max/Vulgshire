import * as THREE from 'three';
import { tex, worldBoxUV, scaleUV } from '../retro/textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared building blocks for all scenes: gothic arches, boxes with world-scale
// UVs, roofs, spires, torches, crossed-quad foliage, sky domes.

export function lambert(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map, ...opts });
}

// Points along a pointed (two-centred) arch from (x0, ys) over the apex to (x1, ys).
export function archPoints(x0, x1, ys, k = 0.8, n = 7) {
  const span = x1 - x0;
  const r = span * k;
  const mid = (x0 + x1) / 2;
  const cL = x0 + r;
  const cR = x1 - r;
  const thA = Math.acos((mid - cL) / r);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + ((thA - Math.PI) * i) / n;
    pts.push([cL + r * Math.cos(a), ys + r * Math.sin(a)]);
  }
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - thA + ((0 - (Math.PI - thA)) * i) / n;
    pts.push([cR + r * Math.cos(a), ys + r * Math.sin(a)]);
  }
  return pts;
}

export function archHole(x0, x1, yBottom, ys, k) {
  const p = new THREE.Path();
  p.moveTo(x0, yBottom);
  for (const [x, y] of archPoints(x0, x1, ys, k)) p.lineTo(x, y);
  p.lineTo(x1, yBottom);
  p.lineTo(x0, yBottom);
  return p;
}

export function shadowy(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function box(w, h, d, mat, x, y, z, tile = 2) {
  const m = new THREE.Mesh(worldBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile), mat);
  m.position.set(x, y, z);
  return shadowy(m);
}

// Gable roof prism running along X, centred on x, ridge at y + rise.
export function gableRoof(len, width, rise, mat, x, y, z) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2 - 0.4, 0);
  s.lineTo(width / 2 + 0.4, 0);
  s.lineTo(0, rise);
  s.lineTo(-width / 2 - 0.4, 0);
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }), 0.5);
  const m = shadowy(new THREE.Mesh(g, mat));
  m.rotation.y = Math.PI / 2;
  m.position.set(x - len / 2, y, z);
  return m;
}

export function spire(radius, height, mat, x, y, z, segments = 4) {
  const g = new THREE.ConeGeometry(radius, height, segments, 1);
  scaleUV(g, 3);
  const m = shadowy(new THREE.Mesh(g, mat));
  m.position.set(x, y + height / 2, z);
  m.rotation.y = Math.PI / 4;
  return m;
}

export function cross(mat, x, y, z, s = 1) {
  const g = new THREE.Group();
  g.add(box(0.1 * s, 1.0 * s, 0.1 * s, mat, 0, 0.5 * s, 0));
  g.add(box(0.55 * s, 0.1 * s, 0.1 * s, mat, 0, 0.68 * s, 0));
  g.position.set(x, y, z);
  return g;
}

// Flat pointed-arch window (dark glass), bottom-centred at the origin.
export function lancet(w, h, mat) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  for (const [x, y] of archPoints(-w / 2, w / 2, h - w * 0.75, 0.8)) s.lineTo(x, y);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(s);
  // Map UVs to the 0..1 window texture.
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, uv.getY(i) / h);
  return new THREE.Mesh(g, mat);
}

export function rotY(mesh, x, z) {
  const g = new THREE.Group();
  g.add(mesh);
  g.rotation.y = Math.PI / 2;
  g.position.set(x, 0, z);
  return g;
}

export function makeTorch(ironMat) {
  const group = new THREE.Group();
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), ironMat);
  bracket.position.set(0, 0, 0.2);
  group.add(bracket);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.55, 5), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
  stick.position.set(0, 0.2, 0.38);
  stick.rotation.x = 0.25;
  group.add(stick);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), color: 0xffffff, fog: true }));
  flame.scale.set(0.28, 0.5, 1);
  flame.position.set(0, 0.68, 0.45);
  group.add(flame);
  const light = new THREE.PointLight(0xff9a48, 3, 9, 2);
  light.position.set(0, 0.7, 0.7);
  group.add(light);
  return { group, flame, light, base: 3, phase: Math.random() * 10 };
}

// Many small upright "crossed quad" sprites, one InstancedMesh per material.
export function crossedSprites(spots, material, minH, maxH, rnd) {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const geo = mergeGeos([a, b]);
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  spots.forEach(([x, z], i) => {
    const h = minH + rnd() * (maxH - minH);
    s.set(h * 0.6, h, h * 0.6);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    p.set(x, 0.05, z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.receiveShadow = true;
  return mesh;
}

export function mergeGeos(geos) {
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  let off = 0;
  for (const g of geos) {
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    nor.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

export function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sky dome + moon + halo, unaffected by fog.
// Night sky: a seamless equirectangular star background (set as scene.background
// by main.js, so there is no dome to see) plus the moon and its halo as sprites
// that follow the camera. `horizon` should match the scene's fog colour.
export function buildSky({ moonDir = null, moonSize = 34, horizon = 0x0c1228 } = {}) {
  const g = new THREE.Group();
  g.userData.background = tex.nightSky(horizon);
  if (moonDir) {
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.moon(), fog: false, depthWrite: false }));
    moon.position.copy(moonDir).multiplyScalar(300);
    moon.scale.set(moonSize, moonSize, 1);
    moon.renderOrder = -9;
    g.add(moon);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex.halo(), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.45 }),
    );
    halo.position.copy(moonDir).multiplyScalar(310);
    halo.scale.set(moonSize * 3.2, moonSize * 3.2, 1);
    halo.renderOrder = -9;
    g.add(halo);
  }
  return g;
}

// Animate a list of torches made by makeTorch (light flicker + flame size).
export function flickerTorches(torches, t) {
  for (const torch of torches) {
    const f = 0.8 + 0.12 * Math.sin(t * 9.1 + torch.phase) + 0.08 * Math.sin(t * 17.3 + torch.phase * 2);
    if (torch.light) torch.light.intensity = torch.base * f;
    const s = torch.flameScale || 1;
    torch.flame.scale.set((0.26 + 0.03 * Math.sin(t * 13 + torch.phase)) * s, (0.46 + 0.07 * f) * s, 1);
  }
}

// Merge many static geometries (already transformed) into one mesh.
export function mergedMesh(geos, material, { cast = false, receive = true } = {}) {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  }
  const mesh = new THREE.Mesh(mergeGeometries(flat, false), material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// A box geometry with world-scale UVs, transformed into place.
export function boxGeo(w, h, d, x, y, z, rotY = 0, tile = 2) {
  const g = worldBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

// Gable roof prism geometry along local X, transformed into place.
export function gableGeo(len, width, rise, x, y, z, rotY = 0, overhang = 0.4) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2 - overhang, 0);
  s.lineTo(width / 2 + overhang, 0);
  s.lineTo(0, rise);
  s.lineTo(-width / 2 - overhang, 0);
  const g = scaleUV(new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }), 0.5);
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2 + rotY);
  g.translate(x, y, z);
  return g;
}

// Small upright quad facing +Z, then rotated/moved (for window grids).
export function quadGeo(w, h, x, y, z, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

// Crenellations (merlons) along local X, as geometries.
export function merlonGeos(len, x, y, z, rotY = 0, { w = 0.7, h = 0.6, d = 0.6, gap = 0.6 } = {}) {
  const out = [];
  const n = Math.floor(len / (w + gap));
  const start = -((n - 1) * (w + gap)) / 2;
  for (let i = 0; i < n; i++) {
    const g = worldBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 1);
    g.translate(start + i * (w + gap), h / 2, 0);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    out.push(g);
  }
  return out;
}

// Flat pointed-arch shape geometry with UVs mapped 0..1 (for glass and glows).
export function lancetGeo(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  for (const [x, y] of archPoints(-w / 2, w / 2, h - w * 0.75, 0.8)) s.lineTo(x, y);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(s);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, uv.getY(i) / h);
  return g;
}
