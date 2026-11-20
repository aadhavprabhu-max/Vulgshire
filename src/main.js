import * as THREE from 'three';
import { settings, loadSettingsFromURL, RES_PRESETS } from './settings.js';
import { RetroRenderer } from './retro/RetroRenderer.js';
import { retroUniforms, patchSceneMaterials, refreshSceneMaterials } from './retro/retroMaterial.js';
import { buildCloister, buildSky, MOON_DIR } from './scenes/cloister.js';
import { createMonk } from './player/monk.js';
import { ThirdPersonController } from './player/controller.js';
import { createHud } from './ui/hud.js';
import { validateWorld } from './data/world.js';

validateWorld();
loadSettingsFromURL();

const canvas = document.getElementById('game');
const retro = new RetroRenderer(canvas, settings);
const hud = createHud(document.getElementById('hud'), settings.shot);

// ---- Scene ---------------------------------------------------------------
const scene = new THREE.Scene();
const FOG_COLOR = 0x101836;
const fog = new THREE.FogExp2(FOG_COLOR, 0.028);
scene.fog = settings.fog ? fog : null;
scene.background = new THREE.Color(FOG_COLOR);

const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);

// Cold moonlight + navy ambient; warm light comes only from flames.
scene.add(new THREE.HemisphereLight(0x5466a8, 0x14141f, 2.3));
const moonLight = new THREE.DirectionalLight(0xbfd0ff, 2.6);
moonLight.position.copy(MOON_DIR).multiplyScalar(60);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
Object.assign(moonLight.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 });
moonLight.shadow.bias = -0.0008;
moonLight.shadow.normalBias = 0.03;
scene.add(moonLight);
scene.add(moonLight.target);

const sky = buildSky();
scene.add(sky);
const cloister = buildCloister();
scene.add(cloister.root);

const monk = createMonk();
scene.add(monk.root);

const controller = new ThirdPersonController({
  camera,
  character: monk,
  canvas,
  colliders: cloister.colliders,
  blockers: cloister.cameraBlockers,
  spawn: cloister.spawn,
  yaw: cloister.spawnYaw,
});

// Debug/screenshot pose: ?pose=x,z,yaw,pitch
const poseParam = new URLSearchParams(location.search).get('pose');
if (poseParam) {
  const [x, z, yaw, pitch] = poseParam.split(',').map(Number);
  controller.pos.set(x, 0, z);
  controller.yaw = controller.facing = yaw;
  if (!Number.isNaN(pitch)) controller.pitch = pitch;
}

patchSceneMaterials(scene);
retroUniforms.uJitter.value = settings.jitter ? 1 : 0;

// ---- Settings keys (number keys: browsers reserve most F-keys) ------------
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
  controller.update(dt);
  monk.update(dt, t, controller.speed);
  for (const torch of cloister.torches) {
    const f = 0.8 + 0.12 * Math.sin(t * 9.1 + torch.phase) + 0.08 * Math.sin(t * 17.3 + torch.phase * 2);
    torch.light.intensity = torch.base * f;
    torch.flame.scale.set(0.26 + 0.03 * Math.sin(t * 13 + torch.phase), 0.46 + 0.07 * f, 1);
  }
  sky.position.set(camera.position.x, 0, camera.position.z); // sky follows the camera
  retro.render(scene, camera);
  if (++frames === 10) window.__vulgshire = { ready: true, controller, settings };
  requestAnimationFrame(frame);
}
frame();
