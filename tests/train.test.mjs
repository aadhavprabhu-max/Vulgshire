// Headless train tests (owner's guide, §9). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/scenes/trainservice.js';

const STOPS = [0, 345, 452, 627, 720, 825, 996];

function run(fps, legs, { spikes = false } = {}) {
  const svc = createService({ stops: STOPS });
  const S = svc.state;
  const log = { arrivals: [], maxSpeed: 0, doorsWhileMoving: 0, movedWithDoorsOpen: 0, reversed: 0, overshoot: 0, t: 0 };
  let last = S.distance;
  let lastState = S.state;
  let rnd = 1;
  while (log.arrivals.length < legs && log.t < legs * 200) {
    rnd = (rnd * 16807) % 2147483647;
    const dt = spikes && rnd % 37 === 0 ? 0.2 : 1 / fps;
    svc.update(dt);
    log.t += dt;
    log.maxSpeed = Math.max(log.maxSpeed, S.speed);
    if (S.speed > 0 && S.doors > 0) log.doorsWhileMoving++;
    if (S.distance !== last && S.doors > 0) log.movedWithDoorsOpen++;
    if ((S.distance - last) * S.dir < -1e-9) log.reversed++;
    const pastTarget = (S.distance - S.target) * S.dir;
    if (pastTarget > 1e-6) log.overshoot++;
    if (S.state === 'stopped' && lastState !== 'stopped') log.arrivals.push({ at: S.distance, stop: STOPS[S.stop], t: log.t });
    if (!Number.isFinite(S.distance) || !Number.isFinite(S.speed)) throw new Error('NaN');
    last = S.distance;
    lastState = S.state;
  }
  return log;
}

for (const fps of [30, 60, 144]) {
  test(`stops on the mark at ${fps} FPS`, () => {
    const log = run(fps, 14);
    assert.equal(log.arrivals.length, 14);
    for (const a of log.arrivals) assert.ok(Math.abs(a.at - a.stop) <= 0.01, `stopped ${a.at} for ${a.stop}`);
    assert.equal(log.overshoot, 0, 'never overshoots');
    assert.ok(log.maxSpeed <= 14 + 1e-9, 'speed limit');
    assert.equal(log.reversed, 0, 'never moves against its direction');
    assert.equal(log.doorsWhileMoving, 0, 'doors closed whenever moving');
    assert.equal(log.movedWithDoorsOpen, 0, 'never moves with doors open');
  });
}

test('frame-rate independent arrival times', () => {
  const a = run(30, 6).arrivals.map((x) => x.t);
  const b = run(144, 6).arrivals.map((x) => x.t);
  a.forEach((t, i) => assert.ok(Math.abs(t - b[i]) < 0.1, `leg ${i}: ${t} vs ${b[i]}`));
});

test('survives frame spikes', () => {
  const log = run(60, 20, { spikes: true });
  for (const a of log.arrivals) assert.ok(Math.abs(a.at - a.stop) <= 0.01);
  assert.equal(log.overshoot, 0);
});

test('1,000 legs without drift or a stuck state', () => {
  const log = run(60, 1000);
  assert.equal(log.arrivals.length, 1000);
  for (const a of log.arrivals) assert.ok(Math.abs(a.at - a.stop) <= 0.01);
});
