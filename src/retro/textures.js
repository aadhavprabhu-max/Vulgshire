import * as THREE from 'three';

// All textures are tiny canvases drawn procedurally (original, no external assets).
// They use nearest filtering and no mipmaps for the chunky early-2000s look.

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Per-pixel painter: fn(x, y) -> [r, g, b, a?]
function paint(w, h, fn) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x, y);
      const i = (y * w + x) * 4;
      img.data[i] = p[0];
      img.data[i + 1] = p[1];
      img.data[i + 2] = p[2];
      img.data[i + 3] = p.length > 3 ? p[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (base, k) => base.map((v) => clamp255(v * k));

// Rows of blocks with mortar. Tiles seamlessly (each row's widths sum to w).
function blocks(w, h, rowH, minW, maxW, base, seed, { vary = 0.14, noise = 0.1, mortar = 0.5 } = {}) {
  const r = rng(seed);
  const rows = [];
  for (let y = 0; y < h; y += rowH) {
    const cuts = [0];
    while (true) {
      const next = cuts[cuts.length - 1] + minW + Math.floor(r() * (maxW - minW));
      if (next > w - minW / 2) break;
      cuts.push(next);
    }
    rows.push({ y, cuts, offset: Math.floor(r() * w), tones: cuts.map(() => 1 + (r() - 0.5) * 2 * vary) });
  }
  const pr = rng(seed + 99);
  return paint(w, h, (x, y) => {
    const row = rows[Math.floor(y / rowH)];
    const ly = y - row.y;
    const xx = (x + row.offset) % w;
    let bi = 0;
    for (let i = 0; i < row.cuts.length; i++) if (xx >= row.cuts[i]) bi = i;
    let k = row.tones[bi] * (1 + (pr() - 0.5) * 2 * noise);
    if (xx === row.cuts[bi] || ly === rowH - 1) k *= mortar;
    else if (ly === 0) k *= 1.12; // top-edge highlight
    return shade(base, k);
  });
}

const cache = {};
function cached(key, make) {
  return cache[key] || (cache[key] = make());
}

export const tex = {
  stoneWall: () => cached('stoneWall', () => toTexture(blocks(64, 64, 16, 18, 34, [122, 112, 96], 11))),
  darkStone: () => cached('darkStone', () => toTexture(blocks(64, 64, 16, 14, 28, [86, 84, 86], 23, { vary: 0.18 }))),
  column: () =>
    cached('column', () => {
      const r = rng(5);
      return toTexture(paint(32, 64, (x, y) => {
        const band = y % 32 === 31 ? 0.6 : 1;
        return shade([128, 118, 100], band * (0.9 + r() * 0.2) * (0.92 + 0.08 * Math.sin(x * 0.4)));
      }));
    }),
  flagstone: () =>
    cached('flagstone', () => {
      // Irregular slabs: 3 rows of different heights, staggered joints.
      const r = rng(7);
      const rowsY = [0, 22, 42, 64];
      const slabs = rowsY.slice(0, 3).map(() => {
        const cuts = [0];
        while (cuts[cuts.length - 1] < 64) cuts.push(cuts[cuts.length - 1] + 18 + Math.floor(r() * 16));
        return { cuts, tones: cuts.map(() => 0.82 + r() * 0.3), off: Math.floor(r() * 64) };
      });
      const g = rng(8);
      return toTexture(paint(64, 64, (x, y) => {
        const ri = y < 22 ? 0 : y < 42 ? 1 : 2;
        const row = slabs[ri];
        const xx = (x + row.off) % 64;
        let bi = 0;
        for (let i = 0; i < row.cuts.length; i++) if (xx >= row.cuts[i]) bi = i;
        const edge = row.cuts.includes(xx) || y === rowsY[ri];
        const k = (edge ? 0.45 : row.tones[bi]) * (0.88 + g() * 0.24);
        return shade([104, 100, 92], k);
      }));
    }),
  slate: () =>
    cached('slate', () => {
      const r = rng(13);
      const tones = Array.from({ length: 64 }, () => 0.8 + r() * 0.35);
      return toTexture(paint(64, 64, (x, y) => {
        const row = Math.floor(y / 8);
        const xx = x + (row % 2) * 4;
        const col = Math.floor(xx / 8);
        const ly = y % 8;
        let k = tones[(row * 9 + col) % 64] * (0.92 + r() * 0.16);
        if (ly === 7 || xx % 8 === 0) k *= 0.45;
        else if (ly === 0) k *= 1.1;
        return shade([72, 76, 92], k);
      }));
    }),
  wood: () =>
    cached('wood', () => {
      const r = rng(17);
      const plankTone = Array.from({ length: 8 }, () => 0.8 + r() * 0.35);
      return toTexture(paint(64, 64, (x, y) => {
        const p = Math.floor(x / 8);
        let k = plankTone[p] * (0.85 + 0.15 * Math.sin(y * 0.35 + p * 3)) * (0.9 + r() * 0.2);
        if (x % 8 === 0) k *= 0.4;
        return shade([84, 60, 40], k);
      }));
    }),
  grass: () =>
    cached('grass', () => {
      const r = rng(19);
      return toTexture(paint(64, 64, (x, y) => {
        const n = r();
        const k = n > 0.92 ? 1.6 : n < 0.1 ? 0.55 : 0.85 + n * 0.3;
        return shade([30, 44, 28], k);
      }));
    }),
  soil: () =>
    cached('soil', () => {
      const r = rng(21);
      return toTexture(paint(32, 32, () => shade([38, 34, 28], 0.7 + r() * 0.6)));
    }),
  robe: () =>
    cached('robe', () => {
      const r = rng(29);
      const streak = Array.from({ length: 32 }, () => 0.8 + r() * 0.4);
      return toTexture(paint(32, 32, (x) => shade([17, 16, 19], streak[x] * (0.9 + r() * 0.2))));
    }),
  rope: () => cached('rope', () => toTexture(paint(8, 8, (x, y) => shade([92, 80, 60], (x + y) % 3 === 0 ? 0.6 : 1)))),
  statue: () =>
    cached('statue', () => {
      const r = rng(31);
      return toTexture(paint(32, 32, (x, y) => {
        const streak = Math.sin(x * 1.3 + Math.floor(y / 6)) > 0.7 ? 0.75 : 1;
        return shade([150, 132, 100], streak * (0.82 + r() * 0.3));
      }));
    }),
  sky: () =>
    cached('sky', () => {
      const w = 256;
      const h = 128;
      const c = makeCanvas(w, h);
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#04050d');
      grad.addColorStop(0.35, '#0a0e22');
      grad.addColorStop(0.5, '#141a38');
      grad.addColorStop(1, '#0a0d1e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Soft cloud banks (wrap horizontally by drawing twice).
      const r = rng(37);
      for (let i = 0; i < 70; i++) {
        const x = r() * w;
        const y = 18 + r() * 44;
        const rad = 6 + r() * 18;
        for (const ox of [-w, 0, w]) {
          const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, rad);
          g.addColorStop(0, `rgba(58,68,110,${0.18 + r() * 0.16})`);
          g.addColorStop(1, 'rgba(48,58,96,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - rad, y - rad, rad * 2, rad * 2);
        }
      }
      // A few stars high up.
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(200,210,255,${0.3 + r() * 0.5})`;
        ctx.fillRect(Math.floor(r() * w), Math.floor(r() * 30), 1, 1);
      }
      const t = toTexture(c);
      t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    }),
  moon: () =>
    cached('moon', () => {
      const s = 64;
      const r = rng(41);
      const craters = Array.from({ length: 14 }, () => [r() * s, r() * s, 2 + r() * 7, 0.72 + r() * 0.15]);
      return toTexture(
        paint(s, s, (x, y) => {
          const dx = x + 0.5 - s / 2;
          const dy = y + 0.5 - s / 2;
          const d = Math.sqrt(dx * dx + dy * dy) / (s / 2 - 1);
          if (d > 1) return [0, 0, 0, 0];
          let k = 1 - 0.12 * d * d;
          for (const [cx, cy, cr, ck] of craters) if ((x - cx) ** 2 + (y - cy) ** 2 < cr * cr) k *= ck;
          k *= 0.94 + r() * 0.08;
          return [clamp255(235 * k), clamp255(236 * k), clamp255(232 * k), 255];
        }),
        { repeat: false },
      );
    }),
  halo: () =>
    cached('halo', () => {
      const s = 32;
      return toTexture(
        paint(s, s, (x, y) => {
          const d = Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2) / (s / 2);
          const a = Math.max(0, 1 - d) ** 2;
          return [150, 170, 230, clamp255(a * 255)];
        }),
        { repeat: false },
      );
    }),
  flower: (petal) =>
    cached('flower' + petal, () => {
      // 16×32 sprite: dark stems + leaves, bright bell clusters at the top.
      const r = rng(petal === 'white' ? 43 : 47);
      const col = petal === 'white' ? [236, 240, 255] : [120, 140, 255];
      const c = makeCanvas(16, 32);
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgb(22,40,26)';
      for (const sx of [4, 8, 11]) ctx.fillRect(sx, 10 + Math.floor(r() * 4), 1, 22);
      ctx.fillStyle = 'rgb(30,52,32)';
      for (let i = 0; i < 6; i++) ctx.fillRect(2 + Math.floor(r() * 12), 18 + Math.floor(r() * 12), 2, 3);
      for (let i = 0; i < 7; i++) {
        const k = 0.8 + r() * 0.25;
        ctx.fillStyle = `rgb(${col.map((v) => clamp255(v * k)).join(',')})`;
        const x = 2 + Math.floor(r() * 12);
        const y = 2 + Math.floor(r() * 14);
        ctx.fillRect(x, y, 2, 2);
      }
      return toTexture(c, { repeat: false });
    }),
  bush: () =>
    cached('bush', () => {
      const r = rng(53);
      return toTexture(
        paint(32, 32, (x, y) => {
          const dx = (x - 16) / 16;
          const dy = (y - 20) / 14;
          const inside = dx * dx + dy * dy < 1 - r() * 0.35;
          if (!inside || y > 31) return [0, 0, 0, 0];
          return shade([34, 56, 34], 0.6 + r() * 0.7).concat(255);
        }),
        { repeat: false },
      );
    }),
  flame: () =>
    cached('flame', () => {
      return toTexture(
        paint(8, 16, (x, y) => {
          const cx = 3.5;
          const w = Math.max(0, 3.6 * Math.sin((Math.PI * (16 - y)) / 18));
          const d = Math.abs(x - cx);
          if (d > w) return [0, 0, 0, 0];
          const hot = 1 - d / (w + 0.01);
          return y > 9 && hot > 0.5 ? [255, 236, 160, 255] : hot > 0.4 ? [255, 170, 60, 255] : [220, 90, 30, 255];
        }),
        { repeat: false },
      );
    }),
  lanternPane: () =>
    cached('lanternPane', () =>
      toTexture(
        paint(8, 12, (x, y) => {
          if (x === 0 || x === 7 || y === 0 || y === 11 || y === 6) return [30, 26, 22, 255];
          const k = 1 - Math.abs(y - 6) / 8;
          return [255, clamp255(170 + 70 * k), clamp255(70 + 60 * k), 255];
        }),
        { repeat: false },
      ),
    ),
  windowDark: () =>
    cached('windowDark', () => {
      const r = rng(59);
      return toTexture(paint(8, 16, (x, y) => (x === 0 || x === 7 || y === 0 ? [40, 38, 44, 255] : shade([20, 22, 34], 0.7 + r() * 0.6).concat(255))), { repeat: false });
    }),
};

// Scale UVs of an axis-aligned BoxGeometry so textures tile in world units.
// `tile` = metres covered by one texture repeat.
export function worldBoxUV(geo, w, h, d, tile = 2) {
  const uv = geo.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z (4 verts each).
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// Scale all UVs (for ExtrudeGeometry / plane geometry whose UVs are in metres).
export function scaleUV(geo, s) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
  return geo;
}
