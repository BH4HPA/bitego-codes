import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type TenantBrandingDTO = {
  tenantId: string;
  type: 'SINGLE' | 'CHAIN';
  status: 'ACTIVE' | 'DISABLED';
  brandName: string;
  brandLogoUrl: string | null;
  primaryStoreId: string | null;
  updatedAt?: string;
};

export async function getTenantBranding() {
  const r = await api.get<ApiResponse<TenantBrandingDTO>>('/tenant/branding');
  return unwrap(r.data);
}

export async function updateTenantBranding(params: { brandName?: string; brandLogoUrl?: string | null }) {
  const r = await api.put<ApiResponse<{ tenantId: string; brandName: string; brandLogoUrl: string | null }>>(
    '/tenant/branding',
    params,
  );
  return unwrap(r.data);
}
