"""Build map masks used by the North Shore zone.

- water: from reference/maps/vulgshire-topdown-FINAL.png (blue-grey water colour,
  smoothed; small specks such as the lake's lettering removed).
- northShore: the walkable district the owner outlined in cyan on a copy of the
  map (reference/maps/vulgshire-north-shore-outline.png).
Writes src/data/mapmasks.json with run-length rows: [[start, end], ...] per row.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
m = np.array(Image.open(ROOT / "reference/maps/vulgshire-topdown-FINAL.png").convert("RGB")).astype(int)
H, W, _ = m.shape
r, g, b = m[..., 0], m[..., 1], m[..., 2]
water = ((g >= r + 2) & (b >= r + 1) & (r < 120)).astype(np.uint8) * 255
im = Image.fromarray(water)
im = im.filter(ImageFilter.BoxBlur(3)).point(lambda v: 255 if v > 110 else 0)
im = im.filter(ImageFilter.BoxBlur(2)).point(lambda v: 255 if v > 128 else 0)
w = np.array(im) > 0
# Remove tiny land specks inside water (lettering, boats) and tiny water specks on land.
lab, n = ndimage.label(~w)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
for i, s in enumerate(sizes, 1):
    if s < 150:
        w[lab == i] = True
lab, n = ndimage.label(w)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
for i, s in enumerate(sizes, 1):
    if s < 150:
        w[lab == i] = False

# Owner's outline (cyan) -> filled region in map pixels.
hl = np.array(Image.open(ROOT / "reference/maps/vulgshire-north-shore-outline.png").convert("RGB")).astype(int)
cy = (hl[..., 0] < 90) & (hl[..., 1] > 190) & (hl[..., 2] > 190)
cy = ndimage.binary_dilation(cy, iterations=3)
outside = ndimage.binary_fill_holes(cy)  # filled = curve + inside
region_hl = outside
sx = W / hl.shape[1]
sy = H / hl.shape[0]
region = np.array(Image.fromarray(region_hl.astype(np.uint8) * 255).resize((W, H), Image.NEAREST)) > 0
print("region px:", region.sum(), "bbox:", np.argwhere(region).min(0), np.argwhere(region).max(0), "scale", sx, sy)

def rle(mask):
    rows = []
    for y in range(mask.shape[0]):
        row = mask[y]
        runs = []
        x = 0
        while x < W:
            if row[x]:
                s = x
                while x < W and row[x]:
                    x += 1
                runs.append([s, x])
            else:
                x += 1
        rows.append(runs)
    return rows

out = {"size": [W, H], "water": rle(w), "northShore": rle(region)}
(ROOT / "src/data/mapmasks.json").write_text(json.dumps(out, separators=(",", ":")))
print("water frac", w.mean(), "wrote", (ROOT / "src/data/mapmasks.json").stat().st_size, "bytes")
ov = m.copy()
ov[w] = [0, 110, 230]
ov[region & ~w] = (ov[region & ~w] * 0.5 + np.array([0, 200, 200]) * 0.5).astype(int)
Image.fromarray(ov.astype(np.uint8)).save(ROOT / "docs/north-shore-masks.png")
