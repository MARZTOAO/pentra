# Pentra brand files

Vector logos. SVG, so they scale to any size with no loss — a business
card or a billboard, same file.

| File | Use it for |
|---|---|
| `pentra-app-icon.svg` | The app icon. The mark on its black tile. Favicons, the installer, store listings, a Discord server icon. |
| `pentra-mark.svg` | The mark on its own, transparent. Use when you want the pentagon without the black square — on a coloured background, a sticker, merch, a watermark. |
| `pentra-wordmark-on-dark.svg` | `// PENTRA` for dark backgrounds. This is what sits in the app's top left. |
| `pentra-wordmark-on-light.svg` | The same wordmark for white or light backgrounds. |

`_preview.png` shows all four at several sizes. It is a reference, not an
asset — don't ship it.

## Colours

| | Hex | Where |
|---|---|---|
| Accent | `#ff7a2f` | The pentagon, the two slashes. Never change this one. |
| Tile | `#000000` | The app icon's rounded square. |
| Ink on dark | `#e9ebee` | The letters of PENTRA on a dark background. |
| Ink on light | `#0e0f11` | The letters on a white background. |

## Notes for whoever uses these next

**The type is already outlined.** PENTRA is drawn as curves, not as live
text, so it renders identically everywhere and nobody needs Archivo Black
installed. The flip side: you cannot retype it. To change the words, the
wordmark has to be regenerated from the font.

**The mark is pure fill — no strokes.** Its bars look like a stroked
pentagon but they are solid shapes. That matters because strokes get
scaled, expanded or misread by cutting machines, embroidery digitisers and
some print workflows. This one survives all of them.

**The top node is bigger than the other four** (radius 123 against 99 at
1024px). That is deliberate, not a mistake — it gives the mark an apex so
it reads as pointing up rather than as a flat ring. Keep it.

**Both wordmark files are the same shapes**, differing only in the letter
colour. If you need a third colourway, copy one and change the second
`fill`. The first `fill` is the slashes.

**Minimum sizes.** The wordmark stops being legible below about 14px tall.
The mark holds down to roughly 16px; below that use the app icon, whose
tile gives it an edge to sit against.

**Clear space.** Leave at least the height of one slash around the
wordmark, and a quarter of its width around the mark.

## Needing a PNG

Some places won't take SVG — certain social profiles, older tools, print
shops that ask for raster. Any of these can be exported at any size without
quality loss; ask and they can be generated.
