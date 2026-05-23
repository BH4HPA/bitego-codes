import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type PlatformStoreDTO = {
  tenantType?: 'SINGLE' | 'CHAIN' | null;
  tenantBrandName?: string;
  storeType?: 'SINGLE_STORE' | 'CHAIN_PRIMARY' | 'CHAIN_BRANCH' | null;
  storeId: string;
  tenantId: string | null;
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

export async function listPlatformStores(params: {
  tenantId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const r = await api.get<
    ApiResponse<{ list: PlatformStoreDTO[]; pagination: { page: number; pageSize: number; total: number } }>
  >('/platform/stores', { params });
  return unwrap(r.data);
}

export async function getPlatformStore(storeId: string) {
  const r = await api.get<ApiResponse<PlatformStoreDTO>>(`/platform/stores/${encodeURIComponent(storeId)}`);
  return unwrap(r.data);
}

export async function createPlatformStore(params: {
  tenantId: string;
  storeId?: string;
  name: string;
  subName?: string | null;
  isPrimary?: number;
}) {
  const r = await api.post<ApiResponse<{ storeId: string }>>('/platform/stores', params);
  return unwrap(r.data);
}

export async function updatePlatformStore(
  storeId: string,
  params: {
    name?: string;
    subName?: string | null;
    isPrimary?: number;
    logoUrl?: string;
    phone?: string;
    address?: string;
    description?: string;
  },
) {
  const r = await api.put<ApiResponse<{ storeId: string }>>(`/platform/stores/${encodeURIComponent(storeId)}`, params);
  return unwrap(r.data);
}

export async function deletePlatformStore(storeId: string) {
  const r = await api.delete<ApiResponse<{ storeId: string }>>(`/platform/stores/${encodeURIComponent(storeId)}`);
  return unwrap(r.data);
}
