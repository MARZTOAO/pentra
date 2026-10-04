/**
 * "Game data powered by IGDB.com".
 *
 * Pentra's catalogue — names, genres, release dates, cover art — comes
 * from IGDB through the Twitch developer API (scripts/import-games.mjs).
 * IGDB's terms ask for a linked credit wherever its data is shown, and
 * it's the honest thing to say anyway: none of those covers are ours.
 *
 * Used at the foot of every signed-in screen (AppShell) and in the game
 * search box, which is the one place the catalogue is browsed directly.
 */
export function IgdbCredit({ className = "" }: { className?: string }) {
  return (
    <p className={"text-2xs text-muted " + className}>
      Game data powered by{" "}
      <a
        href="https://www.igdb.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-line underline-offset-2 transition hover:text-accent"
      >
        IGDB.com
      </a>
    </p>
  );
}
