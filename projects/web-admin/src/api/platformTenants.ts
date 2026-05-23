import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type PlatformTenantDTO = {
  tenantId: string;
  type: 'SINGLE' | 'CHAIN';
  brandName: string;
  brandLogoUrl?: string | null;
  primaryStoreId?: string | null;
  primaryStoreName?: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt?: string;
  updatedAt?: string;
};

export async function listPlatformTenants(params: {
  type?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const r = await api.get<
    ApiResponse<{ list: PlatformTenantDTO[]; pagination: { page: number; pageSize: number; total: number } }>
  >('/platform/tenants', { params });
  return unwrap(r.data);
}

export async function getPlatformTenant(tenantId: string) {
  const r = await api.get<ApiResponse<PlatformTenantDTO>>(`/platform/tenants/${encodeURIComponent(tenantId)}`);
  return unwrap(r.data);
}

export async function createPlatformTenant(params: {
  tenantId?: string;
  type: 'SINGLE' | 'CHAIN';
  brandName: string;
  brandLogoUrl?: string | null;
  storeId?: string;
  storeName?: string;
}) {
  const r = await api.post<ApiResponse<{ tenantId: string; primaryStoreId: string }>>('/platform/tenants', params);
  return unwrap(r.data);
}

export async function updatePlatformTenant(
  tenantId: string,
  params: { brandName?: string; brandLogoUrl?: string | null; status?: 'ACTIVE' | 'DISABLED' },
) {
  const r = await api.put<ApiResponse<{ tenantId: string }>>(
    `/platform/tenants/${encodeURIComponent(tenantId)}`,
    params,
  );
  return unwrap(r.data);
}

export async function deletePlatformTenant(tenantId: string) {
  const r = await api.delete<ApiResponse<{ tenantId: string }>>(`/platform/tenants/${encodeURIComponent(tenantId)}`);
  return unwrap(r.data);
}
