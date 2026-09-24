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
  racing: ["Forza Horizon 5", "Gran Turismo 7", "F1 24", "Assetto Corsa", "Wreckfest", "Trackmania"],
  fighting: ["Street Fighter 6", "Tekken 8", "Mortal Kombat 1", "Guilty Gear Strive", "Super Smash Bros", "Skullgirls"],
  mmo: ["Final Fantasy XIV", "World of Warcraft", "Guild Wars 2", "The Elder Scrolls Online", "Black Desert", "Old School RuneScape"],
  horror: ["Phasmophobia", "Dead by Daylight", "Lethal Company", "Resident Evil 4", "Outlast Trials", "Content Warning"],
  roguelike: ["Hades", "Balatro", "Slay the Spire", "Dead Cells", "Risk of Rain 2", "Vampire Survivors"],
  sports: ["Rocket League", "EA Sports FC", "NBA 2K", "Madden NFL", "MLB The Show", "PGA Tour"],
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
  { username: "apexofnothing", theme: "shooter",   region: "Oceania",                 platforms: ["PC"],                            availability: ["Weekday mornings", "Weeknights"],  bio: "AU servers, terrible ping, great attitude." },
  { username: "sablecinder",   theme: "soulslike", region: "Asia — Southeast",        platforms: ["PC", "Steam Deck"],              availability: ["Late night"],                      bio: "Boss rush on repeat. Will trade builds." },
  { username: "driftline_ko",  theme: "racing",    region: "Asia — East",             platforms: ["PlayStation 5"],                 availability: ["Weeknights", "Weekend nights"],    bio: "Clean racing only. I will let you by if I punt you." },
  { username: "sundaydriver",  theme: "racing",    region: "UK & Ireland",            platforms: ["Xbox Series X|S", "PC"],         availability: ["Weekend days"],                    bio: "Wheel and pedals, no assists, still slow." },
  { username: "framedata",     theme: "fighting",  region: "North America — West",    platforms: ["PlayStation 5", "PC"],           availability: ["Weeknights", "Late night"],        bio: "Happy to run sets with anyone, any rank. Lab partner wanted." },
  { username: "parrycity",     theme: "fighting",  region: "North America — East",    platforms: ["PC"],                            availability: ["Weekend nights"],                  bio: "I mash on wakeup and I'm not sorry." },
  { username: "eorzeatired",   theme: "mmo",       region: "North America — Central", platforms: ["PC"],                            availability: ["Weeknights", "Randomly online"],   bio: "Sprout-friendly. Will run anything, will explain everything." },
  { username: "raidleadburnout", theme: "mmo",     region: "Europe — West",           platforms: ["PC"],                            availability: ["Weekend nights"],                  bio: "Twelve years of raid logs and a deep need for a break." },
  { username: "twoflashlights", theme: "horror",   region: "North America — East",    platforms: ["PC"],                            availability: ["Late night", "Weekend nights"],    bio: "I scream, you laugh, we both die. Mic essential." },
  { username: "ghosthunting",  theme: "horror",    region: "Europe — East",           platforms: ["PC", "VR"],                      availability: ["Weeknights"],                      bio: "VR ghost hunting is a bad idea and I do it anyway." },
  { username: "onemorerun",    theme: "roguelike", region: "North America — West",    platforms: ["Nintendo Switch", "Steam Deck"], availability: ["Weekday afternoons", "Late night"], bio: "Deckbuilders mostly. I'll talk your build through with you." },
  { username: "seededchaos",   theme: "roguelike", region: "South America",           platforms: ["PC"],                            availability: ["Weeknights"],                      bio: "Ascension 20 or bust. Mostly bust." },
  { username: "openicebox",    theme: "sports",    region: "North America — Central", platforms: ["Xbox Series X|S"],               availability: ["Weekend days", "Weeknights"],      bio: "Rocket League casual, football ranked. Chaos either way." },
  { username: "goalline_amy",  theme: "sports",    region: "UK & Ireland",            platforms: ["PlayStation 5"],                 availability: ["Weeknights"],                      bio: "Pro clubs needs a keeper who wants to be there. That's me." },
  { username: "cartographer",  theme: "strategy",  region: "Middle East",             platforms: ["PC", "Mobile"],                  availability: ["Weekday mornings", "Randomly online"], bio: "Long games, slow turns, no rush. Async friendly." },
  { username: "xShadowReapr",  theme: "shooter",   region: "North America — East",    platforms: ["Xbox Series X|S"],               availability: ["Weeknights", "Late night"],        bio: "Made this name in 2009 and I'm too deep in to change it." },
  { username: "BigMike_44",     theme: "sports",    region: "North America — Central", platforms: ["PlayStation 5"],                 availability: ["Weekend days"],                    bio: "Dad, welder, absolute menace in Rocket League. Mic is always hot." },
  { username: "MoistBagel",     theme: "roguelike", region: "North America — West",    platforms: ["PC", "Steam Deck"],              availability: ["Late night"],                      bio: "Yes the name is bad. No I will not be changing it." },
  { username: "sn1per_kyle",    theme: "shooter",   region: "North America — Central", platforms: ["PC"],                            availability: ["Weeknights"],                      bio: "Gold 3 and coping. Looking for a duo who doesn't tilt." },
  { username: "dadof3gaming",   theme: "survival",  region: "UK & Ireland",            platforms: ["PC", "Nintendo Switch"],         availability: ["Late night", "Randomly online"],   bio: "Online after 9 when the kids are down. Usually building something." },
  { username: "Trvnt",          theme: "fighting",  region: "Europe — West",           platforms: ["PlayStation 5"],                 availability: ["Weeknights", "Weekend nights"],    bio: "Ranked sets most nights. Will run first to five with anybody." },
  { username: "wetsocks99",     theme: "horror",    region: "Oceania",                 platforms: ["PC"],                            availability: ["Weekday mornings"],                bio: "AU hours. I do the screaming, you do the objectives." },
  { username: "notshroud",      theme: "shooter",   region: "North America — West",    platforms: ["PC"],                            availability: ["Weekend nights"],                  bio: "Name is aspirational. Aim is not." },
  { username: "TrashPandaTTV",  theme: "mmo",       region: "North America — East",    platforms: ["PC"],                            availability: ["Weeknights", "Weekend days"],      bio: "Small streamer, smaller ego. Happy to run alts and help with gearing." },
  { username: "Jonno_07",       theme: "racing",    region: "UK & Ireland",            platforms: ["Xbox Series X|S", "PC"],         availability: ["Weeknights"],                      bio: "League racer. Clean or I'm not interested." },
  { username: "4amqueue",       theme: "soulslike", region: "Asia — East",             platforms: ["PC"],                            availability: ["Late night"],                      bio: "The name is a confession. Summon sign is usually down somewhere." },
  { username: "beastmode_bri",  theme: "fighting",  region: "North America — East",    platforms: ["PlayStation 5", "PC"],           availability: ["Weekend nights"],                  bio: "Been playing since the arcade. Will absolutely body you and then explain how." },
  { username: "Kxngslayr",      theme: "mmo",       region: "Europe — East",           platforms: ["PC"],                            availability: ["Weekend nights", "Late night"],    bio: "Raid lead looking for a static that shows up. Consistency over parses." },
  { username: "PeanutButterGG", theme: "cosy",      region: "North America — Central", platforms: ["Nintendo Switch", "Mobile"],     availability: ["Weekday afternoons"],              bio: "Farming games and podcasts. Zero competitive bone in my body." },
  { username: "Th3RealDev",     theme: "strategy",  region: "North America — West",    platforms: ["PC"],                            availability: ["Weeknights", "Randomly online"],   bio: "I write code all day then play games about logistics. Send help." },
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
          // Required since 69: the signup check refuses an account
          // without one. Any adult date will do for a fake.
          birth_date: "1995-06-15",
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
