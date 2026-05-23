import { create } from 'zustand';
import { useAdminContextStore } from './adminContext';

type AuthState = {
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
};

const tokenKey = 'bitego_admin_token';

function safeParseJwtPayload(token: string): { userId?: unknown } | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1] || '';
  const b64 = payload
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(tokenKey),
  setToken: (token) => {
    const prev = get().token;
    const prevPayload = prev ? safeParseJwtPayload(prev) : null;
    const nextPayload = token ? safeParseJwtPayload(token) : null;
    const prevUserId = typeof prevPayload?.userId === 'string' ? prevPayload.userId : null;
    const nextUserId = typeof nextPayload?.userId === 'string' ? nextPayload.userId : null;
    if (token) localStorage.setItem(tokenKey, token);
    else localStorage.removeItem(tokenKey);
    set({ token });
    if (token !== prev && prevUserId && nextUserId && prevUserId !== nextUserId)
      useAdminContextStore.getState().reset();
  },
  logout: () => {
    localStorage.removeItem(tokenKey);
    useAdminContextStore.getState().reset();
    set({ token: null });
  },
}));
