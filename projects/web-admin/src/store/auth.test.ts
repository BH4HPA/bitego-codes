import { describe, expect, it, beforeEach } from 'vitest';
import { useAuthStore } from './auth';
import { useAdminContextStore } from './adminContext';

function makeJwt(payload: Record<string, unknown>) {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.`;
}

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it('persists token to localStorage', () => {
    useAuthStore.getState().setToken('t1');
    expect(localStorage.getItem('bitego_admin_token')).toBe('t1');
    expect(useAuthStore.getState().token).toBe('t1');
  });

  it('logout clears token', () => {
    useAuthStore.getState().setToken('t1');
    useAuthStore.getState().logout();
    expect(localStorage.getItem('bitego_admin_token')).toBe(null);
    expect(useAuthStore.getState().token).toBe(null);
  });

  it('logout clears admin context', () => {
    useAuthStore.getState().setToken('t1');
    useAdminContextStore.getState().setBoard('tenant');
    useAdminContextStore.getState().setTenantId('t1');
    useAuthStore.getState().logout();
    expect(useAdminContextStore.getState().board).toBe('platform');
    expect(useAdminContextStore.getState().tenantId).toBe(null);
    expect(useAdminContextStore.getState().storeId).toBe(null);
  });

  it('changing token does not reset admin context when userId is unchanged', () => {
    useAuthStore.getState().setToken(makeJwt({ userId: 'u1' }));
    useAdminContextStore.getState().setContext({ board: 'store', tenantId: 't1', storeId: 's1' });
    useAuthStore.getState().setToken(makeJwt({ userId: 'u1' }));
    expect(useAdminContextStore.getState().board).toBe('store');
    expect(useAdminContextStore.getState().tenantId).toBe('t1');
    expect(useAdminContextStore.getState().storeId).toBe('s1');
  });

  it('changing token resets admin context when userId changes', () => {
    useAuthStore.getState().setToken(makeJwt({ userId: 'u1' }));
    useAdminContextStore.getState().setContext({ board: 'store', tenantId: 't1', storeId: 's1' });
    useAuthStore.getState().setToken(makeJwt({ userId: 'u2' }));
    expect(useAdminContextStore.getState().board).toBe('platform');
    expect(useAdminContextStore.getState().tenantId).toBe(null);
    expect(useAdminContextStore.getState().storeId).toBe(null);
  });
});
