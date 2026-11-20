import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// Original low-poly monk: black hooded robe, rope belt, and a hand lantern
// with a flickering warm point light. About 1.75 m tall, faces -Z at rotation 0.

export function createMonk() {
  const root = new THREE.Group();
  root.name = 'monk';
  const body = new THREE.Group(); // bobs while walking
  root.add(body);

  const robe = new THREE.MeshLambertMaterial({ map: tex.robe(), flatShading: true });
  const robeDark = new THREE.MeshLambertMaterial({ color: 0x0b0a0d, flatShading: true });
  const rope = new THREE.MeshLambertMaterial({ map: tex.rope(), flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a6a52, flatShading: true });
  const iron = new THREE.MeshLambertMaterial({ color: 0x1c1a18, flatShading: true });

  const cast = (m) => {
    m.castShadow = true;
    return m;
  };

  // Robe: faceted lathe, wide hem, narrow waist, broad shoulders.
  const profile = [
    [0.0, 0.02],
    [0.4, 0.02],
    [0.37, 0.25],
    [0.3, 0.7],
    [0.25, 1.0],
    [0.27, 1.2],
    [0.3, 1.38],
    [0.24, 1.47],
    [0.1, 1.52],
    [0.0, 1.52],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const robeMesh = cast(new THREE.Mesh(new THREE.LatheGeometry(profile, 8), robe));
  robeMesh.scale.set(1, 1, 0.82);
  body.add(robeMesh);

  // Rope belt with a hanging end.
  const belt = cast(new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.028, 4, 10), rope));
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.82, 1);
  belt.position.y = 1.0;
  body.add(belt);
  const beltEnd = cast(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.035), rope));
  beltEnd.position.set(-0.12, 0.8, -0.2);
  body.add(beltEnd);

  // Hood: a faceted dome with a pointed back, plus a dark face opening.
  const hood = cast(new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), robe));
  hood.scale.set(1, 1.12, 1.08);
  hood.position.set(0, 1.64, 0.02);
  body.add(hood);
  const hoodTip = cast(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 6), robe));
  hoodTip.position.set(0, 1.62, 0.2);
  hoodTip.rotation.x = Math.PI / 2 + 0.5;
  body.add(hoodTip);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), robeDark);
  face.position.set(0, 1.62, -0.185);
  face.rotation.y = Math.PI;
  body.add(face);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), skin);
  chin.position.set(0, 1.55, -0.17);
  body.add(chin);
  // Cowl draped over the shoulders.
  const cowl = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.33, 0.2, 8), robe));
  cowl.position.y = 1.42;
  cowl.scale.z = 0.85;
  body.add(cowl);

  // Arms: flared sleeves pivoting at the shoulders.
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.29, 1.4, 0);
    const sleeve = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.62, 6), robe));
    sleeve.position.y = -0.31;
    pivot.add(sleeve);
    const hand = cast(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), skin));
    hand.position.y = -0.66;
    pivot.add(hand);
    body.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  armL.rotation.z = -0.12;
  armR.rotation.z = 0.2;
  armR.rotation.x = -0.18;

  // Lantern hangs from the right hand on a short ring.
  const lantern = new THREE.Group();
  const lanternPivot = new THREE.Group(); // swings
  lanternPivot.position.set(0, -0.7, 0);
  armR.add(lanternPivot);
  lanternPivot.add(lantern);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 3, 6), iron);
  ring.position.y = -0.04;
  lantern.add(ring);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.19, 0.13), new THREE.MeshBasicMaterial({ map: tex.lanternPane() }));
  glass.position.y = -0.2;
  lantern.add(glass);
  const cap = cast(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.09, 4), iron));
  cap.rotation.y = Math.PI / 4;
  cap.position.y = -0.065;
  lantern.add(cap);
  const base = cast(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.15), iron));
  base.position.y = -0.305;
  lantern.add(base);

  const light = new THREE.PointLight(0xffa24a, 4, 10, 2);
  light.position.set(0, -0.2, 0);
  lantern.add(light);

  // Blob shadow under the feet (soft-edged dark disc, very era-appropriate).
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.07;
  root.add(blob);

  let walkPhase = 0;
  const state = { light, baseIntensity: 4 };

  function update(dt, t, speed) {
    // Walk cycle: bob, arm swing, lantern sway. Idle: slow breathing sway.
    const moving = speed > 0.1;
    walkPhase += dt * (moving ? 2.2 + speed * 1.6 : 0);
    const s = Math.sin(walkPhase * 2);
    body.position.y = moving ? Math.abs(Math.sin(walkPhase * 2)) * 0.035 : Math.sin(t * 1.4) * 0.006;
    body.rotation.z = moving ? Math.sin(walkPhase * 2) * 0.025 : 0;
    armL.rotation.x = moving ? s * 0.35 : Math.sin(t * 1.2) * 0.03;
    lanternPivot.rotation.x = moving ? -s * 0.25 + 0.05 : Math.sin(t * 1.7) * 0.06;
    lanternPivot.rotation.z = moving ? Math.cos(walkPhase * 2) * 0.12 : Math.sin(t * 1.3) * 0.04;

    // Candle flicker: layered sines plus a little noise.
    const f = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.04 * Math.sin(t * 5.1) + (Math.random() - 0.5) * 0.04;
    light.intensity = state.baseIntensity * f;
  }

  return { root, update, light, state };
}
