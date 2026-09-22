# Email templates

The two HTML files here are pasted into
**Supabase → Authentication → Emails → Templates**. Open one, select all,
paste into the Body box, set the Subject, save. Nothing to edit first —
they're kept free of comments so the whole file is the payload.

| File | Template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm sign up | Confirm your Pentra account |
| `reset-password.html` | Reset password | Reset your Pentra password |

## The link is deliberately not `{{ .ConfirmationURL }}`

That variable points at Supabase's own verify endpoint, which finishes
the verification and then hands the session back in the URL **fragment**
(`#access_token=…`). Two things in this app would drop it on the floor:

1. The app uses **HashRouter**, so the fragment belongs to the router. A
   URL arriving as `#access_token=…` is, to the router, a route that
   doesn't exist.
2. `src/lib/supabase.ts` sets **`detectSessionInUrl: false`** — correct
   for the desktop build, which has no redirects to read — so nothing
   would pick those tokens up even if the router ignored them.

Someone would click the link, land on Pentra signed out, and have no way
to tell what went wrong.

So these templates link to `{{ .SiteURL }}/#/confirm?token_hash={{ .TokenHash }}&type=…`
instead, putting the token in the **query string** where nothing else is
looking. `src/pages/Confirm.tsx` exchanges it for a session with
`verifyOtp`. Same outcome, no collision, works the same in the browser
and in the desktop app — and the person gets a real screen rather than a
silent redirect.

**If you ever switch away from HashRouter**, this stops being necessary,
but it will keep working. Don't "simplify" it back to `.ConfirmationURL`
without testing a real signup end to end first.

## Why the markup looks twenty years old

Tables, inline styles, no flexbox, no web fonts, a background colour
repeated on every cell. Email clients are not browsers: Outlook renders
with Word, Gmail strips `<style>` blocks in some views, and dark-mode
clients invert colours unasked. The accent rule across the top stands in
for the notch, because `clip-path` would not survive a single client.

The button is a table cell with a background colour rather than a styled
`<a>`, because Outlook ignores padding on inline links and would render
it as bare blue text.

## Site URL matters

The link is built from `{{ .SiteURL }}`. Check
**Authentication → URL Configuration** reads exactly `https://pentra.gg`
with **no trailing slash** — otherwise every link becomes
`pentra.gg//#/confirm` and 404s.

## Changing the wording

Edit the file, paste it back into the dashboard, and commit the change
here so the two don't drift. The dashboard is the live copy; this folder
is the source of truth for what was put there.
