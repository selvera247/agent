import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./client";

const AuthContext = createContext(null);
const STORAGE_KEY = "findatagraph_session";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authConfig, setAuthConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api("/auth/config")
      .then((res) => {
        if (!cancelled) setAuthConfig(res.data);
      })
      .catch(() => {
        if (!cancelled) setAuthConfig({ mode: "local", allow_local: true });
      });

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setBooting(false);
      return () => {
        cancelled = true;
      };
    }
    try {
      const saved = JSON.parse(raw);
      setToken(saved.token);
      setUser(saved.user);
      api("/auth/me", { token: saved.token })
        .then((res) => {
          if (!cancelled) setUser(res.user);
        })
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY);
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
        })
        .finally(() => {
          if (!cancelled) setBooting(false);
        });
    } catch {
      setBooting(false);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(session) {
    setToken(session.token);
    setUser(session.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  async function login(email, password) {
    const res = await api("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    persist(res);
    return res.user;
  }

  /** After Okta/Clerk SDK obtains an access token */
  async function loginWithIdpToken(accessToken) {
    const res = await api("/auth/oidc/session", {
      method: "POST",
      body: { access_token: accessToken },
    });
    persist({ token: res.token, user: res.user });
    return res.user;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        loginWithIdpToken,
        logout,
        booting,
        authConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
