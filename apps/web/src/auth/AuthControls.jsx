import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth as useClerkAuth,
} from "@clerk/react";
import { useEffect, useRef } from "react";
import { useAuth as useAppAuth } from "../api/auth";

/**
 * Clerk UI controls layered on top of the app AuthProvider (Option A).
 * When Clerk signs in, exchanges the Clerk session JWT for a FinDataGraph session.
 */
export default function AuthControls({ showWhenLocal = false }) {
  const { authConfig } = useAppAuth();
  const mode = authConfig?.mode || "local";
  const pk =
    authConfig?.clerk?.publishable_key ||
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    "";

  if (!pk) return null;
  if (mode !== "clerk" && !showWhenLocal) return null;

  return (
    <div className="auth-controls">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className="btn btn-secondary">
            Clerk sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="btn btn-ghost">
            Sign up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <ClerkSessionBridge />
        <UserButton afterSignOutUrl="/login" />
      </Show>
    </div>
  );
}

function ClerkSessionBridge() {
  const { getToken, isSignedIn, signOut } = useClerkAuth();
  const { token, loginWithIdpToken, logout } = useAppAuth();
  const exchanging = useRef(false);

  useEffect(() => {
    if (!isSignedIn || token || exchanging.current) return;
    let cancelled = false;
    exchanging.current = true;
    (async () => {
      try {
        const clerkToken = await getToken();
        if (!clerkToken) throw new Error("Clerk did not return a session token");
        if (!cancelled) await loginWithIdpToken(clerkToken);
      } catch (err) {
        console.error("Clerk → app session exchange failed:", err);
        if (!cancelled) {
          logout();
          try {
            await signOut();
          } catch {
            /* ignore */
          }
        }
      } finally {
        exchanging.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, isSignedIn, loginWithIdpToken, logout, signOut, token]);

  return null;
}
