# Vulgshire upgrade: notes

Working notes for the five-part upgrade (floor flicker, building kit, keep, day/night, enterable buildings). Branch `vulgshire-upgrade`.

Owner decisions (2026-11-22):
- The keep reference is `docs/keep_reference.png`, a crop of `reference/screenshots/03-burning-castle-bridge.png`. Match its shapes closely: a dense cluster of tall pointed spires.
- **Flames on the keep at night only.** They fade out towards morning and back in at dusk.
- One full day takes 14 minutes (in config). There's a key to scrub and pause time, and the clock starts at the current purple night.
- Interiors are believable empty rooms. Build the system first, prove it on a tavern, a shop and a house, then switch it on for all buildings. NPCs and loot only if the owner asks.
- After this upgrade: another city zone, better-looking water, and 2 more metro lines.

## Phase 0: investigation and baseline

### Architecture
- Modular ES modules, built with **Vite 8**, **three.js 0.187**. No single-file build.
- `src/main.js` holds the one camera, the lights, the key bindings and the main loop.
- Scenes come from a registry (`src/scenes/index.js`). Each scene's `build()` returns a root group, colliders, floors, portals and so on (see CLAUDE.md).
- **Buildings (primitive-shape code):**
  - `src/scenes/buildings.js`: `BuildingSet`, 10 archetypes (`gable, stepped, long, jetty, hip, tower, shop, arcade, turret, baroque`) and 3 detail levels (`min`, `low`, `high`).
    - Pieces are pushed into per-material "buckets" of geometry, and `build()` merges each bucket into one mesh, so there is one draw call per material per set.
    - Colour lives in vertex colours, so different tints still share a material.
  - `src/scenes/town.js`:
    - `lotsAlongStreets()` places houses facing the streets and fills the blocks behind them (spatially hashed).
    - `scatterLots()` places the distant skyline.
    - `streetGeometry()` builds the street paving strips.
  - `src/scenes/chunks.js`:
    - Splits the lots into 100 m chunks (250 m for the skyline).
    - A `min` version of every chunk is built at load; the `high` version is built lazily within 150 m (one chunk per frame) and thrown away beyond 210 m.
    - Chunks beyond `far` (520 / 640 m) are hidden.
  - `src/scenes/kit.js`: shared helpers (`boxGeo`, `mergedMesh`, arches, roofs, spires, merlons, torches).
- **The Crownkeep exterior:** `src/scenes/castle.js` (`buildCastle`, about 140 lines).
  - It's built from boxes, towers and spire cones, with lit-window quads.
  - The fires on the roofs and the smoke come from `fx.js` (`fireCluster`, `smokeColumn`).
  - Used by `bridge.js` (scaled ×1.45 around the hill top) and `metro.js` (at the river crossing).

### The retro pipeline (to respect everywhere)
- `src/retro/RetroRenderer.js`:
  - draws the scene into a **640×360 HalfFloat render target** (854×480 or native as options, key 1), with a 24-bit depth renderbuffer
  - upscales with nearest-neighbour and letterboxes to 16:9
  - the post shader applies the **ordered dither + 5-bit colour** (key 4) and the **colour grade** (key 5)
- `src/retro/retroMaterial.js`:
  - **vertex snap ("jitter")**: snaps clip-space **x and y** (not z) to a 160×90 screen grid
  - patched into every scene material through `onBeforeCompile`
  - **off by default** (`settings.jitter = false`), toggled with key 2
- `src/retro/textures.js`: every texture is a small procedural canvas with **NearestFilter for both mag and min, and no mipmaps** (a locked decision in CLAUDE.md).
- Fog: `FogExp2`, per scene (North Shore colour 0x170d20, density 0.0052).

### Camera and depth
- `PerspectiveCamera(58°, 16/9, near 0.1, far 1000)` in `main.js`.
- **No `logarithmicDepthBuffer`**, and the depth buffer is 24-bit.
- On the North Shore the fog is 99 % opaque by about 410 m and the skyline chunks stop at 640 m, so `far` can come in to about 700 without losing anything visible.
- Shadows: one directional light with a 1024² `BasicShadowMap`, a fixed box per scene (North Shore: ±45 m around the bridge). It does not follow the player.

### Baseline (North Shore, 640×360, scene pass)
- New: the **P** key (or `?stats=1`) shows FPS, frame time, triangles, draw calls, geometries and textures (`src/ui/stats.js`). `window.__vulgshire.perf` exposes the same numbers.

| Pose | Triangles | Draw calls |
|---|---|---|
| Bridge spawn, looking at the castle | 335k | 924 |
| Market square | 351k | 557 |
| Cathedral square | 285k | 283 |

- About 735 geometries are live.
- FPS measured in the cloud container is **not meaningful**: it uses a software renderer (SwiftShader) and gets about 5–10 FPS. The owner should read the real FPS with **P** on their own machine. Triangles and draw calls are exact everywhere and are the numbers to hold.
- "Before" screenshots: `screenshots/progress/043`–`045`.

### The floor flicker: what it is
Two different things look like "the floor flickers when I walk":

**1. Stacked, nearly coplanar surfaces (real z-fighting).** A raycast probe over the whole walkable area (14,483 samples, 3 m grid) found:

| Where | What | Gap |
|---|---|---|
| About 10 % of the walkable area | street paving (`flagstone`) over the ground (`cobble`) | 1.5 cm |
| Round squares | square paving over street paving | **1 mm** (0.016 vs 0.015) |
| Station and cathedral plazas | plaza paving over the ground | 3 cm |
| Street crossings | street strips overlapping each other in the same mesh, with different UV directions | 0 |
| **The bridge you spawn on** | the bridge deck top (y = 0) exactly coplanar with the map ground, which runs straight under it (the `skip` option of `buildGround` only skips parapets) | 0 |
| A few rooftops | two houses' roofs touching in the same plane | 0 |

The ground itself is made of **row strips up to 1.5 km long** (one quad per map-pixel row). These long sliver triangles snap badly once jitter is on.

**2. Texture shimmer (aliasing).** Floor textures use nearest filtering with no mipmaps at 640×360, so distant cobbles and flagstones "crawl" and sparkle when the camera moves a fraction of a pixel. A test that moved the camera 3 cm between shots:

| | Bridge | Street | Market |
|---|---|---|---|
| Textured, jitter off: pixels that flip and flip back | 1,071 | 587 | 383 |
| Same, jitter on | 2,704 | 871 | 470 |
| Same pose, no move (animation noise) | ≤160 | ≤30 | ≤110 |
| Flat colour per material (no textures), moving | ≈ static noise | | |

So most of the visible flicker when walking is **texture shimmer**, which the vertex jitter roughly doubles. On top of that there is **real z-fighting** on the bridge deck, the squares and the street crossings.

### Proposed Phase 1 fixes (smallest first)
1. **Geometry:**
   - Cut the ground out under the bridge deck.
   - Put each kind of surface on its own height: ground 0, streets +3 cm, squares and plazas +6 cm.
   - Give the paving `polygonOffset` so it always wins.
   - Clean up street overlaps at crossings (one material, offset per street).
2. **Depth:** near 0.1 → 0.25 and far 1000 → 750 (still past the fog), checked per scene.
3. **Ground mesh:** build it from short pieces (chunked strips at most about 50 m long) instead of 1.5 km slivers, so snapping stays stable.
4. **Texture shimmer, needs the owner's OK** (it touches the locked "no mipmaps" rule):
   - Give **floor textures only** a `NearestMipmapNearestFilter` with a few hand-built mip levels.
   - Up close they stay exactly as chunky as now; far away they stop sparkling.
   - The alternative is to leave the textures alone and only fix the geometry.
5. **Jitter:** leave the ground out of the vertex snap (walls keep wobbling) so floors don't swim when jitter is on.

## Phase 1: floor flicker (done)
- **Layers:** `LAYER` in `kit.js`: ground 0, streets +4 cm, squares +7 cm, plazas +8 cm.
  - Paving materials also get a `polygonOffset` that grows with the layer.
  - Squares now use the same world-space UVs as streets, so where they overlap they look identical.
- **The bridge:** the ground is cut out under the deck (`buildGround({ noGround })`), and the deck top sits at +2 cm.
- **Ground mesh:** row strips are capped at 64 map pixels (about 90 m), so there are no more kilometre-long slivers.
- **`floorMat()`:** floors in every scene use mip-mapped floor textures (`floorTex()`, nearest-mip, so they're still chunky up close) and stay out of the vertex snap (`userData.noJitter`). Walls keep their wobble and their unfiltered textures.
- **Camera:** near 0.1 → 0.2, far 1000 → 800. The moon sits at about 310 m and the skylines at most 640 m, so nothing visible is lost.
- **Results:**
  - The stacked-surface probe went from **3,928 overlapping samples to 7**. The 7 left are props touching, like an awning on a post.
  - The textured "nudge the camera" test now only flags one-pixel texel edges, which is the intended nearest-neighbour look.
  - Distant cobbles and flagstones no longer sparkle.
- **Cost:** +~19k triangles (the shorter ground strips), same draw calls. All 6 scenes load without errors.

## Phase 2: modular building kit (done)
- **The kit** (`BuildingSet.addKit` in `buildings.js`, archetype `kit`): each house is a seeded **body + roof + add-ons + colours**.
  - Bodies: `box`, `L` (a back range plus a forward wing around a small yard), `chamfer` (cut front corners, with corner windows), `jetty` (overhanging timber upper floor), `tower`.
  - Roofs: `gable` (ridge either way), `hip`, `mansard` (steep lower slopes with dormers), `shed` (a lean-to with gable infill), `stepped` (crow steps), `cross` (cross gables on L-houses), `spire` and `pyramid` (towers).
  - Add-ons: dormers, bay (oriel) windows, balconies, 0–2 chimneys, outside wooden stairs to a first-floor door (L-houses), shop fronts with display windows and awnings, hanging signs, timber framing, shutters, flower boxes, quoins and string courses.
- **Knobs:** `KIT` (exported):
  - weights for bodies, roofs and add-ons
  - the eaves height range
  - district palettes (`default`, `merchant` near the Guildhall, `castle` with more stone near the Crownkeep); lots carry `district`
  - per-lot overrides `kitBody` and `kitRoof` (for design and debugging)
  - `ARCHETYPE_WEIGHTS` keeps the older hand-made archetypes (shop, arcade, baroque, turret, church and so on) in the mix, with about 55 % of houses coming from the kit
- **Doors:** every building records its front door in world space (`BuildingSet.doors`: position, facing, width, lot and use: house, shop or tavern). This is for Phase 5.
- **Optimisation:**
  - **Texture atlas** (`src/retro/atlas.js`): all 13 opaque building textures are packed into one 512 px canvas. Each vertex carries its tile rectangle and the shader wraps UVs with `fract()`, so tiling, nearest filtering and the vertex snap are unchanged.
    - A chunk of houses is now about 5 draw calls (walls, details, awnings, lit windows, dark windows) instead of about 16.
    - Merging per chunk beats one draw call per house or instancing: a whole 100 m chunk with hundreds of windows and chimneys costs the same few calls.
  - **The train:** each car's static parts are merged per material. Only the platform-side door leaves and the cab lamps stay separate, about 70 → 15 meshes per car.
  - LOD and culling are unchanged (detailed within 150 m, cheap shells to 520 m, skyline to 640 m, all inside the fog).
- **Numbers (Phase 0 baseline → now):**

| Pose | Draw calls | Triangles |
|---|---|---|
| Bridge spawn | 924 → **860** | 335k → **327k** |
| Market | 557 → **517** | 351k → **332k** |
| Cathedral square | 283 → **230** | 285k → **295k** |

  More shapes, fewer calls.
- **Also fixed:** skyline houses in the metro scene no longer poke down through the station vaults (they now keep clear of every station hall).

## Phase 3: the keep (done)
- `castle.js` is rebuilt after `docs/keep_reference.png`, a dense cluster of gothic towers:
  - **Towers:** each one is a square shaft with corner buttresses and pinnacles, an octagonal belfry full of lit lancets, and a needle spire with lit lucarnes and a finial.
  - **The Great Spire** stands just right of centre and is the tallest, about 160 m. **The Royal Tower** on the right is a tall block of lit windows.
  - **Left of centre:** a medium spire, then a cluster of smaller spires and round turrets with conical caps.
  - **Palace:** four ranges with steep roofs, ridge pinnacles and lit dormers.
  - **Front:** a crenellated curtain wall with square towers, corner turrets and a twin-towered gatehouse.
- **Scale:** ×1.8 (was ×1.45) on a bigger hill (top r 66, base r 106). Both scenes share `CROWNKEEP` and `CROWNKEEP_PRECINCT`, and houses keep out of the precinct.
  - The castle road has a walkable corridor through the gate, so the gate portal is still reachable (tested: walking in still loads Inside the Crownkeep).
  - Heights are tuned so the whole cluster fits in the frame from the bridge, like the reference.
- **Light:**
  - Warm lit windows and belfries.
  - Additive glow sprites in every belfry.
  - Two big amber fill lights on the facade.
  - Lighter slate with a faint violet self-glow, so the needles read against the sky.
  - Landmark materials use **45 % fog** (`landmarkMaterial()`), so the keep shows over the rooftops from across the district.
- **Fires only at night:**
  - The roof fires, wall braziers, smoke columns and embers are in `castle.nightObjects`.
  - `castle.setNight(k)` hides them by day and fades the glows and fill lights. The day/night cycle (Phase 4) drives it.
- **Torch-lined approach:** post torches on both sides of the castle road from the bridge to the gate.
- **Cost:** draw calls at the bridge are 925 (baseline 924), and there are fewer triangles than the baseline.
- **Still off:** the night sky is darker than the reference's purple sky, so the spires are best seen against the new sky (Phase 4). `052-keep-silhouette-test-purple-sky.png` shows the shapes against a purple background.

## Phase 4: day/night (done)
- `src/world/daynight.js`, driven from `main.js`:
  - **Clock:** `settings.dayLengthMinutes = 14` and `settings.startHour = 22` (URL `?time=13.5&daylen=14`, `?timepause=1`).
  - **Keys:** **T** pauses and resumes, **,** / **.** go back or forward half an hour (with a toast showing the time).
- **Sun and moon:**
  - The sun rises in the east at 6:00, crosses the south and sets at 18:00.
  - The moon starts where each scene composed it (at 22:00) and moves 15° an hour.
  - The directional light follows whichever body is brighter.
- **Sky:**
  - A shader sphere: the scene's starry night texture, plus a purple horizon band at night (North Shore `env.skyGlow`, like the reference), blended into a day gradient.
  - A warm dawn or dusk glow around the low sun, and a sun disc and halo.
  - Stars fade by day.
- **Lighting:**
  - Each scene's own `env` is the night keyframe. Fog colour, hemisphere colours and intensity, and the sun's colour and intensity are blended towards dawn, noon and dusk keyframes.
  - Scenes without a sky (the cathedral, the Crownkeep interior) keep their own lighting.
  - The metro blends in by how far you are out under the sky (`outdoor()`), so tunnels stay as they were.
- **Emissives:**
  - Lit windows (every material using the lit-window texture, plus anything tagged `userData.glow`) fade to dark glass by day.
  - Torch flames hide, and point lights scale down, from dusk to dawn. Flickering lights are handled by remembering each frame's fresh value.
  - Indoors they stay lit.
  - `scene.setTime()` hooks: the Crownkeep's roof fires, smoke and embers burn only at night (North Shore and metro). The bridge torch smoke goes out with the torches.
- **Performance:** everything is uniform and colour blending except shadows.
  - `renderer.shadowMap.autoUpdate` is off. Shadows refresh at most every 0.1 s or when the sun moves noticeably, and are switched off while no body is up.
  - At the bridge: night 931 calls, noon 718 (fires off).
- **Screenshots:** `053`–`057` (night, dawn, noon, dusk, and the cloister at noon).

## Phase 5: enterable buildings (done)
- **The system** (`src/world/interiors.js`):
  - Every house records its front door (`BuildingSet.doors`). Detailed chunks expose the doors near the player (`chunks.doorsNear`, `built.doorsNear`), so only nearby houses can be entered.
  - **Entering:** walk into a door, moving towards it. After a short fade, that building's interior is built in its own footprint, seeded by the lot so it's the same room every time.
  - **While inside:** the city root is hidden (not drawn). The controller swaps to the room's colliders, walkable area and camera blockers.
  - **Leaving:** walk back out through the door. After a fade the room is disposed and the city comes back, with the player outside the door facing the street.
  - Only one interior ever exists at a time.
- **Room kit:**
  - Shell: floor (planks or flagstones), walls (plaster or timber framing, tinted), a beamed ceiling, skirting, a door with a frame, and windows that show the time of day (dark blue at night, bright by day).
  - Kinds by use: **house** (bed with blanket and pillow, chest, hearth, table with stools and a candle, rug, shelf), **shop** (counter, shelves of goods, crates, barrels, lamp), **tavern** (bar with mugs, barrels, hearth, tables with candles, lamp), **chapel** (altar with candles, pews).
  - Kit houses carry a use (house, shop or tavern). Other archetypes map by type and size.
- **Lighting:** it follows the clock. The hemisphere goes from warm and dim at night to daylight by day, the sun and moon are switched off inside, hearth fires burn all day, and lamps are mostly lit at night. Flames flicker.
- **Proven on 3 first, then all:**
  - A house, a shop and a tavern near the market: entered, photographed, and walked out of. Inside: about 1.6–2.3k triangles and 12–16 draw calls (the city isn't drawn).
  - Then all 184 doors in the detailed chunks around the market: every interior builds (0 failures, about 0.8 ms each in the software renderer), and every spawn point is clear of furniture.
  - Also checked: walking into a door from the street at noon.
- **Not added (per the brief, ask first):** meaningful contents such as NPCs, loot or upper floors.

## Final before/after (same harness, North Shore at 22:00, streaming settled)
| Pose | Draw calls | Triangles |
|---|---|---|
| Bridge spawn | 929 → **753** | 336k → **322k** |
| Market | 555 → **334** | 351k → **328k** |
| Cathedral square | 257 → **260** | 285k → **278k** |
| West street | 463 → **265** | 295k → **270k** |

FPS can only be read on real hardware: press **P**. The cloud browser is a software renderer.
