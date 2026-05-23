import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { TenantUsersPage } from './TenantUsersPage';

vi.mock('../../store/adminContext', () => ({
  useAdminContextStore: <T,>(sel: (s: { tenantId: string; storeId: string; board: string }) => T) =>
    sel({ tenantId: 't_1', storeId: 's_1', board: 'tenant' }),
}));

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(async () => false), dialog: null }),
}));

vi.mock('../../api/tenantUsers', () => ({
  listTenantUsers: vi.fn(async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } })),
  createTenantAdminUser: vi.fn(async () => ({ userId: 'u_1', scopeId: 'sc_1' })),
}));

vi.mock('../../api/tenantStores', () => ({
  listTenantStores: vi.fn(async () => ({
    list: [{ storeId: 's_1', tenantId: 't_1', isPrimary: 1, name: '主店', subName: null }],
    pagination: { page: 1, pageSize: 100, total: 1 },
  })),
}));

describe('TenantUsersPage', () => {
  it('opens add-member dialog with role selector and store autocomplete', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(['tenant_users', 'ADMIN', '', 0, 20], {
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0 },
    });

    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <TenantUsersPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    await user.click(screen.getByRole('button', { name: '添加成员' }));
    expect(await screen.findByLabelText('角色')).toBeInTheDocument();
    expect(screen.getByLabelText('门店')).toBeInTheDocument();

    await user.click(screen.getByLabelText('角色'));
    await user.click(await screen.findByRole('option', { name: '租户管理员' }));
    expect(screen.queryByLabelText('门店')).toBeNull();
  });
});
