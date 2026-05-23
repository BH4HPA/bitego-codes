import { api, unwrap } from './client';
import type { ApiList, ApiResponse, TableDTO } from './types';

export async function getTables(params: { status?: string; page?: number; pageSize?: number }) {
  const resp = await api.get<ApiResponse<ApiList<TableDTO>>>('/tables', { params });
  return unwrap(resp.data);
}

export async function createTable(params: { code: string; status?: string }) {
  const resp = await api.post<ApiResponse<{ tableId: string; qrcodeUrl: string | null; h5QrcodeUrl: string | null }>>(
    '/tables',
    params,
  );
  return unwrap(resp.data);
}

export async function updateTable(tableId: string, params: { code?: string; status?: string }) {
  const resp = await api.put<ApiResponse<{ tableId: string }>>(`/tables/${encodeURIComponent(tableId)}`, params);
  return unwrap(resp.data);
}

export async function regenerateTableQrcode(tableId: string, params: { envVersion?: 'release' | 'trial' | 'develop' }) {
  const resp = await api.post<ApiResponse<{ tableId: string; qrcodeUrl: string | null; envVersion: string }>>(
    `/tables/${encodeURIComponent(tableId)}/qrcode`,
    params,
  );
  return unwrap(resp.data);
}

export async function regenerateTableH5Qrcode(tableId: string) {
  const resp = await api.post<ApiResponse<{ tableId: string; h5QrcodeUrl: string | null }>>(
    `/tables/${encodeURIComponent(tableId)}/h5-qrcode`,
    {},
  );
  return unwrap(resp.data);
}

export async function getTable(tableId: string) {
  const resp = await api.get<ApiResponse<TableDTO & { sessionToken?: string }>>(
    `/tables/${encodeURIComponent(tableId)}`,
  );
  return unwrap(resp.data);
}

export async function forceClearTable(tableId: string, params?: { reason?: string }) {
  const resp = await api.post<ApiResponse<{ tableId: string; status: string; sessionVersion: number }>>(
    `/tables/${encodeURIComponent(tableId)}/force-clear`,
    params || {},
  );
  return unwrap(resp.data);
}

export async function clearTable(tableId: string, params?: { reason?: string }) {
  const resp = await api.post<ApiResponse<{ tableId: string; status: string; sessionVersion: number }>>(
    `/tables/${encodeURIComponent(tableId)}/clear`,
    params || {},
  );
  return unwrap(resp.data);
}
