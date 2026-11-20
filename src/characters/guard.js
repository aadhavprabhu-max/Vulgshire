import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// Original low-poly armoured guard with a horned helm (reference 03).
// Faces -Z at rotation 0. update(dt, speed) animates a stiff marching walk.
export function createGuard() {
  const root = new THREE.Group();
  const armor = new THREE.MeshLambertMaterial({ map: tex.armor(), flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1718, flatShading: true });
  const horn = new THREE.MeshLambertMaterial({ color: 0xb8ab90, flatShading: true });
  const leather = new THREE.MeshLambertMaterial({ color: 0x3a2a1e, flatShading: true });
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const body = new THREE.Group();
  root.add(body);

  // Legs pivot at the hips.
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.13, 0.95, 0);
    add(hip, new THREE.BoxGeometry(0.17, 0.5, 0.2), dark, 0, -0.25, 0);
    add(hip, new THREE.BoxGeometry(0.18, 0.12, 0.16), armor, 0, -0.48, -0.03); // knee cop
    add(hip, new THREE.BoxGeometry(0.16, 0.42, 0.18), armor, 0, -0.72, 0);
    add(hip, new THREE.BoxGeometry(0.17, 0.1, 0.3), dark, 0, -0.9, -0.05);
    body.add(hip);
    return hip;
  });
  // Torso: breastplate, faulds, belt.
  add(body, new THREE.BoxGeometry(0.5, 0.55, 0.32), armor, 0, 1.33, 0);
  add(body, new THREE.CylinderGeometry(0.24, 0.3, 0.3, 6), armor, 0, 0.98, 0);
  add(body, new THREE.BoxGeometry(0.52, 0.07, 0.34), leather, 0, 1.08, 0);
  // Pauldrons and arms.
  const arms = [-1, 1].map((s) => {
    add(body, new THREE.SphereGeometry(0.17, 5, 3), armor, s * 0.33, 1.56, 0);
    const sh = new THREE.Group();
    sh.position.set(s * 0.34, 1.5, 0);
    add(sh, new THREE.BoxGeometry(0.14, 0.62, 0.16), armor, 0, -0.31, 0);
    add(sh, new THREE.BoxGeometry(0.12, 0.12, 0.12), dark, 0, -0.66, 0);
    body.add(sh);
    return sh;
  });
  // Helm with two curved horns.
  add(body, new THREE.CylinderGeometry(0.15, 0.17, 0.12, 6), dark, 0, 1.66, 0);
  const helm = add(body, new THREE.SphereGeometry(0.19, 6, 4), armor, 0, 1.8, 0);
  helm.scale.y = 1.1;
  add(body, new THREE.ConeGeometry(0.05, 0.16, 4), armor, 0, 1.99, 0); // spike
  for (const s of [-1, 1]) {
    const h1 = add(body, new THREE.ConeGeometry(0.06, 0.26, 4), horn, s * 0.25, 1.9, 0);
    h1.rotation.z = -s * 1.1;
    const h2 = add(body, new THREE.ConeGeometry(0.035, 0.18, 4), horn, s * 0.35, 2.04, 0);
    h2.rotation.z = -s * 0.25;
  }
  // Spear over the right shoulder.
  const spear = new THREE.Group();
  add(spear, new THREE.CylinderGeometry(0.025, 0.025, 2.4, 4), leather, 0, 0.6, 0);
  add(spear, new THREE.ConeGeometry(0.06, 0.28, 4), armor, 0, 1.94, 0);
  spear.position.set(0, -0.6, -0.04);
  arms[1].add(spear);

  let phase = Math.random() * 6;
  function update(dt, speed) {
    phase += dt * speed * 3.2;
    const s = Math.sin(phase);
    const moving = speed > 0.05;
    legs[0].rotation.x = moving ? s * 0.45 : 0;
    legs[1].rotation.x = moving ? -s * 0.45 : 0;
    arms[0].rotation.x = moving ? -s * 0.35 : 0;
    arms[1].rotation.x = moving ? s * 0.12 - 0.15 : -0.15;
    body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.04 : 0;
  }
  return { root, update };
}
