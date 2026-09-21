import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { RELEASES_PAGE } from "../lib/platform";

/**
 * The frame around every public page — home, privacy, terms.
 *
 * Kept apart from AppShell on purpose. That one is the signed-in app
 * with its sidebar and notifications; this is the website, which has
 * a header, a footer, and nothing that needs a session.
 */

export function SiteHeader() {
  const { session } = useAuth();
  const signedIn = Boolean(session);

  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
      <Link to="/" className="display whitespace-nowrap text-lg">
        <span className="text-accent">//</span> PENTRA
      </Link>
      <nav className="flex items-center gap-1 sm:gap-3">
        {signedIn ? (
          /* Offering "create account" to someone who has one is the
             kind of detail that makes a site feel unattended. */
          <Link
            to="/home"
            className="notch-md whitespace-nowrap border border-accent/50 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10 sm:px-4"
          >
            Open Pentra
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="whitespace-nowrap px-2 py-2 text-sm font-medium text-muted transition hover:text-ink sm:px-3"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="notch-md whitespace-nowrap border border-accent/50 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10 sm:px-4"
            >
              {/* The short label is for 320px phones, where the long
                  one wraps the whole header. */}
              <span className="sm:hidden">Sign up</span>
              <span className="hidden sm:inline">Create account</span>
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function FooterAccountLink() {
  const { session } = useAuth();
  return session ? (
    <Link to="/home" className="transition hover:text-ink">Open Pentra</Link>
  ) : (
    <Link to="/login" className="transition hover:text-ink">Sign in</Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link to="/" className="display text-sm text-ink">
          <span className="text-accent">//</span> PENTRA
        </Link>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/privacy" className="transition hover:text-ink">Privacy</Link>
          <Link to="/terms" className="transition hover:text-ink">Terms</Link>
          <FooterAccountLink />
          <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="transition hover:text-ink">
            Releases
          </a>
        </nav>
      </div>
    </footer>
  );
}

/**
 * A long, readable page of prose. Legal pages, mostly. Narrow measure,
 * generous line height, headings that can be scanned.
 */
export function Prose({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-bg text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-8 sm:px-8 sm:pt-14">
        <p className="label-wide mb-4 text-accent">{kicker}</p>
        <h1 className="display text-3xl sm:text-4xl">{title}</h1>
        <p className="numeric mt-3 text-xs text-muted">Last updated {updated}</p>
        <div className="mt-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A section with a heading. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="display text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
