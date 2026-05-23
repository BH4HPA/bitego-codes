import { api, unwrap } from './client';
import type { ApiList, ApiResponse, SKUDTO } from './types';

export async function getSkus(params: { goodId?: string }) {
  const resp = await api.get<ApiResponse<ApiList<SKUDTO>>>('/skus', { params });
  return unwrap(resp.data);
}

export async function createSku(params: {
  goodId: string;
  specCombination?: string;
  priceCents: number;
  stock?: number;
  status?: string;
}) {
  const resp = await api.post<ApiResponse<{ skuId: string }>>('/skus', params);
  return unwrap(resp.data);
}

export async function updateSku(
  skuId: string,
  params: { specCombination?: string; priceCents?: number; stock?: number; status?: string },
) {
  const resp = await api.put<ApiResponse<{ skuId: string }>>(`/skus/${encodeURIComponent(skuId)}`, params);
  return unwrap(resp.data);
}

export async function bulkUpdateSkus(params: {
  skuIds: string[];
  status?: string;
  stock?: number;
  stockDelta?: number;
}) {
  const resp = await api.put<ApiResponse<{ affected: number; skuIdsCount: number }>>('/skus/bulk', params);
  return unwrap(resp.data);
}

export async function deleteSku(skuId: string) {
  const resp = await api.delete<ApiResponse<{ skuId: string }>>(`/skus/${encodeURIComponent(skuId)}`);
  return unwrap(resp.data);
}
