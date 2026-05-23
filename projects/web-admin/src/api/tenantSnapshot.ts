import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export async function exportTenantSnapshot(params?: { includeInactive?: boolean }) {
  const r = await api.get<ApiResponse<{ key: string; publicUrl: string; size: number }>>('/tenant/snapshot/export', {
    params: params?.includeInactive ? { includeInactive: 1 } : undefined,
  });
  return unwrap(r.data);
}

export async function resetTenantSnapshot() {
  const r =
    await api.post<ApiResponse<{ tenantId: string; stores: Array<{ storeId: string; counts: unknown }> }>>(
      '/tenant/snapshot/reset',
    );
  return unwrap(r.data);
}

export async function importTenantSnapshot(file: File) {
  const form = new FormData();
  form.append('file', file);
  const r = await api.post<ApiResponse<{ tenantId: string; stores: Array<{ storeId: string; counts: unknown }> }>>(
    '/tenant/snapshot/import',
    form,
  );
  return unwrap(r.data);
}

export async function importTenantSnapshotFromStore(file: File) {
  const form = new FormData();
  form.append('file', file);
  const r = await api.post<ApiResponse<{ tenantId: string; newPrimaryStoreId: string; counts: unknown }>>(
    '/tenant/snapshot/import-from-store',
    form,
  );
  return unwrap(r.data);
}
