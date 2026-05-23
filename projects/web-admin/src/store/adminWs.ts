import { create } from 'zustand';
import type { DashboardOverviewDTO } from '../api/types';
import type { TenantSyncStatusDTO } from '../api/tenantSync';

export type AdminMaintenanceDTO = {
  platform: { enabled: boolean; message: string };
  tenant: { enabled: boolean; message: string };
  store: { enabled: boolean; message: string };
};

export type AdminWsNotification = {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  orderId: string | null;
  tableId: string | null;
  tableCode: string | null;
  tenantId: string | null;
  storeId: string | null;
  status: 'UNREAD' | 'READ' | 'HANDLED';
  createdAt?: string;
};

type AdminWsState = {
  supported: boolean;
  connected: boolean;
  lastError: { code: number; message: string } | null;
  maintenance: AdminMaintenanceDTO | null;
  tableConnCounts: Record<string, number>;
  tableConnCountsSeq: number;
  tableStatusSeq: number;
  lastNotification: AdminWsNotification | null;
  notificationSeq: number;
  dashboardOverview: DashboardOverviewDTO | null;
  tenantSyncStatusByStoreId: Record<string, TenantSyncStatusDTO>;
  setSupported: (supported: boolean) => void;
  setConnected: (connected: boolean) => void;
  setLastError: (e: { code: number; message: string } | null) => void;
  setMaintenance: (m: AdminMaintenanceDTO | null) => void;
  setTableConnCounts: (c: Record<string, number>) => void;
  patchTableConnCounts: (patch: Record<string, number>) => void;
  bumpTableStatusSeq: () => void;
  pushNotification: (n: AdminWsNotification) => void;
  setDashboardOverview: (o: DashboardOverviewDTO) => void;
  setTenantSyncStatus: (storeId: string, s: TenantSyncStatusDTO) => void;
  reset: () => void;
};

export const useAdminWsStore = create<AdminWsState>((set) => ({
  supported: typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined',
  connected: false,
  lastError: null,
  maintenance: null,
  tableConnCounts: {},
  tableConnCountsSeq: 0,
  tableStatusSeq: 0,
  lastNotification: null,
  notificationSeq: 0,
  dashboardOverview: null,
  tenantSyncStatusByStoreId: {},
  setSupported: (supported) => set({ supported }),
  setConnected: (connected) => set({ connected }),
  setLastError: (e) => set({ lastError: e }),
  setMaintenance: (m) => set({ maintenance: m }),
  setTableConnCounts: (c) => set((s) => ({ tableConnCounts: c, tableConnCountsSeq: s.tableConnCountsSeq + 1 })),
  patchTableConnCounts: (patch) =>
    set((s) => ({ tableConnCounts: { ...s.tableConnCounts, ...patch }, tableConnCountsSeq: s.tableConnCountsSeq + 1 })),
  bumpTableStatusSeq: () => set((s) => ({ tableStatusSeq: s.tableStatusSeq + 1 })),
  pushNotification: (n) => set((s) => ({ lastNotification: n, notificationSeq: s.notificationSeq + 1 })),
  setDashboardOverview: (o) => set({ dashboardOverview: o }),
  setTenantSyncStatus: (storeId, s0) =>
    set((s) => ({ tenantSyncStatusByStoreId: { ...s.tenantSyncStatusByStoreId, [storeId]: s0 } })),
  reset: () =>
    set({
      connected: false,
      lastError: null,
      maintenance: null,
      tableConnCounts: {},
      tableConnCountsSeq: 0,
      tableStatusSeq: 0,
      lastNotification: null,
      notificationSeq: 0,
      dashboardOverview: null,
      tenantSyncStatusByStoreId: {},
    }),
}));
