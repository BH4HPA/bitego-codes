import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useAdminContextStore } from '../../store/adminContext';
import { AdminContextSwitcher } from './AdminContextSwitcher';

const getMyAdminScopes = vi.fn(async () => ({
  list: [{ scopeId: 'sc_1', tenantId: 'store_default', role: 'SUPER_ADMIN', status: 'ACTIVE' }],
  platform: { role: 'SUPER_ADMIN' },
  tenants: [],
}));
const listPlatformTenants = vi.fn(async () => ({
  list: [{ tenantId: 't_1', type: 'CHAIN', brandName: '租户A', primaryStoreId: 's_1', status: 'ACTIVE' }],
  pagination: { page: 1, pageSize: 100, total: 1 },
}));
const listPlatformStores = vi.fn(async () => ({
  list: [
    { storeId: 's_1', tenantId: 't_1', isPrimary: 1, name: '主店' },
    { storeId: 's_2', tenantId: 't_1', isPrimary: 0, name: '二店' },
  ],
  pagination: { page: 1, pageSize: 200, total: 2 },
}));

vi.mock('../../api/adminScopes', () => ({ getMyAdminScopes: () => getMyAdminScopes() }));
vi.mock('../../api/platformTenants', () => ({ listPlatformTenants: () => listPlatformTenants() }));
vi.mock('../../api/platformStores', () => ({ listPlatformStores: () => listPlatformStores() }));
vi.mock('../../api/tenantStores', () => ({
  listTenantStores: vi.fn(async () => ({ list: [], pagination: { page: 1, pageSize: 200, total: 0 } })),
}));

describe('AdminContextSwitcher', () => {
  it('keeps selected chain store and does not force back to primary', async () => {
    useAdminContextStore.getState().reset();
    useAdminContextStore.getState().setBoard('store');
    useAdminContextStore.getState().setTenantId('t_1');
    useAdminContextStore.getState().setStoreId('s_2');

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AdminContextSwitcher />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(listPlatformStores).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useAdminContextStore.getState().storeId).toBe('s_2'));
  });

  it('hides tenant board when there is no chain tenant', async () => {
    useAdminContextStore.getState().reset();
    useAdminContextStore.getState().setBoard('platform');
    useAdminContextStore.getState().setTenantId(null);
    useAdminContextStore.getState().setStoreId(null);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AdminContextSwitcher />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('平台')).toBeInTheDocument());
    const boardSelect = screen.getByRole('combobox');
    fireEvent.mouseDown(boardSelect);
    await waitFor(() => expect(screen.getByRole('option', { name: '平台' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: '门店' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '租户' })).toBeNull();
  });
});
