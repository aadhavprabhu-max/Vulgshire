import { floorAt } from '../player/floors.js';

// A tiny crowd director: NPCs either stand and do something (idle / talk /
// read / pray) or walk a list of waypoints (ping-pong or loop), following floor
// heights so they can use stairs. They pause when the player blocks their way
// and carry a collider so the player can't walk through them.

export function createCrowd({ root, colliders, floors = [], ground = 0 }) {
  const npcs = [];

  function add(person, { pos, facing = 0, path = null, speed = 0.9, loop = false, wait = 2, mode }) {
    const start = path ? path[0] : pos;
    const y = floorAt(floors, ground, start[0], start[1], 50);
    person.root.position.set(start[0], y, start[1]);
    person.root.rotation.y = facing;
    if (mode) person.setMode(mode);
    root.add(person.root);
    const col = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, y0: 0, y1: 0, h: 0, dynamic: true };
    colliders.push(col);
    const npc = { person, path, speed, loop, wait, idx: 1, dir: 1, pause: 0, cur: 0, col };
    npcs.push(npc);
    syncCollider(npc);
    return npc;
  }

  function syncCollider(n) {
    const p = n.person.root.position;
    Object.assign(n.col, { minX: p.x - 0.28, maxX: p.x + 0.28, minZ: p.z - 0.28, maxZ: p.z + 0.28, y0: p.y - 1.2, y1: p.y + 1.2, h: p.y + 1.8 });
  }

  function update(dt, t, player) {
    for (const n of npcs) {
      const r = n.person.root;
      // Far-away people are hidden and paused (cheap crowds in big zones).
      if (player) {
        const far = Math.hypot(r.position.x - player.x, r.position.z - player.z) > 85;
        r.visible = !far;
        if (far) continue;
      }
      let speed = 0;
      if (n.path) {
        if (n.pause > 0) {
          n.pause -= dt;
        } else {
          const [tx, tz] = n.path[n.idx];
          const dx = tx - r.position.x;
          const dz = tz - r.position.z;
          const d = Math.hypot(dx, dz);
          // Give way: stop if the player stands just ahead on the same level.
          let blocked = false;
          if (player && Math.abs(player.y - r.position.y) < 1.5) {
            const px = player.x - r.position.x;
            const pz = player.z - r.position.z;
            const pd = Math.hypot(px, pz);
            if (pd < 1.3 && (px * dx + pz * dz) / (pd * d + 1e-6) > 0.2) blocked = true;
          }
          if (d < 0.15) {
            // Next waypoint (ping-pong or loop), with a pause at the ends.
            const last = n.path.length - 1;
            if (n.loop) n.idx = (n.idx + 1) % n.path.length;
            else {
              if (n.idx === last) n.dir = -1;
              else if (n.idx === 0) n.dir = 1;
              n.idx += n.dir;
            }
            if (n.idx === 0 || n.idx === last) n.pause = n.wait;
          } else if (!blocked) {
            const step = Math.min(d, n.speed * dt);
            r.position.x += (dx / d) * step;
            r.position.z += (dz / d) * step;
            speed = n.speed;
            const want = Math.atan2(-dx, -dz);
            let diff = want - r.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            r.rotation.y += diff * Math.min(1, dt * 6);
          }
          const fy = floorAt(floors, ground, r.position.x, r.position.z, r.position.y);
          r.position.y += (fy - r.position.y) * Math.min(1, dt * 12);
        }
        n.cur += (speed - n.cur) * Math.min(1, dt * 8);
        syncCollider(n);
      }
      n.person.update(dt, t, n.cur);
    }
  }

  return { add, update, npcs };
}

// Facing angle that looks from (x, z) toward (tx, tz) (monk convention: 0 = -Z).
export function faceToward(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z));
}
