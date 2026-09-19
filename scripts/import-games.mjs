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
 *   npm run backfill-games
 *       Everything released in the last five years, however obscure.
 *       Run once; it takes a few minutes and pulls tens of thousands
 *       of titles. Use --years=N for a different window.
 *
 *   npm run sync-games
 *       The one meant to run on a schedule. Pulls games coming out in
 *       the next two years, plus anything IGDB has changed recently,
 *       so the catalogue keeps up with what's being announced and
 *       released without anyone doing anything.
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

const SYNC = argv.includes("--sync");
const BACKFILL = argv.includes("--backfill");

// How far back the backfill reaches.
const BACKFILL_YEARS = flag("years", 5);

// How far ahead to look for announced games. Two years covers anything
// with a date worth planning around; past that, dates are placeholders
// like "2028" that shift constantly.
const SYNC_AHEAD_DAYS = flag("ahead", 730);

// How far back to look for changes. A day's schedule with a 48-hour
// window means a single missed run costs nothing.
const SYNC_SINCE_HOURS = flag("since", 48);

// A ceiling on the "what changed" pass, in case of a long gap.
const SYNC_MAX_PAGES = flag("max-pages", 20);

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
  "fields name, cover.image_id, genres.name, platforms.name, " +
  "total_rating_count, first_release_date, hypes;";

// DLC, expansions and alternate editions all carry a parent. Excluding
// them keeps "Elden Ring" from arriving as nine near-identical rows.
// Filtering this way rather than on IGDB's category field, because the
// category numbering has changed before and a parent reference hasn't.
const NO_DLC = "parent_game = null & version_parent = null";

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
    // IGDB dates are unix seconds; Postgres wants an ISO timestamp.
    release_date: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString()
      : null,
    hypes: game.hypes ?? 0,
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



/**
 * Games people asked for by name.
 *
 * Runs as part of the daily sync, using the service role key, so it
 * can see requests from every user - the policy on that table only
 * lets each person read their own.
 *
 * A request that IGDB has never heard of is marked not_found rather
 * than left pending. Otherwise a single misspelling gets retried
 * every night forever.
 */
async function fulfilRequests(token) {
  const { data: requests, error } = await supabase
    .from("game_requests")
    .select("id, name")
    .eq("status", "pending")
    .order("created_at")
    .limit(50);

  if (error) {
    console.log(`  requests: skipped (${error.message})`);
    return;
  }

  if (!requests || requests.length === 0) {
    console.log("  requests: none waiting.");
    return;
  }

  let found = 0;
  let missing = 0;

  for (const request of requests) {
    const escaped = request.name.replace(/"/g, '\\"');

    const games = await igdb(
      token,
      `
      search "${escaped}";
      ${FIELDS}
      where cover != null & ${NO_DLC};
      limit 10;
    `,
    );

    if (games.length === 0) {
      await supabase
        .from("game_requests")
        .update({ status: "not_found", resolved_at: new Date().toISOString() })
        .eq("id", request.id);

      missing++;
      console.log(`    · "${request.name}" — nothing on IGDB`);
      await sleep(DELAY_MS);
      continue;
    }

    await save(games.map(toRow));

    // Point the request at the closest match so the app can say what
    // it actually added - "Helldivers 2" when they typed "helldivers".
    const { data: row } = await supabase
      .from("games")
      .select("id")
      .eq("igdb_id", games[0].id)
      .single();

    await supabase
      .from("game_requests")
      .update({
        status: "imported",
        resolved_at: new Date().toISOString(),
        game_id: row?.id ?? null,
      })
      .eq("id", request.id);

    found++;
    console.log(`    · "${request.name}" — added ${games.length}, top match ${games[0].name}`);

    await sleep(DELAY_MS);
  }

  console.log(`  requests: ${found} filled, ${missing} not found on IGDB.`);
}

/**
 * The scheduled run.
 *
 * Two passes, because "new" means two different things:
 *
 *   announced  - games with a release date still in the future. These
 *                are what the bulk import can never find, since it
 *                ranks by rating count and an unreleased game has no
 *                ratings. This is the pass that lets someone schedule
 *                a session for launch night.
 *
 *   changed    - anything IGDB has touched since the last run: a game
 *                that just came out, a date that slipped, cover art
 *                that finally appeared, a name that was corrected.
 *
 * Both upsert on igdb_id, so re-running is free and nothing is ever
 * duplicated. Nothing is deleted, ever - posts and Top 5 entries point
 * at these rows.
 */
async function syncMode(token) {
  const now = Math.floor(Date.now() / 1000);
  const horizon = now + SYNC_AHEAD_DAYS * 86400;
  const since = now - SYNC_SINCE_HOURS * 3600;

  console.log(
    `Syncing: games due in the next ${SYNC_AHEAD_DAYS} days, ` +
      `plus anything changed in the last ${SYNC_SINCE_HOURS} hours.\n`,
  );

  let announced = 0;
  let changed = 0;

  // ---- pass one: what's coming ----
  for (let page = 0; ; page++) {
    const games = await igdb(
      token,
      `
      ${FIELDS}
      where first_release_date > ${now}
        & first_release_date < ${horizon}
        & cover != null
        & ${NO_DLC};
      sort first_release_date asc;
      limit ${PAGE_SIZE};
      offset ${page * PAGE_SIZE};
    `,
    );

    if (games.length === 0) break;

    announced += await save(games.map(toRow));
    process.stdout.write(`  upcoming: ${announced}\r`);

    if (games.length < PAGE_SIZE) break;
    await sleep(DELAY_MS);
  }

  console.log(`  upcoming: ${announced} games with a date ahead of us.`);

  // ---- pass two: what changed ----
  for (let page = 0; ; page++) {
    const games = await igdb(
      token,
      `
      ${FIELDS}
      where updated_at > ${since}
        & cover != null
        & ${NO_DLC}
        & total_rating_count >= ${MIN_RATINGS};
      sort updated_at desc;
      limit ${PAGE_SIZE};
      offset ${page * PAGE_SIZE};
    `,
    );

    if (games.length === 0) break;

    changed += await save(games.map(toRow));
    process.stdout.write(`  updated: ${changed}\r`);

    // A very long gap since the last run could return thousands of
    // rows. Cap it rather than paging forever; the next run catches up.
    if (games.length < PAGE_SIZE || page >= SYNC_MAX_PAGES) break;
    await sleep(DELAY_MS);
  }

  console.log(`  updated: ${changed} games changed recently.`);

  // ---- pass three: what people asked for by name ----
  await fulfilRequests(token);

  console.log(`\nDone. Your games table now holds ${await totalRows()} rows.\n`);
}


/**
 * Everything from the last few years, however obscure.
 *
 * Paging by `offset` breaks down here. Offsets get slower the deeper
 * they go, and IGDB stops honouring them past a point - which is the
 * wall you hit trying to walk forty thousand rows five hundred at a
 * time. So this pages by id instead: sort by id, remember the last one
 * seen, and ask for everything after it. The cost is flat no matter
 * how far in you are, and nothing is skipped or repeated if rows shift
 * underneath you mid-run.
 *
 * No upper bound on the date, so anything already announced for the
 * future comes along too.
 */
async function backfillMode(token) {
  const since = Math.floor(
    (Date.now() - BACKFILL_YEARS * 365.25 * 86400 * 1000) / 1000,
  );

  console.log(
    `Pulling everything released since ` +
      `${new Date(since * 1000).toISOString().slice(0, 10)}.\n` +
      `This takes a few minutes. Leave it running.\n`,
  );

  let lastId = 0;
  let total = 0;
  let page = 0;

  for (;;) {
    const games = await igdb(
      token,
      `
      ${FIELDS}
      where id > ${lastId}
        & first_release_date > ${since}
        & cover != null
        & ${NO_DLC};
      sort id asc;
      limit ${PAGE_SIZE};
    `,
    );

    if (games.length === 0) break;

    total += await save(games.map(toRow));
    lastId = games[games.length - 1].id;
    page++;

    process.stdout.write(`  page ${page}: ${total} saved so far…\r`);

    if (games.length < PAGE_SIZE) break;
    await sleep(DELAY_MS);
  }

  console.log(`  ${total} games imported or updated over ${page} pages.`);
  console.log(`\nDone. Your games table now holds ${await totalRows()} rows.\n`);
}

// ---- go -----------------------------------------------------------

async function main() {
  console.log("Getting an access token from Twitch…");
  const token = await getAccessToken();
  console.log("Got it.\n");

  if (BACKFILL) await backfillMode(token);
  else if (SYNC) await syncMode(token);
  else if (searchTerms.length > 0) await searchMode(token, searchTerms);
  else await bulkMode(token);
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
