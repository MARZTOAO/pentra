import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { FullScreenLoader } from "./ui";

/**
 * Wrap any screen that should only be reachable when logged in.
 * While the session is still loading we show a spinner rather than
 * bouncing the user to /login - otherwise every app start would flash
 * the login screen for a moment.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
