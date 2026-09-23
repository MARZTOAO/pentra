#!/usr/bin/env python3
"""
Build the two tray icons from the app icon.

    python scripts/icons/build-tray.py

Writes src-tauri/icons/tray.png and tray-unread.png, 32x32 RGBA. They
are a matched pair: identical apart from a dot in the bottom-right
corner, so the tray icon does not appear to resize when the dot
arrives. src-tauri/src/lib.rs embeds both with include_bytes!.

WHY THE DOT CARRIES NO NUMBER. A Windows tray icon is 16 physical
pixels at 100% scaling. A digit drawn into the corner of one is a
smudge - this was rendered at 16, 20, 24 and 32 and looked at before
the decision; two digits were worse still. The icon says "there is
something", the tooltip says how much.

WHY IT IS WHITE. The mark is #ff7a2f, so an orange dot on it is
invisible and a red one is muddy at 16px. White separates from both the
mark and the black tile at every size.
"""

import pathlib
import sys

from PIL import Image, ImageDraw

SIZE = 32
RADIUS = 0.16      # of SIZE. 0.18 crowded the mark; 0.20 swallowed a vertex.
INSET = 0.05       # gap from the bottom-right corner
RING = 0.05        # dark ring, so the dot reads as sitting on top
TILE = (14, 15, 17, 255)     # --bg
DOT = (255, 255, 255, 255)

here = pathlib.Path(__file__).resolve()
icons = here.parent.parent.parent / "src-tauri" / "icons"
source = icons / "icon.png"

if not source.exists():
    sys.exit(f"missing {source} - run `npm run tauri icon` first")

base = Image.open(source).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
base.save(icons / "tray.png")

badged = base.copy()
draw = ImageDraw.Draw(badged)
r = SIZE * RADIUS
cx = cy = SIZE - r - SIZE * INSET
ro = r + SIZE * RING
draw.ellipse([cx - ro, cy - ro, cx + ro, cy + ro], fill=TILE)
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DOT)
badged.save(icons / "tray-unread.png")

# The pair is only a pair if the difference is confined to the badge.
a, b = base.load(), badged.load()
diff = [(x, y) for x in range(SIZE) for y in range(SIZE) if a[x, y] != b[x, y]]
if not diff:
    sys.exit("the two icons came out identical - the badge did not draw")
left, top = min(p[0] for p in diff), min(p[1] for p in diff)
if left < SIZE // 2 or top < SIZE // 2:
    sys.exit(f"badge leaked outside the bottom-right quadrant (x>={left}, y>={top})")

print(f"wrote tray.png and tray-unread.png ({len(diff)} px differ, all bottom-right)")
