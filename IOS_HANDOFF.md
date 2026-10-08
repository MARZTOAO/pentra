# iOS handoff — read this first

For a Claude session working on the Mac (`/Users/michael/pentra`) or the PC.
First written 2026-10-05; brought up to date 2026-10-07. The full history
lives in the claude.ai Project "Gamer Social App" (`claude/project-state.md`,
`claude/october-2026.md`); this is the short version.

## Who and how

- The owner is MARZ. He's new to coding: Claude writes the code, MARZ runs
  commands, tests, and pushes. Explain steps plainly, one command per code
  block, and always start push instructions with the `cd` into the repo.
- Git: MARZ commits and pushes himself. No Co-Authored-By lines in his
  commits.
- The same repo is checked out on his Windows PC at
  `C:\Users\MSI\source\gamer-social`. Both machines push to
  `github.com/MARZTOAO/pentra` (public). `git pull` (then `npm install`)
  before starting on either machine.

## What Pentra is

A social app for gamers: React 19 + TypeScript + Vite + Tailwind v4,
HashRouter, Supabase (Postgres + RLS + Edge Functions). It ships as a website
(pentra.gg, Vercel, deploys on every push), a Windows desktop app (Tauri, in
`src-tauri/`) and an iPhone app (Capacitor, in `ios/`). One codebase, one
database, one account everywhere.

## Where the iPhone app stands (2026-10-07)

| Stage | Status |
|---|---|
| 1. Capacitor shell, runs in the Simulator | Done |
| 2. Native feel (safe areas, keyboard, links, sign-out on phones) | Done |
| 3. Push notifications (APNs) | Done, working on a real iPhone |
| 4. Pro on iOS, US storefront only | Done (`ios/App/App/Storefront.swift`) |
| 5. App Store | **Submitted.** Build 3, iPhone only, version 1.0 |
| 6. Live updates | Not started |

- App Review asked for more information (Guideline 2.1, new developer
  account) on 2026-10-06. MARZ replied with a screen recording and answers,
  added them to the App Review Notes, and resubmitted on 2026-10-07. Waiting.
- Release is set to **manual**: after approval nothing goes live until MARZ
  presses Release.
- Not offered in the EU at launch (no trader status). All other countries,
  plus future ones.
- Age rating 16+ (override from Apple's calculated 13+).
- Don't edit the iOS App Version 1.0 page while it's in review.
- The App Store listing text, privacy answers and review notes are in the
  claude.ai doc "Pentra App Store Listing".

### Builds

- Bundle id `gg.pentra.app`, team `7B7PG928BR`, individual account.
- `TARGETED_DEVICE_FAMILY = 1` (iPhone only). `CURRENT_PROJECT_VERSION` is 3;
  bump it in both build configurations of `project.pbxproj` for each upload.
- The app ships its own copy of the web build: a pushed change reaches the
  website at once but the iPhone only in the next build. Database changes
  reach both immediately.
- To build: `npm run ios` (builds and syncs), `npx cap open ios`, set the
  device to **Any iOS Device (arm64)**, Product → Archive, Distribute App →
  App Store Connect → Upload.
- **Build 4** (after 1.0 is approved) carries giveaways, the ambassador page
  and the Support page to the iPhone.

### Push notifications

- `supabase/102_push_notifications.sql` + the `push` Edge Function (Verify
  JWT off). Secrets: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`,
  `APNS_PRIVATE_KEY`. The vault secret `push_function_url` tells the database
  where the function is.
- `src/lib/push.ts` registers the token after sign-in. Remember: a Supabase
  query builder sends nothing until it's awaited or `.then()`-ed.

## Mac quirks (save time)

- Node comes from nvm; `~/.zshrc` loads it. If `npm` is "not found", open a
  new Terminal window.
- `gh` is installed at `~/gh` (arm64 build).
- Xcode 27 calls the Simulator "Device Hub". `npx cap run ios` fails; use
  `npx cap open ios` and press Play instead.
- A real iPhone needs Developer Mode on (it only appears in Settings after
  Xcode first tries to install).
- If git says `index.lock` exists, a stale lock is left over: remove
  `.git/index.lock` and retry.
- GitHub sometimes answers a push with "Internal Server Error"; wait and push
  again.

## Bots and abuse

- Sign-up: a Before User Created hook (`supabase/functions/signup-guard`)
  refuses disposable email domains and checks Cloudflare Turnstile on the
  website. The bot check can't run in the app, so the app sends people to
  pentra.gg to sign up. Secrets: `SIGNUP_HOOK_SECRET`, `TURNSTILE_SECRET_KEY`;
  site key `VITE_TURNSTILE_SITE_KEY` (Vercel + GitHub secret).
- Rate limits on messages, friend requests, posts and more (101).
- The 42 seeded test players (`@example.test`) have random passwords; nobody
  can sign in as them.

## Money

- Pentra Pro: $5.99 a month or $59.88 a year, Stripe (live). Sold on the
  website, the PC app, and the iPhone app on the US storefront only.
  Hidden on Android when that exists (no storefront check there).
- Creator partners (ambassadors), DevPanel → Creators:
  - Viewers get 25% off a first month or 30% off a first year with a code.
  - Creator earns $1 monthly / $10 yearly per new subscriber for their first
    100, then $1.50 / $15, after the 14-day refund window (104).
  - Loyalty bonus: +$2 when a monthly subscriber pays a 3rd time, +$10 when
    a yearly one renews (106).
  - A code can be linked to the creator's own account; they then see an
    Ambassador page (Settings → Ambassador) with their own numbers only, and
    last month's top 3.
  - Payouts are sent by hand (Zelle or PayPal) and recorded in the Creators
    tab. W-9 before the first payout; 1099-NEC at $600+ a year.
- Giveaways (105), DevPanel → Giveaways: entrants opt in on /giveaway with a
  TikTok username (18+, Top 5, date of birth on file). Bonus entries from
  invites that start playing. Weighted draw after closing; confirm or skip
  winners after checking TikTok. Rules template built in. Keep prizes under
  $5,000 or register in NY and FL.

## Built but switched off

- **Pentra Pets** (supabase/110, src/lib/pets.ts, PetCard/PetSprite,
  shown on PublicProfile). Behind the `pets` feature flag: invisible
  until MARZ turns it on in Developer → Flags (testers first, then
  everyone). On launch day: flag on for all, then run
  supabase/111_pets_launch.sql for the What's New line. Art is being
  commissioned; see public/pets/README.md for file names and the brief,
  then flip ART_READY in PetSprite.tsx. All the numbers (hatch time,
  decay, XP, snacks, new-egg cooldown) live in `pet_rules()` in 110 —
  change them there. A new egg destroys the old pet: Pro any time, free
  once every 30 days. Developer row on the card: hatch/evolve/fill/reset.

## Not started / on hold

- Android: on hold. A new personal Google Play account needs 12 testers for
  14 days before going public.
- Live updates (stage 6).
- A notification toggle for chat messages.

## Rules that matter

- `.env` holds secrets and is gitignored; it must never be committed. Copy it
  between machines by USB or password manager only.
- Never put the Supabase service role key, Stripe secret keys, APNs key,
  webhook or hook secrets anywhere in the app, the repo, or chat. Never ask
  MARZ to paste them into chat.
- Database changes are numbered SQL files in `supabase/` (latest is 107),
  run by hand in the Supabase SQL Editor before pushing. Applied migrations
  are never edited; add a line to `supabase/CHECK_APPLIED.sql` for each new
  one.
- Every user-visible change gets a What's New line (`changelog_entries`),
  written before the push.
- `npm run build` must pass (tsconfig has `noUnusedLocals` on).
- `.sql` files go in the SQL Editor; Edge Function code goes in Edge
  Functions. Use `pbcopy < file` to copy a file on the Mac.
