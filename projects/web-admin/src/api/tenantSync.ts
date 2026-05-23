import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type TenantSyncStatusDTO = {
  dirty: boolean;
  summary: Record<string, number>;
  recentChanges: Array<{
    id: number;
    entityType: string;
    action: string;
    name: string;
    changedByUserId: string | null;
    changedAt: string | null;
  }>;
  jobSummary: { batchId: string; counts: Record<string, number>; lastSyncedAt: string | null } | null;
};

export async function getTenantSyncSharedCatalogStatus() {
  const r = await api.get<ApiResponse<TenantSyncStatusDTO>>('/tenant/sync-shared-catalog/status');
  return unwrap(r.data);
}

export async function triggerTenantSyncSharedCatalog() {
  const r = await api.post<ApiResponse<{ batchId: string | null; enqueued: number }>>(
    '/tenant/sync-shared-catalog',
    null,
  );
  return unwrap(r.data);
}
