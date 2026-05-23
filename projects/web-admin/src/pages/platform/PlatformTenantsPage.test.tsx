import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../app/queryClient';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { PlatformTenantsPage } from './PlatformTenantsPage';

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => false),
    dialog: <div data-testid="confirm-dialog" />,
  }),
}));

vi.mock('../../api/platformTenants', () => ({
  listPlatformTenants: vi.fn(async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } })),
  createPlatformTenant: vi.fn(async () => ({ tenantId: 't_new', primaryStoreId: 'store_new' })),
  updatePlatformTenant: vi.fn(async () => ({})),
  deletePlatformTenant: vi.fn(async () => ({})),
}));

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryData(['platform_tenants', 'ALL', 'ALL', '', 0, 20], {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0 },
  });
});

afterEach(() => {
  queryClient.clear();
});

describe('PlatformTenantsPage', () => {
  it('renders confirm dialog holder', () => {
    render(
      <SnackbarProvider>
        <QueryClientProvider client={queryClient}>
          <PlatformTenantsPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('invalidates admin scopes after create', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <SnackbarProvider>
        <QueryClientProvider client={queryClient}>
          <PlatformTenantsPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );
    const openBtn = screen.getAllByText('新增租户')[0];
    openBtn.click();
    const brandInput = await screen.findByLabelText(/^品牌名称$/);
    fireEvent.change(brandInput, { target: { value: '连锁A' } });
    const createBtn = await screen.findByText('创建');
    createBtn.click();
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['admin_scopes', 'me'] }));
  });
});
