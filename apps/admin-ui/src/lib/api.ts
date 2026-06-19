import axios from "axios";

const API_URL = import.meta.env.VITE_ADMIN_API_URL || "/api/admin";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
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
