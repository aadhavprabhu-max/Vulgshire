import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// Original low-poly townsfolk and courtiers, built from a handful of options so
// every NPC looks different. Faces -Z at rotation 0, about 1.7 m tall.
//
//   outfit: 'gown' | 'robe' | 'priest' | 'doublet' | 'servant' | 'herald'
//   hat:    'none' | 'hood' | 'cap' | 'veil' | 'chaperon' | 'beret' | 'coif'
//   carry:  null | 'tray' | 'book' | 'candle' | 'scroll' | 'basket'
//   mode:   'idle' | 'talk' | 'read' | 'pray' (what they do while standing)

const matCache = new Map();
function mat(kind, hex) {
  const key = kind + hex;
  if (!matCache.has(key)) {
    const map = kind === 'damask' ? tex.damask() : kind === 'cloth' ? tex.cloth() : null;
    matCache.set(key, new THREE.MeshLambertMaterial({ map, color: hex, flatShading: true }));
  }
  return matCache.get(key);
}

const SKIN = [0x8a6a52, 0xb08a6c, 0x6e5040, 0xc09a7c, 0x9a7458];
const HAIR = [0x2a1e16, 0x4a3420, 0x6a4a2a, 0x1a1414, 0x8a7a6a, 0xa07a40];

export const PALETTES = {
  noble: [0x7a1c22, 0x5a1830, 0x1f4a2a, 0x1f2f6a, 0x4a2460, 0x2a2228, 0x6a4a1c],
  commoner: [0x6a5038, 0x605a54, 0x5a4a3a, 0x4a5a48, 0x6a5a4a, 0x50483e],
  trim: [0xb08a40, 0xd8d0c0, 0x8a2a2a, 0x2a2a3a, 0xc0b090],
};

export function createPerson(o = {}) {
  const rnd = o.rnd || Math.random;
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const outfit = o.outfit || 'doublet';
  const main = o.main ?? pick(outfit === 'servant' ? PALETTES.commoner : PALETTES.noble);
  const trim = o.trim ?? pick(PALETTES.trim);
  const skin = mat('plain', o.skin ?? pick(SKIN));
  const hairM = mat('plain', o.hair ?? pick(HAIR));
  const fancy = outfit === 'gown' || outfit === 'robe';
  const mainM = mat(fancy ? 'damask' : 'cloth', main);
  const trimM = mat('cloth', trim);
  const darkM = mat('plain', 0x1c1816);
  const lightM = mat('cloth', 0xd8ceb8);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const lathe = (pts, segs = 8) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);

  const long = outfit === 'gown' || outfit === 'robe' || outfit === 'priest';
  let legs = null;
  let shoulderY = 1.38;

  if (long) {
    const robeM = outfit === 'priest' ? mat('cloth', 0x18161a) : mainM;
    const skirt =
      outfit === 'gown'
        ? [
            [0, 0.02],
            [0.46, 0.02],
            [0.4, 0.3],
            [0.28, 0.75],
            [0.17, 1.02],
            [0.19, 1.2],
            [0.22, 1.36],
            [0.12, 1.44],
            [0, 1.45],
          ]
        : [
            [0, 0.02],
            [0.36, 0.02],
            [0.33, 0.4],
            [0.27, 0.95],
            [0.25, 1.2],
            [0.28, 1.36],
            [0.14, 1.45],
            [0, 1.46],
          ];
    const s = add(body, lathe(skirt), robeM);
    s.scale.z = 0.85;
    if (outfit === 'gown') {
      add(body, new THREE.TorusGeometry(0.18, 0.03, 4, 10), trimM, 0, 1.02, 0).rotation.x = Math.PI / 2; // girdle
      add(body, new THREE.CylinderGeometry(0.17, 0.2, 0.06, 8), trimM, 0, 1.42, 0); // neckline
    } else if (outfit === 'robe') {
      add(body, new THREE.CylinderGeometry(0.2, 0.31, 0.16, 8), mat('cloth', o.trim ?? 0xd8d0c0), 0, 1.36, 0); // fur collar
      add(body, new THREE.BoxGeometry(0.1, 1.1, 0.04), trimM, 0, 0.75, -0.24); // front band
    } else {
      add(body, new THREE.CylinderGeometry(0.16, 0.2, 0.1, 8), lightM, 0, 1.38, 0); // white collar
      add(body, new THREE.BoxGeometry(0.12, 1.0, 0.03), mat('cloth', 0x6a1a2a), 0, 0.85, -0.25); // stole
    }
  } else {
    // Hose, shoes, doublet with a short flared skirt.
    const hoseM = mat('cloth', outfit === 'servant' ? 0x3a342e : pick([0x2a2a30, 0x3a2020, 0x202a3a, 0x30302a]));
    legs = [-1, 1].map((sd) => {
      const hip = new THREE.Group();
      hip.position.set(sd * 0.1, 0.84, 0);
      add(hip, new THREE.BoxGeometry(0.13, 0.8, 0.15), hoseM, 0, -0.4, 0);
      add(hip, new THREE.BoxGeometry(0.14, 0.08, 0.26), darkM, 0, -0.8, -0.05);
      body.add(hip);
      return hip;
    });
    add(body, new THREE.CylinderGeometry(0.2, 0.18, 0.5, 8), mainM, 0, 1.14, 0).scale.z = 0.8;
    add(body, new THREE.CylinderGeometry(0.21, 0.3, 0.28, 8), mainM, 0, 0.82, 0).scale.z = 0.85;
    add(body, new THREE.TorusGeometry(0.2, 0.025, 4, 10), darkM, 0, 0.94, 0).rotation.x = Math.PI / 2;
    if (outfit === 'servant') add(body, new THREE.PlaneGeometry(0.34, 0.6), lightM, 0, 0.75, -0.21).rotation.y = Math.PI; // apron
    if (outfit === 'herald') {
      const tab = new THREE.MeshLambertMaterial({ map: tex.banner(), alphaTest: 0.5, side: THREE.DoubleSide });
      for (const zz of [-0.2, 0.2]) add(body, new THREE.PlaneGeometry(0.36, 0.9), tab, 0, 0.95, zz).rotation.y = zz < 0 ? Math.PI : 0;
    }
    shoulderY = 1.36;
  }

  // Head, hair, hat.
  const headY = 1.58;
  add(body, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), skin, 0, headY - 0.13, 0);
  add(body, new THREE.IcosahedronGeometry(0.12, 0), skin, 0, headY, -0.01).scale.y = 1.12;
  const hat = o.hat || 'none';
  if (hat === 'none' || hat === 'cap' || hat === 'beret' || hat === 'chaperon') {
    add(body, new THREE.SphereGeometry(0.13, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), hairM, 0, headY + 0.02, 0.02);
    if (outfit === 'gown' && hat === 'none') add(body, new THREE.BoxGeometry(0.2, 0.45, 0.06), hairM, 0, headY - 0.2, 0.11); // long hair
  }
  if (hat === 'hood') {
    add(body, new THREE.SphereGeometry(0.16, 7, 5), mainM, 0, headY + 0.02, 0.03).scale.set(1, 1.1, 1.05);
    add(body, new THREE.ConeGeometry(0.1, 0.22, 6), mainM, 0, headY, 0.2).rotation.x = Math.PI / 2 + 0.4;
  } else if (hat === 'cap') {
    add(body, new THREE.CylinderGeometry(0.13, 0.14, 0.08, 8), trimM, 0, headY + 0.11, 0);
  } else if (hat === 'beret') {
    const b = add(body, new THREE.SphereGeometry(0.17, 8, 4), mainM, 0.03, headY + 0.12, 0);
    b.scale.set(1, 0.4, 1);
    b.rotation.z = -0.2;
  } else if (hat === 'chaperon') {
    add(body, new THREE.TorusGeometry(0.12, 0.05, 5, 10), mainM, 0, headY + 0.12, 0).rotation.x = Math.PI / 2;
    add(body, new THREE.ConeGeometry(0.06, 0.4, 5), mainM, 0.12, headY + 0.02, 0.12).rotation.z = -2.4;
  } else if (hat === 'veil') {
    add(body, new THREE.SphereGeometry(0.15, 7, 5), lightM, 0, headY + 0.03, 0.02).scale.set(1, 1.05, 1.05);
    add(body, new THREE.ConeGeometry(0.22, 0.5, 8, 1, true), mat('cloth', o.trim ?? 0x3a2a4a), 0, headY - 0.12, 0.06);
  } else if (hat === 'coif') {
    add(body, new THREE.SphereGeometry(0.14, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.6), lightM, 0, headY + 0.01, 0.01);
  }

  // Arms on shoulder pivots.
  const sleeveM = outfit === 'priest' ? mat('cloth', 0x18161a) : mainM;
  const arms = [-1, 1].map((sd) => {
    const p = new THREE.Group();
    p.position.set(sd * 0.25, shoulderY, 0);
    add(p, new THREE.CylinderGeometry(0.06, fancy ? 0.12 : 0.075, 0.58, 6), sleeveM, 0, -0.29, 0);
    add(p, new THREE.BoxGeometry(0.075, 0.09, 0.075), skin, 0, -0.62, 0);
    body.add(p);
    return p;
  });

  // Things carried in the hands.
  const carry = o.carry || null;
  const held = new THREE.Group();
  held.position.set(0, 0.92, -0.32);
  body.add(held);
  let flame = null;
  if (carry === 'tray') {
    add(held, new THREE.CylinderGeometry(0.24, 0.24, 0.03, 10), mat('plain', 0xb0a080), 0, 0.12, 0);
    for (const [x, z] of [
      [-0.08, 0.02],
      [0.09, -0.05],
    ])
      add(held, new THREE.CylinderGeometry(0.04, 0.03, 0.12, 6), mat('plain', 0xc0a060), x, 0.2, z);
  } else if (carry === 'book') {
    add(held, new THREE.BoxGeometry(0.3, 0.04, 0.22), mat('plain', 0x5a1a1a), 0, 0.12, 0).rotation.x = -0.5;
  } else if (carry === 'scroll') {
    add(held, new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), lightM, 0, 0.1, 0).rotation.z = Math.PI / 2;
  } else if (carry === 'basket') {
    add(held, new THREE.CylinderGeometry(0.17, 0.13, 0.16, 8), mat('cloth', 0x8a6a3a), 0, 0.05, 0);
  } else if (carry === 'candle') {
    add(held, new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), lightM, 0, 0.12, 0);
    flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame(), fog: true }));
    flame.scale.set(0.09, 0.16, 1);
    flame.position.y = 0.3;
    held.add(flame);
  }
  const carrying = !!carry;
  if (carrying) for (const a of arms) a.rotation.x = 0.85;

  const scale = o.scale ?? 0.94 + rnd() * 0.12;
  root.scale.setScalar(scale);

  let phase = rnd() * 10;
  let mode = o.mode || 'idle';
  const seed = rnd() * 10;

  function update(dt, t, speed = 0) {
    const moving = speed > 0.05;
    phase += dt * (moving ? 2.6 + speed * 1.8 : 0);
    const s = Math.sin(phase * 2);
    body.position.y = moving ? Math.abs(Math.sin(phase * 2)) * 0.03 : Math.sin(t * 1.3 + seed) * 0.005;
    body.rotation.z = moving && long ? s * 0.03 : 0;
    if (legs) {
      legs[0].rotation.x = moving ? s * 0.5 : 0;
      legs[1].rotation.x = moving ? -s * 0.5 : 0;
    }
    if (carrying) {
      for (const a of arms) a.rotation.x = 0.85 + (moving ? Math.sin(phase * 4) * 0.03 : 0);
    } else if (moving) {
      arms[0].rotation.x = -s * 0.4;
      arms[1].rotation.x = s * 0.4;
      arms[0].rotation.z = arms[1].rotation.z = 0;
    } else if (mode === 'talk') {
      arms[1].rotation.x = 0.5 + Math.sin(t * 2.2 + seed) * 0.35;
      arms[1].rotation.z = 0.2;
      arms[0].rotation.x = 0.1;
      body.rotation.y = Math.sin(t * 0.7 + seed) * 0.12;
    } else if (mode === 'read') {
      arms[0].rotation.x = arms[1].rotation.x = 0.9;
      arms[0].rotation.z = -0.25;
      arms[1].rotation.z = 0.25;
    } else if (mode === 'pray') {
      arms[0].rotation.x = arms[1].rotation.x = 1.1;
      arms[0].rotation.z = -0.45;
      arms[1].rotation.z = 0.45;
      body.rotation.x = 0.06;
    } else {
      arms[0].rotation.x = Math.sin(t * 0.9 + seed) * 0.04;
      arms[1].rotation.x = -Math.sin(t * 0.9 + seed) * 0.04;
      body.rotation.y = Math.sin(t * 0.3 + seed) * 0.2;
    }
    if (flame) flame.scale.set(0.09, 0.14 + Math.sin(t * 13 + seed) * 0.03, 1);
  }

  return {
    root,
    update,
    setMode(m) {
      mode = m;
    },
    get mode() {
      return mode;
    },
  };
}
