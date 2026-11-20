import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// Original low-poly alchemist in a green striped robe and soft cap (reference 02).
// Faces -Z at rotation 0. Idles: slow breathing, glances left and right.
export function createAlchemist() {
  const root = new THREE.Group();
  const robe = new THREE.MeshLambertMaterial({ map: tex.robeStripe(), flatShading: true });
  const coat = new THREE.MeshLambertMaterial({ color: 0x1c1e26, flatShading: true });
  const cap = new THREE.MeshLambertMaterial({ color: 0x6a7040, flatShading: true });
  const leather = new THREE.MeshLambertMaterial({ color: 0x3e2c1c, flatShading: true });
  const rope = new THREE.MeshLambertMaterial({ map: tex.rope(), flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a6a52, flatShading: true });
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const body = new THREE.Group();
  root.add(body);
  const profile = [
    [0, 0.02],
    [0.38, 0.02],
    [0.35, 0.4],
    [0.29, 0.9],
    [0.27, 1.2],
    [0.31, 1.4],
    [0.22, 1.5],
    [0, 1.52],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const r = add(body, new THREE.LatheGeometry(profile, 8), robe, 0, 0, 0);
  r.scale.z = 0.85;
  // Dark over-mantle on the shoulders.
  add(body, new THREE.CylinderGeometry(0.24, 0.36, 0.34, 8), coat, 0, 1.36, 0);
  // Satchel strap and pouch, rope belt.
  const strap = add(body, new THREE.BoxGeometry(0.06, 0.8, 0.04), leather, 0.02, 1.15, 0.2);
  strap.rotation.z = 0.7;
  add(body, new THREE.BoxGeometry(0.22, 0.2, 0.1), leather, -0.18, 0.85, 0.26);
  const belt = add(body, new THREE.TorusGeometry(0.28, 0.03, 4, 10), rope, 0, 1.0, 0);
  belt.rotation.x = Math.PI / 2;
  // Head with a soft, slumped cap.
  add(body, new THREE.IcosahedronGeometry(0.14, 0), skin, 0, 1.64, -0.02);
  const c1 = add(body, new THREE.CylinderGeometry(0.17, 0.16, 0.12, 7), cap, 0, 1.74, 0);
  c1.rotation.x = 0.1;
  const c2 = add(body, new THREE.SphereGeometry(0.19, 7, 4), cap, 0.02, 1.84, 0.05);
  c2.scale.set(1, 0.6, 1);
  // Arms resting forward on the railing.
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.3, 1.38, 0);
    add(sh, new THREE.CylinderGeometry(0.07, 0.11, 0.6, 6), robe, 0, -0.3, 0);
    add(sh, new THREE.BoxGeometry(0.08, 0.1, 0.08), skin, 0, -0.64, 0);
    sh.rotation.x = 0.55;
    sh.rotation.z = s * 0.12;
    body.add(sh);
  }
  function update(dt, t) {
    body.position.y = Math.sin(t * 1.3) * 0.006;
    body.rotation.y = Math.sin(t * 0.25) * 0.25;
  }
  return { root, update };
}
