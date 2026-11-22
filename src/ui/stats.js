// Toggleable performance readout (P, or ?stats=1): FPS, frame time, and the
// scene pass's triangles and draw calls. Updated twice a second.
export function createStats(renderer) {
  const el = document.createElement('div');
  el.id = 'stats';
  el.hidden = true;
  document.body.appendChild(el);
  let frames = 0;
  let acc = 0;
  let worst = 0;
  let last = performance.now();
  const api = {
    get visible() {
      return !el.hidden;
    },
    toggle(on = el.hidden) {
      el.hidden = !on;
    },
    // Call once per frame after rendering.
    tick() {
      const now = performance.now();
      const ms = now - last;
      last = now;
      frames++;
      acc += ms;
      worst = Math.max(worst, ms);
      if (acc < 500) return;
      const s = renderer.stats || {};
      const mem = renderer.renderer.info.memory;
      api.last = { fps: (frames * 1000) / acc, ms: acc / frames, worst, triangles: s.triangles, calls: s.calls, geometries: mem.geometries, textures: mem.textures };
      if (!el.hidden) {
        const L = api.last;
        el.textContent = `${L.fps.toFixed(0)} fps  ${L.ms.toFixed(1)} ms (worst ${L.worst.toFixed(0)})\n${(L.triangles / 1000).toFixed(0)}k tris  ${L.calls} calls\n${L.geometries} geos  ${L.textures} tex`;
      }
      frames = 0;
      acc = 0;
      worst = 0;
    },
  };
  return api;
}
