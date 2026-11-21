"""Build the in-game parchment metro map (src/assets/metro-map.jpg).

Lines are classified by colour from the owner's drawing on the map
(reference/maps/vulgshire-metro-lines.png, same framing as the final map),
redrawn crisp on a downscaled copy of the final map. Open lines are drawn
bright; lines not built yet are drawn faint and dashed.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "src/data/metro.json").read_text())
base = Image.open(ROOT / "reference/maps/vulgshire-topdown-FINAL.png").convert("RGB")
W, H = base.size
src = np.array(Image.open(ROOT / "reference/maps/vulgshire-metro-lines.png").convert("RGB").resize((W, H), Image.NEAREST)).astype(int)
r, g, b = src[..., 0], src[..., 1], src[..., 2]
mx = src.max(-1)
mn = src.min(-1)
sat = (mx - mn) / np.maximum(mx, 1)

def hue(r, g, b):
    import colorsys
    return colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[0] * 360

# Class masks by colour (strokes are thick, saturated, bright).
masks = {
    "orange": (r > 200) & (g > 120) & (g < 200) & (b < 80),
    "purple": (r > 120) & (r < 200) & (g < 120) & (b > 200),
    "red": (r > 190) & (g < 70) & (b < 70),
    "yellow": (r > 220) & (g > 210) & (b < 60),
    "green": (g > 130) & (r < 60) & (b > 50) & (b < 120) & (g - r > 80),
    "cyan": (b > 220) & (g > 120) & (g < 200) & (r < 60),
    "darkblue": (b > 190) & (g < 60) & (r < 60),
    "paleblue": (r > 170) & (g > 205) & (b > 225) & (sat < 0.25) & (sat > 0.06),
    "black": (mx < 30),
}
# Black strokes: keep only large thick connected blobs (map ink is thin).
k = masks["black"]
k = ndimage.binary_opening(k, iterations=2)
lab, n = ndimage.label(k)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
keep = np.zeros_like(k)
for i, s in enumerate(sizes, 1):
    if s > 400:
        keep |= lab == i
masks["black"] = keep
for key in masks:
    if key != "black":
        masks[key] = ndimage.binary_opening(masks[key], iterations=1)

# Snap each open-line station onto its drawn line and save the result.
for st in data["stations"]:
    line = next(l for l in data["lines"] if l["id"] == st["line"])
    ys, xs = np.nonzero(masks[line["key"]])
    i = int(np.argmin((xs - st["mapPx"][0]) ** 2 + (ys - st["mapPx"][1]) ** 2))
    st["mapPx"] = [int(xs[i]), int(ys[i])]
(ROOT / "src/data/metro.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

S = 1024 / W  # output scale
out = base.resize((1024, int(H * S)), Image.LANCZOS)
# Darken and warm the parchment a little so the lines pop.
out = Image.blend(out, Image.new("RGB", out.size, (40, 28, 16)), 0.25)
ov = Image.new("RGBA", out.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
for line in data["lines"]:
    m = masks.get(line["key"])
    if m is None:
        continue
    small = np.array(Image.fromarray((m * 255).astype(np.uint8)).resize(out.size, Image.BILINEAR)) > 60
    col = tuple(int(line["colour"][i : i + 2], 16) for i in (1, 3, 5))
    alpha = 255 if line["open"] else 120
    arr = np.zeros((out.size[1], out.size[0], 4), np.uint8)
    arr[small] = col + (alpha,)
    if not line["open"]:
        yy, xx = np.nonzero(small)
        hole = ((xx // 6 + yy // 6) % 2) == 0
        arr[yy[hole], xx[hole]] = 0
    ov = Image.alpha_composite(ov, Image.fromarray(arr, "RGBA"))
out = out.convert("RGBA")
# Thin dark outline under lines for contrast.
shadow = ov.split()[3].filter(ImageFilter.MaxFilter(5)).point(lambda v: 160 if v > 0 else 0)
out = Image.alpha_composite(out, Image.merge("RGBA", [Image.new("L", out.size, 20)] * 3 + [shadow]))
out = Image.alpha_composite(out, ov)
d = ImageDraw.Draw(out)

def font(size, bold=True):
    for n in (["DejaVuSerif-Bold.ttf"] if bold else []) + ["DejaVuSerif.ttf", "DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            pass
    return ImageFont.load_default()

f_st, f_t, f_s = font(13), font(26), font(12, False)
for st in data["stations"]:
    x, y = st["mapPx"][0] * S, st["mapPx"][1] * S
    rr = 8 if st.get("interchange") else 6
    d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(250, 240, 215), outline=(30, 20, 10), width=3)
    lx, ly = st.get("label", [12, -8])
    tw = d.textlength(st["name"], font=f_st)
    tx = x + lx if lx >= 0 else x + lx - tw
    d.rectangle([tx - 3, y + ly - 2, tx + tw + 3, y + ly + 16], fill=(246, 234, 206, 230), outline=(160, 90, 20))
    d.text((tx, y + ly), st["name"], fill=(60, 30, 10), font=f_st)
# Title cartouche and legend.
d.rectangle([262, 8, 762, 46], fill=(246, 234, 206, 235), outline=(70, 40, 15), width=2)
d.text((512, 27), "VULGSHIRE  —  THE ANCIENT UNDERGROUND", fill=(50, 25, 8), font=font(18), anchor="mm")
lx, ly = 14, out.size[1] - 14 - 18 * len(data["lines"]) - 10
d.rectangle([lx, ly, lx + 290, out.size[1] - 10], fill=(246, 234, 206, 235), outline=(70, 40, 15), width=2)
for i, line in enumerate(data["lines"]):
    col = tuple(int(line["colour"][j : j + 2], 16) for j in (1, 3, 5))
    yy = ly + 8 + i * 18
    d.rectangle([lx + 8, yy + 4, lx + 34, yy + 10], fill=col, outline=(20, 15, 10))
    label = f'{line["numeral"]}  {line["name"]}' + ("" if line["open"] else "  (closed)")
    d.text((lx + 42, yy), label, fill=(50, 25, 8) if line["open"] else (120, 100, 80), font=f_s)
out.convert("RGB").save(ROOT / "src/assets/metro-map.jpg", quality=86)
print("wrote", (ROOT / "src/assets/metro-map.jpg").stat().st_size)
