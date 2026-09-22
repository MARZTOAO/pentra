import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { captureReferralFromUrl } from "./lib/referrals";
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
import Confirm from "./pages/Confirm";

/** Every signed-in screen gets the sidebar frame. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

// Before anything renders or routes: an invite link is a plain
// `?ref=` on the root, and the router would otherwise throw the query
// string away on the first navigation.
captureReferralFromUrl();

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

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

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

          <Route
            path="/me"
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
