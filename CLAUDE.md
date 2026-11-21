# VULGSHIRE — project brief for Claude Code

A dark fantasy medieval game styled like an early-2000s 3D game. The setting is Vulgshire, "The City of Three Rivers". All four reference scenes have a first pass. The bridge scene is the first **fully walkable zone** (North River Crossing, built from the final map). Its castle gate now opens into **Inside the Crownkeep**, a walkable interior with a grand staircase and the Great Hall. First-person view exists (**V**).

## How to work with me

- I'm a chill dude. Keep replies casual and short, with emojis.
- First task: read this file, `docs/MASTER_MAP_PROMPT.md`, and look at every image in `reference/`. Do not write code yet.
- For any coding or deep-planning task, propose a short plan and ask "can I proceed" before you start. For simple questions or lookups, just answer.
- Never edit `docs/MASTER_MAP_PROMPT.md`. If you think it needs a change, tell me why and let me decide.

## Decisions (locked, 2026-11-20)

- **Stack:** Three.js + Vite, plain JavaScript, runs in the browser.
- **Platform:** browser first. A desktop wrapper (Electron or Tauri) may come later.
- **Camera:** third person, over the shoulder, behind the character (every reference screenshot uses this framing).
- **Genre:** exploration + narrative to start. Stealth may be added later. No combat or progression for now.
- **Protagonist:** the monk (black belted robe, lantern), with our own original design. Keep every character clearly original: no look-alikes of existing franchises (for example, no wizard-school-style uniforms).
- **First scene:** the moonlit cloister (`01-moonlit-cloister.png`).
- **Rendering:** internal resolution 640x360 by default (854x480 as an option), always 16:9, upscaled with nearest-neighbour, letterboxed when the window isn't 16:9. The internal resolution is a setting. Textures are small and nearest-filtered with no mipmaps.
- **World scale:** about 1/4 of the map's scale. The map's scale bar gives about 5.6 m per pixel, so the walled city measures roughly 6.3 x 4.7 km at full scale and roughly 1.6 x 1.2 km in game. The lake is roughly 3 x 2 km at full scale and roughly 0.8 x 0.5 km in game.
- **Progress screenshots:** after each meaningful visual change, save a small 16:9 screenshot (about 640 px wide) to `screenshots/progress/` with a numbered, descriptive filename (for example `003-cloister-fog-pass.png`). Compare it with the matching reference image and note in one line what matches and what's off.
- **Naming:** district and landmark names are provisional. Keep them in one data file, never hard-coded across the code.

## Running it

- `npm install` once, then `npm run dev` and open the printed URL.
- Controls: click to lock the mouse and look around, **WASD** or arrow keys to move, **Shift** to run, **Q/E** to turn, **V** for first or third person.
- Scenes: **[** and **]** switch between the five scenes, or open one directly with `?scene=cloister|rooftop|bridge|crownkeep|cathedral` (or `#crownkeep` etc.). Walking through the castle gate (and back out the door) changes zone automatically, with a fade.
- Retro toggles: **1** cycles resolution (640x360, 854x480, native), **2** vertex jitter, **3** fog, **4** dither, **5** colour grade, **H** hides the HUD. These are number keys because browsers reserve most F-keys.
- URL flags: `?res=0|1|2&jitter=1&fog=0&dither=0&grade=0`, `&shot=1` (hides the HUD), `&pose=x,z,yaw,pitch` (debug camera pose), `&view=first`.
- Progress screenshots: `node tools/screenshot.mjs screenshots/progress/NNN-name.png ["query"]` renders headless at 640x360. It needs Playwright; in the cloud container it uses the preinstalled global copy.

## Playable link

- Hosted as a Claude artifact: https://claude.ai/artifact/7eSk5dX1oGP8d5963ZPjj7 (slug `35d1374a-e791-44e3-9aad-3ba1abca1962`). It's private to the owner until they share it from the artifact page.
- To update it: run `npm run build`, then republish `dist/index.html` and `dist/assets/*` to that slug (remove the old hashed asset files).
- Open a scene directly with a hash: `#cloister`, `#rooftop`, `#bridge`, `#cathedral`. Mouse look falls back to click-and-drag when pointer lock is blocked.

## GitHub Pages

- **Live:** https://aadhavprabhu-max.github.io/Vulgshire/ (add `#bridge`, `#crownkeep` and so on to pick a scene).
- `.github/workflows/pages.yml` builds and deploys on every push to `main` (or by running it manually). The repo is public and Pages is set to "GitHub Actions".

## Code layout

- `src/main.js`: scene setup, lights, settings keys, main loop.
- `src/retro/`: `RetroRenderer.js` (low-res target, nearest upscale, letterbox, dither, colour grade), `retroMaterial.js` (vertex jitter shader patch), `textures.js` (all procedural textures).
- `src/scenes/index.js`: the scene registry. Each scene module exports `{ id, title, reference, build() }`. `build()` returns `{ root, sky, colliders, cameraBlockers, spawn, spawnYaw, spawnPitch, env: { fog, hemi, dir }, update(dt, t) }`.
- `src/scenes/kit.js`: shared building blocks (pointed arches, world-UV boxes, roofs, spires, merlons, torches, sky dome, geometry merging).
- `src/scenes/buildings.js`: varied building kit. `src/scenes/town.js`: streets, lot placement along streets, scatter towns. `src/scenes/castle.js`: the Crownkeep.
- `src/data/locations.json`: pinned places and zones on the map. `tools/annotate_map.py` renders `docs/map-locations.png` from it.
- `src/scenes/fx.js`: blocky smoke columns, ember particles, roof fires.
- `src/scenes/cloister.js` (ref 01), `rooftop.js` (ref 02), `bridge.js` (ref 03), `crownkeep.js` (interiors refs), `cathedral.js` (ref 04).
- Scene contract extras: `floors` (walkable surfaces: flat `{minX,maxX,minZ,maxZ,y}` or ramps `{...,y0,y1,axis}`), `portals` (`{minX,maxX,minZ,maxZ,maxY?,to,entry}`), and `entries` (named arrival points `{pos,yaw,pitch}`).
- `src/characters/`: NPCs: `guard.js` (horned helm, spear) and `alchemist.js` (green striped robe).
- `src/player/`: `monk.js` (model, lantern, animation), `controller.js` (third-person camera, movement, collision).
- `src/data/world.js`: world names, map positions and the three-rivers rule check (`validateWorld`).
- `src/ui/hud.js`: the small iron-framed HUD.

## Rendering notes (Milestone 1)

- Lights: a navy hemisphere light, a cold directional moonlight with a hard 1024 px `BasicShadowMap`, and warm point lights for the lantern and wall torches.
- Surfaces under the walkway roof use darker "baked" materials (`stoneShade`, `floorShade`) because the hemisphere light can't be occluded. This keeps the arches reading as dark openings, like in the reference.
- Glowing flowers are unlit `MeshBasicMaterial` crossed quads (instanced).
- Glowing things (lit windows, potions, stained glass, flames) use unlit `MeshBasicMaterial`. Real point lights are kept few: the bridge lights only every other post torch.
- Big skylines (town, castle) are merged into a few meshes. The Crownkeep is built at map scale and then scaled up by 1.45 around the hill top so it dominates the view.

## Scene placement on the map

- All pins live in `src/data/locations.json` and are drawn onto a copy of the map at `docs/map-locations.png` by `python3 tools/annotate_map.py`. Red pins come from the final map; blue pins are proposals. The reference map itself is never edited.
- **Bridge (ref 03) = walkable zone "North River Crossing":** the stone bridge over the NORTH river, just west of the Crownkeep (map px 665,167). The zone covers map px 558–736 × 110–228.
- **Cathedral (ref 04):** the Great Cathedral beside the Crownkeep. The view is from the west gallery.
- **Cloister (ref 01):** not placed yet. Proposal: the Great Cathedral's cloister.
- **Rooftop (ref 02):** not placed yet. Proposal: a tower in the Old Town looking across the lake.
- **The burning castle** in ref 03 is shown because the reference shows it. Why it burns (if it ever does in the story) is **undecided lore**.

## The walkable zone (North River Crossing, `src/scenes/bridge.js`)

- Coordinates: **x = east, z = south**, 1 map px = 1.4 m (map scale × 1/4), origin at the bridge centre. Walkable ground is at y = 0; the river surface is at y = -6 between quays.
- **River:** traced from the map as a centreline (`RIVER_PX`), half-width 21 m, with quay walls, low parapets and moored boats. It flows south into the lake, and it is the only river in this zone.
- **Bridge:** 54 m long with six arches, battlements, post torches (two with smoke), the west bridge tower (the camera starts in it, like ref 03), and guards patrolling to the castle gate.
- **West bank:** the main road SW (toward the Old Town), the west road, a street under the north city wall, north–south streets, alleys, the riverside lane, and a market square with a well. The north city wall has towers.
- **East bank:** the castle road, riverside lane and side street, and the closed Crownkeep gatehouse. The Crownkeep sits on its hill at x ≈ 205 (scaled ×1.45).
- **Bounds:** walkable x −155…98, z −78…88, with invisible walls and wooden barricades wherever a street leaves the zone. Skyline-only districts continue beyond.
- **Colliders:** axis-aligned `{minX,maxX,minZ,maxZ}` or rotated `{cx,cz,hx,hz,rot}`. An optional `h` (height) lets the camera pass over low things like railings; without `h` the camera treats the collider as a full-height wall.

## Inside the Crownkeep (`src/scenes/crownkeep.js`)

- Original design inspired by the mood references in `reference/interiors/` plus real halls: the medieval great hall's raised dais, the Palais Garnier's split ceremonial staircase, and the looping ribbed vault of Prague Castle's Vladislav Hall.
- Coordinates: x = east (you enter from the west door), z = south. `GL = 6.5` is the upper floor.
- **Grand Stair Hall** (x 0–28): a central flight up to a landing, two flights up to the east gallery, two-storey arcades with balustraded galleries, torchères, a tiered chandelier.
- **Great Hall** (x 28–90, on the upper floor): a ribbed vault with looping ribs, moonbeams through the south lancets, a rose window over two rows of lancets, the dais with an **empty throne** (who sits there is undecided lore), the library gallery, a warm brick doorway, an inlaid floor medallion, chandeliers, and two guards at the door.
- Exits: the west door goes back to the castle gate (`bridge`, entry `gate`).
- Colliders use levels (`y0`/`y1`) so balustrades only block on their floor; floors handle the stairs.

## Buildings (`src/scenes/buildings.js`, `town.js`)

- Archetypes: `gable`, `stepped` (crow-stepped gable), `long` (eaves to the street, dormers), `jetty` (overhanging half-timbered upper floors), `hip` (merchant house), `tower` (tower house), `shop` (awning and display window), `church`. Each also varies in size, pastel plaster colour, roof material and tint, chimneys, doors and lit windows.
- `lotsAlongStreets()` lines streets with buildings whose fronts face the street, then fills the blocks behind them. `buildTown()` scatters buildings for distant skylines. Everything is merged per material, with colour stored in vertex colours.

## Notes on the references

- The screenshots are portrait phone-video frames with play and mute buttons laid over them. Ignore the buttons; the game is landscape 16:9.
- The references have sharp geometry and chunky textures. We deliberately render at a low internal resolution, so the game will look chunkier overall than the references. This is intended.
- Crownkeep's "high ground" isn't visible on the flat map, so terrain height there has to be designed by us.
- The dark arch in the south-east wall of the final map is probably where the removed fourth river used to exit. Treat it as an ordinary city gate.

## The look we are matching exactly

The four images in `reference/screenshots/` are the target. Match them, don't modernize them.

- Low-poly early-2000s 3D, chunky pixelated textures (nearest-neighbor), heavy fog.
- Light comes from torches, lanterns, moonlight and stained-glass beams.
- Palette: deep blue, purple and amber. Dark, somber, gothic.

What each screenshot shows:

1. `01-moonlit-cloister.png`: night cloister. Monk in a black robe holding a lantern, a statue, glowing white flowers, gothic arches, full moon.
2. `02-alchemist-rooftop.png`: foggy tower balcony. Alchemist in a green robe, shelves of glowing potion bottles, a hanging lantern, a misty city of spires below.
3. `03-burning-castle-bridge.png`: torch-lit stone bridge. Armored guards walk toward a burning gothic castle under a purple sky.
4. `04-cathedral-interior.png`: view from a cathedral balcony. Pews, a rose window, stained glass, light beams.

## The world

Source of truth for the layout is `reference/maps/vulgshire-topdown-FINAL.png`. It is a strict top-down antique map generated from `docs/MASTER_MAP_PROMPT.md`.

- I hand-edited it to remove a fourth river the generator added. There are exactly **three incoming rivers (north, west, east)** and **no river leaving the lake**. Treat that as a hard rule.
- One enormous central lake, Vulgshire Lake, with several islands, one with a fortress or tower. The city wraps around the shoreline inside a walled, irregular ring.
- North: the Crownkeep royal fortress on high ground, with the Great Cathedral right beside it.
- Around the lake: Merchants' Quarter (north-east), Eastern Bazaar (east, with an arena-like market), Southern District (south, residential), Old Town (south-west), Docks (west shore with piers), Western Gates (west), Silver Gate (east).
- Outside the walls: Greyspire Mountains (north-west), Ashenwood Forest (north-east), farmland and forest all around.
- A few spots near the old river path in the south-east may not line up perfectly because of the edit. Zoom in before relying on exact streets there.
- `reference/maps/vulgshire-angled-dark.png` and `vulgshire-angled-parchment.png` are earlier angled-view maps. Use them only for mood and skyline ideas. Do not use them for geography, because they don't have exactly three rivers.

## Repo layout

- `reference/maps/`: final top-down map plus the two older angled maps.
- `reference/screenshots/`: the four look-and-feel stills.
- `reference/interiors/`: two mood images for the Crownkeep interior (a gothic hall-library and a dark grand staircase), added by the user. They look like found images, so treat them as **mood references only**: never ship them or copy them as game assets.
- `docs/MASTER_MAP_PROMPT.md`: the master map-generation prompt, verbatim.
- `screenshots/progress/`: numbered progress screenshots (16:9, about 640 px wide).
- `assets/` (planned): game assets, each with a note on its source and licence. Use only original or properly licensed assets.

## Git

- Never push to `main`. Work on feature branches with small commits.

## Ideas for later (don't start without asking)

Build one small area first and get the retro look right: the moonlit cloister or the cathedral interior. Then grow outward, using the final map so each district becomes its own zone.
