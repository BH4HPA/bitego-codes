import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type TenantStoreDTO = {
  storeId: string;
  tenantId: string;
  tenantType?: 'SINGLE' | 'CHAIN' | string | null;
  tenantBrandName?: string | null;
  isPrimary: number;
  subName?: string | null;
  name: string;
  displayName?: string | null;
  logoUrl?: string;
  phone?: string;
  address?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function listTenantStores(params: { keyword?: string; page?: number; pageSize?: number }) {
  const r = await api.get<
    ApiResponse<{ list: TenantStoreDTO[]; pagination: { page: number; pageSize: number; total: number } }>
  >('/tenant/stores', { params });
  return unwrap(r.data);
}

export async function getTenantStore(storeId: string) {
  const r = await api.get<ApiResponse<TenantStoreDTO>>(`/tenant/stores/${encodeURIComponent(storeId)}`);
  return unwrap(r.data);
}

export async function createTenantStore(params: {
  storeId?: string;
  name: string;
  subName?: string | null;
  logoUrl?: string;
}) {
  const r = await api.post<ApiResponse<{ storeId: string }>>('/tenant/stores', params);
  return unwrap(r.data);
}

export async function deleteTenantStore(storeId: string) {
  const r = await api.delete<ApiResponse<{ storeId: string }>>(`/tenant/stores/${encodeURIComponent(storeId)}`);
  return unwrap(r.data);
}
