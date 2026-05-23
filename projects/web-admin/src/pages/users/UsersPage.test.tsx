import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { UsersPage } from './UsersPage';

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(async () => false), dialog: null }),
}));

describe('UsersPage', () => {
  it('switches columns between ADMIN and CUSTOMER', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(['admin_users', 'ADMIN', '', 0, 20], {
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
    qc.setQueryData(['admin_users', 'CUSTOMER', '', 0, 20], {
      list: [
        {
          userId: 'usr_1',
          userType: 'CUSTOMER',
          nickname: '小明',
          avatarUrl: '',
          wechatOpenid: 'wx_1',
          lastLoginAt: null,
          createdAt: '',
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });

    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <UsersPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    await waitFor(() => expect(screen.getByText('用户管理')).toBeInTheDocument());
    expect(screen.getByText('账号')).toBeInTheDocument();
    expect(screen.queryByText('微信ID')).toBeNull();

    await user.click(screen.getByLabelText('类型'));
    await user.click(screen.getByText('小程序用户'));
    await waitFor(() => expect(screen.getByText('微信ID')).toBeInTheDocument());
    expect(screen.queryByText('账号')).toBeNull();
  });
});
