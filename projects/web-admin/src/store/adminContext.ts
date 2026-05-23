import { create } from 'zustand';
import { queryClient } from '../app/queryClient';

// 只清除与 AdminContext 相关的查询缓存
function clearContextRelatedCache() {
  // 清除与租户相关的缓存
  queryClient.removeQueries({ queryKey: ['platform_tenants'] });
  // 清除与门店相关的缓存
  queryClient.removeQueries({ queryKey: ['platform_stores'] });
  queryClient.removeQueries({ queryKey: ['tenant_stores'] });
  // 清除与维护状态相关的缓存
  queryClient.removeQueries({ queryKey: ['admin_maintenance'] });
  // 清除与快照相关的缓存
  queryClient.removeQueries({ queryKey: ['tenant_snapshot'] });
  queryClient.removeQueries({ queryKey: ['store_snapshot'] });
  // 清除与用户管理相关的缓存
  queryClient.removeQueries({ queryKey: ['platform_users'] });
  queryClient.removeQueries({ queryKey: ['tenant_users'] });
  queryClient.removeQueries({ queryKey: ['store_users'] });
  // 清除与分类、规格、商品相关的缓存
  queryClient.removeQueries({ queryKey: ['categories'] });
  queryClient.removeQueries({ queryKey: ['shared_spec_groups'] });
  queryClient.removeQueries({ queryKey: ['goods'] });
  queryClient.removeQueries({ queryKey: ['skus'] });
  // 清除与订单相关的缓存
  queryClient.removeQueries({ queryKey: ['orders'] });
  // 清除与桌台相关的缓存
  queryClient.removeQueries({ queryKey: ['tables'] });
  // 清除与门店管理相关的缓存
  queryClient.removeQueries({ queryKey: ['stores'] });
  // 清除与概览相关的缓存
  queryClient.removeQueries({ queryKey: ['dashboard'] });
  queryClient.removeQueries({ queryKey: ['overview_stores'] });
  // 保留 branding 相关的缓存
  // queryClient.removeQueries({ queryKey: ['platform_branding'] });
  // 保留通知相关的缓存
  // queryClient.removeQueries({ queryKey: ['admin_notifications'] });
}

type AdminContextState = {
  tenantId: string | null;
  storeId: string | null;
  board: 'platform' | 'tenant' | 'store';
  setContext: (next: {
    board: 'platform' | 'tenant' | 'store';
    tenantId: string | null;
    storeId: string | null;
  }) => void;
  setTenantId: (tenantId: string | null) => void;
  setStoreId: (storeId: string | null) => void;
  setBoard: (board: 'platform' | 'tenant' | 'store') => void;
  reset: () => void;
};

const tenantKey = 'bitego_admin_tenant_id';
const storeKey = 'bitego_admin_store_id';
const boardKey = 'bitego_admin_board';

function parseBoard(raw: string | null): 'platform' | 'tenant' | 'store' {
  if (raw === 'platform' || raw === 'tenant' || raw === 'store') return raw;
  return 'platform';
}

function parseNullableId(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  return s ? s : null;
}

function readInitial() {
  const board = parseBoard(localStorage.getItem(boardKey));
  const storedTenantId = parseNullableId(localStorage.getItem(tenantKey));
  const storedStoreId = parseNullableId(localStorage.getItem(storeKey));
  if (board === 'platform') return { board, tenantId: null, storeId: null };
  if (board === 'tenant') return { board, tenantId: storedTenantId, storeId: null };
  return { board, tenantId: storedTenantId, storeId: storedStoreId };
}

function persistContext(next: {
  board: 'platform' | 'tenant' | 'store';
  tenantId: string | null;
  storeId: string | null;
}) {
  localStorage.setItem(boardKey, next.board);
  if (next.tenantId) localStorage.setItem(tenantKey, next.tenantId);
  else localStorage.removeItem(tenantKey);
  if (next.storeId) localStorage.setItem(storeKey, next.storeId);
  else localStorage.removeItem(storeKey);
}

export const useAdminContextStore = create<AdminContextState>((set) => ({
  ...readInitial(),
  setContext: (next) => {
    const current = useAdminContextStore.getState();
    if (current.board === next.board && current.tenantId === next.tenantId && current.storeId === next.storeId) return;
    persistContext(next);
    clearContextRelatedCache();
    set(next);
  },
  setTenantId: (tenantId) => {
    const current = useAdminContextStore.getState().tenantId;
    if (current === tenantId) return;
    if (tenantId) localStorage.setItem(tenantKey, tenantId);
    else localStorage.removeItem(tenantKey);
    set({ tenantId });
  },
  setStoreId: (storeId) => {
    const current = useAdminContextStore.getState().storeId;
    if (current === storeId) return;
    if (storeId) localStorage.setItem(storeKey, storeId);
    else localStorage.removeItem(storeKey);
    set({ storeId });
  },
  setBoard: (board) => {
    const current = useAdminContextStore.getState();
    if (current.board === board) return;
    localStorage.setItem(boardKey, board);
    set((s) => {
      if (board === 'platform') return { board, tenantId: null, storeId: null };
      if (board === 'tenant') return { board, tenantId: s.tenantId, storeId: null };
      return { board, tenantId: s.tenantId, storeId: s.storeId };
    });
  },
  reset: () => {
    localStorage.removeItem(tenantKey);
    localStorage.removeItem(storeKey);
    localStorage.removeItem(boardKey);
    queryClient.clear();
    set((s) => {
      if (s.board === 'platform' && s.tenantId === null && s.storeId === null) return s;
      return { board: 'platform', tenantId: null, storeId: null };
    });
  },
}));
