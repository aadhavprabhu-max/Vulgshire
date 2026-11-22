// Runtime settings. All toggles can also be set from the URL,
// e.g. ?res=1&jitter=1&fog=0&dither=0&grade=0&shot=1
// Also read in main.js: ?scene=<id>, ?pose=x,z,yaw,pitch, ?view=first
export const RES_PRESETS = [
  { label: '640×360', w: 640, h: 360 },
  { label: '854×480', w: 854, h: 480 },
  { label: 'native', w: 0, h: 0 }, // fills the letterboxed window at device resolution
];

export const settings = {
  resIndex: 0,
  jitter: false, // PS-style vertex snapping
  fog: true,
  dither: true, // ordered dither + 5-bit-per-channel colour depth
  grade: true, // gentle cold colour grade
  shot: false, // screenshot mode: no HUD, fixed pose
  // Day/night cycle: a full day lasts this many real minutes; the clock starts
  // at startHour (22 = the moody night of the references). ?time=13.5&daylen=14
  dayLengthMinutes: 14,
  startHour: 22,
};

export function loadSettingsFromURL() {
  const q = new URLSearchParams(location.search);
  const flag = (k) => (q.has(k) ? q.get(k) !== '0' : undefined);
  if (q.has('res')) settings.resIndex = Math.max(0, Math.min(RES_PRESETS.length - 1, +q.get('res') | 0));
  for (const k of ['jitter', 'fog', 'dither', 'grade', 'shot']) {
    const v = flag(k);
    if (v !== undefined) settings[k] = v;
  }
  if (q.has('time')) settings.startHour = ((+q.get('time') % 24) + 24) % 24;
  if (q.has('daylen')) settings.dayLengthMinutes = Math.max(0.1, +q.get('daylen'));
}
