"""
Rebuild src-tauri/icons/icon.ico — the icon Windows shows in the taskbar,
the Start menu and Alt-Tab.

    python scripts/icons/build-ico.py        (needs Pillow: pip install pillow)

Reads the PNGs already in src-tauri/icons/ and downscales icon.png for the
sizes that have no PNG of their own. Writes nothing else.

WHY THIS EXISTS RATHER THAN JUST CALLING Pillow's ICO writer:

  * Pillow 12 writes PNG-compressed frames at every size unless told
    otherwise. Windows Vista and later cope with that, but every Windows
    icon tool — including the `ico` crate behind `tauri icon` — writes BMP
    below 256 and PNG only at 256. No reason to be the odd one out in the
    exact file that was already rendering wrong.

  * Pillow's BMP path is worse. It sets biHeight to twice the image
    height, which per the ICO spec declares an AND mask after the colour
    data, and then it does not write the mask. Every frame comes out short
    by exactly the mask size, so a reader that trusts the header walks off
    the end of that frame and into the next one. Measured: a 32x32 frame
    was 4136 bytes where its own header promises 4264.

So the DIB is assembled here: BITMAPINFOHEADER, bottom-up BGRA, then a
real 1-bit AND mask with a bit set for every fully transparent pixel.

A NOTE ON WHITE CORNERS. If the icon ever shows white in its corners
again, the cause is almost certainly upstream of this script: the master
`pentra-icon-v2.png` is black artwork on a SOLID WHITE canvas, and
anything that resizes it without cutting the rounded corners out first
bakes that white in. `npm run tauri icon` did exactly that once already.
The source of truth is brand/pentra-app-icon.svg, which has real
transparency.
"""

import struct
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("This needs Pillow.  pip install pillow")

ICONS = Path(__file__).resolve().parents[2] / "src-tauri" / "icons"

# What Windows actually asks for. 16 and 32 are the ones people see most:
# 16 in the title bar and Alt-Tab, 32 in the taskbar at 100% scaling.
SIZES = [16, 24, 32, 48, 64, 128, 256]

# Sizes that already exist as their own render, which beats downscaling.
# Everything else comes from icon.png (512).
FROM_FILE = {
    32: "32x32.png",
    64: "64x64.png",
    128: "128x128.png",
    256: "128x128@2x.png",
}
FALLBACK = "icon.png"


def load(size: int) -> Image.Image:
    name = FROM_FILE.get(size)
    if name and (ICONS / name).exists():
        img = Image.open(ICONS / name).convert("RGBA")
        if img.size == (size, size):
            return img
    src = ICONS / FALLBACK
    if not src.exists():
        sys.exit(f"Missing {src} — cannot build the icon without it.")
    return Image.open(src).convert("RGBA").resize((size, size), Image.LANCZOS)


def dib(img: Image.Image) -> bytes:
    """One BMP (DIB) icon frame, AND mask included."""
    w, h = img.size
    px = img.load()

    header = struct.pack(
        "<IiiHHIIiiII",
        40,         # biSize
        w,          # biWidth
        h * 2,      # biHeight — colour data and mask stacked, per the spec
        1,          # biPlanes
        32,         # biBitCount
        0,          # biCompression = BI_RGB
        w * h * 4,  # biSizeImage
        0, 0, 0, 0,
    )

    # Colour data: bottom row first, BGRA.
    xor = bytearray()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = px[x, y]
            xor += bytes((b, g, r, a))

    # The AND mask: one bit per pixel, set where the pixel is fully
    # transparent, rows padded to 4 bytes, bottom row first. A 32-bit icon
    # is drawn from its alpha channel on anything modern, but the mask
    # still has to be present and still has to be the right size.
    row_bytes = ((w + 31) // 32) * 4
    mask = bytearray()
    for y in range(h - 1, -1, -1):
        row = bytearray(row_bytes)
        for x in range(w):
            if px[x, y][3] == 0:
                row[x >> 3] |= 0x80 >> (x & 7)
        mask += row

    return bytes(header) + bytes(xor) + bytes(mask)


def main() -> None:
    import io

    entries = []
    for size in SIZES:
        img = load(size)
        if size == 256:
            # 256 stays PNG. As a DIB it would be 256KB on its own.
            buf = io.BytesIO()
            img.save(buf, format="png")
            entries.append((size, buf.getvalue(), "PNG"))
        else:
            entries.append((size, dib(img), "BMP"))

    out = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
    body = bytearray()
    data_off = 6 + 16 * len(entries)
    for size, blob, _kind in entries:
        byte = 0 if size == 256 else size  # 256 is written as 0
        out += struct.pack(
            "<BBBBHHII", byte, byte, 0, 0, 1, 32, len(blob), data_off + len(body)
        )
        body += blob
    out += body

    target = ICONS / "icon.ico"
    target.write_bytes(bytes(out))

    print(f"wrote {target}  ({len(out)} bytes)")
    for size, blob, kind in entries:
        expect = 40 + size * size * 4 + ((size + 31) // 32) * 4 * size
        note = "" if kind == "PNG" else ("  ok" if len(blob) == expect else "  *** WRONG LENGTH")
        print(f"  {size:>3} {kind} {len(blob):>7}B{note}")


if __name__ == "__main__":
    main()
