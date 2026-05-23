import { api, unwrap } from './client';
import type { ApiResponse } from './types';
import type { AdminScopeDTO } from './adminScopes';

export type PlatformScopeDetailDTO = AdminScopeDTO & {
  tenantName?: string | null;
  storeName?: string | null;
};

export type PlatformUserDTO = {
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
};

export async function listPlatformUsers(params: {
  userType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const r = await api.get<
    ApiResponse<{ list: PlatformUserDTO[]; pagination: { page: number; pageSize: number; total: number } }>
  >('/platform/users', { params });
  return unwrap(r.data);
}

export async function getPlatformUserDetail(userId: string) {
  const r = await api.get<ApiResponse<{ user: PlatformUserDTO; scopes: PlatformScopeDetailDTO[] }>>(
    `/platform/users/${encodeURIComponent(userId)}`,
  );
  return unwrap(r.data);
}

export async function createPlatformAdminUser(params: {
  username: string;
  password: string;
  nickname?: string;
  avatarUrl?: string;
  scopes?: Array<{ tenantId: string; storeId?: string; role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN' }>;
}) {
  const r = await api.post<ApiResponse<{ userId: string; scopeIds: string[] }>>('/platform/users', params);
  return unwrap(r.data);
}

export async function deletePlatformUser(userId: string) {
  const r = await api.delete<ApiResponse<{ userId: string }>>(`/platform/users/${encodeURIComponent(userId)}`);
  return unwrap(r.data);
}
