import LOCATIONS from './locations.json';

// Vulgshire world definition. Single source for names and map placement.
// Names are PROVISIONAL: rename here, never hard-code them elsewhere.
// Positions are pixel coordinates on reference/maps/vulgshire-topdown-FINAL.png (1536×1024).

export const WORLD = {
  name: 'Vulgshire',
  subtitle: 'The City of Three Rivers',
  map: {
    image: 'reference/maps/vulgshire-topdown-FINAL.png',
    sizePx: [1536, 1024],
    metresPerPixel: 5.6, // from the map's 0–1,500 m scale bar (~267 px)
  },
  gameScale: 0.25, // the game world is ~1/4 of the map's real-world scale

  lake: { id: 'lake', name: 'Vulgshire Lake', centerPx: [745, 490] },

  // HARD RULE: exactly three rivers, all flowing INTO the lake. None flows out.
  rivers: [
    { id: 'river-north', name: null, entersFrom: 'north', flowsInto: 'lake' },
    { id: 'river-west', name: null, entersFrom: 'west', flowsInto: 'lake' },
    { id: 'river-east', name: null, entersFrom: 'east', flowsInto: 'lake' },
  ],

  districts: [
    { id: 'crownkeep', name: 'The Crownkeep', kind: 'royal fortress', mapPx: [820, 170] },
    { id: 'cathedral', name: 'The Great Cathedral', kind: 'cathedral', mapPx: [935, 255] },
    { id: 'merchants', name: "The Merchants' Quarter", kind: 'commercial', mapPx: [1165, 400] },
    { id: 'bazaar', name: 'The Eastern Bazaar', kind: 'market', mapPx: [1205, 605] },
    { id: 'silver-gate', name: 'The Silver Gate', kind: 'gate', mapPx: [1410, 556] },
    { id: 'southern', name: 'The Southern District', kind: 'residential', mapPx: [962, 772] },
    { id: 'old-town', name: 'The Old Town', kind: 'historic centre', mapPx: [510, 660] },
    { id: 'docks', name: 'The Docks', kind: 'harbour', mapPx: [368, 478] },
    { id: 'western-gates', name: 'The Western Gates', kind: 'gate', mapPx: [243, 350] },
  ],

  outside: [
    { id: 'greyspire', name: 'Greyspire Mountains', kind: 'mountains', mapPx: [165, 210] },
    { id: 'ashenwood', name: 'Ashenwood Forest', kind: 'forest', mapPx: [1240, 125] },
  ],
};

// Pinned scene locations and walkable zones (see docs/map-locations.png).
export { LOCATIONS };

// Map pixel -> game metres for a zone (x = east, z = south).
export function mapToZone(zone, [px, py]) {
  const k = LOCATIONS.metresPerPixel * LOCATIONS.gameScale;
  return { x: (px - zone.originPx[0]) * k, z: (py - zone.originPx[1]) * k };
}

export function validateWorld(world = WORLD) {
  const errors = [];
  if (world.rivers.length !== 3) errors.push(`expected exactly 3 rivers, found ${world.rivers.length}`);
  for (const r of world.rivers) {
    if (r.flowsInto !== 'lake') errors.push(`river ${r.id} must flow into the lake`);
  }
  if (errors.length) throw new Error('Vulgshire world rule broken: ' + errors.join('; '));
  return true;
}
