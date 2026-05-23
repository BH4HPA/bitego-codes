import { api, unwrap } from './client';
import type { ApiResponse } from './types';
import type { AdminScopeDTO } from './adminScopes';

export type StoreScopeDTO = AdminScopeDTO & { storeName?: string | null };

export type StoreUserDTO = {
  userId: string;
  userType: string;
  username?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  wechatOpenid?: string | null;
  wechatUnionid?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  lastOrderAt?: string | null;
  scopes?: StoreScopeDTO[];
};

type Pagination = { page: number; pageSize: number; total: number };

export async function listStoreUsers(params: {
  userType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const r = await api.get<ApiResponse<{ list: StoreUserDTO[]; pagination: Pagination }>>('/store/users', { params });
  return unwrap(r.data);
}

export async function getStoreUserDetail(userId: string) {
  const r = await api.get<ApiResponse<{ user: StoreUserDTO; scopes: StoreScopeDTO[] }>>(
    `/store/users/${encodeURIComponent(userId)}`,
  );
  return unwrap(r.data);
}

export async function createStoreAdmin(params: {
  username: string;
  password: string;
  nickname?: string;
  avatarUrl?: string;
}) {
  const r = await api.post<ApiResponse<{ userId: string; scopeId: string }>>('/store/admin-users', params);
  return unwrap(r.data);
}
