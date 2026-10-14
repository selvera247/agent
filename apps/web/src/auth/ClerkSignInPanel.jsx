import { Show, SignIn, useAuth as useClerkAuth } from "@clerk/react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth as useAppAuth } from "../api/auth";

/**
 * Clerk sign-in panel for the login page (Option A).
 * Relies on the root ClerkProvider in main.jsx — does not nest another provider.
 * Exchanges the Clerk session JWT via loginWithIdpToken → /auth/oidc/session.
 */
export default function ClerkSignInPanel({ onError }) {
  const { authConfig, loginWithIdpToken } = useAppAuth();
  const navigate = useNavigate();

  const pk =
    authConfig?.clerk?.publishable_key ||
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    "";

  if (!pk) {
    return (
      <p className="error">
        Set <code>CLERK_PUBLISHABLE_KEY</code> /{" "}
        <code>VITE_CLERK_PUBLISHABLE_KEY</code> (and matching JWKS issuer on the
        API) to enable Clerk.
      </p>
    );
  }

  function AfterSignIn() {
    const { getToken, isSignedIn } = useClerkAuth();
    useEffect(() => {
      if (!isSignedIn) return;
      let cancelled = false;
      (async () => {
        try {
          const token = await getToken();
          if (!token) throw new Error("Clerk did not return a session token");
          if (cancelled) return;
          await loginWithIdpToken(token);
          navigate("/studio", { replace: true });
        } catch (err) {
          onError?.(err.message || "Clerk session failed");
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [getToken, isSignedIn]);
    return <p className="hint">Establishing FinDataGraph session…</p>;
  }

  return (
    <>
      <Show when="signed-out">
        <SignIn routing="hash" />
      </Show>
      <Show when="signed-in">
        <AfterSignIn />
      </Show>
    </>
  );
}
