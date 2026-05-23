import { api, unwrap } from './client';
import type { ApiResponse } from './types';

type Pagination = { page: number; pageSize: number; total: number };

export type StoreOverviewDTO = {
  storeId: string;
  tenantId: string;
  tenantType?: 'SINGLE' | 'CHAIN' | string | null;
  storeType?: 'SINGLE_STORE' | 'CHAIN_PRIMARY' | 'CHAIN_BRANCH' | string | null;
  isPrimary: number;
  subName?: string | null;
  name: string;
  logoUrl?: string | null;
  tenantBrandName?: string;
  tenantBrandLogoUrl?: string | null;
  totalTableCount: number;
  occupiedTableCount: number;
  onlineUserCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function getPlatformOverviewStores(params: {
  tenantId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const r = await api.get<ApiResponse<{ list: StoreOverviewDTO[]; pagination: Pagination }>>(
    '/platform/overview/stores',
    { params },
  );
  return unwrap(r.data);
}

export async function getTenantOverviewStores(params: { keyword?: string; page?: number; pageSize?: number }) {
  const r = await api.get<ApiResponse<{ list: StoreOverviewDTO[]; pagination: Pagination }>>(
    '/tenant/overview/stores',
    { params },
  );
  return unwrap(r.data);
}
