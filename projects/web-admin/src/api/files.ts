import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type UploadFileResp = { key: string; etag: string; size: number; mime: string; publicUrl: string };

export async function uploadImage(params: { file: File; path?: string }) {
  const form = new FormData();
  form.append('file', params.file);
  if (params.path) form.append('path', params.path);
  const resp = await api.post<ApiResponse<UploadFileResp>>('/files', form, {
    headers: { 'content-type': 'multipart/form-data' },
  });
  return unwrap(resp.data);
}
