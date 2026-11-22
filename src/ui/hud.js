// Small iron-framed HUD: controls hint + toasts for setting changes.
export function createHud(el, hidden = false) {
  el.innerHTML = `
    <div class="title">VULGSHIRE · <span class="scene"></span></div>
    <div>Click (or drag) to look · <b>WASD</b> move · <b>Shift</b> run · <b>Q/E</b> turn · <b>V</b> first / third person · <b>M</b> map</div>
    <div><b>1</b> resolution · <b>2</b> vertex jitter · <b>3</b> fog · <b>4</b> dither · <b>5</b> colour grade · <b>H</b> hide · <b>P</b> stats</div>
    <div><b>[</b> / <b>]</b> previous / next scene</div>
    <div class="toast"></div>`;
  const toastEl = el.querySelector('.toast');
  let timer = 0;
  if (hidden) el.classList.add('hidden');
  const sceneEl = el.querySelector('.scene');
  return {
    setScene(name) {
      sceneEl.textContent = name;
    },
    toast(msg) {
      toastEl.textContent = msg;
      clearTimeout(timer);
      timer = setTimeout(() => (toastEl.textContent = ''), 2200);
    },
    toggle() {
      el.classList.toggle('hidden');
    },
  };
}
