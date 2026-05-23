import { api, unwrap } from './client';
import type { ApiResponse, DashboardOverviewDTO } from './types';

export async function getDashboardOverview() {
  const resp = await api.get<ApiResponse<DashboardOverviewDTO>>('/dashboard/overview');
  return unwrap(resp.data);
}
