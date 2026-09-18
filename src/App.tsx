import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell, ComingSoon } from "./components/AppShell";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Discover from "./pages/Discover";
import Friends from "./pages/Friends";
import Settings from "./pages/Settings";

/** Every signed-in screen gets the sidebar frame. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

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

          <Route
            path="/discover"
            element={
              <Shell>
                <Discover />
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
                <ComingSoon
                  title="Messages"
                  note="Real-time chat arrives in Phase 5."
                />
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
          <Route path="*" element={<Navigate to="/me" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
