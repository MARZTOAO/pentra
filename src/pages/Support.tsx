import { Link } from "react-router-dom";
import { Prose, Section } from "../components/Site";
import { MIN_AGE, SUPPORT_EMAIL } from "../lib/constants";
import { REFUND_DAYS } from "../lib/billing";

/**
 * /support — how to reach us, and answers to what people ask most.
 *
 * The App Store listing's Support URL points here (from the next
 * version; 1.0 was submitted pointing at /terms). Keep every answer
 * true of what the app does today, like the legal pages.
 */

const UPDATED = "October 7, 2026";

const a = "text-accent hover:underline";

export default function Support() {
  return (
    <Prose kicker="Support" title="How can we help?" updated={UPDATED}>
      <Section title="Contact us">
        <p>
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={a}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with your Pentra username and what's going on. A real person
          reads every message, usually within a day or two.
        </p>
        <p>
          To report a player, a post or a message, use Report inside the
          app instead: it reaches us faster and shows us exactly what you
          mean.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          <strong>Can't sign in?</strong> Use{" "}
          <Link to="/forgot" className={a}>
            Forgot password
          </Link>{" "}
          to get a reset link by email. If the email never arrives, check
          your spam folder, then write to us.
        </p>
        <p>
          <strong>No verification email after signing up?</strong> Try
          signing in: Pentra offers to send it again. New accounts are
          made on pentra.gg, including from the iPhone app.
        </p>
        <p>
          <strong>Change your password, notifications or who can message
          you</strong> in Settings.
        </p>
        <p>
          <strong>Delete your account</strong> from Settings → Delete
          account, at the bottom of the page. It removes your account and
          everything in it for good.
        </p>
        <p>
          Pentra is for players {MIN_AGE} and over.
        </p>
      </Section>

      <Section title="Staying safe">
        <p>
          Every profile, post, comment and message has <strong>Report</strong>{" "}
          and <strong>Block</strong>. A blocked player can't see you or
          contact you anywhere in the app, and you can unblock them in
          Settings. Reports are reviewed, and accounts that break the rules
          are warned or removed.
        </p>
      </Section>

      <Section title="Pentra Pro">
        <p>
          <strong>Cancel or change your card</strong> from Settings →
          Pentra Pro. Cancelling stops the next charge; Pro stays on until
          the end of what you've paid for.
        </p>
        <p>
          <strong>Refunds:</strong> ask within {REFUND_DAYS} days of your
          first payment and we'll refund it in full, once per account.
          Email us with your username. The full details are in the{" "}
          <Link to="/terms" className={a}>
            terms
          </Link>
          .
        </p>
        <p>
          <strong>Buying on iPhone:</strong> in the US, the iPhone app
          opens our website to buy Pro. Everywhere else, buy it at
          pentra.gg and it works in the app too, on the same account.
        </p>
      </Section>

      <Section title="Notifications on iPhone">
        <p>
          Not getting notifications? Check iPhone Settings → Notifications
          → Pentra and make sure Allow Notifications is on. You choose
          which kinds you get in Pentra's own Settings.
        </p>
      </Section>

      <Section title="Giveaways">
        <p>
          When a giveaway is running it's at the top of Home and at{" "}
          <Link to="/giveaway" className={a}>
            pentra.gg/#/giveaway
          </Link>
          , with its official rules linked on the page. Winners are
          contacted directly.
        </p>
      </Section>

      <Section title="Creators and partnerships">
        <p>
          Make gaming content and want to partner with Pentra? Email us
          with a link to your channel. Partners get their own code, a cut
          of each Pro subscriber they bring in, and a dashboard in the app
          to track it.
        </p>
      </Section>
    </Prose>
  );
}
