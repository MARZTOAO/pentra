import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { captureReferralFromUrl } from "./lib/referrals";
import { captureCreatorFromUrl } from "./lib/billing";
import { useAuth } from "./lib/AuthContext";
import { useEffect, useState } from "react";
import { getProfile } from "./lib/profile";
import { FullScreenLoader } from "./components/ui";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./components/AppShell";
import { Notifications } from "./components/Notifications";
import { UpdateBanner } from "./components/UpdateBanner";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import UserFriends from "./pages/UserFriends";
import PostPage from "./pages/PostPage";
import Discover from "./pages/Discover";
import Friends from "./pages/Friends";
import Settings from "./pages/Settings";
import Messages from "./pages/Messages";
import Home from "./pages/Home";
import Search from "./pages/Search";
import MySessions from "./pages/MySessions";
import Landing from "./pages/Landing";
import { Privacy, Terms } from "./pages/Legal";
import Support from "./pages/Support";
import Confirm from "./pages/Confirm";
import Forgot from "./pages/Forgot";
import DevMetrics from "./pages/DevMetrics";
import Developer from "./pages/Developer";
import Pro from "./pages/Pro";
import Ambassador from "./pages/Ambassador";
import GiveawayRoute, { GiveawayRulesRoute } from "./pages/Giveaway";
import Arcade from "./pages/Arcade";
import ArcadeGame from "./pages/ArcadeGame";
import StackTrace from "./pages/StackTrace";

/** Every signed-in screen gets the sidebar frame. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

/**
 * The Profile tab: your own profile exactly as other players see it,
 * with a gear that opens the editor (/me/edit). Looks up your username
 * once and hands it to PublicProfile, which does the rest.
 */
function MyProfile() {
  const { user } = useAuth();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then(({ data }) => {
      setUsername((data as { username?: string } | null)?.username ?? null);
    });
  }, [user]);

  if (!username) return <FullScreenLoader />;
  return <PublicProfile username={username} />;
}

// Before anything renders or routes: an invite link is a plain
// `?ref=` on the root, and the router would otherwise throw the query
// string away on the first navigation.
captureReferralFromUrl();
// Same for a creator's `?creator=CODE` link (lib/billing.ts).
captureCreatorFromUrl();

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Notifications>
          <Routes>
          {/* The website. Signed-in people and the desktop app skip
              straight past it — see Landing. */}
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/support" element={<Support />} />

          {/* Giveaways (supabase/105). Open signed out too, for the
              link in a TikTok bio; inside the app frame once signed in. */}
          <Route path="/giveaway" element={<GiveawayRoute />} />
          <Route path="/giveaway/rules/:id" element={<GiveawayRulesRoute />} />

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot" element={<Forgot />} />

          {/* Where the link in a confirmation or password-reset email
              lands. Outside ProtectedRoute on purpose: the whole point
              is that you are not signed in yet when you arrive. */}
          <Route path="/confirm" element={<Confirm />} />

          <Route
            path="/home"
            element={
              <Shell>
                <Home />
              </Shell>
            }
          />

          {/* Profile tab: yours, as everyone sees it. The gear on it
              opens the editor. */}
          <Route
            path="/me"
            element={
              <Shell>
                <MyProfile />
              </Shell>
            }
          />

          <Route
            path="/me/edit"
            element={
              <Shell>
                <Profile />
              </Shell>
            }
          />

          <Route
            path="/u/:username"
            element={
              <Shell>
                <PublicProfile />
              </Shell>
            }
          />

          {/* A single post, on its own page. Where notifications land. */}
          <Route
            path="/p/:id"
            element={
              <Shell>
                <PostPage />
              </Shell>
            }
          />

          <Route
            path="/u/:username/friends"
            element={
              <Shell>
                <UserFriends />
              </Shell>
            }
          />

          <Route
            path="/sessions"
            element={
              <Shell>
                <MySessions />
              </Shell>
            }
          />

          <Route
            path="/discover"
            element={
              <Shell>
                <Discover />
              </Shell>
            }
          />

          <Route
            path="/search"
            element={
              <Shell>
                <Search />
              </Shell>
            }
          />

          <Route
            path="/friends"
            element={
              <Shell>
                <Friends />
              </Shell>
            }
          />

          <Route
            path="/messages"
            element={
              <Shell>
                <Messages />
              </Shell>
            }
          />

          <Route
            path="/messages/:id"
            element={
              <Shell>
                <Messages />
              </Shell>
            }
          />

          <Route
            path="/settings"
            element={
              <Shell>
                <Settings />
              </Shell>
            }
          />

          {/* Pentra Pro: the upgrade page and your plan. Stripe sends
              people back here (/pro?done=1) after paying. */}
          <Route
            path="/pro"
            element={
              <Shell>
                <Pro />
              </Shell>
            }
          />

          {/* Creator partners' own numbers (supabase/104). The page
              shows nothing to anyone the database doesn't say is one. */}
          <Route
            path="/ambassador"
            element={
              <Shell>
                <Ambassador />
              </Shell>
            }
          />

          {/* Developers only — the pages check, and the database
              refuses everything behind them to anyone else. */}
          {/* The Arcade: small games, scores on profiles (93). */}
          <Route
            path="/arcade"
            element={
              <Shell>
                <Arcade />
              </Shell>
            }
          />
          {/* Stack Trace has levels, not a score, so its own page (95). */}
          <Route
            path="/arcade/stack-trace"
            element={
              <Shell>
                <StackTrace />
              </Shell>
            }
          />
          <Route
            path="/arcade/:slug"
            element={
              <Shell>
                <ArcadeGame />
              </Shell>
            }
          />

          <Route
            path="/dev"
            element={
              <Shell>
                <Developer />
              </Shell>
            }
          />
          <Route
            path="/dev/metrics"
            element={
              <Shell>
                <DevMetrics />
              </Shell>
            }
          />

          {/* Anything else goes to the profile, which bounces you to
              login if you aren't signed in. */}
          <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>

          {/* Desktop only; draws nothing in a browser. Outside the
              routes so an update is offered on every screen. */}
          <UpdateBanner />
        </Notifications>
      </HashRouter>
    </AuthProvider>
  );
}
