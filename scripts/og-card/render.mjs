/**
 * Renders scripts/og-card/card.html to public/og.png.
 *
 *   npm i -D playwright     (once — not a runtime dependency)
 *   node scripts/og-card/render.mjs
 *
 * WHY 2x: the card is designed at 1200x630, which is what every scraper
 * expects and crops to. It is RENDERED at deviceScaleFactor 2, so the
 * shipped file is 2400x1260 real pixels. Discord, iMessage and Twitter
 * display OG images at up to 2x on a high-DPI screen; a 1200px file gets
 * upscaled there and visibly softens. The aspect ratio is identical either
 * way, so nothing about how the card is laid out changes.
 *
 * The meta tags in index.html state the REAL pixel size (2400x1260), not
 * the design size — they are meant to describe the file.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { statSync } from "node:fs";

/*
 * Imported dynamically, and deliberately NOT in devDependencies: playwright
 * pulls a browser down with it, and CI runs `npm ci` on every release build.
 * This script runs maybe twice a year. Install it when you need it.
 */
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("\nThis script needs playwright, which isn't installed.\n");
  console.error("  npm i -D playwright\n");
  console.error("It is not a project dependency on purpose — it downloads a");
  console.error("browser, and the card only gets re-rendered when it changes.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../public/og.png");
const W = 1200;
const H = 630;
const SCALE = 2;

/** Platforms cap OG images around 5MB. Comfortably under it is the target. */
const WARN_BYTES = 1_500_000;

/*
 * --allow-file-access-from-files: card.html reads the icon master's pixels
 * back off a canvas to cut its corners out. Chromium treats a file:// image
 * as cross-origin and blocks that read by default.
 */
const browser = await chromium.launch({
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: SCALE,
});

await page.goto("file://" + resolve(here, "card.html"));
await page.evaluate(() => document.fonts.ready);

/* card.html cuts the mark out of the icon master on a canvas; wait for it
   rather than racing it, or the card screenshots with an empty square. */
let markSize;
try {
  /* Bounded, so a mark that never resolves fails loudly instead of leaving
     the script sitting there looking like it's still working. */
  markSize = await Promise.race([
    page.evaluate(() => window.markReady),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timed out after 15s")), 15000)),
  ]);
} catch (err) {
  await browser.close();
  console.error("\nThe mark failed to draw: " + err.message);
  console.error("Check pentra-icon-v2.png is in the repo root.");
  process.exit(1);
}

await page.waitForTimeout(300);

const state = await page.evaluate(() => {
  const h1 = document.querySelector("h1");
  const left = document.querySelector(".left");
  return {
    fonts: [...document.fonts].map((f) => `${f.family}:${f.status}`),
    /* The headline is `white-space: nowrap`, so a longer tagline does not
       wrap — it overflows and gets silently clipped at the card edge.
       This is the check that catches a copy change.

       Measured with a Range rather than scrollWidth: the h1 is a block
       filling the column, so scrollWidth never reads below the column
       width and the printed number would look permanently maxed out.
       A Range over the contents gives the widest line's real width. */
    headlineWidth: (() => {
      const r = document.createRange();
      r.selectNodeContents(h1);
      return Math.ceil(r.getBoundingClientRect().width);
    })(),
    columnWidth: left.clientWidth,
    /* Nothing at all should exceed the frame. */
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
  };
});

const fail = (msg, detail) => {
  console.error(`\n${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
};

/*
 * A missing woff2 does not throw. The browser falls back to Arial without
 * a word and you get a card that is subtly, unnoticeably wrong — so this
 * is checked every render rather than assumed.
 */
if (!state.fonts.includes("Archivo Black:loaded")) {
  await browser.close();
  fail("Archivo Black did not load — run `npm run fetch-fonts` first.", state.fonts.join(", "));
}
if (state.headlineWidth > state.columnWidth) {
  await browser.close();
  fail(
    `The headline is clipped: it needs ${state.headlineWidth}px and has ${state.columnWidth}px.`,
    "Shorten the words or drop the h1 font-size in card.html."
  );
}
if (state.pageWidth > W || state.pageHeight > H) {
  await browser.close();
  fail(`Content overflows the card: ${state.pageWidth}x${state.pageHeight}, expected ${W}x${H}.`);
}

await page.screenshot({ path: OUT });
await browser.close();

const bytes = statSync(OUT).size;
console.log(`\npublic/og.png  ${W * SCALE}x${H * SCALE}  ${Math.round(bytes / 1024)} KB`);
console.log(
  `fonts ok · mark ${markSize} · headline ${state.headlineWidth}/${state.columnWidth}px`
);
if (bytes > WARN_BYTES) {
  console.warn(`\nWARNING: ${Math.round(bytes / 1024)} KB is larger than intended.`);
}
console.log("\nIf the size changed, update og:image:width/height in index.html to match.");
