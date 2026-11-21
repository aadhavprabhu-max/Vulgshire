"""Trace the centreline of an open metro line from the owner's drawing.

Walks along the coloured stroke from its hub end, taking the centroid of the
stroke pixels a few pixels ahead, then smooths the result. Writes the path (map
pixels, about every 4 px) into src/data/metro.json as lines[].path.
"""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "src/data/metro.json").read_text())
base = Image.open(ROOT / "reference/maps/vulgshire-topdown-FINAL.png")
W, H = base.size
src = np.array(Image.open(ROOT / "reference/maps/vulgshire-metro-lines.png").convert("RGB").resize((W, H), Image.NEAREST)).astype(int)
r, g, b = src[..., 0], src[..., 1], src[..., 2]
masks = {"orange": (r > 200) & (g > 120) & (g < 200) & (b < 80)}

for line in data["lines"]:
    if not line["open"]:
        continue
    m = masks[line["key"]]
    ys, xs = np.nonzero(m)
    pts = np.stack([xs, ys], 1).astype(float)
    sts = [s for s in data["stations"] if s["line"] == line["id"]]
    start = np.array(sts[0]["mapPx"], float)
    nxt = np.array(sts[1]["mapPx"], float)
    p = start.copy()
    d = (nxt - p) / np.linalg.norm(nxt - p)
    path = [p.copy()]
    visited = np.zeros(len(pts), bool)
    for _ in range(2000):
        rel = pts - p
        dist = np.hypot(rel[:, 0], rel[:, 1])
        visited |= dist < 6
        ring = (dist > 5) & (dist < 9) & ~visited
        if not ring.any():
            break
        cand = rel[ring]
        cos = (cand @ d) / np.linalg.norm(cand, axis=1)
        ahead = cand[cos > 0.2]
        if len(ahead) < 3:
            break
        c = ahead.mean(0)
        step = c / np.linalg.norm(c) * 4
        nd = step / 4
        d = d * 0.5 + nd * 0.5
        d /= np.linalg.norm(d)
        p = p + d * 4
        path.append(p.copy())
    path = np.array(path)
    # Smooth (moving average) and keep the ends.
    sm = path.copy()
    for i in range(2, len(path) - 2):
        sm[i] = path[i - 2 : i + 3].mean(0)
    line["path"] = [[round(float(x), 1), round(float(y), 1)] for x, y in sm]
    end = sts[-1]["mapPx"]
    print(line["id"], "points", len(sm), "start", sm[0].round(), "end", sm[-1].round(), "last station", end)
(ROOT / "src/data/metro.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
