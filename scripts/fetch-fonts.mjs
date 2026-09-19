/**
 * Downloads the app's typefaces into public/fonts/ so they ship inside
 * the application.
 *
 *   npm run fetch-fonts
 *
 * Run once. Re-run only if you change the typefaces.
 *
 * Why not just link to Google Fonts: this is a desktop app. An app that
 * needs the internet to render its own lettering shows a different
 * typeface on a train, and a flash of the wrong one every launch. The
 * CDN link in index.html is a safety net for anyone who hasn't run this
 * yet — once these files exist they take priority.
 *
 * Licensing: Archivo, Archivo Black and Space Mono are all SIL Open
 * Font License, which permits bundling them in an application.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "fonts");

// Latin subsets only — the app's interface is English, and the full
// character sets are several times the size for glyphs nobody renders.
const FACES = [
  { file: "archivo-400.woff2", family: "Archivo", weight: "400" },
  { file: "archivo-600.woff2", family: "Archivo", weight: "600" },
  { file: "archivo-700.woff2", family: "Archivo", weight: "700" },
  { file: "archivo-black.woff2", family: "Archivo Black", weight: "400" },
  { file: "space-mono-400.woff2", family: "Space Mono", weight: "400" },
  { file: "space-mono-700.woff2", family: "Space Mono", weight: "700" },
];

// A browser-like user agent is what makes Google serve woff2 rather than
// an older format.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function cssFor(family, weight) {
  const url =
    "https://fonts.googleapis.com/css2?family=" +
    encodeURIComponent(family) +
    ":wght@" +
    weight +
    "&display=swap";

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${family} ${weight}: ${res.status}`);
  return res.text();
}

/** Pulls the latin woff2 url out of a Google Fonts stylesheet. */
function latinUrl(css) {
  // The stylesheet is a run of @font-face blocks, one per subset, each
  // preceded by a comment naming it. We want the plain `latin` one, not
  // latin-ext or cyrillic.
  const blocks = css.split("/*").map((b) => "/*" + b);
  const latin = blocks.find((b) => b.startsWith("/* latin */"));
  const match = (latin ?? css).match(/url\((https:[^)]+\.woff2)\)/);
  return match ? match[1] : null;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log(`Fetching ${FACES.length} font files into public/fonts/\n`);

  let got = 0;

  for (const face of FACES) {
    const target = join(OUT, face.file);

    try {
      await access(target);
      console.log(`  ${face.file} — already here, skipping`);
      got++;
      continue;
    } catch {
      // Not there yet, which is the normal case.
    }

    process.stdout.write(`  ${face.file} … `);

    try {
      const css = await cssFor(face.family, face.weight);
      const url = latinUrl(css);

      if (!url) throw new Error("no woff2 in the stylesheet");

      const file = await fetch(url);
      if (!file.ok) throw new Error(`download failed (${file.status})`);

      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(target, bytes);

      console.log(`${Math.round(bytes.length / 1024)} KB`);
      got++;
    } catch (error) {
      console.log(`FAILED — ${error.message}`);
    }
  }

  console.log(
    `\n${got}/${FACES.length} in place.` +
      (got === FACES.length
        ? " The app now carries its own typefaces.\n"
        : " The missing ones fall back to the CDN link in index.html.\n"),
  );
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
