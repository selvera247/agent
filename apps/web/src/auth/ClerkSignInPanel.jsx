import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth as useAppAuth } from "../api/auth";

/**
 * Loads Clerk only when AUTH_MODE=clerk and publishable key is present.
 * Uses dynamic import so local/Okta builds don't require Clerk at runtime.
 */
export default function ClerkSignInPanel({ onError }) {
  const { authConfig, loginWithIdpToken } = useAppAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [ClerkUI, setClerkUI] = useState(null);

  const pk =
    authConfig?.clerk?.publishable_key ||
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    "";

  useEffect(() => {
    if (!pk) {
      onError?.(
        "Clerk publishable key missing (CLERK_PUBLISHABLE_KEY / VITE_CLERK_PUBLISHABLE_KEY)"
      );
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@clerk/react");
        if (cancelled) return;
        setClerkUI(mod);
        setReady(true);
      } catch (err) {
        onError?.(err.message || "Failed to load Clerk");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pk, onError]);

  if (!pk) {
    return (
      <p className="error">
        Set <code>CLERK_PUBLISHABLE_KEY</code> (and matching JWKS issuer on the
        API) to enable Clerk.
      </p>
    );
  }

  if (!ready || !ClerkUI) {
    return <p className="hint">Loading Clerk…</p>;
  }

  const { ClerkProvider, SignedIn, SignedOut, SignIn, useAuth } = ClerkUI;

  function AfterSignIn() {
    const { getToken, isSignedIn } = useAuth();
    useEffect(() => {
      if (!isSignedIn) return;
      (async () => {
        try {
          const token = await getToken();
          if (!token) throw new Error("Clerk did not return a session token");
          await loginWithIdpToken(token);
          navigate("/studio", { replace: true });
        } catch (err) {
          onError?.(err.message || "Clerk session failed");
        }
      })();
    }, [getToken, isSignedIn]);
    return <p className="hint">Establishing FinDataGraph session…</p>;
  }

  return (
    <ClerkProvider publishableKey={pk}>
      <SignedOut>
        <SignIn routing="hash" />
      </SignedOut>
      <SignedIn>
        <AfterSignIn />
      </SignedIn>
    </ClerkProvider>
  );
}
