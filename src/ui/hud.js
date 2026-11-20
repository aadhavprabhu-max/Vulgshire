// Small iron-framed HUD: controls hint + toasts for setting changes.
export function createHud(el, hidden = false) {
  el.innerHTML = `
    <div class="title">VULGSHIRE</div>
    <div>Click to look · <b>WASD</b> move · <b>Shift</b> run · <b>Q/E</b> turn</div>
    <div><b>1</b> resolution · <b>2</b> vertex jitter · <b>3</b> fog · <b>4</b> dither · <b>5</b> colour grade · <b>H</b> hide</div>
    <div class="toast"></div>`;
  const toastEl = el.querySelector('.toast');
  let timer = 0;
  if (hidden) el.classList.add('hidden');
  return {
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
