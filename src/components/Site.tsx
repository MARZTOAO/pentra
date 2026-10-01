import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { RELEASES_PAGE } from "../lib/platform";
import { SUPPORT_EMAIL } from "../lib/constants";

/**
 * The frame around every public page — home, privacy, terms.
 *
 * Kept apart from AppShell on purpose. That one is the signed-in app
 * with its sidebar and notifications; this is the website, which has
 * a header, a footer, and nothing that needs a session.
 */

/** Sections on the home page the header can jump to. */
const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "download", label: "Download" },
];

/**
 * Scrolls to a section on the home page. A plain href="#features"
 * can't be used: the app routes on the URL hash (HashRouter), so it
 * would try to open a page called "features".
 */
function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * @param sections Show the jump links. Only on the home page — the
 *   sections they point to don't exist on Privacy or Terms.
 */
export function SiteHeader({ sections = false }: { sections?: boolean }) {
  const { session } = useAuth();
  const signedIn = Boolean(session);

  return (
    // Sticky and frosted, with a hairline under it, so it stays to hand
    // on a long page without a hard bar across the top.
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link to="/" className="display whitespace-nowrap text-lg">
          <span className="text-accent">//</span> PENTRA
        </Link>

        {sections && (
          <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                className="px-3 py-2 text-sm text-muted transition hover:text-ink"
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}

        <nav className="flex items-center gap-1 sm:gap-2">
          {signedIn ? (
            /* Offering "create account" to someone who has one is the
               kind of detail that makes a site feel unattended. */
            <Link
              to="/home"
              className="notch-md whitespace-nowrap bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
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
                className="notch-md whitespace-nowrap bg-accent px-3 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi sm:px-4"
              >
                {/* The short label is for 320px phones, where the long
                    one wraps the whole header. */}
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create account</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function FooterAccountLink() {
  const { session } = useAuth();
  return session ? (
    <Link to="/home" className="transition hover:text-ink">Open Pentra</Link>
  ) : (
    <Link to="/signup" className="transition hover:text-ink">Create an account</Link>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const link = "transition hover:text-ink";
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link to="/" className="display text-lg text-ink">
            <span className="text-accent">//</span> PENTRA
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Find people to play with. Matched by your games, your
            platform and your hours.
          </p>
        </div>

        <div>
          <p className="label-wide mb-3 text-ink">Pentra</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><FooterAccountLink /></li>
            <li>
              <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className={link}>
                Downloads &amp; releases
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="label-wide mb-3 text-ink">Legal</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link to="/privacy" className={link}>Privacy</Link></li>
            <li><Link to="/terms" className={link}>Terms</Link></li>
          </ul>
        </div>

        <div>
          <p className="label-wide mb-3 text-ink">Support</p>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>
                {SUPPORT_EMAIL}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line/60">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-muted sm:px-8">
          © {year} Pentra
        </p>
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
