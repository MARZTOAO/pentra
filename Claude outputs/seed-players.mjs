/**
 * Creates fake players so you have something to match against.
 *
 *   npm run seed-players           create 12 test accounts
 *   npm run seed-players -- --wipe remove every account this script made
 *
 * Each fake player gets a Top 5 drawn from a theme (shooters, cosy games,
 * soulslikes and so on), so the matching results are actually meaningful:
 * two "soulslike" players should score far above a soulslike and a cosy
 * player. If everyone had random games, you'd learn nothing.
 *
 * Every account uses an @example.test email address, which is a reserved
 * domain that can't receive mail - that's what --wipe keys off, and it
 * means you can never accidentally email a fake person.
 */

import { createClient } from "@supabase/supabase-js";

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("\nMissing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env\n");
  process.exit(1);
}

// The service_role key can create users and bypass row-level security.
// Correct for a seeding script you run yourself; never in the app.
const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAIL_DOMAIN = "example.test";
const PASSWORD = "seedplayer123";

// ---- the cast ------------------------------------------------------

const THEMES = {
  soulslike: ["Elden Ring", "Dark Souls III", "Bloodborne", "Sekiro", "Lies of P", "Nioh 2"],
  shooter: ["Counter-Strike", "Valorant", "Apex Legends", "Call of Duty", "Overwatch", "Destiny 2"],
  cosy: ["Stardew Valley", "Animal Crossing", "Spiritfarer", "Unpacking", "Dave the Diver", "Cult of the Lamb"],
  survival: ["Minecraft", "Valheim", "Rust", "Terraria", "Grounded", "Palworld"],
  strategy: ["Civilization VI", "Total War", "Crusader Kings III", "Age of Empires", "Factorio", "Stellaris"],
  story: ["The Last of Us", "Red Dead Redemption 2", "Baldur's Gate 3", "Cyberpunk 2077", "Disco Elysium", "God of War"],
};

const PLAYERS = [
  { username: "ashfallen",    theme: "soulslike", region: "North America — East",    platforms: ["PC"],                       availability: ["Weeknights", "Late night"],       bio: "Co-op summons welcome. I will absolutely die to the first boss with you." },
  { username: "hollowknight9", theme: "soulslike", region: "North America — East",   platforms: ["PC", "PlayStation 5"],      availability: ["Weeknights"],                     bio: "Currently on my seventh playthrough. Send help." },
  { username: "emberveil",    theme: "soulslike", region: "Europe — West",           platforms: ["PlayStation 5"],            availability: ["Weekend nights"],                 bio: "Invasions and jolly cooperation, equally." },
  { username: "tracerounds",  theme: "shooter",   region: "North America — East",    platforms: ["PC"],                       availability: ["Weeknights", "Weekend nights"],   bio: "Comms on, ego off. Ranked most nights." },
  { username: "deadeye_pat",  theme: "shooter",   region: "North America — Central", platforms: ["PC", "Xbox Series X|S"],    availability: ["Weekend days"],                   bio: "Aim's fine, positioning's a work in progress." },
  { username: "nightmarket",  theme: "shooter",   region: "North America — West",    platforms: ["PC"],                       availability: ["Late night", "Randomly online"],  bio: "Night owl. If I'm online, I'm queueing." },
  { username: "turnipprince", theme: "cosy",      region: "North America — East",    platforms: ["Nintendo Switch", "PC"],    availability: ["Weekday afternoons", "Weeknights"], bio: "Here for the vibes and the crops. No PvP ever." },
  { username: "mossandmoon",  theme: "cosy",      region: "UK & Ireland",            platforms: ["Nintendo Switch"],          availability: ["Weekend days"],                   bio: "Slow games, good tea, long chats." },
  { username: "riverbell",    theme: "survival",  region: "North America — Central", platforms: ["PC"],                       availability: ["Weeknights", "Weekend days"],     bio: "I build the base, you fight the things. Deal?" },
  { username: "ironsworn",    theme: "survival",  region: "North America — East",    platforms: ["PC", "Steam Deck"],         availability: ["Randomly online"],                bio: "Server's always up if you want in." },
  { username: "grandstrategy", theme: "strategy", region: "Europe — West",           platforms: ["PC"],                       availability: ["Weekend days", "Weekend nights"], bio: "One more turn. It is never one more turn." },
  { username: "quietending",  theme: "story",     region: "North America — West",    platforms: ["PlayStation 5", "PC"],      availability: ["Weeknights"],                     bio: "I play slowly and read every note. Happy to co-op anything." },
];

const NOTES = [
  "Happy to carry or be carried.",
  "Mic optional, patience required.",
  "Still working through it — no spoilers.",
  "Hundreds of hours and counting.",
  "My comfort game.",
  "",
  "",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- helpers -------------------------------------------------------

/**
 * Finds a game in your catalogue by name. Matching is loose because the
 * catalogue uses IGDB's official titles, which don't always match how
 * people say them ("Counter-Strike" vs "Counter-Strike 2").
 */
async function findGame(name) {
  const { data } = await supabase
    .from("games")
    .select("id, name, platforms")
    .ilike("name", `%${name}%`)
    .order("popularity", { ascending: false })
    .limit(1);

  return data?.[0] ?? null;
}

async function seed() {
  // Check the catalogue is populated, or every Top 5 comes out empty.
  const { count } = await supabase
    .from("games")
    .select("*", { count: "exact", head: true });

  if (!count) {
    console.error("\nYour games table is empty. Run `npm run import-games` first.\n");
    process.exit(1);
  }

  console.log(`Catalogue holds ${count} games. Creating ${PLAYERS.length} players.\n`);

  for (const player of PLAYERS) {
    const email = `${player.username}@${EMAIL_DOMAIN}`;
    process.stdout.write(`${player.username.padEnd(15)} `);

    const { data: created, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true, // skip the verification step for fakes
        user_metadata: {
          username: player.username,
          display_name: player.username,
        },
      });

    if (authError) {
      if (/already/i.test(authError.message)) {
        console.log("already exists, skipping.");
        continue;
      }
      console.log(`failed: ${authError.message}`);
      continue;
    }

    const userId = created.user.id;

    // The signup trigger made the profile row; fill in the rest.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        bio: player.bio,
        region: player.region,
        platforms: player.platforms,
        availability: player.availability,
        location_country: "USA",
      })
      .eq("id", userId);

    if (profileError) {
      console.log(`profile failed: ${profileError.message}`);
      continue;
    }

    // Build a Top 5 from the theme, shuffled so no two players are identical.
    const titles = [...THEMES[player.theme]].sort(() => Math.random() - 0.5).slice(0, 5);

    const rows = [];
    let rank = 1;

    for (const title of titles) {
      const game = await findGame(title);
      if (!game) continue;
      if (rows.some((r) => r.game_id === game.id)) continue;

      rows.push({
        user_id: userId,
        game_id: game.id,
        rank: rank++,
        platform:
          player.platforms.find((p) => game.platforms?.includes(p)) ??
          player.platforms[0],
        note: pick(NOTES) || null,
      });
    }

    if (rows.length > 0) {
      const { error: topError } = await supabase.from("top_five").insert(rows);
      if (topError) {
        console.log(`top five failed: ${topError.message}`);
        continue;
      }
    }

    console.log(`created with ${rows.length} games (${player.theme}).`);
  }

  console.log(`\nDone. All test accounts use the password: ${PASSWORD}`);
  console.log(`Log in as any of them with <username>@${EMAIL_DOMAIN}\n`);
}

// ---- wipe ----------------------------------------------------------

async function wipe() {
  console.log("Removing seeded accounts…\n");

  let removed = 0;
  let page = 1;

  // Deleting the auth user cascades to their profile and top_five rows.
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    const fakes = data.users.filter((u) => u.email?.endsWith(`@${EMAIL_DOMAIN}`));

    for (const user of fakes) {
      await supabase.auth.admin.deleteUser(user.id);
      console.log(`  removed ${user.email}`);
      removed++;
    }

    if (data.users.length < 200) break;
    page++;
  }

  console.log(`\nDone. Removed ${removed} accounts.\n`);
}

// ---- go ------------------------------------------------------------

const wiping = process.argv.includes("--wipe");

(wiping ? wipe() : seed()).catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
