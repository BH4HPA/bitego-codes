import { api, unwrap } from './client';
import type { ApiResponse, LoginResp, UserMe } from './types';

export async function login(params: { username: string; password: string }) {
  const resp = await api.post<ApiResponse<LoginResp>>('/auth/login', params);
  return unwrap(resp.data);
}

export async function devToken(params: { role?: 'ADMIN' | 'CUSTOMER' }) {
  const resp = await api.post<ApiResponse<LoginResp>>('/auth/dev-token', params);
  return unwrap(resp.data);
}

export async function getMe() {
  const resp = await api.get<ApiResponse<UserMe>>('/users/me');
  return unwrap(resp.data);
}
