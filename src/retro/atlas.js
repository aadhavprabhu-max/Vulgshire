import * as THREE from 'three';
import { applySnap } from './retroMaterial.js';

// Texture atlas for merged buildings: many small tiling textures packed into one
// canvas, so a whole chunk of houses can share one material (one draw call).
// Tiling still works: each vertex carries its texture's rectangle in the atlas
// (`tile` = u0, v0, du, dv) and the shader wraps the UV inside it with fract().
// Nearest filtering and no mipmaps keep it pixel-exact with no bleeding.

/** Pack textures (each with a canvas .image) into one atlas. */
export function packAtlas(textures, width = 512) {
  const uniq = [...new Set(textures)];
  const items = uniq.map((t) => ({ t, w: t.image.width, h: t.image.height })).sort((a, b) => b.h - a.h);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const it of items) {
    if (x + it.w > width) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    it.x = x;
    it.y = y;
    x += it.w;
    rowH = Math.max(rowH, it.h);
  }
  let height = 1;
  while (height < y + rowH) height *= 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rects = new Map();
  for (const it of items) {
    ctx.drawImage(it.t.image, it.x, it.y);
    // CanvasTexture uses flipY, so v = 0 is the bottom of the canvas.
    rects.set(it.t, [it.x / width, 1 - (it.y + it.h) / height, it.w / width, it.h / height]);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, rect: (t) => rects.get(t) };
}

/** A Lambert material that samples a packed atlas through the per-vertex `tile` rect. */
export function atlasMaterial(texture, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, ...opts });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 tile;\nvarying vec4 vTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTile = tile;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTile;')
      // (chunks are still #include lines here, so replace the whole map chunk)
      .replace('#include <map_fragment>', 'diffuseColor *= texture2D( map, vTile.xy + fract( vMapUv ) * vTile.zw );');
    applySnap(shader);
  };
  m.customProgramCacheKey = () => 'atlas-tile';
  m.userData.retroPatched = true; // already includes the vertex snap
  return m;
}

/** Give a geometry a constant per-vertex `tile` rect (and white colour if it has none). */
export function setTile(geo, rect) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set(rect, i * 4);
  geo.setAttribute('tile', new THREE.BufferAttribute(a, 4));
  if (!geo.attributes.color) {
    const c = new Float32Array(n * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return geo;
}
