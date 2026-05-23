import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { useAdminContextStore } from '../../store/adminContext';
import { DashboardPage } from './DashboardPage';

vi.mock('../../hooks/useAdminTableConnCounts', () => ({
  useAdminTableConnCounts: () => ({ counts: { tbl_1: 1, tbl_2: 0 }, connected: true }),
}));

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(async () => false), dialog: null }),
}));

describe('DashboardPage', () => {
  it('filters active orders when selecting a table row', async () => {
    useAdminContextStore.getState().reset();
    useAdminContextStore.getState().setBoard('store');
    useAdminContextStore.getState().setTenantId('t_1');
    useAdminContextStore.getState().setStoreId('store_1');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(['dashboard', 'overview', 'store_1'], {
      tables: [
        {
          tableId: 'tbl_1',
          code: 'A01',
          status: 'OCCUPIED',
          sessionVersion: 1,
          openedAt: null,
          cart: null,
          activeOrders: [],
          totalOrderCount: 0,
          totalAmountExRefunded: '0',
        },
        {
          tableId: 'tbl_2',
          code: 'A02',
          status: 'OCCUPIED',
          sessionVersion: 1,
          openedAt: null,
          cart: null,
          activeOrders: [],
          totalOrderCount: 0,
          totalAmountExRefunded: '0',
        },
      ],
      activeOrders: [
        { orderId: 'o1', orderNo: 'NO1', tableCode: 'A01', status: 'Paid', remark: null, pendingItems: [] },
        { orderId: 'o2', orderNo: 'NO2', tableCode: 'A02', status: 'Paid', remark: null, pendingItems: [] },
      ],
    });
    qc.setQueryData(['orders', { tableId: 'tbl_1', tableSessionVersion: 1 }], {
      list: [],
      pagination: { page: 1, pageSize: 100, total: 0 },
    });

    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <DashboardPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    await waitFor(() => expect(screen.getByText('A01 · NO1 · 已支付')).toBeInTheDocument());
    expect(screen.getByText('A01 · NO1 · 已支付')).toBeInTheDocument();
    expect(screen.getByText('A02 · NO2 · 已支付')).toBeInTheDocument();

    const row1 = screen.getByText('A01').closest('tr');
    expect(row1).toBeTruthy();
    fireEvent.click(row1!);
    expect(screen.getByText('桌号：A01')).toBeInTheDocument();
    expect(screen.getByText('A01 · NO1 · 已支付')).toBeInTheDocument();
    expect(screen.queryByText('A02 · NO2 · 已支付')).toBeNull();

    fireEvent.click(row1!);
    expect(screen.queryByText('桌号：A01')).toBeNull();
    expect(screen.getByText('A02 · NO2 · 已支付')).toBeInTheDocument();
  });

  it('supports sorting tables by amount and falls back to code', async () => {
    useAdminContextStore.getState().reset();
    useAdminContextStore.getState().setBoard('store');
    useAdminContextStore.getState().setTenantId('t_1');
    useAdminContextStore.getState().setStoreId('store_1');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(['dashboard', 'overview', 'store_1'], {
      tables: [
        {
          tableId: 'tbl_1',
          code: 'A02',
          status: 'OCCUPIED',
          sessionVersion: 1,
          openedAt: null,
          cart: null,
          activeOrders: [],
          totalOrderCount: 0,
          totalAmountExRefunded: '300',
        },
        {
          tableId: 'tbl_2',
          code: 'A01',
          status: 'OCCUPIED',
          sessionVersion: 1,
          openedAt: null,
          cart: null,
          activeOrders: [],
          totalOrderCount: 0,
          totalAmountExRefunded: '200',
        },
      ],
      activeOrders: [],
    });

    const r = render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <DashboardPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    const root = within(r.container);
    await waitFor(() => expect(root.getAllByText('桌台总览').length).toBeGreaterThan(0));
    const overviewTable = root.getAllByRole('table')[0]!;
    const rows1 = within(overviewTable).getAllByRole('row');
    expect(within(rows1[1]!).getByText('A01')).toBeInTheDocument();

    fireEvent.click(within(overviewTable).getByRole('button', { name: '总金额' }));
    await waitFor(() => {
      const rows2 = within(overviewTable).getAllByRole('row');
      expect(within(rows2[1]!).getByText('A02')).toBeInTheDocument();
    });
  });
});
