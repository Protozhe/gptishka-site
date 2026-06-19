import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, setAccessToken } from "../lib/api";

type User = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "SUPPORT";
  firstName?: string;
  lastName?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const Context = createContext<AuthCtx | null>(null);
const AUTO_LOGOUT_MINUTES = Number(import.meta.env.VITE_AUTO_LOGOUT_MINUTES || 30);
const AUTO_LOGOUT_MS = Number.isFinite(AUTO_LOGOUT_MINUTES) && AUTO_LOGOUT_MINUTES > 0
  ? AUTO_LOGOUT_MINUTES * 60 * 1000
  : 0;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimerRef = useRef<number | null>(null);
  const restorePromiseRef = useRef<Promise<void> | null>(null);
  const authVersionRef = useRef(0);

  const restoreSession = useCallback(async () => {
    if (restorePromiseRef.current) return restorePromiseRef.current;

    const restoreVersion = authVersionRef.current;
    const restorePromise = (async () => {
      try {
        const refreshRes = await api.post("/auth/refresh");
        if (authVersionRef.current !== restoreVersion) return;
        setAccessToken(refreshRes.data.accessToken);
        const { data } = await api.get("/auth/me");
        if (authVersionRef.current !== restoreVersion) return;
        setUser(data);
      } catch {
        if (authVersionRef.current !== restoreVersion) return;
        setAccessToken(null);
        setUser(null);
      } finally {
        if (authVersionRef.current === restoreVersion) {
          setLoading(false);
        }
        restorePromiseRef.current = null;
      }
    })();

    restorePromiseRef.current = restorePromise;
    return restorePromise;
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (email: string, password: string) => {
    authVersionRef.current += 1;
    const { data } = await api.post("/auth/login", { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    authVersionRef.current += 1;
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || AUTO_LOGOUT_MS <= 0) return undefined;

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const armIdleTimer = () => {
      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(() => {
        logout().catch(() => {
          setAccessToken(null);
          setUser(null);
        });
      }, AUTO_LOGOUT_MS);
    };

    const onActivity = () => {
      armIdleTimer();
    };

    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    armIdleTimer();

    return () => {
      clearIdleTimer();
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    };
  }, [user, logout]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshMe,
    }),
    [user, loading, login, logout, refreshMe]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Auth context is missing");
  return ctx;
}
