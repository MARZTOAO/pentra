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
moon-1.png      moon-2.png      moon-3.png
bolt-1.png      bolt-2.png      bolt-3.png
heart-1.png     heart-2.png     heart-3.png
leaf-1.png      leaf-2.png      leaf-3.png
ghost-1.png     ghost-2.png     ghost-3.png
mushroom-1.png  mushroom-2.png  mushroom-3.png
skull-1.png     skull-2.png     skull-3.png
cactus-1.png    cactus-2.png    cactus-3.png
flake-1.png     flake-2.png     flake-3.png
octo-1.png      octo-2.png      octo-3.png
flame-1.png     flame-2.png     flame-3.png
pad-1.png       pad-2.png       pad-3.png
rocket-1.png    rocket-2.png    rocket-3.png
penguin-1.png   penguin-2.png   penguin-3.png
dino-1.png      dino-2.png      dino-3.png
fish-1.png      fish-2.png      fish-3.png
bat-1.png       bat-2.png       bat-3.png
bot-1.png       bot-2.png       bot-3.png
crown-1.png     crown-2.png     crown-3.png
shield-1.png    shield-2.png    shield-3.png
```

Then open `src/components/PetSprite.tsx` and change `const ART_READY = false;` to `true`.

Brief for the artist:

- 91 images: one egg, and 30 species × 3 stages.
- Square, transparent background, 512×512 px PNG. The pet sits on the bottom edge (a little drop shadow is fine), centred.
- Stage 1 is the small cute shape with dot eyes. Stage 2 is a creature: the shape becomes a head-and-body with legs, arms and a feature (ears, antenna, horns, wings). Stage 3 is the full form: bigger, fiercer eyes, a signature piece (crown, wings, tail, aura). Think Pokémon energy, but ours: round bodies, blush cheeks, a lighter belly patch, big eyes, stubby limbs. Same creature each time, clearly growing up. The in-app placeholder drawings (ask MARZ for the sheet) show the intended pose and features for every one.
- Each species has a shape and a colour the app already uses: Pentagon (orange `#ff7a2f`), Blip (round, teal `#2ad4c8`), Cube (purple `#a66cff`), Spike (triangle, red `#ff6b6b`), Gem (diamond, blue `#5aa9ff`), Hex (lime `#8bff3a`), Blob (pink `#ff4fa3`), Star (yellow `#ffd23f`), Drop (sky `#38bdf8`), Pill (white `#e9ebee`), Moon (crescent, indigo `#6366f1`), Bolt (lightning, amber `#f5b301`), Heart (crimson `#e11d48`), Leaf (green `#22c55e`), Ghost (mint `#a7f3d0`), Mushroom (tan `#c08457`), Skull (slate `#94a3b8`), Cactus (olive `#65a30d`), Snowflake (ice `#bae6fd`), Octo (deep blue `#1d4ed8`), Flame (`#ff4500`), Pad (a game controller, fuchsia `#c026d3`), Rocket (silver `#cbd5e1` with red fins), Penguin (slate `#334155` with a white belly), Dino (emerald `#10b981`), Fish (cyan `#06b6d4`), Bat (violet `#7c3aed`), Bot (a robot head, teal `#0f766e`), Crown (gold `#d4a017`), Shield (forest green `#166534`). The art doesn't have to be literal shapes, but should keep each one's colour so they read at a glance.
- It's shown at roughly 100 px on the profile, so bold outlines and big eyes; avoid thin detail.
- Dark app background (`#0e0f11`), so no dark outlines around the whole figure.
