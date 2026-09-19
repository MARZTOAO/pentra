import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProfileByUsername, type Profile } from "../lib/profile";
import { getFriendsOf, type Match } from "../lib/matching";
import { MatchCard } from "../components/MatchCard";
import { Avatar } from "../components/Avatar";
import { FullScreenLoader } from "../components/ui";

/**
 * Somebody else's friends, ranked by how well each one matches you.
 *
 * The ranking is the point. A plain alphabetical list of forty
 * strangers is a phone book; the same forty ordered by what you'd
 * actually have in common is a reason to open it. It reuses the Find
 * players card and the Find players scoring so a percentage means the
 * same thing here as it does there.
 */
export default function UserFriends() {
  const { username } = useParams<{ username: string }>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;

    let active = true;
    setLoading(true);

    getProfileByUsername(username).then(async ({ data }) => {
      if (!active) return;

      if (!data) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const row = data as Profile;
      setProfile(row);
      setFriends(await getFriendsOf(row.id));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [username]);

  if (loading) return <FullScreenLoader />;

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <h1 className="mb-2 display text-xl">No such player</h1>
          <Link to="/discover" className="text-sm font-medium text-accent hover:underline">
            Find players instead
          </Link>
        </div>
      </div>
    );
  }

  const name = profile.display_name || profile.username;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-8 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link to={`/u/${profile.username}`} className="shrink-0">
          <Avatar of={profile} size={44} />
        </Link>

        <div className="min-w-0">
          <h1 className="display truncate text-2xl">{name}'s friends</h1>
          <p className="mt-0.5 text-sm text-muted">
            {friends.length === 0
              ? "Nobody to show."
              : `${friends.length} ${friends.length === 1 ? "player" : "players"}, best match first`}
          </p>
        </div>
      </header>

      {friends.length === 0 ? (
        <div className="notch border border-dashed border-line p-10 text-center">
          <p className="mx-auto max-w-sm text-sm text-muted">
            {name} hasn't added anyone yet — or the only person here is you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {friends.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
