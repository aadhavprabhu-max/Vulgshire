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
