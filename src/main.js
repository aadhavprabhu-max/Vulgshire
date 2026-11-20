import * as THREE from 'three';
import { settings, loadSettingsFromURL, RES_PRESETS } from './settings.js';
import { RetroRenderer } from './retro/RetroRenderer.js';
import { retroUniforms, patchSceneMaterials, refreshSceneMaterials } from './retro/retroMaterial.js';
import { SCENES } from './scenes/index.js';
import { createMonk } from './player/monk.js';
import { ThirdPersonController } from './player/controller.js';
import { createHud } from './ui/hud.js';
import { validateWorld } from './data/world.js';

validateWorld();
loadSettingsFromURL();

const canvas = document.getElementById('game');
const retro = new RetroRenderer(canvas, settings);
const hud = createHud(document.getElementById('hud'), settings.shot);
const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);

const scene = new THREE.Scene();
const fog = new THREE.FogExp2(0x000000, 0.02);
const hemi = new THREE.HemisphereLight();
const dirLight = new THREE.DirectionalLight();
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.bias = -0.0008;
dirLight.shadow.normalBias = 0.03;
scene.add(hemi, dirLight, dirLight.target);

const monk = createMonk();
scene.add(monk.root);
const controller = new ThirdPersonController({ camera, character: monk, canvas, colliders: [], blockers: [], spawn: new THREE.Vector3() });

let current = null; // { def, built }
let sceneIndex = Math.max(0, SCENES.findIndex((s) => s.id === new URLSearchParams(location.search).get('scene')));

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    // Materials and textures are shared/cached and stay alive.
  });
}

function loadScene(index) {
  if (current) {
    scene.remove(current.built.root, current.built.sky);
    disposeTree(current.built.root);
  }
  const def = SCENES[index];
  const built = def.build();
  current = { def, built };
  scene.add(built.root);
  if (built.sky) scene.add(built.sky);

  const env = built.env;
  fog.color.set(env.fog.color);
  fog.density = env.fog.density;
  scene.fog = settings.fog ? fog : null;
  scene.background = new THREE.Color(env.fog.color);
  hemi.color.set(env.hemi.sky);
  hemi.groundColor.set(env.hemi.ground);
  hemi.intensity = env.hemi.intensity;
  dirLight.color.set(env.dir.color);
  dirLight.intensity = env.dir.intensity;
  dirLight.position.copy(env.dir.dir).multiplyScalar(60);
  dirLight.castShadow = !!env.dir.shadow;
  const e = env.dir.extent || 26;
  Object.assign(dirLight.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 160 });
  dirLight.shadow.camera.updateProjectionMatrix();
  if (env.dir.target) dirLight.target.position.copy(env.dir.target);
  else dirLight.target.position.set(0, 0, 0);
  dirLight.position.add(dirLight.target.position);

  controller.colliders = built.colliders;
  controller.blockers = built.cameraBlockers;
  controller.pos.copy(built.spawn);
  controller.yaw = controller.facing = built.spawnYaw;
  controller.pitch = built.spawnPitch ?? 0.1;
  monk.state.baseIntensity = built.lanternIntensity ?? 4;

  patchSceneMaterials(scene);
  refreshSceneMaterials(scene);
  hud.setScene?.(def.title);
}

loadScene(sceneIndex);

// Debug/screenshot pose: ?pose=x,z,yaw,pitch
const poseParam = new URLSearchParams(location.search).get('pose');
if (poseParam) {
  const [x, z, yaw, pitch] = poseParam.split(',').map(Number);
  controller.pos.set(x, current.built.spawn.y, z);
  controller.yaw = controller.facing = yaw;
  if (!Number.isNaN(pitch)) controller.pitch = pitch;
}
retroUniforms.uJitter.value = settings.jitter ? 1 : 0;

// ---- Keys (number keys: browsers reserve most F-keys) ----------------------
window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'Digit1':
      settings.resIndex = (settings.resIndex + 1) % RES_PRESETS.length;
      retro.applyResolution();
      hud.toast(`Resolution: ${RES_PRESETS[settings.resIndex].label} (${retro.width}×${retro.height})`);
      break;
    case 'Digit2':
      settings.jitter = !settings.jitter;
      retroUniforms.uJitter.value = settings.jitter ? 1 : 0;
      hud.toast(`Vertex jitter: ${settings.jitter ? 'on' : 'off'}`);
      break;
    case 'Digit3':
      settings.fog = !settings.fog;
      scene.fog = settings.fog ? fog : null;
      refreshSceneMaterials(scene);
      hud.toast(`Fog: ${settings.fog ? 'on' : 'off'}`);
      break;
    case 'Digit4':
      settings.dither = !settings.dither;
      hud.toast(`Dither: ${settings.dither ? 'on' : 'off'}`);
      break;
    case 'Digit5':
      settings.grade = !settings.grade;
      hud.toast(`Colour grade: ${settings.grade ? 'on' : 'off'}`);
      break;
    case 'BracketRight':
    case 'BracketLeft':
      sceneIndex = (sceneIndex + (e.code === 'BracketRight' ? 1 : SCENES.length - 1)) % SCENES.length;
      loadScene(sceneIndex);
      hud.toast(`Scene: ${SCENES[sceneIndex].title}`);
      break;
    case 'KeyH':
      hud.toggle();
      break;
  }
});

// ---- Loop ------------------------------------------------------------------
const clock = new THREE.Clock();
let frames = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  current.built.update?.(dt, t, { controller, camera });
  controller.update(dt);
  monk.update(dt, t, controller.speed);
  if (current.built.sky) current.built.sky.position.set(camera.position.x, camera.position.y, camera.position.z);
  retro.render(scene, camera);
  if (++frames === 10) window.__vulgshire = { ready: true, controller, settings };
  requestAnimationFrame(frame);
}
frame();
