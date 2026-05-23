import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { PlatformStoresPage } from './PlatformStoresPage';

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => false),
    dialog: <div data-testid="confirm-dialog" />,
  }),
}));

vi.mock('../../api/platformStores', () => ({
  listPlatformStores: vi.fn(async () => ({
    list: [
      {
        storeId: 'store_default',
        tenantId: 'store_default',
        name: '默认门店',
        subName: null,
        isPrimary: 1,
        storeType: 'SINGLE_STORE',
        tenantType: 'SINGLE',
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1 },
  })),
  createPlatformStore: vi.fn(async () => ({})),
  updatePlatformStore: vi.fn(async () => ({})),
  deletePlatformStore: vi.fn(async () => ({})),
}));

vi.mock('../../api/platformTenants', () => ({
  listPlatformTenants: vi.fn(async () => ({
    list: [
      {
        tenantId: 'store_default',
        type: 'SINGLE',
        brandName: '默认门店',
        brandLogoUrl: null,
        primaryStoreId: 'store_default',
      },
    ],
    pagination: { page: 1, pageSize: 100, total: 1 },
  })),
}));

describe('PlatformStoresPage', () => {
  it('disables delete for store_default', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <PlatformStoresPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );
    const cells = await screen.findAllByText('store_default');
    const row = cells[0]?.closest('tr') || null;
    expect(row).toBeTruthy();
    const delBtn = within(row as HTMLElement)
      .getByText('删除')
      .closest('button');
    expect(delBtn).toBeTruthy();
    expect(delBtn).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });
});
