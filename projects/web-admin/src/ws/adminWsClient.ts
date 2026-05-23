import { queryClient } from '../app/queryClient';
import type { DashboardOverviewDTO } from '../api/types';
import type { TenantSyncStatusDTO } from '../api/tenantSync';
import type { AdminMaintenanceDTO, AdminWsNotification } from '../store/adminWs';
import { useAdminWsStore } from '../store/adminWs';
import { getAdminDashboardWsUrl, startWsHeartbeat } from '../utils/ws';

type Counts = Record<string, number>;

type Msg =
  | { type: 'PONG'; ts?: number }
  | { type: 'TABLE_CONN_COUNTS_SNAPSHOT'; data: Counts }
  | { type: 'TABLE_CONN_COUNTS'; data: Counts }
  | { type: 'TABLE_STATUS_CHANGED'; data: unknown }
  | { type: 'NOTIFICATION'; data: unknown }
  | { type: 'MAINTENANCE_SNAPSHOT'; data: unknown }
  | { type: 'MAINTENANCE_CHANGED'; data: unknown }
  | { type: 'DASHBOARD_OVERVIEW_SNAPSHOT'; data: unknown }
  | { type: 'TENANT_SYNC_STATUS_SNAPSHOT'; data: unknown }
  | { type: 'SUBSCRIBE_RESULT'; data: unknown }
  | { type: 'ERROR'; data: { code: number; message: string } };

function getApiBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env && typeof env === 'string' && env.trim()) return env.trim();
  return `${window.location.origin}/api/v1`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object';
}

function isMaintenanceDTO(v: unknown): v is AdminMaintenanceDTO {
  if (!isRecord(v)) return false;
  const platform = v.platform;
  const tenant = v.tenant;
  const store = v.store;
  const ok = (x: unknown) => isRecord(x) && typeof x.enabled === 'boolean' && typeof x.message === 'string';
  return ok(platform) && ok(tenant) && ok(store);
}

function isNotification(v: unknown): v is AdminWsNotification {
  if (!isRecord(v)) return false;
  if (typeof v.notificationId !== 'string' || !v.notificationId) return false;
  if (typeof v.type !== 'string') return false;
  if (typeof v.title !== 'string') return false;
  if (typeof v.message !== 'string') return false;
  return true;
}

function isDashboardOverview(v: unknown): v is DashboardOverviewDTO {
  if (!isRecord(v)) return false;
  return Array.isArray(v.tables) && Array.isArray(v.activeOrders);
}

function isTenantSyncStatus(v: unknown): v is TenantSyncStatusDTO {
  if (!isRecord(v)) return false;
  return typeof v.dirty === 'boolean' && isRecord(v.summary) && Array.isArray(v.recentChanges);
}

function isTenantSyncStatusSnapshot(
  v: unknown,
): v is { tenantId: string; storeId: string; status: TenantSyncStatusDTO } {
  if (!isRecord(v)) return false;
  if (typeof v.tenantId !== 'string' || !v.tenantId) return false;
  if (typeof v.storeId !== 'string' || !v.storeId) return false;
  return isTenantSyncStatus(v.status);
}

let activeWs: WebSocket | null = null;

export function sendAdminWsMessage(payload: unknown) {
  const ws = activeWs;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    void 0;
  }
}

export function startAdminWsClient(params: {
  token: string;
  board: 'platform' | 'tenant' | 'store';
  tenantId: string | null;
  storeId: string | null;
}) {
  if (import.meta.env.MODE === 'test') {
    useAdminWsStore.getState().setSupported(false);
    useAdminWsStore.getState().reset();
    return () => void 0;
  }
  const supported = typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined';
  useAdminWsStore.getState().setSupported(supported);
  if (!supported) {
    useAdminWsStore.getState().reset();
    return () => void 0;
  }

  const wsUrl = getAdminDashboardWsUrl({
    apiBaseUrl: getApiBaseUrl(),
    token: params.token,
    board: params.board,
    tenantId: params.tenantId,
    storeId: params.storeId,
  });

  let stopped = false;
  let ws: WebSocket | null = null;
  let hbStop: (() => void) | null = null;
  let retry = 0;

  let flushTimer: number | null = null;
  let pending: Counts = {};

  const flush = () => {
    flushTimer = null;
    const patch = pending;
    pending = {};
    useAdminWsStore.getState().patchTableConnCounts(patch);
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = window.setTimeout(flush, 200);
  };

  const cleanupWs = () => {
    useAdminWsStore.getState().setConnected(false);
    hbStop?.();
    hbStop = null;
    try {
      ws?.close();
    } catch {
      void 0;
    }
    if (activeWs === ws) activeWs = null;
    ws = null;
  };

  const connect = () => {
    if (stopped) return;
    cleanupWs();
    useAdminWsStore.getState().setLastError(null);
    const next = new WebSocket(wsUrl);
    ws = next;
    activeWs = next;

    next.onopen = () => {
      retry = 0;
      useAdminWsStore.getState().setConnected(true);
      hbStop?.();
      hbStop = startWsHeartbeat(next, 5000);
    };
    next.onclose = () => {
      useAdminWsStore.getState().setConnected(false);
      hbStop?.();
      hbStop = null;
      if (activeWs === next) activeWs = null;
      if (stopped) return;
      retry = Math.min(retry + 1, 8);
      const delay = Math.min(60_000, 500 * 2 ** retry);
      window.setTimeout(connect, delay);
    };
    next.onerror = () => {
      useAdminWsStore.getState().setConnected(false);
      try {
        next.close();
      } catch {
        void 0;
      }
    };
    next.onmessage = (ev) => {
      let msg: Msg | null = null;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'ERROR') {
        useAdminWsStore.getState().setLastError(msg.data || null);
        try {
          next.close();
        } catch {
          void 0;
        }
        return;
      }

      if (msg.type === 'PONG') return;

      if (msg.type === 'TABLE_CONN_COUNTS_SNAPSHOT') {
        useAdminWsStore.getState().setTableConnCounts(msg.data || {});
        return;
      }
      if (msg.type === 'TABLE_CONN_COUNTS') {
        Object.assign(pending, msg.data || {});
        scheduleFlush();
        return;
      }
      if (msg.type === 'TABLE_STATUS_CHANGED') {
        useAdminWsStore.getState().bumpTableStatusSeq();
        return;
      }
      if (msg.type === 'NOTIFICATION') {
        if (isNotification(msg.data)) useAdminWsStore.getState().pushNotification(msg.data);
        void queryClient.invalidateQueries({ queryKey: ['admin_notifications'] });
        return;
      }
      if (msg.type === 'MAINTENANCE_SNAPSHOT' || msg.type === 'MAINTENANCE_CHANGED') {
        if (!isMaintenanceDTO(msg.data)) return;
        useAdminWsStore.getState().setMaintenance(msg.data);
        queryClient.setQueryData(['admin_maintenance', params.tenantId, params.storeId], msg.data);
        return;
      }
      if (msg.type === 'DASHBOARD_OVERVIEW_SNAPSHOT') {
        if (!isDashboardOverview(msg.data)) return;
        useAdminWsStore.getState().setDashboardOverview(msg.data);
        queryClient.setQueryData(['dashboard', 'overview', params.storeId], msg.data);
        return;
      }
      if (msg.type === 'TENANT_SYNC_STATUS_SNAPSHOT') {
        if (!isTenantSyncStatusSnapshot(msg.data)) return;
        useAdminWsStore.getState().setTenantSyncStatus(msg.data.storeId, msg.data.status);
        queryClient.setQueryData(
          ['tenantSyncStatus', { tenantId: msg.data.tenantId, storeId: msg.data.storeId }],
          msg.data.status,
        );
      }
    };
  };

  connect();

  return () => {
    stopped = true;
    if (flushTimer) window.clearTimeout(flushTimer);
    flushTimer = null;
    pending = {};
    cleanupWs();
  };
}
