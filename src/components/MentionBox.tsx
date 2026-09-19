import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";
import { supabase } from "../lib/supabase";
import { Anchored } from "./Anchored";
import { Avatar } from "./Avatar";

export type MentionableFriend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
};

/**
 * A textarea that offers your friends when you type "@".
 *
 * Only friends, because only friends can actually be tagged — see
 * supabase/34_mentions.sql. Offering a name the database will refuse
 * to record would be a small lie that costs someone a notification
 * they were expecting to send.
 *
 * The list hangs below the whole box rather than beside the caret.
 * Caret-accurate positioning in a textarea means rendering a mirror
 * element and measuring it, which is a lot of machinery for a panel
 * that is perfectly usable one line lower.
 */
export function MentionBox({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (next: string) => void;
} & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
>) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [matches, setMatches] = useState<MentionableFriend[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // The partial "@word" the caret currently sits inside, or null.
  const [fragment, setFragment] = useState<{
    start: number;
    text: string;
  } | null>(null);

  const search = useCallback(async (prefix: string) => {
    const { data, error } = await supabase.rpc("mentionable_friends", {
      prefix,
    });
    if (error || !data) {
      setMatches([]);
      setOpen(false);
      return;
    }
    const rows = data as MentionableFriend[];
    setMatches(rows);
    setActive(0);
    setOpen(rows.length > 0);
  }, []);

  /**
   * Finds an @word that the caret is inside or directly after.
   *
   * Anchored to a word boundary so an email address doesn't open the
   * picker halfway through typing it.
   */
  function detect(text: string, caret: number) {
    const before = text.slice(0, caret);
    const match = before.match(/(?:^|\s)@([A-Za-z0-9_]{0,20})$/);

    if (!match) {
      setFragment(null);
      setOpen(false);
      return;
    }

    setFragment({ start: caret - match[1].length, text: match[1] });
  }

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    if (!fragment) return;

    const timer = setTimeout(() => search(fragment.text), 150);
    return () => clearTimeout(timer);
  }, [fragment, search]);

  function choose(friend: MentionableFriend) {
    if (!fragment) return;

    const before = value.slice(0, fragment.start);
    const after = value.slice(fragment.start + fragment.text.length);
    const next = `${before}${friend.username} ${after}`;

    onChange(next);
    setOpen(false);
    setFragment(null);

    // Put the caret after the name we just inserted, rather than
    // wherever the browser decides to leave it.
    const caret = before.length + friend.username.length + 1;
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || matches.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Only swallow Enter while the picker is up — otherwise it would
      // stop people starting a new line in an ordinary post.
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <>
      <textarea
        {...rest}
        ref={box}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? 0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Let a click on the list land before the panel disappears.
          setTimeout(() => setOpen(false), 150);
        }}
      />

      {open && (
        <Anchored
          anchorRef={box}
          onClose={() => setOpen(false)}
          width={260}
        >
          <div className="float-shadow">
            <ul className="notch-md overflow-hidden border border-line bg-surface py-1">
              {matches.map((friend, i) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    // mousedown, not click: blur fires first otherwise
                    // and the panel is gone before the click lands.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(friend);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition " +
                      (i === active ? "bg-surface-2" : "")
                    }
                  >
                    <Avatar of={friend} size={26} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">
                        {friend.display_name || friend.username}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        @{friend.username}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Anchored>
      )}
    </>
  );
}
