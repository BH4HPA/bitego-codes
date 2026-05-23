import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type PlatformBrandingDTO = { platformName: string; platformLogoUrl: string | null };

export async function getPlatformBranding() {
  const r = await api.get<ApiResponse<PlatformBrandingDTO>>('/platform/branding');
  return unwrap(r.data);
}

export async function updatePlatformBranding(params: { platformName?: string; platformLogoUrl?: string | null }) {
  const r = await api.put<ApiResponse<PlatformBrandingDTO>>('/platform/branding', params);
  return unwrap(r.data);
}
