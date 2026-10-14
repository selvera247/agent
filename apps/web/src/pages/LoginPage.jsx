import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";
import ClerkSignInPanel from "../auth/ClerkSignInPanel";
import OktaSignInPanel from "../auth/OktaSignInPanel";

export default function LoginPage() {
  const { login, token, authConfig } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("controller@findatagraph.demo");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const mode = authConfig?.mode || "local";
  const allowLocal = authConfig?.allow_local !== false;

  const title = useMemo(() => {
    if (mode === "clerk") return "Sign in with Clerk";
    if (mode === "okta") return "Sign in with Okta";
    return "FinDataGraph";
  }, [mode]);

  if (token) return <Navigate to="/studio" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      navigate("/studio");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>{title}</h1>
        <p className="sub">
          Preferred IdPs: <strong>Okta</strong> or <strong>Clerk</strong>. Mode:{" "}
          <code>{mode}</code>
          {allowLocal ? " · local demo login enabled" : ""}.
        </p>
        {error ? <p className="error">{error}</p> : null}

        {mode === "clerk" ? (
          <ClerkSignInPanel onError={setError} />
        ) : null}

        {mode === "okta" ? <OktaSignInPanel onError={setError} /> : null}

        {allowLocal ? (
          <form
            onSubmit={onSubmit}
            style={{ marginTop: mode === "local" ? 0 : "1.25rem" }}
            data-testid="login-form"
          >
            {mode !== "local" ? (
              <p className="hint" style={{ marginBottom: "0.75rem" }}>
                Jumpstart demo users (local fallback)
              </p>
            ) : null}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                data-testid="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                data-testid="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              className="btn"
              type="submit"
              data-testid="login-submit"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <p className="hint">
              Demo users (password <code>password123</code>):
              <br />
              controller@findatagraph.demo · accountant@findatagraph.demo ·
              admin@findatagraph.demo
            </p>
          </form>
        ) : null}

        {!allowLocal && mode === "local" ? (
          <p className="error">Local login disabled and no IdP configured.</p>
        ) : null}
      </div>
    </div>
  );
}

/** Okta redirect landing — completes PKCE and establishes session */
export function LoginCallbackPage() {
  const { loginWithIdpToken, token } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) {
      navigate("/studio", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { default: OktaAuth } = await import("@okta/okta-auth-js");
        const cfg = await fetch("/api/v1/auth/config").then((r) => r.json());
        const okta = cfg.data?.okta;
        if (!okta?.issuer || !okta?.client_id) {
          throw new Error("Okta is not configured on the API");
        }
        const authClient = new OktaAuth({
          issuer: okta.issuer,
          clientId: okta.client_id,
          redirectUri: okta.redirect_uri || `${window.location.origin}/login/callback`,
          pkce: true,
          scopes: ["openid", "profile", "email", "groups"],
        });
        const result = await authClient.token.parseFromUrl();
        authClient.tokenManager.setTokens(result.tokens);
        const accessToken = result.tokens.accessToken?.accessToken;
        if (!accessToken) throw new Error("No Okta access token");
        if (!cancelled) {
          await loginWithIdpToken(accessToken);
          navigate("/studio", { replace: true });
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Okta callback failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loginWithIdpToken, navigate, token]);

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Completing Okta sign-in…</h1>
        {error ? <p className="error">{error}</p> : <p className="sub">Please wait.</p>}
      </div>
    </div>
  );
}
