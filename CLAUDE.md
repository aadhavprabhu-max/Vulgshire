# VULGSHIRE — project brief for Claude Code

A dark fantasy medieval game styled like an early-2000s 3D game. The setting is Vulgshire, "The City of Three Rivers". All four reference scenes have a first pass (cloister, rooftop, bridge, cathedral). They're waiting for the user's feedback.

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
- Controls: click to lock the mouse and look around, **WASD** or arrow keys to move, **Shift** to run, **Q/E** to turn.
- Scenes: **[** and **]** switch between the four scenes, or open one directly with `?scene=cloister|rooftop|bridge|cathedral`.
- Retro toggles: **1** cycles resolution (640x360, 854x480, native), **2** vertex jitter, **3** fog, **4** dither, **5** colour grade, **H** hides the HUD. These are number keys because browsers reserve most F-keys.
- URL flags: `?res=0|1|2&jitter=1&fog=0&dither=0&grade=0`, `&shot=1` (hides the HUD), `&pose=x,z,yaw,pitch` (debug camera pose).
- Progress screenshots: `node tools/screenshot.mjs screenshots/progress/NNN-name.png ["query"]` renders headless at 640x360. It needs Playwright; in the cloud container it uses the preinstalled global copy.

## Code layout

- `src/main.js`: scene setup, lights, settings keys, main loop.
- `src/retro/`: `RetroRenderer.js` (low-res target, nearest upscale, letterbox, dither, colour grade), `retroMaterial.js` (vertex jitter shader patch), `textures.js` (all procedural textures).
- `src/scenes/index.js`: the scene registry. Each scene module exports `{ id, title, reference, build() }`. `build()` returns `{ root, sky, colliders, cameraBlockers, spawn, spawnYaw, spawnPitch, env: { fog, hemi, dir }, update(dt, t) }`.
- `src/scenes/kit.js`: shared building blocks (pointed arches, world-UV boxes, roofs, spires, merlons, torches, sky dome, geometry merging).
- `src/scenes/town.js`: procedural town (half-timbered houses, gable roofs, lit and dark windows, church spires), merged into a few meshes.
- `src/scenes/fx.js`: blocky smoke columns, ember particles, roof fires.
- `src/scenes/cloister.js` (ref 01), `rooftop.js` (ref 02), `bridge.js` (ref 03), `cathedral.js` (ref 04).
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

- **Bridge (ref 03):** the stone bridge over the NORTH river, just west of the Crownkeep. This comes from the final map. The monk walks toward the keep; the river flows south into the lake.
- **Cathedral (ref 04):** the Great Cathedral beside the Crownkeep. The view is from the west gallery.
- **Cloister (ref 01):** not placed yet. Proposal: the Great Cathedral's cloister.
- **Rooftop (ref 02):** not placed yet. Proposal: a tower in the Old Town looking across the lake.
- **The burning castle** in ref 03 is shown because the reference shows it. Why it burns (if it ever does in the story) is **undecided lore**.

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
- `docs/MASTER_MAP_PROMPT.md`: the master map-generation prompt, verbatim.
- `screenshots/progress/`: numbered progress screenshots (16:9, about 640 px wide).
- `assets/` (planned): game assets, each with a note on its source and licence. Use only original or properly licensed assets.

## Git

- Never push to `main`. Work on feature branches with small commits.

## Ideas for later (don't start without asking)

Build one small area first and get the retro look right: the moonlit cloister or the cathedral interior. Then grow outward, using the final map so each district becomes its own zone.
