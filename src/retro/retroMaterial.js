import * as THREE from 'three';

// Shared uniforms for the PS-style vertex snapping ("jitter").
export const retroUniforms = {
  uJitter: { value: 0 },
  uSnap: { value: new THREE.Vector2(160, 90) }, // snap grid in screen space (coarser = wobblier)
};

const SNAP = /* glsl */ `
#include <fog_vertex>
if (uJitter > 0.5) {
  vec4 snapped = gl_Position;
  snapped.xyz /= snapped.w;
  snapped.xy = floor(snapped.xy * uSnap + 0.5) / uSnap;
  snapped.xyz *= gl_Position.w;
  gl_Position = snapped;
}
`;

function onBeforeCompile(shader) {
  applySnap(shader);
}

/** Add the vertex snap to a shader (for materials with their own onBeforeCompile). */
export function applySnap(shader) {
  shader.uniforms.uJitter = retroUniforms.uJitter;
  shader.uniforms.uSnap = retroUniforms.uSnap;
  shader.vertexShader = 'uniform float uJitter;\nuniform vec2 uSnap;\n' + shader.vertexShader.replace('#include <fog_vertex>', SNAP);
}

export function patchMaterial(material) {
  if (material.userData.retroPatched || material.isShaderMaterial) return;
  // Floors stay out of the vertex snap: snapping big, flat, grazing-angle ground
  // makes it swim and fight with the paving on top. Walls keep their wobble.
  if (material.userData.noJitter) {
    material.userData.retroPatched = true;
    return;
  }
  material.onBeforeCompile = onBeforeCompile;
  material.userData.retroPatched = true;
}

export function patchSceneMaterials(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) patchMaterial(m);
  });
}

export function refreshSceneMaterials(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
  });
}

/**
 * A landmark material: thinner fog (fogScale < 1) so a hero building reads
 * through the haze from across the city, plus the usual vertex snap.
 */
export function landmarkMaterial(material, fogScale = 0.5) {
  material.onBeforeCompile = (shader) => {
    applySnap(shader);
    shader.uniforms.uFogScale = { value: fogScale };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFogScale;')
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          #ifdef FOG_EXP2
            float fd = fogDensity * uFogScale;
            float fogFactor = 1.0 - exp( - fd * fd * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar / uFogScale, vFogDepth );
          #endif
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'landmark-' + fogScale;
  material.userData.retroPatched = true;
  return material;
}
