import { api, unwrap } from './client';
import type { ApiList, ApiResponse, GoodDetailDTO, GoodListItemDTO, GoodOptionGroupDTO } from './types';

export async function getGoods(params: {
  status?: string;
  categoryId?: string;
  name?: string;
  page?: number;
  pageSize?: number;
}) {
  const resp = await api.get<ApiResponse<ApiList<GoodListItemDTO>>>('/goods', { params });
  return unwrap(resp.data);
}

export async function getGood(goodId: string) {
  const resp = await api.get<ApiResponse<GoodDetailDTO>>(`/goods/${encodeURIComponent(goodId)}`);
  return unwrap(resp.data);
}

export async function createGood(params: {
  categoryId: string;
  categoryIds?: string[];
  name: string;
  description?: string;
  detailMarkdown?: string;
  imageUrls?: string[];
  status?: string;
  basePriceCents?: number;
  optionGroups?: GoodOptionGroupDTO[];
}) {
  const resp = await api.post<
    ApiResponse<{
      goodId: string;
      skuRebuild?: {
        skuRebuilt: boolean;
        skuDeletedCount: number;
        skuCreatedCount: number;
        skuPriceUpdatedCount: number;
      } | null;
    }>
  >('/goods', params);
  return unwrap(resp.data);
}

export async function updateGood(
  goodId: string,
  params: {
    categoryId?: string;
    categoryIds?: string[];
    name?: string;
    description?: string;
    detailMarkdown?: string;
    imageUrls?: string[];
    status?: string;
    basePriceCents?: number;
    defaultSkuId?: string;
    optionGroups?: GoodOptionGroupDTO[];
  },
) {
  const resp = await api.put<
    ApiResponse<{
      goodId: string;
      skuRebuild?: {
        skuRebuilt: boolean;
        skuDeletedCount: number;
        skuCreatedCount: number;
        skuPriceUpdatedCount: number;
      } | null;
    }>
  >(`/goods/${encodeURIComponent(goodId)}`, params);
  return unwrap(resp.data);
}

export async function deleteGood(goodId: string) {
  const resp = await api.delete<ApiResponse<{ goodId: string }>>(`/goods/${encodeURIComponent(goodId)}`);
  return unwrap(resp.data);
}
