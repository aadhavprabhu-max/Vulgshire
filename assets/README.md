# Assets

Every asset used so far is **original and generated in code**. There are no downloaded textures, models or sounds.

| Asset | Source | Licence |
|---|---|---|
| All textures: stone, castle stone, flagstone, cobbles, slate, roof tiles, plaster, wood, grass, cloth, striped robe, armour, statue, water, skies (night, storm, overcast), plain and half-timbered plaster, awning, door, moon, flowers, flame, smoke, mist, light shaft, stained glass, rose windows, banner, windows, lantern | Drawn procedurally on small canvases in `src/retro/textures.js` | Original, part of this project |
| All architecture, the varied town buildings, the castle, the monk, guards, alchemist, statue, props | Built from Three.js primitives in `src/scenes/`, `src/player/` and `src/characters/` | Original, part of this project |

Libraries: [three.js](https://threejs.org) (MIT), [Vite](https://vitejs.dev) (MIT).

When adding files here, add a row: what it is, where it came from, its licence.

`docs/map-locations.png` is generated from the reference map by `tools/annotate_map.py` (pins and labels drawn on a copy).

The images in `reference/interiors/` are mood references supplied by the project owner (source unknown). They are not game assets and must not be shipped or traced.
