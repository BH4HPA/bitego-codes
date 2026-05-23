import { api, unwrap } from './client';
import type { ApiResponse } from './types';

export type MaintenanceState = { enabled: boolean; message: string };

export async function getAdminMaintenance() {
  const r =
    await api.get<ApiResponse<{ platform: MaintenanceState; tenant: MaintenanceState; store: MaintenanceState }>>(
      '/admin/maintenance',
    );
  return unwrap(r.data);
}
