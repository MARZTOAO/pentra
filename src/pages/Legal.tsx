import { Link } from "react-router-dom";
import { Prose, Section } from "../components/Site";
import { MIN_AGE, SUPPORT_EMAIL } from "../lib/constants";

/**
 * Privacy and Terms.
 *
 * Written in plain English on purpose, and written to be TRUE of what
 * the app actually does today — every claim in here maps to a real
 * table, feature or third party. When the app changes in a way that
 * affects one of these (a new integration, a new kind of data, ads
 * being switched on), the page changes with it and UPDATED moves.
 *
 * Not reviewed by a lawyer. Before this is relied on, it should be.
 */

const UPDATED = "September 24, 2026";

/**
 * Where someone writes with a question.
 *
 * A Porkbun forward, not a real mailbox — it lands in MARZ's own inbox
 * without exposing that address. It matters most for the people the
 * in-app tools can't reach: somebody banned or locked out, a parent
 * whose under-age child signed up, a rights-holder, or anyone asking
 * what data we hold on them.
 */
const CONTACT_EMAIL = SUPPORT_EMAIL;

function Contact() {
  if (!CONTACT_EMAIL) {
    return (
      <p>
        Questions about any of this can be sent through the report and
        feedback tools inside the app.
      </p>
    );
  }
  return (
    <p>
      Questions about any of this:{" "}
      <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
        {CONTACT_EMAIL}
      </a>
      .
    </p>
  );
}

/* ================================================================== */

export function Privacy() {
  return (
    <Prose kicker="Privacy" title="What Pentra knows about you." updated={UPDATED}>
      <Section title="The short version">
        <p>
          Pentra stores what you put into it — your account, your
          profile, the games you pick, what you post and who you message
          — because that is what the app is made of. It does not sell
          any of it, it does not buy data about you from anywhere else,
          and you can delete the whole lot yourself from Settings at any
          time.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong>Your account.</strong> An email address and a password.
          The password is stored hashed, which means nobody — including
          us — can read it back.
        </p>
        <p>
          <strong>Your profile.</strong> Whatever you choose to fill in:
          a username, display name, avatar, bio, the region you play from,
          your time zone, the platforms you play on, when you're usually
          free, and an optional city or country. Some of this is shown to
          other people; that's what a profile is for. Your email address
          never is.
        </p>
        <p>
          <strong>Your date of birth.</strong> Asked when you sign up, to
          check you're old enough to use Pentra, and used for one other
          thing: a happy-birthday message on the day. It's kept apart
          from your profile and never shown to anyone else; you can see
          it in Settings. It can't be changed from inside the app — if
          it's wrong, email us and we'll correct it.
        </p>
        <p>
          <strong>Your games.</strong> Your Top 5 and your library. This is
          what matching runs on, and it's visible on your profile.
        </p>
        <p>
          <strong>What you do in the app.</strong> Posts, comments, likes,
          sessions you host or join, friend requests, and direct messages.
          Messages are private between the people in the conversation;
          they are stored so that the conversation is there when you come
          back.
        </p>
        <p>
          <strong>Activity.</strong> When you were last active and whether
          you're currently online, so that friends can see who's around.
          You can set yourself to appear offline.
        </p>
        <p>
          <strong>Reports.</strong> If you report someone, or someone
          reports you, the report is kept so that it can be acted on.
          People are never told who reported them.
        </p>
      </Section>

      <Section title="What we don't collect">
        <ul>
          <li>Your real name, unless you choose to put it in your profile.</li>
          <li>Your precise location. Region and time zone are what you tell us, not what we detect.</li>
          <li>Anything from your computer or game accounts. The desktop app is the same app as the website, in a window.</li>
          <li>Payment details. If paid features arrive, payment will be handled by a payment provider and card numbers will never touch Pentra.</li>
        </ul>
      </Section>

      <Section title="Who else sees it">
        <p>
          Pentra runs on services that hold data on our behalf. They
          process it for us and don't get to use it for their own
          purposes.
        </p>
        <ul>
          <li><strong>Supabase</strong> hosts the database and handles sign-in.</li>
          <li><strong>Vercel</strong> serves the website.</li>
          <li><strong>GitHub</strong> hosts the desktop app downloads and updates. Checking for an update tells GitHub your IP address, as any download does.</li>
        </ul>
        <p>
          The games catalogue comes from IGDB. That is a one-way import:
          we fetch the list of games; nothing about you is sent back.
        </p>
        <p>
          Advertising may appear on the public website — the home page
          and pages like this one — but not inside the app once you're
          signed in. If and when it does, the ad network (Google AdSense)
          will set its own cookies on those public pages, and this policy
          will be updated to say so before it happens.
        </p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          Pentra keeps you signed in with a token stored in your browser
          (or in the desktop app). It also remembers small preferences
          locally, like which theme you use. There are no tracking cookies
          and no analytics scripts.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Settings → Delete account. It removes your account and
          everything keyed to it: your profile, posts, comments,
          sessions, friendships, and the messages you sent — they
          disappear from the other person's conversation too. Deletion
          is immediate and cannot be undone.
        </p>
      </Section>

      <Section title="Age">
        <p>
          You need to be at least {MIN_AGE} to use Pentra. We ask for
          your date of birth when you sign up and don't create an
          account for anyone younger — and when we refuse one, we don't
          keep the details that were entered. If we learn that someone
          younger has an account anyway, we remove it. Parents who think
          their child has signed up can write to us at the address
          below.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When this page changes in a way that matters, the date at the
          top moves and the change is announced in What's New inside the
          app.
        </p>
        <Contact />
      </Section>
    </Prose>
  );
}

/* ================================================================== */

export function Terms() {
  return (
    <Prose kicker="Terms" title="The deal." updated={UPDATED}>
      <Section title="The short version">
        <p>
          Pentra is free to use. Be a decent person to the people you
          meet through it, don't try to break it, and understand that
          it's run by a small team and might occasionally go down or
          change. That's most of it.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>You need to be at least {MIN_AGE}.</li>
          <li>One person, one account. Your username is yours while you hold it; it isn't a trademark and it can be reclaimed if it impersonates someone.</li>
          <li>You're responsible for what happens under your account. Keep your password to yourself.</li>
        </ul>
      </Section>

      <Section title="What's not allowed">
        <p>
          The point of Pentra is finding people to play with, so most of
          this is common sense.
        </p>
        <ul>
          <li>Harassment, threats, or hate directed at anyone.</li>
          <li>Sexual content, and any content that sexualises minors — this one gets an immediate, permanent ban and, where the law requires it, a report.</li>
          <li>Impersonating another person.</li>
          <li>Spam, scams, phishing, or selling things.</li>
          <li>Posting other people's private information.</li>
          <li>Trying to get around a ban, scraping the service, or attacking it.</li>
        </ul>
        <p>
          Reports are reviewed. Depending on what happened you may get a
          warning first, or you may not. A ban ends your access to the
          service; it doesn't entitle you to an explanation of who
          reported you.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          What you post is yours. By posting it you let Pentra show it
          to other people in the app, which is the only reason we need
          it. Delete a post and it's gone.
        </p>
        <p>
          Don't post things you don't have the right to post — someone
          else's artwork, for instance.
        </p>
      </Section>

      <Section title="The desktop app">
        <p>
          The desktop app is the same service in a window. It updates
          itself when a new version is released. The <Link to="/privacy" className="text-accent hover:underline">privacy page</Link> says what that involves.
        </p>
      </Section>

      <Section title="No promises">
        <p>
          Pentra is provided as it is. We do our best to keep it up and
          keep your data safe, but we can't guarantee it will always be
          available, that a session will fill, or that the people you
          meet will be who they say they are. Use the same judgement you
          would anywhere else online — Pentra isn't responsible for what
          happens between people who meet through it.
        </p>
        <p>
          To the extent the law allows, Pentra isn't liable for indirect
          or consequential losses arising from using it.
        </p>
      </Section>

      <Section title="Ending things">
        <p>
          You can delete your account at any time from Settings. We can
          suspend or close accounts that break these terms. We might
          also change or shut down the service; if that happens with
          anything more than a temporary outage, you'll be told in
          advance.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If these terms change in a way that matters, the date at the
          top moves and the change is announced in What's New inside the
          app. Carrying on using Pentra after that means you're okay with
          the new version.
        </p>
        <Contact />
      </Section>
    </Prose>
  );
}
