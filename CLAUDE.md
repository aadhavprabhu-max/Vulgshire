# VULGSHIRE — project brief for Claude Code

A dark fantasy medieval game styled like an early-2000s 3D game. The setting is Vulgshire, "The City of Three Rivers". All four reference scenes have a first pass. The **North Shore** is the big walkable zone: the whole district the owner outlined (west of the north river, the Crownkeep, the Great Cathedral and its square, the north lake shore, the Merchants' Quarter), built from the final map. Its castle gate now opens into **Inside the Crownkeep**, a walkable interior with a grand staircase and the Great Hall. First-person view exists (**V**).

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

- `npm install` once, then `npm run dev` and open the printed URL. `npm test` runs the headless train tests.
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
- `src/characters/`: NPCs: `guard.js` (horned helm, spear), `alchemist.js` (green striped robe), `people.js` (original character kit: gowns, robes, doublets, servants, priests, heralds; hats; carried items; idle / talk / read / pray poses) and `crowd.js` (walks NPCs along waypoints, follows floors and stairs, gives way to the player, gives them colliders).
- `src/player/floors.js`: walkable-surface maths shared by the player and NPCs.
- `src/player/`: `monk.js` (model, lantern, animation), `controller.js` (third-person camera, movement, collision).
- `src/data/world.js`: world names, map positions and the three-rivers rule check (`validateWorld`).
- `src/ui/hud.js`: the small iron-framed HUD.

## Sky

- There is no sky dome. Outdoor scenes use a seamless equirectangular night sky as `scene.background` (`tex.nightSky(horizon)`, 2048 px so stars stay crisp), plus moon and halo sprites (`buildSky({ moonDir, moonSize, horizon })`). `horizon` matches the scene's fog colour.

## Rendering notes (Milestone 1)

- Lights: a navy hemisphere light, a cold directional moonlight with a hard 1024 px `BasicShadowMap`, and warm point lights for the lantern and wall torches.
- Surfaces under the walkway roof use darker "baked" materials (`stoneShade`, `floorShade`) because the hemisphere light can't be occluded. This keeps the arches reading as dark openings, like in the reference.
- **Floors** (`floorMat()` in `kit.js`): mip-mapped floor textures (`floorTex()`: nearest magnification, nearest-picked mips, so floors stay chunky up close but don't sparkle far away), and no vertex snap. Stacked ground surfaces sit on `LAYER` heights (ground 0, streets 0.04, squares 0.07, plazas 0.08) with polygon offsets, so they never z-fight. Walls and everything else keep unfiltered textures with no mipmaps.
- Camera near/far is 0.2 / 800. Press **P** (or `?stats=1`) for FPS, triangles and draw calls.
- Glowing flowers are unlit `MeshBasicMaterial` crossed quads (instanced).
- Glowing things (lit windows, potions, stained glass, flames) use unlit `MeshBasicMaterial`. Real point lights are kept few: the bridge lights only every other post torch.
- Big skylines (town, castle) are merged into a few meshes. The Crownkeep is built at map scale and then scaled up by 1.45 around the hill top so it dominates the view.

## Scene placement on the map

- All pins live in `src/data/locations.json` and are drawn onto a copy of the map at `docs/map-locations.png` by `python3 tools/annotate_map.py`. Red pins come from the final map; blue pins are proposals. The reference map itself is never edited.
- **Bridge (ref 03) = walkable zone "North River Crossing":** the stone bridge over the NORTH river, just west of the Crownkeep (map px 665,167). The zone covers map px 558–736 × 110–228.
- **Cathedral (ref 04):** the Great Cathedral beside the Crownkeep. The view is from the west gallery.
- **Cloister (ref 01):** the Great Cathedral's cloister, entered from the east transept door.
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

## The North Shore (`src/scenes/bridge.js`, scene id still `bridge`)

- **Terrain from the map:** `tools/build_masks.py` reads the water (lake + rivers) from the final map and the walkable district from the owner's outline (`reference/maps/vulgshire-north-shore-outline.png`), and writes `src/data/mapmasks.json`. `src/scenes/mapterrain.js` turns these into ground, quay walls and shore parapets, and gives `isWater` / `inRegion` / `walkable` tests. The controller keeps the player on walkable ground (`built.walkable`).
- **Same coordinates as before:** origin at the north-river bridge, x = east, z = south, 1 map px = 1.4 m. Water is at y = -4.
- **Landmarks** (`src/scenes/landmarks.js`):
  - **Grand Central Station:** map px 550,310, where all the metro lines meet; a gothic hall with a clock tower, rose window and lantern plaza.
  - **The Great Cathedral exterior:** twin spires, rose window, flying buttresses, a square with a fountain. Its door goes to the `cathedral` scene, and a door on the east transept goes to the `cloister`.
  - **The Merchants' Guildhall:** an arcaded hall with a lookout tower.
  - Plus the north city wall traced along the outline, the bridge and the Crownkeep gate.
- **Streets:** the castle-side ones from before plus about 20 traced from the map (map-pixel polylines in `streets`).
- **Buildings:** about 1,500 lots via `lotsAlongStreets` (spatial-hashed). `src/scenes/chunks.js` splits them into 100 m chunks: a cheap `min` LOD everywhere (4 materials) and the detailed `high` LOD built lazily within 150 m. Every lot has a `seed`, so near and far versions match. The rest of the city is a skyline of `scatterLots` in 250 m far-only chunks.
- **Performance:** about 300–420k triangles and about 850 draw calls. Colliders sit in an 8 m grid in the controller; NPC colliders are `dynamic`. NPCs further than 85 m and flames further than 150 m are hidden.
- **New archetypes:** `arcade` (arcaded ground floor), `turret` (corner turret with a cone cap), `baroque` (Prague-style decorated gable with volutes and urns).

## The Ancient Underground (`src/scenes/metro.js`, scene id `metro`)

- **Line II, The Pilgrim's Way (orange)** is built. The other 8 lines are on the map only.
- **Data** lives in `src/data/metro.json`: all 9 lines (names, numerals, colours, `open`) and the orange stations (names, `mapPx` snapped onto the owner's drawn line, `style`). Station names on signs come from here.
- **Station order:** Triflumen ⇄, Northern Quays, Crownkeep Stair, The Great Cathedral, Ashenwood Gate, Belfry Row, Merchants' Quarter ⇄.
- **Route = the owner's drawing:** `tools/trace_metro_path.py` traces the centreline of the orange stroke into `metro.json` (`lines[].path`, map pixels). `src/scenes/metroline.js` turns it into a smooth 1 m-sampled curve in North Shore world coordinates, giving `frame(s)`, `toWorld(s, d)`, `toLine(x, z)` and `yawToWorld`.
- **Built straight, then bent:** the line is about 988 m long, with stations at line metres 0, 346, 452, 627, 720, 825 and 996 (Northern Quays sits just east of the river so the ramp fits). Everything is built in line space (s along the track, d across it; platforms on the −d side, top at y = 1 above the rail, 56 m platforms), then `bendGroup` tessellates and bends it onto the curve and adds the height profile.
- **One height profile for both scenes** (`PROFILE` and `railY(s)` in `metroline.js`): streets at 0, water at −4, tunnels and stations with the rail at −10. Eased ramps climb from s 40 to 160 and fall from 214 to 300; the viaduct (s 160–214) carries the rail at street level. The line is open to the sky between the tunnel mouths at s 90 and 267 (rail about −6.3 there, so the tunnel roofs stay under the street).
- **Physics on the curve:** colliders and floors become rotated boxes (`bendBox`), portals become world AABBs (`bendAABB`), and NPC positions and paths are converted too. 
- **World space = North Shore coordinates:** `mapPos` is exact. The banks, city and Crownkeep around the river crossing are where they really are (built from the map masks, raised to y = 14).
- **Station looks** follow the owner's renders (`reference/metro-station-designs.webp`). The render titles are not used as names; their looks map to stations like this:

  | Station | Look |
  |---|---|
  | Triflumen | grand hall (clock, stairs, chandeliers) |
  | Northern Quays | sewers (water channel, stalactites) |
  | Crownkeep Stair | castle (stained glass, banners, guard) |
  | The Great Cathedral | cathedral depths (ribbed vault, chandeliers, pilgrims) |
  | Ashenwood Gate | fortress (round pillars, iron gates, guards) |
  | Belfry Row | crypt (green braziers, winged statue) |
  | Merchants' Quarter | citadel (brick, lamps, benches, crates) |

  The Ironforge Junction render is spare.
- **River crossing:** between Triflumen and Northern Quays the train leaves a tunnel mouth (s 90), climbs a walled cutting, crosses the lake mouth of the north river on a low arched viaduct at street level (s 160–214), and dives back down a cutting into the tunnel at s 267. The city and the Crownkeep stand around it and the fog thins out there.
- **The train** (`src/scenes/train.js`, from `reference/metro-train-design.webp`):
  - 3 flat-faced cars in a weathered green and cream livery, with the "VULGSHIRE" crest and cab lamps (white head lights at the front, red tail lights at the back, switching with direction)
  - hollow cars: real window openings with see-through glass, real doorways with sliding leaves (platform side only), benches, poles and lamps
  - each body sits on the chord between its two bogies (±5 m), so it pitches on ramps and yaws on curves; bellows stretch between cars; wheels spin
  - `train.place(frame, railY, s, { dir, travelled })` places everything from one distance; `setDoors(0..1)` slides the doors
- **The train brain** (`src/scenes/trainservice.js`): one 1D number (distance along the line) plus speed. A state machine (boarding → closing → departing → travelling → arriving → stopped → boarding) brakes from v²/2b and lands exactly on the stop mark at any frame rate (fixed 1/60 s sub-steps, frame capped at 0.25 s). Doors are closed whenever it moves. `npm test` checks this (`tests/train.test.mjs`).
- **Riding:**
  - Entering a station calls `onEnter`, which sends the train toward you.
  - Platform-edge colliders are 0.25 m chunks; only those wholly inside an open doorway open, and a threshold floor bridges the gap there.
  - Stepping through an open door makes you ride (switching to first person). You are then held in the car's own space (`controller.carried`): the car walls and benches block you, you can walk between cars through the gangways, the view turns with the car, and you can only get off through an open platform-side door.
- **Street side** (North Shore):
  - Grand Central Station's doors lead to Triflumen.
  - The other stations have stone kiosks placed at the nearest clear spot to their `mapPx`.
  - Platform stairs lead back up to those kiosks.
  - The same cutting, viaduct and tunnel mouths (same curve, same heights) are in the North Shore. The ground there has a slot with retaining walls and parapets; houses keep clear of it. A street-side train runs on the same train brain between two stops hidden in the tunnels.
- **The map (M):** `src/ui/metromap.js` shows `src/assets/metro-map.jpg` (built by `tools/build_metro_map.py` from the final map plus the owner's line drawing) with a pulsing "you are here" dot. Scenes can provide `mapPos(player)`.
- **Scene contract additions:** `onEnter(entry)`, `mapPos(player)`. The update `ctx` now includes `scene`.

## Inside the Crownkeep (`src/scenes/crownkeep.js`)

- Original design inspired by the mood references in `reference/interiors/` plus real halls: the medieval great hall's raised dais, the Palais Garnier's split ceremonial staircase, and the looping ribbed vault of Prague Castle's Vladislav Hall.
- Coordinates: x = east (you enter from the west door), z = south. `GL = 6.5` is the upper floor.
- **Grand Stair Hall** (x 0–28): a central flight up to a landing, two flights up to the east gallery, two-storey arcades with balustraded galleries, torchères, a tiered chandelier.
- **The court:** 17 NPCs. Walkers: a servant carrying a tray up and down the grand stairs, a guard patrolling the galleries, a lady strolling, a noble circling the hall, a candle-bearer. Standing: nobles talking, a scribe reading by the library, a priest praying near the throne, heralds, gossips at the warm doorway.
- **Great Hall** (x 28–90, z ±13, on the upper floor; the vault springs at GL + 10.5): two colonnades of red-marble columns with gilded capitals, three-tier chandeliers, tall 9.5 m lancets, a 5 m rose window with two smaller roses, a ribbed vault with looping ribs, moonbeams through the south lancets, a rose window over two rows of lancets, the dais with an **empty throne** (who sits there is undecided lore), the library gallery, a warm brick doorway, an inlaid floor medallion, chandeliers, and two guards at the door.
- Exits: the west door goes back to the castle gate (`bridge`, entry `gate`). The cathedral's west door and the cloister's west door lead back to the North Shore (entries `cathedral`, `cloister`).
- Colliders use levels (`y0`/`y1`) so balustrades only block on their floor; floors handle the stairs.

## Buildings (`src/scenes/buildings.js`, `town.js`)

- **The modular kit** (archetype `kit`, about 55 % of houses): a seeded body (`box`, `L`, `chamfer`, `jetty`, `tower`) + roof (`gable`, `hip`, `mansard`, `shed`, `stepped`, `cross`, `spire`, `pyramid`) + add-ons (dormers, bays, balconies, chimneys, outside stairs, shop fronts, signs). Tune it with `KIT` (weights, height range, district palettes) and `ARCHETYPE_WEIGHTS`. Lots can force `kitBody` and `kitRoof`.
- **Atlas:** every opaque building texture is packed into one atlas (`src/retro/atlas.js`, per-vertex `tile` rect + `fract()` tiling), so a chunk of houses is about 5 draw calls. Add new building textures to `texFor` in `materials()`.
- `BuildingSet.build()` also returns `doors` (world-space front doors with lot and use).

- Archetypes: `gable`, `stepped` (crow-stepped gable), `long` (eaves to the street, dormers), `jetty` (overhanging half-timbered upper floors), `hip` (merchant house), `tower` (tower house), `shop` (awning and display window), `church`. Each also varies in size, pastel plaster colour, roof material and tint, chimneys, doors and lit windows.
- Detail level `high` (walkable streets) adds: stone sills, lintels and jambs on windows; painted shutters (some closed); flower boxes; stone door surrounds with steps; door lanterns; plinths; corner quoins; string courses; ridge caps; chimney pots; carved brackets under jetties; oriel (bay) windows; wooden balconies; shop signs. Skylines use `low`.
- 128 px textures: weathered lime plaster (3 m repeat), three timber-frame patterns sized to one 3 m storey, moss-flecked clay tiles and slates, town ashlar.
- The town has street life: market stalls around the well, barrels, crates, carts, benches, lamp posts, and about 16 townsfolk (`streetLife()` in `bridge.js`).
- Render stats: `window.__vulgshire.info` gives the scene pass's triangles and draw calls. The town is about 490k triangles and 700 calls.
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
- `reference/metro-train-design.webp`, `reference/metro-station-designs.webp`: the owner's metro designs (train and the 8 station looks).
- `reference/interiors/`: two mood images for the Crownkeep interior (a gothic hall-library and a dark grand staircase), added by the user. They look like found images, so treat them as **mood references only**: never ship them or copy them as game assets.
- `docs/MASTER_MAP_PROMPT.md`: the master map-generation prompt, verbatim.
- `screenshots/progress/`: numbered progress screenshots (16:9, about 640 px wide).
- `assets/` (planned): game assets, each with a note on its source and licence. Use only original or properly licensed assets.

## Git

- Never push to `main`. Work on feature branches with small commits.

## Ideas for later (don't start without asking)

### Underground metro (after the whole city is built)

- The owner drew the network in `reference/maps/vulgshire-metro-lines.png` (on the final map). Its style is undecided (ancient ruin rail, alchemist-powered, or crypt carts); keep it fantasy, not industrial.
- **The hub:** every line meets on the north-west lake shore, next to where the north river enters the lake.
- **Purple:** north wall to the hub.
- **Orange:** hub, along the north shore, then a loop up around the Great Cathedral whose top stop is the **Crownkeep entrance**, then down to the Merchants' Quarter.
- **Black:** Merchants' Quarter, down the east side past the Eastern Bazaar, to the south-east.
- **Dark blue:** hub, **under the lake**, to the Eastern Bazaar.
- **Cyan:** hub, **under the lake**, to the island fortress.
- **Light blue:** hub, the Docks, toward the Western Gates.
- **Green:** a Docks branch into the west Old Town.
- **Red:** hub, down the west shore, Old Town, then south into the Southern District.
- **Yellow:** a crosstown line along the south shore, joining Black in the south-east.
- Stations would be zones joined by the existing portal and fade system.

Build one small area first and get the retro look right: the moonlit cloister or the cathedral interior. Then grow outward, using the final map so each district becomes its own zone.
