import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./client";

const AuthContext = createContext(null);
const STORAGE_KEY = "findatagraph_session";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setBooting(false);
      return;
    }
    try {
      const saved = JSON.parse(raw);
      setToken(saved.token);
      setUser(saved.user);
      api("/auth/me", { token: saved.token })
        .then((res) => setUser(res.user))
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUser(null);
        })
        .finally(() => setBooting(false));
    } catch {
      setBooting(false);
    }
  }, []);

  async function login(email, password) {
    const res = await api("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(res.token);
    setUser(res.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    return res.user;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, booting }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
