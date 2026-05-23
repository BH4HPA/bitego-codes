import { api, unwrap } from './client';
import type { ApiResponse } from './types';
import type { AdminScopeDTO } from './adminScopes';

export type TenantScopeDTO = AdminScopeDTO & { storeName?: string | null };

export type TenantUserDTO = {
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
  scopes?: TenantScopeDTO[];
};

type Pagination = { page: number; pageSize: number; total: number };

export async function listTenantUsers(params: {
  userType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const r = await api.get<ApiResponse<{ list: TenantUserDTO[]; pagination: Pagination }>>('/tenant/users', { params });
  return unwrap(r.data);
}

export async function getTenantUserDetail(userId: string) {
  const r = await api.get<ApiResponse<{ user: TenantUserDTO; scopes: TenantScopeDTO[] }>>(
    `/tenant/users/${encodeURIComponent(userId)}`,
  );
  return unwrap(r.data);
}

export async function createTenantAdminUser(params: {
  username: string;
  password: string;
  nickname?: string;
  avatarUrl?: string;
  role: 'TENANT_ADMIN' | 'STORE_ADMIN';
  storeId?: string;
}) {
  const r = await api.post<ApiResponse<{ userId: string; scopeId: string }>>('/tenant/admin-users', params);
  return unwrap(r.data);
}
