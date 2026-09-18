/**
 * Imports the games catalogue from IGDB into your Supabase `games` table.
 *
 * Two modes:
 *
 *   npm run import-games
 *       Bulk import of the most-rated games. Safe to re-run; rows are
 *       matched on igdb_id and updated rather than duplicated.
 *
 *   npm run add-game -- "Microsoft Flight Simulator"
 *       Searches IGDB by name and imports every match, no matter how
 *       obscure. Use this for anything the bulk import missed.
 *
 * Options for the bulk mode:
 *   --pages=40      how many pages of 500 to pull   (default 40 = 20,000)
 *   --min-ratings=2 minimum number of IGDB ratings  (default 2)
 *
 * Why import rather than call IGDB live from the app: search stays instant,
 * rate limits stop mattering, and the app keeps working if IGDB is down.
 */

import { createClient } from "@supabase/supabase-js";

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const PAGE_SIZE = 500; // IGDB's maximum per request
const DELAY_MS = 300; // IGDB allows 4 req/sec; this stays well under

function requireEnv(name, value) {
  if (!value) {
    console.error(`\nMissing ${name} in your .env file.\n`);
    process.exit(1);
  }
}

requireEnv("TWITCH_CLIENT_ID", TWITCH_CLIENT_ID);
requireEnv("TWITCH_CLIENT_SECRET", TWITCH_CLIENT_SECRET);
requireEnv("VITE_SUPABASE_URL", VITE_SUPABASE_URL);
requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);

// The service_role key bypasses row-level security. Correct here - this is
// you, on your own machine, seeding a table users can only read.
const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- command line -------------------------------------------------

const argv = process.argv.slice(2);

function flag(name, fallback) {
  const match = argv.find((a) => a.startsWith(`--${name}=`));
  return match ? Number(match.split("=")[1]) : fallback;
}

const searchTerms = argv.filter((a) => !a.startsWith("--"));
const PAGES = flag("pages", 40);
const MIN_RATINGS = flag("min-ratings", 2);

// ---- IGDB ---------------------------------------------------------

async function getAccessToken() {
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(
      `Twitch token request failed (${res.status}): ${await res.text()}`,
    );
  }

  return (await res.json()).access_token;
}

const FIELDS =
  "fields name, cover.image_id, genres.name, platforms.name, total_rating_count;";

async function igdb(token, query) {
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: query,
  });

  if (!res.ok) {
    throw new Error(`IGDB request failed (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/** Turn an IGDB record into a row shaped like our `games` table. */
function toRow(game) {
  return {
    igdb_id: game.id,
    name: game.name,
    cover_url: game.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
      : null,
    genres: (game.genres ?? []).map((g) => g.name),
    platforms: (game.platforms ?? []).map((p) => p.name),
    popularity: game.total_rating_count ?? 0,
  };
}

async function save(rows) {
  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("games")
    .upsert(rows, { onConflict: "igdb_id" });

  if (error) {
    console.error(`\nDatabase error: ${error.message}\n`);
    process.exit(1);
  }

  return rows.length;
}

async function totalRows() {
  const { count } = await supabase
    .from("games")
    .select("*", { count: "exact", head: true });
  return count;
}

// ---- modes --------------------------------------------------------

/** Import everything matching a name, however obscure. */
async function searchMode(token, terms) {
  let imported = 0;

  for (const term of terms) {
    // The quotes matter - IGDB treats a bare word differently from a phrase.
    const escaped = term.replace(/"/g, '\\"');
    const query = `
      search "${escaped}";
      ${FIELDS}
      where cover != null;
      limit 50;
    `;

    process.stdout.write(`Searching IGDB for "${term}"… `);
    const games = await igdb(token, query);

    if (games.length === 0) {
      console.log("no matches with cover art.");
      continue;
    }

    imported += await save(games.map(toRow));
    console.log(`imported ${games.length}:`);
    for (const g of games.slice(0, 10)) {
      console.log(`    · ${g.name}`);
    }
    if (games.length > 10) console.log(`    … and ${games.length - 10} more`);

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Imported or updated ${imported} games.`);
  console.log(`Your games table now holds ${await totalRows()} rows.\n`);
}

/** Bulk import, most-rated first. */
async function bulkMode(token) {
  console.log(
    `Importing up to ${PAGES * PAGE_SIZE} games (minimum ${MIN_RATINGS} ratings).\n`,
  );

  let imported = 0;

  for (let page = 0; page < PAGES; page++) {
    const offset = page * PAGE_SIZE;
    process.stdout.write(`Page ${page + 1}/${PAGES}… `);

    const games = await igdb(
      token,
      `
      ${FIELDS}
      where cover != null
        & total_rating_count != null
        & total_rating_count >= ${MIN_RATINGS};
      sort total_rating_count desc;
      limit ${PAGE_SIZE};
      offset ${offset};
    `,
    );

    if (games.length === 0) {
      console.log("no more results, stopping.");
      break;
    }

    imported += await save(games.map(toRow));
    console.log(`saved ${games.length}.`);

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Imported or updated ${imported} games this run.`);
  console.log(`Your games table now holds ${await totalRows()} rows.\n`);
}

// ---- go -----------------------------------------------------------

async function main() {
  console.log("Getting an access token from Twitch…");
  const token = await getAccessToken();
  console.log("Got it.\n");

  if (searchTerms.length > 0) await searchMode(token, searchTerms);
  else await bulkMode(token);
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
