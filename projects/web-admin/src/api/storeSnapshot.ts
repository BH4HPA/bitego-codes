import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export async function exportStoreSnapshot(params?: { includeInactive?: boolean }) {
  const r = await api.get<ApiResponse<{ key: string; publicUrl: string; size: number }>>('/stores/export', {
    params: params?.includeInactive ? { includeInactive: 1 } : undefined,
  });
  return unwrap(r.data);
}

export async function resetStoreSnapshot() {
  const r = await api.post<ApiResponse<{ storeId: string; counts: unknown }>>('/stores/reset');
  return unwrap(r.data);
}

export async function importStoreSnapshot(file: File) {
  const form = new FormData();
  form.append('file', file);
  const r = await api.post<ApiResponse<{ storeId: string; counts: unknown }>>('/stores/import', form);
  return unwrap(r.data);
}
