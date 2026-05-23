import { describe, expect, it } from 'vitest';
import { getAdminDashboardWsUrl } from './ws';

describe('getAdminDashboardWsUrl', () => {
  it('converts http api base to ws url', () => {
    const url = getAdminDashboardWsUrl({ apiBaseUrl: 'http://127.0.0.1:3000/api/v1', token: 't', board: 'store' });
    expect(url).toBe('ws://127.0.0.1:3000/ws/admin-dashboard?token=t&board=store');
  });

  it('converts https api base to wss url', () => {
    const url = getAdminDashboardWsUrl({ apiBaseUrl: 'https://example.com/api/v1', token: 't', board: 'tenant' });
    expect(url).toBe('wss://example.com/ws/admin-dashboard?token=t&board=tenant');
  });
});
