// The train's brain (after the owner's train guide): a 1D model. The whole state
// is distance along the line + speed; every 3D position is derived from it.
// Pure JavaScript, no three.js, so it runs headless in the tests.
//
//   boarding --dwell over--> closing --doors shut--> departing --v > 2--> travelling
//      ^                                                                   | braking point
//   stopped <------------- arrived exactly on the mark <-------------- arriving

export function createService({ stops, accel = 1.0, brake = 1.1, vmax = 14, dwell = 10, doorTime = 1.2 }) {
  const S = {
    distance: stops[0],
    speed: 0,
    dir: 1, // +1 toward higher distances, -1 back
    stop: 0, // index of the current / next stop
    target: stops[0],
    state: 'boarding',
    stateTime: 0,
    dwellLeft: dwell,
    doors: 1, // 0 closed .. 1 open (platform side only)
    doorCmd: 1,
    travelled: 0, // total distance (drives wheel spin)
  };
  const setState = (s) => {
    S.state = s;
    S.stateTime = 0;
  };
  const doorsClosed = () => S.doors <= 0;

  function nextStop() {
    if (S.stop >= stops.length - 1) S.dir = -1;
    else if (S.stop <= 0) S.dir = 1;
    S.stop += S.dir;
    S.target = stops[S.stop];
  }

  // §2 motion: brake from v²/2b, then recompute the exact deceleration so it stops on the mark.
  function move(dt) {
    const remaining = Math.abs(S.target - S.distance);
    const stopping = (S.speed * S.speed) / (2 * brake);
    const shouldBrake = S.state === 'arriving' || remaining <= stopping + S.speed * dt + 0.02;
    if (shouldBrake && S.state !== 'arriving') setState('arriving');
    const decel = shouldBrake && remaining > 0 ? (S.speed * S.speed) / (2 * remaining) : brake;
    const prev = S.speed;
    S.speed = shouldBrake ? Math.max(0, S.speed - decel * dt) : Math.min(vmax, S.speed + accel * dt);
    let travel = ((prev + S.speed) * dt) / 2;
    if (shouldBrake && S.speed < 0.05 && remaining < 0.05) travel = remaining;
    if (travel >= remaining) {
      S.travelled += remaining;
      S.distance = S.target;
      S.speed = 0;
      setState('stopped');
      return;
    }
    S.distance += S.dir * travel;
    S.travelled += travel;
  }

  function step(dt) {
    S.stateTime += dt;
    // Door leaves move at a steady rate toward the command.
    S.doors = S.doorCmd > S.doors ? Math.min(1, S.doors + dt / doorTime) : Math.max(0, S.doors - dt / doorTime);
    switch (S.state) {
      case 'boarding':
        if (S.doors >= 1) S.dwellLeft -= dt;
        if (S.dwellLeft <= 0) {
          S.doorCmd = 0;
          setState('closing');
        }
        break;
      case 'closing':
        if (S.stateTime >= 1.5 && doorsClosed()) {
          nextStop();
          setState('departing');
        }
        break;
      case 'departing':
        if (doorsClosed()) move(dt);
        if (S.state === 'departing' && S.speed > 2) setState('travelling');
        break;
      case 'travelling':
      case 'arriving':
        move(dt);
        break;
      case 'stopped':
        if (S.stateTime >= 1) {
          S.doorCmd = 1;
          S.dwellLeft = dwell;
          setState('boarding');
        }
        break;
    }
  }

  return {
    state: S,
    stops,
    /** Advance by a frame, in fixed 1/60 s sub-steps (never skips a stop). */
    update(frameDt) {
      let left = Math.min(frameDt, 0.25);
      while (left > 1e-6) {
        const dt = Math.min(left, 1 / 60);
        step(dt);
        left -= dt;
      }
    },
    /** Send the train toward stop i, starting part-way along the previous leg. */
    approach(i, from = 0.55) {
      const j = i < stops.length - 1 ? i + 1 : i - 1;
      S.distance = stops[i] + (stops[j] - stops[i]) * from;
      S.dir = Math.sign(stops[i] - stops[j]);
      S.stop = i;
      S.target = stops[i];
      S.speed = Math.min(vmax, Math.sqrt(2 * brake * Math.abs(stops[i] - S.distance)) * 0.8);
      S.doors = 0;
      S.doorCmd = 0;
      setState('travelling');
    },
    get canBoard() {
      return (S.state === 'boarding' || S.state === 'stopped') && S.doors >= 0.95;
    },
  };
}
