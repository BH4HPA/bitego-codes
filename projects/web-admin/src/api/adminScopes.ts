import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type AdminScopeRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN';

export type AdminScopeDTO = {
  scopeId: string;
  userId?: string;
  tenantId: string;
  storeId?: string | null;
  role: AdminScopeRole;
  tenantType?: 'SINGLE' | 'CHAIN' | null;
  storeIsPrimary?: boolean | null;
  scopeLevel?: 'PLATFORM' | 'TENANT' | 'STORE';
  canManageSharedCatalog?: boolean;
  status: 'ACTIVE';
  createdAt?: string;
  updatedAt?: string;
};

export type AdminEffectiveStore = {
  storeId: string;
  storeName?: string | null;
  storeSubName?: string | null;
  storeIsPrimary: boolean;
  effectiveRole: AdminScopeRole;
  canManageSharedCatalog: boolean;
};

export type AdminEffectiveTenant = {
  tenantId: string;
  tenantName?: string | null;
  tenantType: 'SINGLE' | 'CHAIN' | null;
  effectiveRole: AdminScopeRole;
  canManageSharedCatalog: boolean;
  stores: AdminEffectiveStore[];
};

export type MyAdminScopesResponse = {
  list: AdminScopeDTO[];
  platform: { role: 'SUPER_ADMIN' } | null;
  tenants: AdminEffectiveTenant[];
};

export async function getMyAdminScopes() {
  const r = await api.get<ApiResponse<MyAdminScopesResponse>>('/admin/me/scopes');
  return unwrap(r.data);
}

export async function listAdminScopes(params: { userId: string }) {
  const r = await api.get<ApiResponse<{ list: AdminScopeDTO[] }>>('/admin/scopes', { params });
  return unwrap(r.data);
}

export async function createAdminScope(params: {
  userId: string;
  tenantId: string;
  storeId?: string;
  role: AdminScopeRole;
}) {
  const r = await api.post<ApiResponse<AdminScopeDTO>>('/admin/scopes', params);
  return unwrap(r.data);
}

export async function deleteAdminScope(scopeId: string) {
  const r = await api.delete<ApiResponse<{ scopeId: string }>>(`/admin/scopes/${encodeURIComponent(scopeId)}`);
  return unwrap(r.data);
}
