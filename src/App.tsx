import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell, ComingSoon } from "./components/AppShell";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";

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
                <ComingSoon
                  title="Find players"
                  note="Arrives in Phase 3, once everyone has a Top 5 to match on."
                />
              </Shell>
            }
          />

          <Route
            path="/friends"
            element={
              <Shell>
                <ComingSoon
                  title="Friends"
                  note="Friend requests and your friends list arrive in Phase 4."
                />
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
                <ComingSoon
                  title="Settings"
                  note="Privacy controls and blocking arrive in Phase 6."
                />
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
