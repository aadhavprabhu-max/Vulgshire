import * as THREE from 'three';
import { BuildingSet } from './buildings.js';

// Chunked level of detail for a whole district of buildings.
// - Every chunk (CELL x CELL metres) gets a cheap far version at load time.
// - The detailed near version is built lazily (one chunk per frame) when the
//   player comes within NEAR metres, swapped in, and thrown away again when the
//   player goes far. Beyond FAR the chunk is hidden (fog hides it anyway).
// Lots need a stable `seed` so near and far versions of a house match.

export function createChunkedTown({ lots, root, cell = 100, near = 150, far = 520, litChance = 0.36 }) {
  const cells = new Map();
  for (const lot of lots) {
    const key = `${Math.floor(lot.x / cell)},${Math.floor(lot.z / cell)}`;
    if (!cells.has(key)) {
      const [cx, cz] = key.split(',').map(Number);
      cells.set(key, { lots: [], cx: (cx + 0.5) * cell, cz: (cz + 0.5) * cell, low: null, high: null, highBlockers: [] });
    }
    cells.get(key).lots.push(lot);
  }
  const group = new THREE.Group();
  group.name = 'chunked-town';
  root.add(group);
  let i = 0;
  for (const c of cells.values()) {
    const set = new BuildingSet(1000 + i++, { litChance, detail: 'min' });
    for (const l of c.lots) set.add({ ...l, collide: false });
    c.low = set.build().group;
    group.add(c.low);
  }
  const list = [...cells.values()];
  const blockers = [];

  function buildHigh(c) {
    const set = new BuildingSet(1, { litChance, detail: 'high' });
    for (const l of c.lots) set.add({ ...l, collide: false });
    const b = set.build();
    c.high = b.group;
    c.highBlockers = b.blockers;
    group.add(c.high);
  }
  function dropHigh(c) {
    if (!c.high) return;
    group.remove(c.high);
    c.high.traverse((o) => o.geometry?.dispose());
    c.high = null;
    c.highBlockers = [];
  }

  function update(px, pz, { force = false } = {}) {
    let built = 0;
    const order = list.map((c) => [c, Math.hypot(c.cx - px, c.cz - pz)]).sort((a, b) => a[1] - b[1]);
    for (const [c, d] of order) {
      const wantHigh = d < near;
      if (wantHigh && !c.high && (force || built < 1)) {
        buildHigh(c);
        built++;
      }
      if (!wantHigh && d > near + 60) dropHigh(c);
      const showHigh = !!c.high && wantHigh;
      if (c.high) c.high.visible = showHigh;
      c.low.visible = !showHigh && d < far;
    }
    blockers.length = 0;
    for (const c of list) if (c.high && c.high.visible) blockers.push(...c.highBlockers);
  }

  return { group, update, cells: list, blockers };
}
