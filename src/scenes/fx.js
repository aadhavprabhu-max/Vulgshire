import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// Pixel-style effects: blocky smoke columns, rising embers, roof fires.

// A column of chunky white smoke puffs rising from a point (like reference 03).
export function smokeColumn({ x, y, z, height = 14, puffs = 14, size = 1.2, sway = 1.2, speed = 1.6, tint = 0xffffff }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const items = [];
  for (let i = 0; i < puffs; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.smoke(i % 4), color: tint, alphaTest: 0.5, fog: true }));
    group.add(s);
    items.push({ s, life: i / puffs, seed: Math.random() * 10 });
  }
  return {
    group,
    update(dt, t) {
      for (const p of items) {
        p.life = (p.life + (dt * speed) / height) % 1;
        const h = p.life * height;
        const sc = size * (0.7 + p.life * 1.6);
        p.s.position.set(Math.sin(h * 0.35 + p.seed + t * 0.3) * sway * p.life, h, Math.cos(h * 0.27 + p.seed) * sway * 0.4 * p.life);
        p.s.scale.set(sc, sc * 1.15, 1);
      }
    },
  };
}

// Rising ember particles: square pixel points that drift upward and respawn.
export function embers({ count = 120, area = [0, 0, 0, 10, 4, 10], rise = 10, color = 0xffa040, size = 2 }) {
  const [cx, cy, cz, sx, sy, sz] = area;
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const respawn = (i) => {
    pos[i * 3] = cx + (Math.random() - 0.5) * sx;
    pos[i * 3 + 1] = cy + Math.random() * sy;
    pos[i * 3 + 2] = cz + (Math.random() - 0.5) * sz;
    vel[i * 3] = (Math.random() - 0.5) * 0.8;
    vel[i * 3 + 1] = 1 + Math.random() * 2;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
  };
  for (let i = 0; i < count; i++) {
    respawn(i);
    pos[i * 3 + 1] += Math.random() * rise;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, fog: true }));
  points.frustumCulled = false;
  return {
    group: points,
    update(dt, t) {
      for (let i = 0; i < count; i++) {
        pos[i * 3] += (vel[i * 3] + Math.sin(t * 2 + i) * 0.4) * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] > cy + sy + rise) respawn(i);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// A cluster of big flame sprites (a burning roof), optionally with a light.
export function fireCluster({ x, y, z, spread = 3, flames = 6, size = 2.2, light = null }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const items = [];
  for (let i = 0; i < flames; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
    s.position.set((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread * 0.5);
    group.add(s);
    items.push({ s, phase: Math.random() * 10, k: 0.7 + Math.random() * 0.6 });
  }
  let pl = null;
  if (light) {
    pl = new THREE.PointLight(0xff8a30, light.intensity, light.distance, light.decay ?? 1.2);
    pl.position.set(0, size, 0);
    group.add(pl);
  }
  return {
    group,
    update(dt, t) {
      for (const it of items) {
        const f = 0.8 + 0.2 * Math.sin(t * 8 + it.phase) + 0.1 * Math.sin(t * 19 + it.phase);
        const w = size * it.k * 0.6;
        const h = size * it.k * f * 1.2;
        it.s.scale.set(w, h, 1);
        it.s.position.y = h / 2;
      }
      if (pl) pl.intensity = light.intensity * (0.85 + 0.15 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 23));
    },
  };
}
