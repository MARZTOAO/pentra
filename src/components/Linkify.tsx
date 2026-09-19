import { Fragment } from "react";
import { Link } from "react-router-dom";

/**
 * Renders post text with any URLs in it turned into links.
 *
 * Posts are plain text, and until now a pasted link rendered as
 * unclickable characters — which looks broken to whoever posted it.
 *
 * Only http and https are matched. Not because other schemes are
 * exotic, but because `javascript:` is one of them: turning arbitrary
 * user text into an anchor is exactly how a post becomes an attack on
 * whoever reads it.
 *
 * `rel="noopener noreferrer"` matters for the same reason. Without
 * `noopener`, the page you open gets a handle on this one through
 * `window.opener` and can navigate it somewhere else.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/**
 * A tagged player. Same shape the database looks for in
 * supabase/34_mentions.sql, so what renders as a link is exactly what
 * got recorded as a tag — a name that lights up here always notified
 * somebody, and one that didn't never does.
 *
 * The link is internal, so it needs no rel or target; react-router
 * handles it in-app.
 */
const MENTION_PATTERN = /(@[A-Za-z0-9_]{3,20})/g;

/** Trailing punctuation usually belongs to the sentence, not the URL. */
function trimTrailing(url: string): [string, string] {
  const match = url.match(/[.,;:!?)\]]+$/);
  if (!match) return [url, ""];
  return [url.slice(0, -match[0].length), match[0]];
}

export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        // split() with one capture group puts the matches at odd indexes.
        // Even ones are ordinary text, which may still hold mentions.
        if (i % 2 === 0) return <Mentions key={i} text={part} />;

        const [href, tail] = trimTrailing(part);

        return (
          <Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              // Stops a link click from also triggering whatever the
              // surrounding card does when you click it.
              onClick={(e) => e.stopPropagation()}
              className="text-accent underline underline-offset-2 hover:text-accent-hi"
            >
              {href.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
            {tail}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Turns @names inside a run of plain text into profile links.
 *
 * Run after the URL split rather than before, so a username-looking
 * fragment inside a URL is left alone.
 */
function Mentions({ text }: { text: string }) {
  const parts = text.split(MENTION_PATTERN);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <Link
            key={i}
            to={`/u/${part.slice(1)}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-accent hover:underline"
          >
            {part}
          </Link>
        ),
      )}
    </>
  );
}
