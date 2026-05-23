import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { PlatformUsersPage } from './PlatformUsersPage';

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(async () => false), dialog: null }),
}));

describe('PlatformUsersPage', () => {
  it('opens add-member dialog with tabs and scope editor', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(['platform_users', 'ADMIN', '', 0, 20], {
      list: [
        {
          userId: 'admin_1',
          userType: 'ADMIN',
          username: 'admin',
          nickname: '管理员',
          avatarUrl: '',
          lastLoginAt: null,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });

    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <PlatformUsersPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    await waitFor(() => expect(screen.getByText('用户管理')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '添加成员' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: '新建账号' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: '从已有账号选择' })).toBeInTheDocument();
    expect(screen.getByText('授权范围')).toBeInTheDocument();
    expect(screen.getByLabelText('角色')).toBeInTheDocument();
    expect(screen.getByLabelText('租户')).toBeInTheDocument();
  });
});
