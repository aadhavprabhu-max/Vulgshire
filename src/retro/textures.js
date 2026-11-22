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

// Floors only: the same chunky texels up close (nearest magnification), but with
// nearest-picked mip levels far away so cobbles and flagstones stop sparkling
// ("crawling") when the camera moves. Walls and everything else keep no mipmaps.
const floorCache = new Map();
export function floorTex(t) {
  if (!floorCache.has(t.uuid)) {
    const c = t.clone();
    c.minFilter = THREE.NearestMipmapNearestFilter;
    c.generateMipmaps = true;
    c.needsUpdate = true;
    floorCache.set(t.uuid, c);
  }
  return floorCache.get(t.uuid);
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
      const S = 128;
      const tones = Array.from({ length: 256 }, () => 0.75 + r() * 0.4);
      const lichen = Array.from({ length: 7 }, () => [r() * S, r() * S, 3 + r() * 7]);
      return toTexture(paint(S, S, (x, y) => {
        const row = Math.floor(y / 16);
        const xx = (x + (row % 2) * 10) % S;
        const col = Math.floor(xx / 20);
        const ly = y % 16;
        let k = tones[(row * 11 + col) % 256] * (0.92 + r() * 0.14);
        if (ly >= 14 || xx % 20 === 0) k *= 0.45;
        else if (ly === 0) k *= 1.12;
        let base = [72, 76, 92];
        for (const [lx, lyy, lr] of lichen) if (Math.hypot(((x - lx + S * 1.5) % S) - S / 2, ((y - lyy + S * 1.5) % S) - S / 2) < lr) base = [96, 104, 70];
        return shade(base, k);
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
  // Night sky as an equirectangular background (no dome geometry, so no edges):
  // near-black zenith, stars, and a glow at the horizon that matches the fog colour.
  nightSky: (horizonHex = 0x0c1228) =>
    cached('nightSky' + horizonHex, () => {
      // Big enough that one texel is about one screen pixel at 640x360, so stars
      // stay crisp points instead of blocky flakes.
      const w = 2048;
      const h = 1024;
      const r = rng(211);
      const hz = `rgb(${(horizonHex >> 16) & 255},${(horizonHex >> 8) & 255},${horizonHex & 255})`;
      const c = makeCanvas(w, h);
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, h / 2);
      g.addColorStop(0, '#010103');
      g.addColorStop(0.55, '#020308');
      g.addColorStop(0.85, hz);
      g.addColorStop(1, hz);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = hz;
      ctx.fillRect(0, h / 2, w, h / 2);
      // Stars: mostly faint single points, a few brighter ones, fading toward the horizon.
      for (let i = 0; i < 2600; i++) {
        const y = Math.pow(r(), 1.4) * h * 0.44;
        const x = r() * w;
        const fade = 1 - y / (h * 0.46);
        const b = (0.4 + r() * 0.6) * fade;
        const big = r() < 0.03;
        ctx.fillStyle = `rgba(${210 + r() * 40},${215 + r() * 30},255,${Math.min(1, b * (big ? 1.6 : 1))})`;
        ctx.fillRect(Math.floor(x), Math.floor(y), big ? 2 : 1, big ? 2 : 1);
      }
      const tx = toTexture(c);
      tx.mapping = THREE.EquirectangularReflectionMapping;
      tx.wrapT = THREE.ClampToEdgeWrapping;
      return tx;
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
      return toTexture(paint(8, 16, (x, y) => (x === 0 || x === 7 || x === 4 ? [28, 27, 32, 255] : shade([14, 16, 26], 0.7 + r() * 0.6).concat(255))), { repeat: false });
    }),
  // Half-timbered plaster for town houses (2 m tile).
  // Half-timbered wall, one storey (3 m) per repeat, 128 px. Three framing patterns:
  // 0 = posts + rails + long braces, 1 = St Andrew's crosses, 2 = curved K-braces.
  plaster: (variant = 0) =>
    cached('plaster' + variant, () => {
      const r = rng(61 + variant);
      const S = 128;
      const beam = [62, 44, 30];
      const fill = [[214, 206, 190], [204, 200, 194], [218, 204, 184]][variant % 3];
      const grain = Array.from({ length: S }, () => 0.85 + r() * 0.3);
      const patches = [[20 + r() * 30, 95 + r() * 20, 5 + r() * 4]];
      const B = 5; // beam width in px
      const isBeam = (x, y) => {
        const px = x % 64;
        if (px < B) return true; // posts every 1.5 m
        if (y < B || y > S - B - 1) return true; // top plate, sill beam
        if (Math.abs(y - 86) < B / 2 + 0.5) return true; // window-sill rail
        if (Math.abs(y - 38) < B / 2 + 0.5) return true; // window-head rail
        const u = (px - B) / (64 - B); // 0..1 across the panel
        if (variant === 0 && y > 86 && Math.abs((y - 86) / (S - B - 86) - (x % 128 < 64 ? u : 1 - u)) < 0.13) return true;
        if (variant === 1 && y > 86) {
          const v = (y - 86) / (S - B - 86);
          if (Math.abs(v - u) < 0.12 || Math.abs(v - (1 - u)) < 0.12) return true;
        }
        if (variant === 2 && y < 38 && y > B) {
          const v = (y - B) / (38 - B);
          const c = Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
          if (Math.abs(v - c) < 0.14 && u < 0.6) return true;
        }
        return false;
      };
      return toTexture(paint(S, S, (x, y) => {
        if (isBeam(x, y)) {
          const k = grain[(x + y * 3) % S] * (x % 64 < B ? grain[y] : grain[x]) * 0.92;
          return shade(beam, k * (0.9 + r() * 0.12));
        }
        let k = 0.9 + r() * 0.12;
        for (const [px, py, pr] of patches) {
          const d = Math.hypot(x - px, y - py);
          if (d < pr) {
            // Plaster fallen away: a few bricks of the infill show through.
            const brick = (y % 6 === 0 || (x + (Math.floor(y / 6) % 2) * 4) % 8 === 0) ? 0.55 : 1;
            return shade([170, 130, 104], brick * (0.88 + r() * 0.15));
          }
          if (d < pr + 1.5) k *= 0.8;
        }
        if (y > S - 20) k *= 0.86; // damp near the sill beam
        return shade(fill, k);
      }));
    }),
  // Curved clay roof tiles with moss, 128 px per 2 m.
  roofTile: () =>
    cached('roofTile', () => {
      const r = rng(67);
      const S = 128;
      const tones = Array.from({ length: 256 }, () => [0.72 + r() * 0.45, r() < 0.15 ? 1 : 0]);
      const moss = Array.from({ length: 9 }, () => [r() * S, r() * S, 4 + r() * 10]);
      return toTexture(paint(S, S, (x, y) => {
        const row = Math.floor(y / 10);
        const xx = (x + (row % 2) * 5) % S;
        const col = Math.floor(xx / 10);
        const ly = y % 10;
        const lx = xx % 10;
        const [tone, dark] = tones[(row * 13 + col) % 256];
        // Barrel shape: bright crown, dark edges; shadow under the next row.
        let k = tone * (0.7 + 0.45 * Math.sin((lx / 10) * Math.PI));
        if (ly > 7) k *= 0.55;
        if (ly === 0) k *= 1.15;
        let base = dark ? [80, 44, 36] : [128, 66, 48];
        for (const [mx, my, mr] of moss) {
          const d = Math.hypot(((x - mx + S * 1.5) % S) - S / 2, ((y - my + S * 1.5) % S) - S / 2);
          if (d < mr * (0.6 + r() * 0.5)) base = [70, 84, 44];
        }
        return shade(base, k * (0.92 + r() * 0.12));
      }));
    }),
  cobble: () =>
    cached('cobble', () => {
      const r = rng(71);
      // Jittered grid of rounded stones.
      const cells = 8;
      const pts = [];
      for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.2 + r() * 0.6) * 8, (j + 0.2 + r() * 0.6) * 8, 0.75 + r() * 0.4]);
      return toTexture(paint(64, 64, (x, y) => {
        let d1 = 1e9;
        let d2 = 1e9;
        let k = 1;
        for (const [px, py, pk] of pts) {
          for (const ox of [-64, 0, 64]) for (const oy of [-64, 0, 64]) {
            const d = (x - px - ox) ** 2 + (y - py - oy) ** 2;
            if (d < d1) {
              d2 = d1;
              d1 = d;
              k = pk;
            } else if (d < d2) d2 = d;
          }
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1) < 1.6;
        return shade([96, 88, 76], edge ? 0.4 : k * (0.9 + r() * 0.15));
      }));
    }),
  water: () =>
    cached('water', () => {
      const r = rng(73);
      return toTexture(paint(64, 64, (x, y) => {
        const ripple = Math.sin(x * 0.4 + Math.floor(y / 3) * 1.7) > 0.86 && r() > 0.3;
        return ripple ? [52, 64, 96] : shade([16, 22, 36], 0.85 + r() * 0.3);
      }));
    }),
  castleStone: () => cached('castleStone', () => toTexture(blocks(64, 64, 16, 20, 36, [74, 72, 84], 79, { vary: 0.16 }))),
  litWindow: () =>
    cached('litWindow', () =>
      toTexture(
        paint(8, 12, (x, y) => {
          if (x === 0 || x === 7 || y === 0 || y === 11 || x === 4 || y === 6) return [40, 30, 22, 255];
          return [255, 196 - y * 3, 96, 255];
        }),
        { repeat: false },
      ),
    ),
  // Stained glass lancet: coloured cells with dark lead lines.
  stainedGlass: (palette = 'purple', seed = 1) =>
    cached('glass-' + palette + seed, () => {
      const pals = {
        purple: [[120, 70, 200], [70, 80, 210], [160, 90, 220], [60, 50, 150], [200, 120, 230], [90, 140, 230]],
        warm: [[220, 70, 70], [240, 180, 60], [80, 120, 230], [140, 70, 200], [70, 180, 120], [240, 120, 40]],
      }[palette];
      const r = rng(83 + seed);
      const cw = 4;
      const ch = 6;
      const colors = Array.from({ length: 64 }, () => pals[Math.floor(r() * pals.length)]);
      return toTexture(
        paint(16, 48, (x, y) => {
          if (x % cw === 0 || y % ch === 0 || x === 15) return [24, 20, 30, 255];
          const c = colors[(Math.floor(y / ch) * 4 + Math.floor(x / cw)) % 64];
          return shade(c, 0.85 + r() * 0.25).concat(255);
        }),
        { repeat: false },
      );
    }),
  rose: (palette = 'purple') =>
    cached('rose-' + palette, () => {
      const pals = {
        purple: [[120, 80, 220], [70, 90, 220], [170, 110, 240], [60, 60, 170], [220, 180, 255]],
        warm: [[230, 70, 80], [250, 190, 60], [70, 120, 240], [150, 70, 210], [80, 200, 130], [250, 130, 50]],
      }[palette];
      const r = rng(89);
      const s = 64;
      return toTexture(
        paint(s, s, (x, y) => {
          const dx = x + 0.5 - s / 2;
          const dy = y + 0.5 - s / 2;
          const d = Math.hypot(dx, dy) / (s / 2);
          if (d > 1) return [0, 0, 0, 0];
          if (d > 0.93) return [40, 36, 44, 255];
          const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
          const ring = Math.floor(d * 4);
          const petal = Math.floor(a * (ring < 1 ? 6 : 12 + ring * 4));
          const lead = Math.abs(d * 4 - Math.round(d * 4)) < 0.08 || Math.abs(a * (ring < 1 ? 6 : 12 + ring * 4) - Math.round(a * (ring < 1 ? 6 : 12 + ring * 4))) < 0.12;
          if (lead) return [26, 22, 32, 255];
          const c = pals[(petal * 3 + ring * 2) % pals.length];
          return shade(c, 0.85 + r() * 0.25).concat(255);
        }),
        { repeat: false },
      );
    }),
  banner: () =>
    cached('banner', () =>
      toTexture(
        paint(16, 40, (x, y) => {
          // Pointed bottom.
          if (y > 32 && Math.abs(x - 7.5) > 40 - y) return [0, 0, 0, 0];
          if (x < 1 || x > 14) return [70, 18, 18, 255];
          const cx = x - 7.5;
          const cy = ((y + 2) % 12) - 6;
          const dd = Math.abs(cx) + Math.abs(cy);
          if (Math.abs(dd - 5) < 0.8) return [200, 150, 70, 255];
          if (dd < 2) return [190, 130, 60, 255];
          return [130, 28, 26, 255];
        }),
        { repeat: false },
      ),
    ),
  smoke: (seed = 0) =>
    cached('smoke' + seed, () => {
      const r = rng(97 + seed);
      return toTexture(
        paint(12, 12, (x, y) => {
          const d = Math.hypot(x - 5.5, y - 5.5) / 6;
          if (d + r() * 0.45 > 1.05) return [0, 0, 0, 0];
          const k = 0.86 + r() * 0.14;
          return [clamp255(235 * k), clamp255(232 * k), clamp255(238 * k), 255];
        }),
        { repeat: false },
      );
    }),
  tileFloor: () =>
    cached('tileFloor', () => {
      const r = rng(101);
      const tones = Array.from({ length: 64 }, () => 0.75 + r() * 0.4);
      return toTexture(paint(64, 64, (x, y) => {
        const i = Math.floor(x / 16);
        const j = Math.floor(y / 16);
        let k = tones[j * 4 + i] * (0.85 + r() * 0.3);
        if (x % 16 === 0 || y % 16 === 0) k *= 0.55;
        const base = (i + j) % 2 ? [120, 104, 104] : [92, 86, 92];
        return shade(base, k);
      }));
    }),
  robeStripe: () =>
    cached('robeStripe', () => {
      const r = rng(103);
      return toTexture(paint(32, 32, (x) => shade(x % 8 < 3 ? [70, 84, 44] : [44, 54, 30], 0.85 + r() * 0.3)));
    }),
  armor: () =>
    cached('armor', () => {
      const r = rng(107);
      return toTexture(paint(16, 16, (x, y) => (x % 8 === 4 && y % 8 === 4 ? [120, 116, 110] : shade([46, 46, 52], 0.8 + r() * 0.4))));
    }),
  // Neutral lime plaster (tinted per building), 128 px per 2 m: rain streaks,
  // hairline cracks and patches where the plaster has fallen off the stone.
  plasterPlain: () =>
    cached('plasterPlain', () => {
      const r = rng(113);
      const S = 128;
      const streak = Array.from({ length: S }, () => (r() < 0.18 ? 0.86 + r() * 0.08 : 1));
      const patches = [[r() * S, 70 + r() * 50, 9 + r() * 6]]; // one ragged patch per 3 m tile
      const cracks = new Set();
      for (let c = 0; c < 6; c++) {
        let x = r() * S;
        let y = r() * S;
        for (let i = 0; i < 40; i++) {
          cracks.add((Math.floor(y + S) % S) * S + (Math.floor(x + S) % S));
          x += (r() - 0.5) * 2.2;
          y += 0.6 + r() * 0.8;
        }
      }
      return toTexture(paint(S, S, (x, y) => {
        for (const [px, py, pr] of patches) {
          const dx = ((x - px + S * 1.5) % S) - S / 2;
          const dy = ((y - py + S * 1.5) % S) - S / 2;
          const ragged = pr * (0.75 + 0.35 * Math.sin(Math.atan2(dy, dx) * 5 + px) * Math.sin(Math.atan2(dy, dx) * 3));
          const d = Math.hypot(dx * 0.7, dy);
          if (d < ragged) {
            const row = Math.floor((y + 64) / 7);
            const mortar = (y + 64) % 7 === 0 || (x + row * 5) % 11 === 0;
            return shade([168, 156, 138], (mortar ? 0.7 : 1) * (0.88 + r() * 0.18));
          }
          if (d < ragged + 1.2) return shade([176, 170, 158], 0.92);
        }
        let k = (0.9 + r() * 0.1) * streak[x];
        if (cracks.has(y * S + x)) k *= 0.62;
        return shade([212, 206, 194], k);
      }));
    }),
  // Rough ashlar for tower houses, quoins and stone ground floors.
  townStone: () => cached('townStone', () => toTexture(blocks(128, 128, 16, 20, 40, [124, 116, 104], 191, { vary: 0.2, noise: 0.12, mortar: 0.5 }))),
  flowerBox: () =>
    cached('flowerBox', () => {
      const r = rng(193);
      const cols = [[220, 60, 70], [240, 200, 80], [200, 120, 220], [250, 250, 240]];
      return toTexture(
        paint(16, 8, () => (r() < 0.35 ? cols[Math.floor(r() * cols.length)] : shade([44, 80, 40], 0.7 + r() * 0.6))),
        { repeat: true },
      );
    }),
  awning: () =>
    cached('awning', () => toTexture(paint(16, 16, (x, y) => shade(x % 8 < 4 ? [232, 228, 220] : [150, 146, 140], y === 15 ? 0.6 : 1)))),
  door: () =>
    cached('door', () => {
      const r = rng(127);
      return toTexture(
        paint(8, 16, (x, y) => {
          if (x === 0 || x === 7 || y === 0) return [30, 24, 20, 255];
          if (y === 5 || y === 11) return [40, 36, 34, 255]; // iron bands
          return shade([78, 54, 36], (x % 2 ? 0.85 : 1) * (0.9 + r() * 0.2)).concat(255);
        }),
        { repeat: false },
      );
    }),
  // ---- Crownkeep interior (128 px, more detail) ----------------------------
  // Polished veined marble slabs. variant 0 = near-black, 1 = grey-violet, 2 = oxblood (balustrades).
  marble: (variant = 0) =>
    cached('marble' + variant, () => {
      const r = rng(131 + variant);
      const base = [[44, 40, 50], [96, 92, 104], [86, 34, 36]][variant];
      const vein = [[118, 112, 126], [170, 166, 176], [170, 120, 110]][variant];
      const ph = r() * 10;
      return toTexture(paint(128, 128, (x, y) => {
        const n = Math.sin(x * 0.06 + 2.6 * Math.sin(y * 0.045 + ph) + 1.7 * Math.sin((x + y) * 0.021 + ph * 2));
        const v = Math.max(0, 1 - Math.abs(n) / 0.07);
        const n2 = Math.sin(y * 0.09 + 3 * Math.sin(x * 0.03 + ph * 3));
        const v2 = Math.max(0, 1 - Math.abs(n2) / 0.04) * 0.5;
        const k = 0.9 + r() * 0.14;
        const t = Math.min(1, v + v2);
        let c = base.map((b, i) => (b + (vein[i] - b) * t) * k);
        if (x % 64 === 0 || y % 64 === 0) c = c.map((q) => q * 0.55); // slab joints
        else if (x % 64 === 1 || y % 64 === 1) c = c.map((q) => q * 1.12); // bevel highlight
        return c.map(clamp255);
      }));
    }),
  // Two-tone marble floor (dark / grey checker, 1 m tiles at 2 m per repeat).
  marbleFloor: () =>
    cached('marbleFloor', () => {
      const r = rng(137);
      const ph = 3.3;
      return toTexture(paint(128, 128, (x, y) => {
        const dark = (Math.floor(x / 64) + Math.floor(y / 64)) % 2 === 0;
        const base = dark ? [34, 32, 40] : [74, 70, 80];
        const vein = dark ? [74, 70, 84] : [116, 112, 124];
        const n = Math.sin(x * 0.07 + 2.2 * Math.sin(y * 0.05 + ph) + (dark ? 4 : 0));
        const t = Math.max(0, 1 - Math.abs(n) / 0.06);
        let c = base.map((b, i) => (b + (vein[i] - b) * t) * (0.9 + r() * 0.14));
        if (x % 64 === 0 || y % 64 === 0) c = c.map((q) => q * 0.5);
        return c.map(clamp255);
      }));
    }),
  // Circular inlaid floor medallion: knotwork bands, a stepped meander and an 8-point star.
  medallion: () =>
    cached('medallion', () => {
      const S = 128;
      const r = rng(139);
      const dark = [52, 42, 38];
      const light = [138, 116, 92];
      const lead = [24, 20, 20];
      return toTexture(
        paint(S, S, (x, y) => {
          const dx = x + 0.5 - S / 2;
          const dy = y + 0.5 - S / 2;
          const d = Math.hypot(dx, dy) / (S / 2);
          const a = Math.atan2(dy, dx);
          if (d > 1) return [0, 0, 0, 0];
          const k = 0.88 + r() * 0.16;
          const sh = (c) => c.map((q) => clamp255(q * k)).concat(255);
          if (d > 0.96) return sh(lead);
          if (d > 0.8) {
            // Knot band: two interleaved sine strands.
            const u = a * 12;
            const w = (d - 0.88) / 0.07;
            const s1 = Math.abs(w - Math.sin(u)) < 0.35;
            const s2 = Math.abs(w + Math.sin(u)) < 0.35;
            if (s1 || s2) return sh(light);
            return sh(dark);
          }
          if (d > 0.77) return sh(lead);
          if (d > 0.55) {
            // Stepped meander (Greek-key-ish) band.
            const u = ((a / (Math.PI * 2)) * 40 + 40) % 1;
            const w = (d - 0.55) / 0.22;
            const on = (u < 0.5 && w < 0.7 && w > 0.2) || (u >= 0.5 && (w > 0.7 || w < 0.3));
            return sh(on ? light : dark);
          }
          if (d > 0.52) return sh(lead);
          // 8-point star on dark ground.
          const ang = Math.abs(((a / (Math.PI * 2)) * 8 + 8) % 1 - 0.5) * 2; // 0 at point, 1 between
          const star = d < 0.48 * (0.45 + 0.55 * (1 - ang));
          if (d < 0.08) return sh(lead);
          return sh(star ? light : dark);
        }),
        { repeat: false },
      );
    }),
  velvet: () =>
    cached('velvet', () => {
      const r = rng(149);
      return toTexture(paint(32, 64, (x, y) => {
        const fold = 0.72 + 0.28 * Math.sin(x * 0.8) ** 2;
        const hem = y > 58 ? 1.6 : 1;
        return shade(y > 58 ? [150, 110, 50] : [112, 18, 24], (fold * (0.92 + r() * 0.12)) / (y > 58 ? hem : 1));
      }));
    }),
  books: () =>
    cached('books', () => {
      const r = rng(151);
      const cols = [[96, 30, 28], [40, 62, 44], [70, 52, 34], [34, 40, 72], [110, 84, 46], [60, 30, 50], [90, 86, 70]];
      const rows = [];
      for (let row = 0; row < 4; row++) {
        const spines = [];
        let x = 0;
        while (x < 64) {
          const w = 2 + Math.floor(r() * 3);
          spines.push({ x, w, c: cols[Math.floor(r() * cols.length)], h: 9 + Math.floor(r() * 5), lean: r() < 0.06 });
          x += w;
        }
        rows.push(spines);
      }
      return toTexture(paint(64, 64, (x, y) => {
        const row = Math.floor(y / 16);
        const ly = y % 16;
        if (ly >= 14) return shade([58, 40, 26], 1 + (ly === 14 ? 0.2 : 0)); // shelf board
        const sp = rows[row].find((s) => x >= s.x && x < s.x + s.w);
        if (!sp || 14 - ly > sp.h) return [16, 12, 10]; // dark back of the shelf
        let k = x === sp.x ? 0.6 : 1;
        if (ly === 14 - sp.h + 2 || ly === 11) k *= 1.35; // gilt bands
        return shade(sp.c, k * (0.9 + r() * 0.15));
      }));
    }),
  brickWarm: () => cached('brickWarm', () => toTexture(blocks(64, 64, 8, 12, 18, [150, 104, 72], 157, { vary: 0.2, mortar: 0.55 }))),
  hallStone: () => cached('hallStone', () => toTexture(blocks(128, 128, 16, 22, 46, [86, 86, 98], 163, { vary: 0.18, noise: 0.12, mortar: 0.45 }))),
  globe: () =>
    cached('globe', () => {
      const r = rng(167);
      return toTexture(paint(64, 32, (x, y) => {
        const land = Math.sin(x * 0.3) * Math.sin(y * 0.45 + 1) + Math.sin(x * 0.11 + y * 0.2) > 0.6;
        if (x % 8 === 0 || y % 8 === 0) return [70, 50, 30];
        return shade(land ? [150, 120, 70] : [70, 84, 80], 0.85 + r() * 0.2);
      }));
    }),
  // Neutral woven cloth (tinted per character through the material colour).
  cloth: () =>
    cached('cloth', () => {
      const r = rng(173);
      return toTexture(paint(32, 32, (x, y) => {
        const weave = (x + y) % 2 ? 0.94 : 1.04;
        const fold = 0.86 + 0.14 * Math.sin(x * 0.55) ** 2;
        return shade([200, 198, 194], weave * fold * (0.9 + r() * 0.12));
      }));
    }),
  // Noble damask: a repeating lozenge pattern, also tinted.
  damask: () =>
    cached('damask', () => {
      const r = rng(179);
      return toTexture(paint(32, 32, (x, y) => {
        const cx = (x % 16) - 7.5;
        const cy = (y % 16) - 7.5;
        const d = Math.abs(cx) + Math.abs(cy);
        const on = d < 5 && d > 2.5;
        const fold = 0.86 + 0.14 * Math.sin(x * 0.4) ** 2;
        return shade(on ? [236, 228, 210] : [170, 166, 162], fold * (0.92 + r() * 0.1));
      }));
    }),
  // Light shaft: bright core fading to the edges and toward the floor end.
  shaft: () =>
    cached('shaft', () =>
      toTexture(
        paint(8, 32, (x, y) => {
          const across = 1 - Math.abs(x - 3.5) / 4;
          const along = 0.35 + 0.65 * (y / 31);
          const k = Math.max(0, across) * along;
          return [clamp255(255 * k), clamp255(255 * k), clamp255(255 * k), 255];
        }),
        { repeat: false },
      ),
    ),
  mist: () =>
    cached('mist', () => {
      const s = 64;
      const c = makeCanvas(s, s);
      const ctx = c.getContext('2d');
      const r = rng(109);
      for (let i = 0; i < 40; i++) {
        const x = r() * s;
        const y = r() * s;
        const rad = 6 + r() * 14;
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          g.addColorStop(0, `rgba(255,255,255,${0.25 + r() * 0.2})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
        }
      }
      return toTexture(c);
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
