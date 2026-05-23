import { api, unwrap } from './client';
import type { ApiList, ApiResponse, CategoryDTO } from './types';

export async function getCategories(params: { status?: string; page?: number; pageSize?: number }) {
  const resp = await api.get<ApiResponse<ApiList<CategoryDTO>>>('/categories', { params });
  return unwrap(resp.data);
}

export async function createCategory(params: {
  name: string;
  subtitle?: string;
  badgeText?: string;
  sort?: number;
  status?: string;
}) {
  const resp = await api.post<ApiResponse<{ categoryId: string }>>('/categories', params);
  return unwrap(resp.data);
}

export async function updateCategory(
  categoryId: string,
  params: { name?: string; subtitle?: string; badgeText?: string; sort?: number; status?: string },
) {
  const resp = await api.put<ApiResponse<{ categoryId: string }>>(
    `/categories/${encodeURIComponent(categoryId)}`,
    params,
  );
  return unwrap(resp.data);
}

export async function deleteCategory(categoryId: string) {
  const resp = await api.delete<ApiResponse<{ categoryId: string }>>(`/categories/${encodeURIComponent(categoryId)}`);
  return unwrap(resp.data);
}

export async function reorderCategoryGoods(categoryId: string, params: { goodIds: string[] }) {
  const resp = await api.put<ApiResponse<{ categoryId: string; goodIdsCount: number }>>(
    `/categories/${encodeURIComponent(categoryId)}/goods/reorder`,
    params,
  );
  return unwrap(resp.data);
}
