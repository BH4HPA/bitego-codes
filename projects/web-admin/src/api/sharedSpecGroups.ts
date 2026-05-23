import { api, unwrap } from './client';
import type { ApiResponse } from './types';
import type { SharedSpecGroupDTO, SharedSpecGroupDetailDTO } from './types';

export async function getSharedSpecGroups() {
  const resp = await api.get<ApiResponse<{ list: SharedSpecGroupDTO[] }>>('/shared-spec-groups');
  return unwrap(resp.data);
}

export async function getSharedSpecGroup(sharedSpecGroupId: string) {
  const resp = await api.get<ApiResponse<SharedSpecGroupDetailDTO>>(
    `/shared-spec-groups/${encodeURIComponent(sharedSpecGroupId)}`,
  );
  return unwrap(resp.data);
}

export async function createSharedSpecGroup(params: {
  name: string;
  description?: string | null;
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  sort?: number;
  defaultOptionIds?: string[];
  options: Array<{ id?: string; name: string; priceCents: number }>;
}) {
  const resp = await api.post<ApiResponse<{ sharedSpecGroupId: string }>>('/shared-spec-groups', params);
  return unwrap(resp.data);
}

export async function updateSharedSpecGroup(
  sharedSpecGroupId: string,
  params: {
    name: string;
    description?: string | null;
    isRequired: boolean;
    minSelection: number;
    maxSelection: number;
    sort?: number;
    defaultOptionIds?: string[];
    options: Array<{ id?: string; optionId?: string; name: string; priceCents: number }>;
  },
) {
  const resp = await api.put<ApiResponse<{ sharedSpecGroupId: string }>>(
    `/shared-spec-groups/${encodeURIComponent(sharedSpecGroupId)}`,
    params,
  );
  return unwrap(resp.data);
}

export async function deleteSharedSpecGroup(sharedSpecGroupId: string) {
  const resp = await api.delete<ApiResponse<{ sharedSpecGroupId: string }>>(
    `/shared-spec-groups/${encodeURIComponent(sharedSpecGroupId)}`,
  );
  return unwrap(resp.data);
}
