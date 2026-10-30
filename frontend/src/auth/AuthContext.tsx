// Keeps the logged-in user available to every page.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, clearToken, getToken, saveToken } from "../api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On page load: if we have a saved token, ask the API who we are.
  useEffect(() => {
    async function loadUser() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<User>("/auth/me");
        setUser(me);
      } catch {
        clearToken();
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  async function login(email: string, password: string) {
    const result = await api<{ token: string; user: User }>("/auth/login", "POST", {
      email: email,
      password: password,
    });
    saveToken(result.token);
    setUser(result.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
