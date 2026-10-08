# Pet artwork goes here

The app draws the pets itself (simple shapes) until real art is dropped in.

When the artist delivers, put PNGs in this folder with these exact names:

```
egg.png
pentagon-1.png  pentagon-2.png  pentagon-3.png
blip-1.png      blip-2.png      blip-3.png
cube-1.png      cube-2.png      cube-3.png
spike-1.png     spike-2.png     spike-3.png
gem-1.png       gem-2.png       gem-3.png
hex-1.png       hex-2.png       hex-3.png
blob-1.png      blob-2.png      blob-3.png
star-1.png      star-2.png      star-3.png
drop-1.png      drop-2.png      drop-3.png
pill-1.png      pill-2.png      pill-3.png
```

Then open `src/components/PetSprite.tsx` and change `const ART_READY = false;` to `true`.

Brief for the artist:

- 31 images: one egg, and 10 species × 3 stages.
- Square, transparent background, 512×512 px PNG. The pet sits on the bottom edge (a little drop shadow is fine), centred.
- Stage 1 is small and cute, stage 2 is the full character, stage 3 is the show-off form (bigger, a crest or glow, more detail). Same creature each time, clearly growing up.
- Each species has a shape and a colour the app already uses: Pentagon (orange `#ff7a2f`), Blip (round, teal `#2ad4c8`), Cube (purple `#a66cff`), Spike (triangle, red `#ff6b6b`), Gem (diamond, blue `#5aa9ff`), Hex (lime `#8bff3a`), Blob (pink `#ff4fa3`), Star (yellow `#ffd23f`), Drop (sky `#38bdf8`), Pill (white `#e9ebee`). The art doesn't have to be literal shapes, but should keep each one's colour so they read at a glance.
- It's shown at roughly 100 px on the profile, so bold outlines and big eyes; avoid thin detail.
- Dark app background (`#0e0f11`), so no dark outlines around the whole figure.
