import * as THREE from 'three';
import { tex } from '../retro/textures.js';

// Day/night cycle. A clock (hours 0..24) drives:
//  - the sun and the moon along arcs (east -> west), and the directional light
//    that follows whichever of them is up;
//  - a shader sky: the scene's starry night texture blended into dawn, day and
//    dusk gradients, with a warm glow around a low sun and a purple horizon band
//    at night;
//  - fog, hemisphere and sun colours (the scene's own env is the night keyframe);
//  - emissive things: lit windows dim to dark glass by day, torch flames and
//    point lights fade on at dusk and off at dawn, scenes get setTime() (the
//    Crownkeep's fires only burn at night).
// Interiors (scenes without a sky) keep their own lighting. A scene can blend
// between the two with `outdoor` (number or function, 0..1).

const DAY = {
  zenith: 0x4c6c9c,
  horizon: 0x9aa4b4,
  fog: 0x8c96a6,
  hemiSky: 0xb4c0d4,
  hemiGround: 0x5a5244,
  hemiI: 1.35,
  sun: 0xfff0d8,
  sunI: 2.1,
};
const MOON_HOUR = 22; // each scene's moon sprite is placed for this hour
const TWILIGHT = { dawn: 0xd89a70, dusk: 0xc8643c, sky: 0x2c2c58, sun: 0xffa060 };

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform sampler2D tNight;
uniform float uHasNight, uDay, uTw, uStars;
uniform vec3 uZenith, uHorizon, uTwColor, uSunDir, uNightGlow, uNightFlat;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 night = uHasNight > 0.5 ? texture2D(tNight, uv).rgb * uStars : uNightFlat;
  night += uNightGlow * exp(-max(d.y, 0.0) * 6.0);
  vec3 day = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.45));
  vec3 col = mix(night, day, uDay);
  float sunAmt = pow(max(dot(d, uSunDir), 0.0), 6.0);
  col += uTwColor * uTw * (sunAmt * 0.9 + exp(-abs(d.y) * 5.0) * 0.35);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createDayNight({ scene, hemi, dirLight, fog, renderer, settings, camera }) {
  const clock = { hour: settings.startHour, paused: false };
  // Sky sphere (drawn first, behind everything, follows the camera).
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      tNight: { value: null },
      uHasNight: { value: 0 },
      uDay: { value: 0 },
      uTw: { value: 0 },
      uStars: { value: 1 },
      uZenith: { value: new THREE.Color(DAY.zenith) },
      uHorizon: { value: new THREE.Color(DAY.horizon) },
      uTwColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uNightGlow: { value: new THREE.Color() },
      uNightFlat: { value: new THREE.Color() },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.visible = false;
  scene.add(sky);
  // The sun: a warm disc and halo.
  const sunGroup = new THREE.Group();
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.halo(), color: 0xfff4d8, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  sunDisc.scale.set(26, 26, 1);
  sunDisc.renderOrder = -9;
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.halo(), color: 0xffc070, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  sunHalo.scale.set(110, 110, 1);
  sunHalo.renderOrder = -9;
  sunGroup.add(sunDisc, sunHalo);
  scene.add(sunGroup);

  let built = null;
  let env = null;
  let moon0 = null; // the scene's moon direction (as composed at the start hour)
  let moonSprites = [];
  let glowMats = [];
  let flames = [];
  let lights = [];
  let refreshT = 0;
  let shadowT = 0;
  const lastDir = new THREE.Vector3();
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const state = { hour: clock.hour, dayK: 0, nightK: 1, glowK: 1, twK: 0, sunDir, moonDir };

  function collect() {
    const flameTex = tex.flame();
    const litTex = tex.litWindow();
    const mats = new Set();
    flames = [];
    lights = [];
    built.root.traverse((o) => {
      if (o.isPointLight) lights.push(o);
      if (o.isSprite && o.material.map === flameTex) flames.push(o);
      const m = o.material;
      if (!m || Array.isArray(m)) return;
      if ((m.isMeshBasicMaterial && m.map === litTex) || m.userData.glow) mats.add(m);
    });
    glowMats = [...mats];
    for (const m of glowMats) if (!m.userData.nightColor) m.userData.nightColor = m.color.clone();
  }

  function attach(b) {
    built = b;
    env = b.env;
    const outdoor = !!b.sky;
    sky.visible = outdoor;
    sunGroup.visible = outdoor;
    if (outdoor) {
      scene.background = null;
      const bg = b.sky.userData.background;
      skyMat.uniforms.tNight.value = bg || null;
      skyMat.uniforms.uHasNight.value = bg ? 1 : 0;
      skyMat.uniforms.uNightFlat.value.set(env.fog.color);
      skyMat.uniforms.uNightGlow.value.set(env.skyGlow ?? env.fog.color).multiplyScalar(env.skyGlow ? 1 : 0.6);
      moonSprites = b.sky.children.filter((c) => c.isSprite);
      moon0 = moonSprites.length ? moonSprites[0].position.clone().normalize() : env.dir.dir.clone().normalize();
      for (const s of moonSprites) s.userData.dist = s.position.length();
    }
    collect();
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    lastDir.set(0, 0, 0);
  }

  const outdoorK = () => {
    if (!built?.sky) return 0;
    const o = built.outdoor;
    return o === undefined ? 1 : typeof o === 'function' ? o() : o;
  };

  function update(dt) {
    if (!built) return state;
    sky.position.copy(camera.position);
    if (!clock.paused) clock.hour = (clock.hour + (dt * 24) / (settings.dayLengthMinutes * 60)) % 24;
    const h = clock.hour;
    // Sun: rises in the east (+x) at 6:00, highest at noon (to the south, +z), sets at 18:00.
    sunDir.set(1, 0, 0.38).normalize().applyAxisAngle(zAxis, ((h - 6) / 24) * Math.PI * 2);
    // Moon: where the scene composed it at 22:00 (the references' hour), moving 15 degrees an hour.
    moonDir.copy(moon0 || sunDir).applyAxisAngle(zAxis, ((h - MOON_HOUR) / 24) * Math.PI * 2);
    const se = sunDir.y;
    const me = moonDir.y;
    const dayK = smooth(-0.1, 0.22, se);
    const twK = (1 - smooth(0.0, 0.32, Math.abs(se + 0.04))) * (se > -0.3 ? 1 : 0);
    const glowK = 1 - smooth(-0.02, 0.2, se); // lights on at dusk, off after dawn
    const morning = h < 12;
    Object.assign(state, { hour: h, dayK, nightK: 1 - dayK, glowK, twK });

    const out = outdoorK();
    if (built.sky) {
      // Sky.
      const U = skyMat.uniforms;
      U.uDay.value = dayK;
      U.uTw.value = twK;
      U.uStars.value = 1 - dayK;
      U.uTwColor.value.set(morning ? TWILIGHT.dawn : TWILIGHT.dusk);
      U.uSunDir.value.copy(sunDir);
      U.uZenith.value.set(DAY.zenith).lerp(tmp.set(TWILIGHT.sky), twK * (1 - dayK * 0.6));
      U.uHorizon.value.set(DAY.horizon).lerp(tmp.set(morning ? TWILIGHT.dawn : TWILIGHT.dusk), twK * 0.7);
      // Sun and moon sprites.
      sunGroup.position.copy(camera.position).addScaledVector(sunDir, 300);
      sunGroup.visible = se > -0.08;
      sunDisc.material.color.set(DAY.sun).lerp(tmp.set(TWILIGHT.sun), twK);
      const moonK = smooth(-0.05, 0.08, me) * (1 - dayK * 0.85);
      for (const s of moonSprites) {
        s.position.copy(moonDir).multiplyScalar(s.userData.dist);
        s.visible = moonK > 0.02;
        s.material.opacity = (s.userData.op0 ??= s.material.opacity) * moonK;
      }
    }
    if (out > 0) {
      // Fog, hemisphere and the light of whichever body is up (blended with the
      // scene's own lighting by `out`).
      tmp.set(env.fog.color).lerp(tmp2.set(DAY.fog), dayK).lerp(tmp2.set(morning ? TWILIGHT.dawn : TWILIGHT.dusk), twK * 0.35);
      fog.color.set(env.fog.color).lerp(tmp, out);
      if (!built.sky) scene.background = fog.color;
      hemi.color.set(env.hemi.sky).lerp(tmp.set(env.hemi.sky).lerp(tmp2.set(DAY.hemiSky), dayK), out);
      hemi.groundColor.set(env.hemi.ground).lerp(tmp.set(env.hemi.ground).lerp(tmp2.set(DAY.hemiGround), dayK), out);
      hemi.intensity = env.hemi.intensity + (env.hemi.intensity + (DAY.hemiI - env.hemi.intensity) * dayK - env.hemi.intensity) * out;
      const sunI = DAY.sunI * smooth(-0.02, 0.16, se);
      const moonI = env.dir.intensity * smooth(-0.02, 0.15, me) * (1 - dayK);
      const useSun = sunI >= moonI;
      const dir = useSun ? sunDir : moonDir;
      const targetPos = dirLight.target.position;
      const tI = useSun ? sunI : moonI;
      tmp.set(useSun ? DAY.sun : env.dir.color);
      if (useSun) tmp.lerp(tmp2.set(TWILIGHT.sun), twK);
      dirLight.color.set(env.dir.color).lerp(tmp, out);
      dirLight.intensity = env.dir.intensity + (tI - env.dir.intensity) * out;
      dirLight.position.copy(targetPos).addScaledVector(out > 0.5 ? dir : env.dir.dir.clone().normalize(), 60);
      // Shadows: only while the light is up; refreshed at a reduced rate.
      const casting = !!env.dir.shadow && tI > 0.15;
      if (dirLight.castShadow !== casting) {
        dirLight.castShadow = casting;
        renderer.shadowMap.needsUpdate = true;
      }
      shadowT += dt;
      if (casting && (shadowT > 0.1 || lastDir.angleTo(dir) > 0.004)) {
        renderer.shadowMap.needsUpdate = true;
        shadowT = 0;
        lastDir.copy(dir);
      }
    } else {
      // Interiors: their own static lighting; shadows still refresh now and then.
      shadowT += dt;
      if (shadowT > 0.1) {
        renderer.shadowMap.needsUpdate = true;
        shadowT = 0;
      }
    }
    // Emissives: windows and torches. Indoors (out = 0) they stay lit.
    const g = 1 - (1 - glowK) * out;
    refreshT -= dt;
    if (refreshT <= 0) {
      collect(); // houses and props stream in and out
      refreshT = 1.5;
    }
    for (const m of glowMats) m.color.copy(m.userData.nightColor).lerp(tmp.set(0x3e4652), 1 - g);
    for (const f of flames) f.visible = g > 0.06;
    for (const l of lights) {
      const u = l.userData;
      if (u.dnSkip) continue; // dims itself (e.g. the Crownkeep's fill lights)
      // Lights that flicker get a fresh value from their own updater each frame.
      if (u.dnLast === undefined || l.intensity !== u.dnLast) u.dnBase = l.intensity;
      l.intensity = u.dnBase * g;
      u.dnLast = l.intensity;
    }
    built.setTime?.({ ...state, glow: g, out });
    return state;
  }

  return {
    clock,
    state,
    attach,
    update,
    /** Move the clock by `hours` (keys). */
    scrub(hours) {
      clock.hour = (((clock.hour + hours) % 24) + 24) % 24;
    },
    label() {
      const hh = Math.floor(clock.hour);
      const mm = Math.floor((clock.hour - hh) * 60);
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    },
  };
}
