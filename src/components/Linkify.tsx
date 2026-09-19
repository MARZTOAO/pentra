import { Fragment } from "react";

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
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;

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
