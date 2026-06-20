import axios from "axios";

const API_URL = import.meta.env.VITE_ADMIN_API_URL || "/api/admin";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

let accessToken: string | null = safeGet("admin_access_token");

export function setAccessToken(token: string | null) {
  accessToken = token;
  safeSet("admin_access_token", token);
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !String(original.url).includes("/auth/")) {
      original._retry = true;
      try {
        const refreshRes = await api.post("/auth/refresh");
        setAccessToken(refreshRes.data.accessToken);
        original.headers.Authorization = `Bearer ${refreshRes.data.accessToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
      }
    }
    throw error;
  }
);
