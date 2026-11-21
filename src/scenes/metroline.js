import * as THREE from 'three';
import METRO from '../data/metro.json';
import { LOCATIONS } from '../data/world.js';

// The metro line's real route, traced from the owner's drawing on the final map
// (tools/trace_metro_path.py -> metro.json lines[].path, in map pixels).
//
// "Line space": s = metres along the line (0 at the first station), d = metres
// to the side (+d is to the right when facing +s), y = up. Geometry is built
// straight in line space, then bent onto the curve. World space is the North
// Shore's zone space (x = east, z = south, 1 map px = 1.4 m).

const K = LOCATIONS.metresPerPixel * LOCATIONS.gameScale;
const ZONE = LOCATIONS.zones.find((z) => z.id === 'north-river-crossing');
const toZone = ([px, py]) => [(px - ZONE.originPx[0]) * K, (py - ZONE.originPx[1]) * K];
export const toMapPx = (x, z) => [x / K + ZONE.originPx[0], z / K + ZONE.originPx[1]];

export function createMetroLine(lineId = 'II', { extend = 70 } = {}) {
  const line = METRO.lines.find((l) => l.id === lineId);
  const raw = line.path.map(toZone);
  // Arc length of the raw path.
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const L = cum[cum.length - 1];
  const rawAt = (s) => {
    if (s <= 0) {
      const [a, b] = [raw[0], raw[1]];
      const t = s / (cum[1] - cum[0]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    if (s >= L) {
      const [a, b] = [raw[raw.length - 2], raw[raw.length - 1]];
      const t = (s - cum[cum.length - 2]) / (L - cum[cum.length - 2]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    let i = 1;
    while (cum[i] < s) i++;
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return [raw[i - 1][0] + (raw[i][0] - raw[i - 1][0]) * t, raw[i - 1][1] + (raw[i][1] - raw[i - 1][1]) * t];
  };
  // Resample every metre (with straight extensions past both ends), then smooth.
  const S0 = -extend;
  const N = Math.ceil(L + 2 * extend) + 1;
  let X = new Float64Array(N);
  let Z = new Float64Array(N);
  for (let i = 0; i < N; i++) [X[i], Z[i]] = rawAt(S0 + i);
  for (let pass = 0; pass < 3; pass++) {
    const X2 = X.slice();
    const Z2 = Z.slice();
    for (let i = 3; i < N - 3; i++) {
      let sx = 0;
      let sz = 0;
      for (let k = -3; k <= 3; k++) {
        sx += X[i + k];
        sz += Z[i + k];
      }
      X2[i] = sx / 7;
      Z2[i] = sz / 7;
    }
    X = X2;
    Z = Z2;
  }
  const TX = new Float64Array(N);
  const TZ = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(N - 1, i + 2);
    const dx = X[b] - X[a];
    const dz = Z[b] - Z[a];
    const l = Math.hypot(dx, dz) || 1;
    TX[i] = dx / l;
    TZ[i] = dz / l;
  }

  /** Frame at s: point, tangent t, side normal n (right of travel), rotation angle. */
  function frame(s) {
    let f = s - S0;
    f = Math.max(0, Math.min(N - 1.0001, f));
    const i = Math.floor(f);
    const u = f - i;
    const x = X[i] + (X[i + 1] - X[i]) * u;
    const z = Z[i] + (Z[i + 1] - Z[i]) * u;
    let tx = TX[i] + (TX[i + 1] - TX[i]) * u;
    let tz = TZ[i] + (TZ[i + 1] - TZ[i]) * u;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // n = tangent rotated so that a straight line along +x maps d onto +z.
    return { x, z, tx, tz, nx: -tz, nz: tx, rot: Math.atan2(-tz, tx) };
  }
  const toWorld = (s, d) => {
    const f = frame(s);
    return [f.x + f.nx * d, f.z + f.nz * d];
  };
  /** Nearest point on the line: {s, d}. `hint` (an s) speeds up the search. */
  function toLine(x, z, hint = null) {
    let i0 = 0;
    let i1 = N - 1;
    if (hint !== null) {
      const c = Math.round(hint - S0);
      i0 = Math.max(0, c - 40);
      i1 = Math.min(N - 1, c + 40);
    }
    let best = i0;
    let bd = Infinity;
    for (let i = i0; i <= i1; i++) {
      const d = (X[i] - x) ** 2 + (Z[i] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // Refine within the segment.
    const s = best + S0;
    const f = frame(s);
    const along = (x - f.x) * f.tx + (z - f.z) * f.tz;
    const s2 = s + Math.max(-1, Math.min(1, along));
    const f2 = frame(s2);
    return { s: s2, d: (x - f2.x) * f2.nx + (z - f2.z) * f2.nz };
  }
  /** Map a line-space yaw (monk convention: 0 looks toward -z) to world yaw at s. */
  function yawToWorld(s, yaw) {
    const f = frame(s);
    const vx = -Math.sin(yaw);
    const vz = -Math.cos(yaw);
    const wx = vx * f.tx + vz * f.nx;
    const wz = vx * f.tz + vz * f.nz;
    return Math.atan2(-wx, -wz);
  }
  const stations = METRO.stations
    .filter((s) => s.line === lineId)
    .map((st) => {
      const [x, z] = toZone(st.mapPx);
      return { ...st, s: Math.round(toLine(x, z).s) };
    });
  stations[0].s = 0;

  return { line, length: L, frame, toWorld, toLine, yawToWorld, stations, toZone };
}

// ---- Bending line-space geometry onto the curve ------------------------------------

// Split triangles until no edge spans more than maxLen along x (= s).
function tessellate(geo, maxLen) {
  const names = Object.keys(geo.attributes);
  const src = names.map((n) => geo.attributes[n]);
  const out = names.map(() => []);
  const pos = geo.attributes.position;
  const tri = [];
  for (let i = 0; i < pos.count; i += 3) {
    const t = [];
    for (let v = 0; v < 3; v++) t.push(src.map((a) => Array.from({ length: a.itemSize }, (_, k) => a.array[(i + v) * a.itemSize + k])));
    tri.push(t);
  }
  const lerp = (a, b) => a.map((arr, j) => arr.map((v, k) => (v + b[j][k]) / 2));
  let guard = 0;
  while (tri.length && guard++ < 2e6) {
    const t = tri.pop();
    const xs = t.map((v) => v[0][0]);
    const e = [Math.abs(xs[0] - xs[1]), Math.abs(xs[1] - xs[2]), Math.abs(xs[2] - xs[0])];
    const m = Math.max(...e);
    if (m <= maxLen) {
      for (const v of t) v.forEach((arr, j) => out[j].push(...arr));
      continue;
    }
    const k = e.indexOf(m);
    const a = k;
    const b = (k + 1) % 3;
    const c = (k + 2) % 3;
    const mid = lerp(t[a], t[b]);
    tri.push([t[a], mid, t[c]], [mid, t[b], t[c]]);
  }
  const g = new THREE.BufferGeometry();
  names.forEach((n, j) => g.setAttribute(n, new THREE.Float32BufferAttribute(out[j], src[j].itemSize)));
  return g;
}

/** Bend everything under `lineRoot` (built in line space) into a new world-space group. */
export function bendGroup(line, lineRoot, { maxLen = 4 } = {}) {
  lineRoot.updateMatrixWorld(true);
  const out = new THREE.Group();
  const meshes = [];
  const others = [];
  lineRoot.traverse((o) => {
    if (o.isSprite || o.isLight) others.push(o);
    else if (o.isMesh) meshes.push(o);
  });
  const blockers = [];
  const v = new THREE.Vector3();
  for (const m of meshes) {
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    g = tessellate(g, maxLen);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const f = line.frame(p.getX(i));
      const d = p.getZ(i);
      p.setXYZ(i, f.x + f.nx * d, p.getY(i), f.z + f.nz * d);
      if (n) {
        const nx = n.getX(i);
        const nz = n.getZ(i);
        n.setXYZ(i, nx * f.tx + nz * f.nx, n.getY(i), nx * f.tz + nz * f.nz);
      }
    }
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m.material);
    mesh.castShadow = m.castShadow;
    mesh.receiveShadow = m.receiveShadow;
    mesh.renderOrder = m.renderOrder;
    out.add(mesh);
    if (m.userData.blocker) blockers.push(mesh);
  }
  for (const o of others) {
    o.getWorldPosition(v);
    const [x, z] = line.toWorld(v.x, v.z);
    o.parent.remove(o);
    o.position.set(x, v.y, z);
    out.add(o);
  }
  return { group: out, blockers };
}

/** Convert a line-space AABB collider/floor into world rotated boxes (split along s). */
export function bendBox(line, b, maxLen = 3) {
  const parts = [];
  const len = b.maxX - b.minX;
  const n = Math.max(1, Math.ceil(len / maxLen));
  for (let k = 0; k < n; k++) {
    const s0 = b.minX + (len * k) / n;
    const s1 = b.minX + (len * (k + 1)) / n;
    const sc = (s0 + s1) / 2;
    const dc = (b.minZ + b.maxZ) / 2;
    const f = line.frame(sc);
    const [cx, cz] = line.toWorld(sc, dc);
    const { minX, maxX, minZ, maxZ, ...rest } = b;
    void minX;
    void maxX;
    void minZ;
    void maxZ;
    parts.push({ ...rest, cx, cz, hx: (s1 - s0) / 2 + 0.05, hz: (b.maxZ - b.minZ) / 2, rot: f.rot, s0, s1 });
  }
  return parts;
}

/** World axis-aligned bounds of a line-space box (for portals). */
export function bendAABB(line, b) {
  const pts = [
    [b.minX, b.minZ],
    [b.maxX, b.minZ],
    [b.minX, b.maxZ],
    [b.maxX, b.maxZ],
  ].map(([s, d]) => line.toWorld(s, d));
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return { ...b, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
