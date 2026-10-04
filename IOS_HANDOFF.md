# iOS handoff — read this first

For a Claude session working on the Mac (`/Users/michael/pentra`). Written
2026-10-05 from the PC session. The full history lives in the claude.ai
Project "Gamer Social App" (`claude/project-state.md`,
`claude/october-2026.md`); this is the short version.

## Who and how

- The owner is MARZ. He's new to coding: Claude writes the code, MARZ runs
  commands, tests, and pushes. Explain steps plainly, one command per code
  block, and always start push instructions with the `cd` into the repo.
- Git: MARZ commits and pushes himself. No Co-Authored-By lines in his
  commits.
- The same repo is checked out on his Windows PC at
  `C:\Users\MSI\source\gamer-social`. Both machines push to
  `github.com/MARZTOAO/pentra` (public). `git pull` before starting.

## What Pentra is

A social app for gamers: React 19 + TypeScript + Vite + Tailwind v4,
HashRouter, Supabase (Postgres + RLS + Edge Functions). It already ships
as a website (pentra.gg, Vercel) and a Windows desktop app (Tauri, in
`src-tauri/`). One codebase, one database, one account everywhere.

## The iOS goal

iPhone/iPad app that looks and works the same as web and desktop, and talks
to the same Supabase so everyone sees everyone regardless of device.

Agreed plan: **Capacitor** shell around the existing React build (Tauri
stays for Windows; don't touch `src-tauri/`). Stages:

1. Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`; `npx cap init`
   (app name **Pentra**, bundle id e.g. `gg.pentra.app`, webDir `dist`);
   `npm run build`; `npx cap add ios`; run in the iPhone Simulator signed in
   to a real account. No Apple account needed for this stage.
2. Native feel: safe-area insets (notch/home indicator), keyboard behaviour in
   chat, external links via `@capacitor/browser`, hide desktop-only things
   (tray/autostart settings, the "get the desktop app" bar, the Tauri
   updater). `src/lib/platform.ts` has `isDesktopApp()` and `isHandheld()`;
   add an `isNativeApp()` alongside. App icon from `brand/pentra-app-icon.svg`.
3. Push notifications (APNs via a Supabase Edge Function + a device-tokens
   table).
4. Pentra Pro on iOS: open the existing Stripe web checkout in Safari (US
   storefront allows external purchase links since May 2025); hide outside
   the US. Re-check App Review Guideline 3.1.1 before submitting.
5. App Store: listing, privacy labels, UGC rules (report/block/filter already
   exist), TestFlight, submit.
6. Live updates (Capgo or similar) so a push reaches iOS without a new build.

Apple Developer enrolment (Individual) was submitted 2026-10-05 and is
pending. Real-device runs and TestFlight wait for it.

## Rules that matter

- `.env` holds secrets and is gitignored; it must never be committed. Copy it
  between machines by USB or password manager only.
- Never put the Supabase service role key, Stripe secret keys or webhook
  secrets anywhere in the app, the repo, or chat.
- Database changes are numbered SQL files in `supabase/` (latest is 97), run
  by hand in the Supabase SQL Editor. Applied migrations are never edited;
  add a line to `supabase/CHECK_APPLIED.sql` for each new one.
- Every user-visible change gets a What's New line (`changelog_entries`),
  written before the push.
- `npm run build` must pass (tsconfig has `noUnusedLocals` on).
