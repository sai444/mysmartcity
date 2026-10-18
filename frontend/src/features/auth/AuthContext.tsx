import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiGet, apiRequest, refreshSession, setAccessToken } from "../../api/client";
import type { MapStyle, UserProfile } from "../../api/types";

export type RegisterInput = {
  email: string;
  password: string;
  display_name: string;
  ward_id?: string;
};

export type ProfilePatch = {
  display_name?: string;
  ward_id?: string;
  map_style?: MapStyle;
};

type AuthContextValue = {
  user: UserProfile | null;
  ready: boolean;
  login: (email: string, password: string, expectedRole?: UserProfile["role"]) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadProfile() {
  return apiGet<UserProfile>("/api/v1/users/me");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then(async (token) => {
        if (!active || !token) return;
        const profile = await loadProfile();
        if (active) setUser(profile);
      })
      .catch(() => {
        if (active) setAccessToken(null);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, expectedRole?: UserProfile["role"]) => {
    const session = await apiRequest<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setAccessToken(session.access_token);
    try {
      const profile = await loadProfile();
      if (expectedRole && profile.role !== expectedRole) {
        setAccessToken(null);
        await apiRequest<void>("/api/v1/auth/logout", { method: "POST", auth: false }).catch(() => undefined);
        throw new Error(
          expectedRole === "admin"
            ? "This account is not a city admin. Use site sign in."
            : "Use admin sign in for this account.",
        );
      }
      setUser(profile);
    } catch (error) {
      setAccessToken(null);
      throw error;
    }
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const session = await apiRequest<{ access_token: string }>("/api/v1/auth/register", {
      method: "POST",
      body: {
        email: input.email,
        password: input.password,
        display_name: input.display_name,
        ward_id: input.ward_id || undefined,
      },
      auth: false,
    });
    setAccessToken(session.access_token);
    try {
      setUser(await loadProfile());
    } catch (error) {
      setAccessToken(null);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<void>("/api/v1/auth/logout", { method: "POST", auth: false });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    const profile = await apiRequest<UserProfile>("/api/v1/users/me", { method: "PATCH", body: patch });
    setUser(profile);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, updateProfile }),
    [user, ready, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
