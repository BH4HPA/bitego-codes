import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export async function exportPlatformSnapshot() {
  const r = await api.get<ApiResponse<{ key: string; url: string; bytes: number }>>('/platform/snapshot/export');
  return unwrap(r.data);
}

export async function resetPlatformSnapshot() {
  const r = await api.post<ApiResponse<{ resetAt: string }>>('/platform/snapshot/reset');
  return unwrap(r.data);
}

export async function importPlatformSnapshot(file: File) {
  const form = new FormData();
  form.append('file', file);
  const r = await api.post<ApiResponse<{ restoredAt: string }>>('/platform/snapshot/import', form);
  return unwrap(r.data);
}
