import mapUrl from '../assets/metro-map.jpg';

// Parchment city map with the metro lines (press M). Built by tools/build_metro_map.py.
// "You are here" is a pulsing marker placed from map-pixel coordinates.
const MAP_W = 1536; // final map size the coordinates refer to

export function createMetroMap() {
  const el = document.createElement('div');
  el.id = 'metromap';
  el.innerHTML = `<div class="frame"><img src="${mapUrl}" alt="Map of Vulgshire"><div class="here"></div><div class="hint">M to close</div></div>`;
  document.body.appendChild(el);
  const img = el.querySelector('img');
  const here = el.querySelector('.here');
  const api = {
    open: false,
    toggle(pos) {
      api.open = !api.open;
      el.classList.toggle('on', api.open);
      if (api.open) api.setHere(pos);
    },
    setHere(pos) {
      if (!pos) {
        here.style.display = 'none';
        return;
      }
      const s = img.clientWidth / MAP_W;
      here.style.display = 'block';
      here.style.left = img.offsetLeft + pos[0] * s + 'px';
      here.style.top = img.offsetTop + pos[1] * s + 'px';
    },
  };
  return api;
}
