import type { AdminScopeDTO } from '../api/adminScopes';

export type AdminRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN';

export const ROLE_RANK: Record<AdminRole, number> = {
  STORE_ADMIN: 1,
  TENANT_ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function roleHigherThan(a: AdminRole, b: AdminRole): boolean {
  return ROLE_RANK[a] > ROLE_RANK[b];
}

export function computeCanManageSharedCatalog(params: {
  role: AdminRole;
  tenantType: 'SINGLE' | 'CHAIN' | null;
  storeIsPrimary: boolean | null;
}): boolean {
  // Mirror of backend adminAuthz.ts: a CHAIN branch store context never grants shared-catalog
  // write capability — edits must happen on the tenant board or the primary store.
  if (params.tenantType === 'CHAIN' && params.storeIsPrimary === false) return false;
  if (params.role === 'SUPER_ADMIN' || params.role === 'TENANT_ADMIN') return true;
  if (params.role === 'STORE_ADMIN') {
    if (params.tenantType === 'SINGLE') return true;
    if (params.tenantType === 'CHAIN' && params.storeIsPrimary === true) return true;
  }
  return false;
}

export function getEffectiveAdminRole(params: {
  scopes: AdminScopeDTO[];
  tenantId: string | null;
  storeId: string | null;
}): AdminRole | null {
  const { scopes, tenantId, storeId } = params;
  if (scopes.some((s) => s.role === 'SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (tenantId && scopes.some((s) => s.role === 'TENANT_ADMIN' && s.tenantId === tenantId)) {
    return 'TENANT_ADMIN';
  }
  if (storeId && scopes.some((s) => s.role === 'STORE_ADMIN' && s.storeId === storeId)) {
    return 'STORE_ADMIN';
  }
  return null;
}

export type AdminCapabilities = {
  role: AdminRole | null;
  canAccessPlatform: boolean;
  canAccessTenant: boolean;
  canAccessStore: boolean;
  canManageSharedCatalog: boolean;
  canToggleGoodsStatus: boolean;
};

export function getAdminCapabilities(params: {
  scopes: AdminScopeDTO[];
  tenantId: string | null;
  storeId: string | null;
  tenantType?: 'SINGLE' | 'CHAIN' | null;
  storeIsPrimary?: boolean | null;
}): AdminCapabilities {
  const role = getEffectiveAdminRole(params);
  if (!role) {
    return {
      role: null,
      canAccessPlatform: false,
      canAccessTenant: false,
      canAccessStore: false,
      canManageSharedCatalog: false,
      canToggleGoodsStatus: false,
    };
  }
  const rank = ROLE_RANK[role];
  const tenantType =
    params.tenantType ??
    (params.tenantId
      ? (params.scopes.find((s) => s.tenantId === params.tenantId && s.tenantType != null)?.tenantType ?? null)
      : null);
  const storeIsPrimary =
    params.storeIsPrimary ??
    (params.storeId
      ? (params.scopes.find((s) => s.storeId === params.storeId && s.storeIsPrimary != null)?.storeIsPrimary ?? null)
      : null);
  return {
    role,
    canAccessPlatform: rank >= ROLE_RANK.SUPER_ADMIN,
    canAccessTenant: rank >= ROLE_RANK.TENANT_ADMIN,
    canAccessStore: rank >= ROLE_RANK.STORE_ADMIN,
    canManageSharedCatalog: computeCanManageSharedCatalog({ role, tenantType, storeIsPrimary }),
    canToggleGoodsStatus: rank >= ROLE_RANK.STORE_ADMIN,
  };
}
