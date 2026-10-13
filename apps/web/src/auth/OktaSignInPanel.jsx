import { useState } from "react";
import { useAuth } from "../api/auth";

export default function OktaSignInPanel({ onError }) {
  const { authConfig } = useAuth();
  const [busy, setBusy] = useState(false);
  const okta = authConfig?.okta;

  async function startOkta() {
    setBusy(true);
    try {
      if (!okta?.issuer || !okta?.client_id) {
        throw new Error(
          "Okta issuer/client_id missing. Set OKTA_ISSUER and OKTA_CLIENT_ID on the API."
        );
      }
      const { default: OktaAuth } = await import("@okta/okta-auth-js");
      const authClient = new OktaAuth({
        issuer: okta.issuer,
        clientId: okta.client_id,
        redirectUri:
          okta.redirect_uri || `${window.location.origin}/login/callback`,
        pkce: true,
        scopes: ["openid", "profile", "email", "groups"],
      });
      await authClient.token.getWithRedirect({
        responseType: "code",
      });
    } catch (err) {
      onError?.(err.message || "Okta redirect failed");
      setBusy(false);
    }
  }

  return (
    <div>
      {!okta?.issuer ? (
        <p className="error">
          Configure <code>OKTA_ISSUER</code> and <code>OKTA_CLIENT_ID</code> for
          Okta SSO.
        </p>
      ) : (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={startOkta}
        >
          {busy ? "Redirecting to Okta…" : "Continue with Okta"}
        </button>
      )}
    </div>
  );
}
