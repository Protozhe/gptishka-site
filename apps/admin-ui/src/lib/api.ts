import axios from "axios";

const API_URL = import.meta.env.VITE_ADMIN_API_URL || "/api/admin";

// Access credentials stay in memory; an HttpOnly cookie restores the session.
let accessToken: string | null = null;
let refreshRequest: Promise<string> | null = null;
try { window.localStorage.removeItem(["admin", "access", "token"].join("_")); } catch {}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use(async (config) => {
  if (config.url === "/auth/logout" && refreshRequest) {
    try { await refreshRequest; } catch {}
  }
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (original && error.response?.status === 401 && !original._retry &&
        !/^\/auth\/(?:login|logout|refresh|register-admin)$/.test(String(original.url))) {
      original._retry = true;
      try {
        if (!refreshRequest) {
          const rotate = () => api.post("/auth/refresh").then(({ data }) => {
            setAccessToken(data.accessToken);
            return data.accessToken as string;
          });
          // Cookies are shared between tabs. Web Locks serialize rotation across
          // them; the database compare-and-swap remains the fallback guard.
          refreshRequest = (async () => globalThis.navigator?.locks
            ? await navigator.locks.request("gptishka-admin-refresh", rotate)
            : await rotate())().finally(() => { refreshRequest = null; });
        }
        const token = await refreshRequest;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        setAccessToken(null);
      }
    }
    throw error;
  }
);
