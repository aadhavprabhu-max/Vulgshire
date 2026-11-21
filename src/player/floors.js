// Walkable surfaces shared by the player and NPCs.
// A floor is flat {minX,maxX,minZ,maxZ,y} or a ramp {minX,maxX,minZ,maxZ,y0,y1,axis}.
export const STEP = 0.6; // highest step climbed without help

export function surfaceY(f, x, z) {
  if (f.rot !== undefined) {
    // Rotated flat floor {cx, cz, hx, hz, rot, y} (same convention as rotated colliders).
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    const dx = x - f.cx;
    const dz = z - f.cz;
    return Math.abs(dx * c - dz * s) <= f.hx && Math.abs(dx * s + dz * c) <= f.hz ? f.y : null;
  }
  if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) return null;
  if (f.y !== undefined) return f.y;
  const t = f.axis === 'x' ? (x - f.minX) / (f.maxX - f.minX) : (z - f.minZ) / (f.maxZ - f.minZ);
  return f.y0 + (f.y1 - f.y0) * t;
}

// Highest floor at (x, z) that is within a step of height y (ground otherwise).
export function floorAt(floors, ground, x, z, y) {
  let best = ground;
  for (const f of floors) {
    const h = surfaceY(f, x, z);
    if (h !== null && h <= y + STEP && h > best) best = h;
  }
  return best;
}
