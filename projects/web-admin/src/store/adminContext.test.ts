import { beforeEach, describe, expect, it } from 'vitest';
import { useAdminContextStore } from './adminContext';

describe('adminContext store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminContextStore.getState().reset();
  });

  it('reset clears persisted context', () => {
    useAdminContextStore.getState().setBoard('tenant');
    useAdminContextStore.getState().setTenantId('t1');
    useAdminContextStore.getState().setStoreId('s1');
    expect(localStorage.getItem('bitego_admin_board')).toBe('tenant');
    expect(localStorage.getItem('bitego_admin_tenant_id')).toBe('t1');
    expect(localStorage.getItem('bitego_admin_store_id')).toBe('s1');

    useAdminContextStore.getState().reset();
    expect(useAdminContextStore.getState().board).toBe('platform');
    expect(useAdminContextStore.getState().tenantId).toBe(null);
    expect(useAdminContextStore.getState().storeId).toBe(null);
    expect(localStorage.getItem('bitego_admin_board')).toBe(null);
    expect(localStorage.getItem('bitego_admin_tenant_id')).toBe(null);
    expect(localStorage.getItem('bitego_admin_store_id')).toBe(null);
  });
});
