import * as THREE from 'three';
import { RES_PRESETS } from '../settings.js';

// Renders the scene into a small 16:9 target, then blits it to a canvas of the
// same size. CSS scales that canvas up with nearest-neighbour and letterboxes it.
// The blit pass also applies the optional colour grade and ordered dither.

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uDither;
uniform float uGrade;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 c = clamp(texture2D(tScene, vUv).rgb, 0.0, 1.0);
  c = toSRGB(c);
  if (uGrade > 0.5) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, 0.88);                         // slightly desaturated
    c += vec3(0.0, 0.006, 0.03) * (1.0 - l) * (1.0 - l); // navy-tinted shadows
    c *= vec3(0.98, 0.98, 1.03);
  }
  if (uDither > 0.5) {
    float d = bayer4(floor(vUv * uRes)) - 0.5;
    const float levels = 31.0;                         // 5 bits per channel
    c = floor(c * levels + 0.5 + d) / levels;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class RetroRenderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // hard, blocky shadows

    this.target = new THREE.WebGLRenderTarget(640, 360, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });

    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(640, 360) },
        uDither: { value: 1 },
        uGrade: { value: 1 },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.width = 640;
    this.height = 360;
    window.addEventListener('resize', () => this.applyResolution());
    this.applyResolution();
  }

  // Size of the letterboxed 16:9 box that fits the window, in CSS pixels.
  fitBox() {
    const w = Math.min(window.innerWidth, (window.innerHeight * 16) / 9);
    return { w: Math.floor(w), h: Math.floor((w * 9) / 16) };
  }

  applyResolution() {
    const box = this.fitBox();
    const preset = RES_PRESETS[this.settings.resIndex];
    let w = preset.w;
    let h = preset.h;
    if (!w) {
      const dpr = window.devicePixelRatio || 1;
      w = Math.round(box.w * dpr);
      h = Math.round((w * 9) / 16);
    }
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.target.setSize(w, h);
    this.postMaterial.uniforms.uRes.value.set(w, h);
    this.canvas.style.width = box.w + 'px';
    this.canvas.style.height = box.h + 'px';
  }

  render(scene, camera) {
    this.postMaterial.uniforms.uDither.value = this.settings.dither ? 1 : 0;
    this.postMaterial.uniforms.uGrade.value = this.settings.grade ? 1 : 0;
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    this.stats = { triangles: r.info.render.triangles, calls: r.info.render.calls };
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}
