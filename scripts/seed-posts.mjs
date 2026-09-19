/**
 * Fills the feed with posts from the seeded fake players.
 *
 *   npm run seed-posts            create ~60 posts and sessions
 *   npm run seed-posts -- --wipe  delete every post this script made
 *
 * An empty feed makes a social app look broken rather than new, so this
 * exists purely so the Home screen has something in it while you're
 * testing and while your first real users arrive.
 *
 * Two kinds of post get made:
 *   text  — an ordinary post, sometimes tagged with one of that
 *           player's own Top 5 games
 *   lfg   — a session: a time, a slot count, and the host already in it
 *
 * Bodies are drawn from per-theme pools, so the soulslike players argue
 * about parry timing and the strategy players argue about wide vs tall.
 * A shared pool would give you forty people saying interchangeable
 * things, which reads as fake immediately.
 *
 * The posts are about GAMES — takes, build questions, mechanics
 * arguments, recommendations — not about the poster's day.
 *
 * Deliberately NOT included: invented gaming news. No fabricated patch
 * notes, release dates, studio announcements or leaks. Those would be
 * false claims about real companies sitting on a public site, and
 * people repeat what they read in a feed. Opinions about real games
 * are fine; invented facts about them are not.
 *
 * SAFETY: this only ever touches accounts on @example.test, the same
 * reserved domain seed-players.mjs uses. It cannot delete a real user's
 * posts, and --wipe is scoped the same way.
 */

import { createClient } from "@supabase/supabase-js";

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("\nMissing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env\n");
  process.exit(1);
}

// service_role bypasses RLS, which is what lets this write rows that
// belong to other users. Correct for a seeding script you run yourself;
// never in the app.
const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAIL_DOMAIN = "example.test";

// ---- what they say -------------------------------------------------

// {game} is replaced with one of that player's own Top 5. Pools are
// keyed by the same themes seed-players.mjs uses.
const BY_THEME = {
  soulslike: [
    "build question — is strength still worth taking late in {game} or should I respec to dex?",
    "hot take: the hardest part of {game} is the run back, not the boss",
    "took 14 tries but the parry timing finally clicked. it's rhythm, not reflex",
    "people sleep on the shield in {game}. it's not cowardice, it's tempo",
    "the best boss in {game} is a mid-game one nobody ever talks about",
    "every soulslike lives or dies on whether the checkpoint is in the right place",
  ],
  shooter: [
    "crosshair placement beats aim training and I'll die on this hill",
    "dropped my sens by 20% and my headshot rate went up. should have done it years ago",
    "utility usage is the real skill gap in {game} and almost nobody practices it",
    "best round I had all night was 2 kills and 6 assists. the stats lie",
    "genuinely asking — what's the best entry weapon right now, not the flashiest",
    "playing for the round instead of the clip is the whole game",
  ],
  cosy: [
    "{game} tip nobody gives you: do the fishing early, the money compounds",
    "is there a cosy game with actually good combat or are those mutually exclusive",
    "played a full year of {game} without looking anything up. mistakes were made",
    "recommend me something slow with a soundtrack worth listening to",
    "cosy games are the only genre that respects your time and I mean that",
  ],
  survival: [
    "the trick with {game} is building small and ugly until you actually know the map",
    "lost a 40 hour base and honestly the rebuild came out better",
    "what's everyone's rule on shared chests? we keep having incidents",
    "co-op {game} works best with exactly three people. change my mind",
    "food and light are the real bosses in every survival game",
  ],
  strategy: [
    "{game} is at its best right when you realise the whole plan was wrong",
    "every strategy game is really a game about what you chose not to build",
    "spent an hour optimising one thing and completely forgot the actual objective",
    "happy to play {game} slowly over a few evenings if anyone wants company",
    "the AI is usually terrible at war and genuinely frightening at economy",
    "{game} sessions do not obey time. I sit down at 8 and it is suddenly 2am",
  ],
  racing: [
    "assists off is worth it but give it a full week before you judge yourself",
    "trail braking changed everything for me in {game}",
    "wheel vs pad in {game} — genuinely, how big is the gap at my level?",
    "racing etiquette: give the place back. it costs you two seconds and buys you a reputation",
    "the fastest lap is almost never the one that felt fastest",
  ],
  fighting: [
    "labbed one matchup for two hours and it fixed my entire week",
    "{game} is the most beginner friendly the genre has ever been. now is the time",
    "anti-airing is 80% of the game and I still can't do it under pressure",
    "rollback netcode genuinely saved fighting games, no exaggeration",
    "losing 10-0 to someone better and asking what you did wrong is the fastest way to improve",
  ],
  mmo: [
    "best class for someone who doesn't want to press forty buttons?",
    "{game} raid mechanics are a memory test wearing a boss fight as a costume",
    "do not skip the story in {game}. that's where it's actually good",
    "static's looking for one more. teaching is fine, showing up is the hard part",
    "the social layer is the content. the raid is just the excuse",
  ],
  horror: [
    "the scariest horror games are the ones with no combat at all",
    "{game} is far funnier than it is scary with the right group",
    "proximity chat is the best thing to happen to co-op horror",
    "jump scares are cheap. dread is the real craft",
    "playing horror with people who panic worse than you is the actual experience",
  ],
  roguelike: [
    "{game} runs live and die on the first three choices, everything after is admin",
    "lost a winning run to greed. again. I never learn",
    "recommend me a roguelike with a real hook, I've done all the big ones",
    "the best runs are the ones where you build something you'd never normally take",
    "a good roguelike makes losing feel like information",
  ],
  sports: [
    "{game} ranked is 50% mechanics and 50% not tilting, and I'm bad at the second one",
    "rotation matters more than mechanics and nobody believes me until they try it",
    "pro clubs is the best mode in any sports game and it isn't close",
    "the skill ceiling in {game} is genuinely absurd and that's why it lasts",
  ],
  story: [
    "no spoilers, but {game} absolutely earns its ending",
    "games that let you walk slowly are underrated",
    "{game} has the best side content in the genre and everyone only talks about the main story",
    "recommend me something with a great story and a short runtime. I have a job",
    "the best writing in games is usually in the optional stuff nobody finds",
  ],
};

// Session posts read differently — they're an ask, not a thought.
const SESSIONS = [
  "running {game} tonight, couple of spots open",
  "{game} session, come join if you're around",
  "looking for a few people for {game}",
  "casual {game} run, all skill levels welcome",
  "{game} — need a couple more, mic preferred but not required",
  "doing a {game} session, first come first served",
];


// ---- real events ---------------------------------------------------

/**
 * Real September 2026 gaming news, and fictional reactions to it.
 *
 * The EVENTS are true — release dates, version numbers and shows,
 * checked against PC Gamer and GameSpot's September 2026 calendars.
 * The REACTIONS are invented, because they come from invented people.
 * That split is the whole point: opinions are fair game, facts about
 * real studios are not something to make up.
 *
 * Nothing here asserts a review score, a sales figure, a leak or an
 * unannounced plan. If you add entries later, keep to that line.
 *
 * `on` is when people would start talking about it. For things not out
 * yet the reaction is anticipation, and the post is dated recently
 * instead — see newsPost().
 *
 * THIS GOES STALE. "Valheim just hit 1.0" reads oddly six months on.
 * Re-run with --wipe and reseed, or refresh these entries, whenever the
 * feed starts looking like a time capsule.
 */
const NEWS = [
  { on: "2026-09-09", themes: ["survival"], lines: [
    "Valheim hitting 1.0 after all this time is genuinely emotional. that game raised me",
    "Valheim 1.0 is out, which means we are legally obligated to start a fresh world",
  ], link: "https://www.pcgamer.com/games/pc-game-release-dates-september-2026/" },
  { on: "2026-09-08", themes: ["mmo"], lines: [
    "FFXIV 7.56 is live. there goes the evening",
    "patch day for FFXIV again. my rotation has opinions about this",
  ], link: "https://www.pcgamer.com/games/pc-game-release-dates-september-2026/" },
  { on: "2026-09-15", themes: ["story", "shooter"], lines: [
    "Marvel's Wolverine is finally out on PS5. waited long enough for this one",
    "everyone's playing Wolverine this week. going in completely unspoiled",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "2026-09-04", themes: ["sports"], lines: [
    "NBA 2K27 is out. I will complain about it constantly and play it daily",
    "new 2K is here and my MyCareer guy is already worse than last year's",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "2026-09-11", themes: ["sports"], lines: [
    "NHL 27 dropped. anyone playing, I need people for EASHL",
  ]},
  { on: "2026-09-04", themes: ["soulslike", "fighting"], lines: [
    "Onimusha: Way of the Sword is out and the parry feel is exactly what I wanted",
    "playing the new Onimusha. it is very much my kind of nonsense",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "2026-09-08", themes: ["roguelike"], lines: [
    "Mewgenics is out and it is as unhinged as promised. love it",
    "new Mewgenics run every night this week, I regret nothing",
  ], link: "https://www.pcgamer.com/games/pc-game-release-dates-september-2026/" },
  { on: "2026-09-12", themes: ["mmo", "strategy"], lines: [
    "BlizzCon weekend. reading everything second hand and pretending I was there",
    "BlizzCon just wrapped, feed is unreadable, I love it",
  ]},
  { on: "2026-09-17", themes: ["story", "strategy", "cosy"], lines: [
    "Tokyo Game Show week is always the best week for the backlog getting longer",
    "TGS is on and my wishlist has grown by six games already",
  ], link: "https://www.pcgamer.com/games/pc-game-release-dates-september-2026/" },
  { on: "2026-09-17", themes: ["strategy"], lines: [
    "Endless Legend 2 hit 1.0. going in blind and expecting to lose badly",
    "Fire Emblem: Fortune's Weave is out on Switch 2 and I am absolutely in",
  ], link: "https://www.pcgamer.com/games/pc-game-release-dates-september-2026/" },
  { on: "2026-09-15", themes: ["survival", "mmo"], lines: [
    "RuneScape: Dragonwilds hit 1.0, which is a sentence I did not expect to type",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "2026-09-03", themes: ["soulslike", "story"], lines: [
    "The Blood of Dawnwalker is out. slow burn so far and I mean that as praise",
  ]},
  { on: "2026-09-02", themes: ["roguelike", "cosy"], lines: [
    "Moonlighter 2 is out and the shopkeeping loop still has me completely",
  ]},
  { on: "2026-09-17", themes: ["story"], lines: [
    "Trails in the Sky 2nd Chapter is out. nobody talk to me for a month",
  ], link: "https://www.pcgamer.com/games/pc-game-release-dates-september-2026/" },
  // Not out yet as of seeding — anticipation, dated to now.
  { on: "2026-09-10", themes: ["racing"], lines: [
    "Hot Wheels: Infinite Rush is out and it is exactly as daft as it should be",
    "picked up the new Hot Wheels game purely for the tracks. no regrets",
  ]},
  { on: "upcoming", themes: ["horror"], lines: [
    "Silent Hill: Townfall lands on the 24th. cautiously, dangerously optimistic",
    "Townfall this month. if it's even half as good as the last one I'm happy",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "upcoming", themes: ["story"], lines: [
    "Control Resonant out on the 24th and I have thought about little else",
    "Witcher 3 Remastered drops on the 29th, free if you already own it. no excuse not to replay",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "upcoming", themes: ["sports"], lines: [
    "EA FC 27 on the 24th. see you all in pro clubs, I'll be in goal",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "upcoming", themes: ["cosy"], lines: [
    "Graveyard Keeper 2 on the 22nd and Toem 2 on the 29th. cosy September is eating well",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "upcoming", themes: ["survival", "shooter"], lines: [
    "Dune Awakening is getting a singleplayer mode on the 22nd, which changes things for me",
    "Minecraft Dungeons 2 on the 29th, roping the kids into that one immediately",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
  { on: "upcoming", themes: ["shooter"], lines: [
    "big Deadlock update supposedly landing this month. the meta is about to be unrecognisable",
  ], link: "https://www.gamespot.com/articles/the-biggest-new-game-releases-of-september-2026/" },
];

/** A date a few days after an event, never in the future. */
function newsWhen(on) {
  if (on === "upcoming") return whenWithin(3);
  const base = new Date(on + "T19:00:00Z").getTime();
  const jitter = Math.random() * 3 * 24 * 60 * 60 * 1000;
  const ceiling = Date.now() - 30 * 60 * 1000;
  return new Date(Math.min(base + jitter, ceiling)).toISOString();
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;

// ---- helpers -------------------------------------------------------

/** Every seeded player, with their Top 5 for tagging and session games. */
async function loadSeededPlayers() {
  const ids = [];
  let page = 1;

  // admin.listUsers pages; the email domain is what marks a fake.
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(error.message);

    for (const u of data.users) {
      if (u.email?.endsWith(`@${EMAIL_DOMAIN}`)) ids.push(u.id);
    }
    if (data.users.length < 200) break;
    page++;
  }

  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", ids);

  const { data: tops } = await supabase
    .from("top_five")
    .select("user_id, game_id, rank, games(name)")
    .in("user_id", ids);

  return (profiles ?? []).map((p) => ({
    ...p,
    games: (tops ?? [])
      .filter((t) => t.user_id === p.id)
      .sort((a, b) => a.rank - b.rank)
      .map((t) => ({ id: t.game_id, name: t.games?.name ?? null }))
      .filter((g) => g.name),
  }));
}

/**
 * Guesses a theme from the games someone actually has, so the right
 * pool gets used even though the theme isn't stored in the database.
 * Falls back to a broad pool rather than guessing wrong loudly.
 */
const THEME_HINTS = {
  soulslike: ["elden", "souls", "bloodborne", "sekiro", "lies of p", "nioh"],
  shooter: ["counter-strike", "valorant", "apex", "call of duty", "overwatch", "destiny"],
  cosy: ["stardew", "animal crossing", "spiritfarer", "unpacking", "dave the diver", "cult of the lamb"],
  survival: ["minecraft", "valheim", "rust", "terraria", "grounded", "palworld"],
  strategy: ["civilization", "total war", "crusader", "age of empires", "factorio", "stellaris"],
  racing: ["forza", "gran turismo", "f1", "assetto", "wreckfest", "trackmania"],
  fighting: ["street fighter", "tekken", "mortal kombat", "guilty gear", "smash", "skullgirls"],
  mmo: ["final fantasy xiv", "warcraft", "guild wars", "elder scrolls online", "black desert", "runescape"],
  horror: ["phasmophobia", "dead by daylight", "lethal company", "resident evil", "outlast", "content warning"],
  roguelike: ["hades", "balatro", "slay the spire", "dead cells", "risk of rain", "vampire survivors"],
  sports: ["rocket league", "ea sports", "nba 2k", "madden", "mlb", "pga"],
  story: ["last of us", "red dead", "baldur's gate", "cyberpunk", "disco elysium", "god of war"],
};

function themeFor(games) {
  const names = games.map((g) => g.name.toLowerCase());
  let best = null;
  let bestHits = 0;

  for (const [theme, hints] of Object.entries(THEME_HINTS)) {
    const hits = names.filter((n) => hints.some((h) => n.includes(h))).length;
    if (hits > bestHits) {
      best = theme;
      bestHits = hits;
    }
  }
  return best ?? "story";
}

/** A moment in the last `days` days, biased toward recent. */
function whenWithin(days) {
  const skew = Math.random() ** 1.7; // more posts near today than a week back
  const ms = skew * days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

/** Tonight-ish, tomorrow-ish, or a few days out — always in the future. */
function sessionTime() {
  const daysOut = rand(6);
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  d.setHours(18 + rand(5), pick([0, 15, 30, 45]), 0, 0);
  if (d.getTime() < Date.now() + 60 * 60 * 1000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

// ---- seed ----------------------------------------------------------

async function seed() {
  const players = await loadSeededPlayers();

  if (players.length === 0) {
    console.error(
      "\nNo seeded players found. Run `npm run seed-players` first.\n",
    );
    process.exit(1);
  }

  const withGames = players.filter((p) => p.games.length > 0);
  console.log(
    `${players.length} seeded players (${withGames.length} with a Top 5). Writing posts.\n`,
  );

  const rows = [];

  // Every line gets used at most once. With 42 players sharing twelve
  // themes, drawing at random guarantees the same sentence appears
  // three or four times, which is the single most obvious tell that a
  // feed is generated. Tracking what's been said is the whole fix.
  const spent = new Set();
  const takeUnused = (pool) => {
    const free = pool.filter((line) => !spent.has(line));
    if (free.length === 0) return null;
    const line = pick(free);
    spent.add(line);
    return line;
  };

  // Sessions are the loudest thing in the feed — a big card with a
  // time, a roster and a join button. A handful reads like an active
  // community; fifteen reads like a listings site.
  const MAX_SESSIONS = 6;
  let sessionsMade = 0;

  // Only themes people actually play together can host one. Without
  // this the generator cheerfully produced "running Balatro tonight,
  // couple of spots open" — Balatro is single-player, and that single
  // detail undoes every other bit of realism on the card.
  const CO_OP = new Set([
    "shooter", "mmo", "survival", "horror", "sports", "racing", "fighting",
  ]);

  // Shuffled, so the few session hosts aren't always the same themes.
  const order = [...players].sort(() => Math.random() - 0.5);

  for (const player of order) {
    const theme = themeFor(player.games);
    const pool = BY_THEME[theme] ?? BY_THEME.story;
    const count = chance(0.15) ? 3 : chance(0.5) ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const game = player.games.length ? pick(player.games) : null;

      // Sessions first, but capped and rationed across the run.
      if (game && CO_OP.has(theme) && sessionsMade < MAX_SESSIONS && chance(0.2)) {
        const line = takeUnused(SESSIONS);
        if (line) {
          sessionsMade++;
          rows.push({
            author_id: player.id,
            body: line.replace("{game}", game.name),
            game_id: game.id,
            kind: "lfg",
            starts_at: sessionTime(),
            slots: 2 + rand(5),
            // Same window as everything else, so the feed interleaves
            // instead of showing a block of sessions then a block of
            // posts. Ordering is by created_at, so this IS the mixing.
            created_at: whenWithin(12),
          });
          continue;
        }
      }

      // Roughly half the feed reacts to something that actually happened.
      const relevant = NEWS.filter((n) => n.themes.includes(theme));
      if (relevant.length && chance(0.45)) {
        const item = pick(relevant);
        const line = takeUnused(item.lines);
        if (line) {
          // Only sometimes — a feed where every news post carries the
          // same two URLs looks like a bot farm, which is the opposite
          // of the point.
          const withLink = item.link && chance(0.4);
          rows.push({
            author_id: player.id,
            body: withLink ? `${line}\n\n${item.link}` : line,
            game_id: null,
            kind: "text",
            starts_at: null,
            slots: null,
            created_at: newsWhen(item.on),
          });
          continue;
        }
      }

      const body = takeUnused(pool);
      if (!body) continue;               // that theme is talked out

      const mentions = body.includes("{game}");
      if (mentions && !game) continue;

      rows.push({
        author_id: player.id,
        body: game ? body.replace("{game}", game.name) : body,
        game_id: mentions || chance(0.35) ? game?.id ?? null : null,
        kind: "text",
        starts_at: null,
        slots: null,
        created_at: whenWithin(12),
      });
    }
  }

  const { data: inserted, error } = await supabase
    .from("posts")
    .insert(rows)
    .select("id, author_id, kind, slots");

  if (error) {
    console.error(`\nInsert failed: ${error.message}\n`);
    process.exit(1);
  }

  const sessions = inserted.filter((p) => p.kind === "lfg");
  console.log(
    `  ${inserted.length} posts (${sessions.length} of them sessions).`,
  );

  // The host is always in their own session — the app assumes it, and
  // a session showing 0/4 when someone organised it looks broken.
  const joins = sessions.map((s) => ({ post_id: s.id, user_id: s.author_id }));

  // Plus a few other players who "joined", without overfilling.
  for (const s of sessions) {
    const others = players.filter((p) => p.id !== s.author_id);
    const room = Math.max(0, (s.slots ?? 2) - 1);
    const take = Math.min(room, rand(3));
    for (const p of others.sort(() => Math.random() - 0.5).slice(0, take)) {
      joins.push({ post_id: s.id, user_id: p.id });
    }
  }

  if (joins.length) {
    const { error: joinError } = await supabase
      .from("session_players")
      .upsert(joins, { onConflict: "post_id,user_id" });
    if (joinError) console.log(`  (joins failed: ${joinError.message})`);
    else console.log(`  ${joins.length} session players.`);
  }

  // Likes, so the counts aren't all zero.
  const likes = [];
  for (const post of inserted) {
    for (const p of players) {
      if (p.id !== post.author_id && chance(0.12)) {
        likes.push({ post_id: post.id, user_id: p.id });
      }
    }
  }

  if (likes.length) {
    const { error: likeError } = await supabase
      .from("post_likes")
      .upsert(likes, { onConflict: "post_id,user_id" });
    if (likeError) console.log(`  (likes failed: ${likeError.message})`);
    else console.log(`  ${likes.length} likes.`);
  }

  console.log("\nDone. Open Home to see the feed.\n");
}

// ---- wipe ----------------------------------------------------------

async function wipe() {
  const players = await loadSeededPlayers();

  if (players.length === 0) {
    console.log("\nNo seeded players, so nothing to clean up.\n");
    return;
  }

  const ids = players.map((p) => p.id);

  // Only posts authored by @example.test accounts. Likes, session
  // players and media rows cascade from the post.
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .in("author_id", ids)
    .select("id");

  if (error) console.error(`\nFailed: ${error.message}\n`);
  else console.log(`\nDeleted ${data.length} seeded posts.\n`);
}

const wiping = process.argv.includes("--wipe");

(wiping ? wipe() : seed()).catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
