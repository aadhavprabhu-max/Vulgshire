"""Draw the pinned scene locations and walkable zones on a COPY of the final map.

Usage:  python3 tools/annotate_map.py
Reads   src/data/locations.json and reference/maps/vulgshire-topdown-FINAL.png
Writes  docs/map-locations.png (the reference map itself is never modified)
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "src/data/locations.json").read_text())
im = Image.open(ROOT / data["mapImage"]).convert("RGB")
d = ImageDraw.Draw(im, "RGBA")

def font(size):
    for name in ["DejaVuSerif-Bold.ttf", "DejaVuSans-Bold.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

f_big, f_small = font(15), font(11)
COL = {"map": (190, 30, 30), "proposal": (40, 70, 170)}

for z in data["zones"]:
    x0, y0, x1, y1 = z["rectPx"]
    d.rectangle([x0, y0, x1, y1], outline=(200, 40, 40, 255), width=3, fill=(200, 40, 40, 30))
    label = "Walkable zone: " + z["name"]
    tw = d.textlength(label, font=f_small)
    d.rectangle([x0, y0 - 18, x0 + tw + 8, y0 - 2], fill=(250, 238, 210, 235), outline=(200, 40, 40), width=1)
    d.text((x0 + 4, y0 - 17), label, fill=(140, 10, 10), font=f_small)

for p in data["places"]:
    x, y = p["mapPx"]
    c = COL[p["status"]]
    d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=c + (230,), outline=(255, 240, 210), width=2)
    label = p["name"] + ("  (proposal)" if p["status"] == "proposal" else "")
    tw = d.textlength(label, font=f_big)
    bx, by = x + 13, y - 10
    if p.get("label") == "left" or bx + tw > im.width - 10:
        bx = x - 13 - tw
    d.rectangle([bx - 4, by - 2, bx + tw + 4, by + 19], fill=(250, 238, 210, 225), outline=c + (255,), width=2)
    d.text((bx, by), label, fill=c, font=f_big)

# Legend
lx, ly = 1180, 900
d.rectangle([lx, ly, lx + 330, ly + 100], fill=(250, 238, 210, 235), outline=(60, 40, 20), width=2)
d.text((lx + 10, ly + 8), "Vulgshire: scene locations", fill=(40, 25, 10), font=f_big)
for i, (k, txt) in enumerate([("map", "from the final map"), ("proposal", "proposal (not decided)")]):
    d.ellipse([lx + 12, ly + 36 + i * 22, lx + 26, ly + 50 + i * 22], fill=COL[k])
    d.text((lx + 34, ly + 34 + i * 22), txt, fill=(40, 25, 10), font=f_small)
d.rectangle([lx + 12, ly + 80, lx + 26, ly + 92], outline=(200, 40, 40), width=2)
d.text((lx + 34, ly + 78), "walkable zone", fill=(40, 25, 10), font=f_small)

out = ROOT / "docs/map-locations.png"
im.save(out)
print("wrote", out)
