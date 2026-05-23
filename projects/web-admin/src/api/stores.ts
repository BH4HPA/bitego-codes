import { api, unwrap } from './client';
import type { ApiResponse, StoreDTO } from './types';

export async function getCurrentStore() {
  const resp = await api.get<ApiResponse<StoreDTO>>('/stores/current');
  return unwrap(resp.data);
}

export async function getStoreById(storeId: string) {
  const resp = await api.get<ApiResponse<StoreDTO>>('/stores/current', { params: { storeId } });
  return unwrap(resp.data);
}

export async function updateCurrentStore(params: Partial<StoreDTO>) {
  const resp = await api.put<ApiResponse<{ storeId: string }>>('/stores/current', params);
  return unwrap(resp.data);
}

export async function exportStoreConfig(params?: { includeInactive?: boolean }) {
  const includeInactive = Boolean(params?.includeInactive);
  const resp = await api.get<ApiResponse<{ key: string; publicUrl: string; size: number }>>(
    `/stores/export${includeInactive ? '?includeInactive=1' : ''}`,
  );
  return unwrap(resp.data);
}

export async function importStoreConfig(file: File) {
  const form = new FormData();
  form.append('file', file);
  const resp = await api.post<ApiResponse<{ storeId: string; counts: Record<string, number> }>>(
    '/stores/import',
    form,
    {
      headers: { 'content-type': 'multipart/form-data' },
    },
  );
  return unwrap(resp.data);
}

export async function resetStoreConfig() {
  const resp = await api.post<ApiResponse<{ storeId: string; counts: Record<string, number> }>>('/stores/reset');
  return unwrap(resp.data);
}
