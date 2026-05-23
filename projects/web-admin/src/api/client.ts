import axios from 'axios';
import type { ApiResponse } from './types';
import { useAuthStore } from '../store/auth';
import { useAdminContextStore } from '../store/adminContext';

export class ApiRequestError extends Error {
  code: number;
  httpStatus: number;

  constructor(params: { message: string; code: number; httpStatus: number }) {
    super(params.message);
    this.code = params.code;
    this.httpStatus = params.httpStatus;
  }
}

function getBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env && typeof env === 'string' && env.trim()) return env.trim().replace(/\/+$/, '');
  return '/api/v1';
}

export const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 0,
});

function normalizeUrl(url: string | undefined) {
  return String(url || '').replace(/^https?:\/\/[^/]+/i, '');
}

function shouldBypassAdminContext(url: string) {
  return (
    url.startsWith('/auth/admin/login') ||
    url.startsWith('/users/me') ||
    url.startsWith('/admin/me/scopes') ||
    url.startsWith('/platform/branding')
  );
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.authorization = `Bearer ${token}`;
  if (token) {
    const ctx = useAdminContextStore.getState();
    const headers = config.headers as Record<string, string>;
    if (ctx.tenantId) headers['x-tenant-id'] = ctx.tenantId;
    if (ctx.storeId) headers['x-store-id'] = ctx.storeId;
    if (ctx.board) headers['x-board'] = ctx.board;
    const url = normalizeUrl(config.url);
    if (!shouldBypassAdminContext(url)) {
      if (ctx.board === 'tenant' && !ctx.tenantId) {
        throw new ApiRequestError({ message: 'AdminContext tenantId 缺失', code: 40000, httpStatus: 400 });
      }
      if (ctx.board === 'store' && (!ctx.tenantId || !ctx.storeId)) {
        throw new ApiRequestError({ message: 'AdminContext storeId 缺失', code: 40000, httpStatus: 400 });
      }
    }
  }
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (err: unknown) => {
    if (axios.isAxiosError(err)) {
      const httpStatus = err.response?.status || 0;
      if (httpStatus === 401) {
        useAuthStore.getState().logout();
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    }
    return Promise.reject(err);
  },
);

export function unwrap<T>(resp: ApiResponse<T>): T {
  if (!resp.success)
    throw new ApiRequestError({ message: resp.message || 'Request failed', code: resp.code, httpStatus: 200 });
  return resp.data;
}
