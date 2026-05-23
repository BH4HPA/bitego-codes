import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../components/snackbar/SnackbarProvider';
import { CategoriesPage } from './categories/CategoriesPage';
import { GoodsListPage } from './goods/GoodsListPage';
import { OrdersListPage } from './orders/OrdersListPage';
import { OrderDetailPage } from './orders/OrderDetailPage';
import { ProfilePage } from './profile/ProfilePage';
import { StorePage } from './stores/StorePage';
import { TablesPage } from './tables/TablesPage';
import { NotFoundPage } from './system/NotFoundPage';

vi.mock('../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(async () => false), dialog: null }),
}));

function createQC() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(['categories', null, null, { status: 'ACTIVE', page: 1, pageSize: 1000 }], {
    list: [
      { categoryId: 'cat_1', name: '分类1', sort: 1 },
      { categoryId: 'cat_2', name: '分类2', sort: 0 },
    ],
    pagination: { page: 1, pageSize: 1000, total: 2 },
  });
  qc.setQueryData(['categories', null, null], {
    list: [
      { categoryId: 'cat_1', name: '分类1', sort: 1, status: 'ACTIVE' },
      { categoryId: 'cat_2', name: '分类2', sort: 0, status: 'ACTIVE' },
    ],
  });
  qc.setQueryData(['goods', null, null, { status: 'ON_SHELF', categoryId: '', name: '', page: 0, pageSize: 50 }], {
    list: [
      {
        goodId: 'g1',
        name: '菜品1',
        description: '一句话',
        imageUrls: [],
        categoryId: 'cat_1',
        categoryIds: ['cat_1', 'cat_2'],
        sales: 0,
        status: 'ON_SHELF',
        basePriceCents: 0,
        minPriceCents: 0,
      },
    ],
    pagination: { page: 1, pageSize: 50, total: 1 },
  });
  qc.setQueryData(['orders', { status: '', tableId: '', orderNo: '', page: 0, pageSize: 50 }], {
    list: [
      {
        orderId: 'o1',
        orderNo: 'NO1',
        status: 'Paid',
        tableId: 'A01',
        totalAmount: '1.00',
        totalAmountCents: 100,
        paidAt: null,
        createdAt: null,
      },
    ],
    pagination: { page: 1, pageSize: 50, total: 1 },
  });
  qc.setQueryData(['order', 'o1'], {
    orderId: 'o1',
    orderNo: 'NO1',
    status: 'Paid',
    tableId: 'A01',
    tableCode: 'A01',
    remark: null,
    totalAmount: '1.00',
    totalAmountCents: 100,
    createdAt: '',
    items: [],
  });
  qc.setQueryData(['order', 'o1', 'refunds'], { list: [], pagination: { page: 1, pageSize: 50, total: 0 } });
  qc.setQueryData(['tables', { status: '', page: 0, pageSize: 50 }], {
    list: [{ tableId: 'A01', code: 'A01', status: 'FREE', sessionVersion: 1, qrcodeUrl: null }],
    pagination: { page: 1, pageSize: 50, total: 1 },
  });
  qc.setQueryData(['store', 'current'], {
    storeId: 'store_default',
    name: '门店',
    logoUrl: '',
    phone: '',
    address: '',
    description: '',
  });
  qc.setQueryData(['me'], { userId: 'admin_1', role: 'ADMIN', username: 'admin', nickname: '管理员', avatarUrl: '' });
  qc.setQueryData(['admin_scopes', 'me'], { list: [] });
  return qc;
}

function renderRoute(route: string) {
  const qc = createQC();
  render(
    <SnackbarProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/goods" element={<GoodsListPage />} />
            <Route path="/orders" element={<OrdersListPage />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/tables" element={<TablesPage />} />
            <Route path="/stores" element={<StorePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </SnackbarProvider>,
  );
}

describe('Pages smoke', () => {
  it('renders CategoriesPage', () => {
    renderRoute('/categories');
    expect(screen.getByText('菜品分类')).toBeInTheDocument();
  });

  it('renders GoodsListPage', () => {
    renderRoute('/goods');
    expect(screen.getByText('菜品管理')).toBeInTheDocument();
    expect(screen.getByText('菜品1')).toBeInTheDocument();
    expect(screen.getByText('分类1 / 分类2')).toBeInTheDocument();
  });

  it('renders OrdersListPage', () => {
    renderRoute('/orders');
    expect(screen.getByText('订单管理')).toBeInTheDocument();
    expect(screen.getByText('NO1')).toBeInTheDocument();
  });

  it('renders OrderDetailPage', () => {
    renderRoute('/orders/o1');
    expect(screen.getByText('订单详情')).toBeInTheDocument();
  });

  it('renders TablesPage', () => {
    renderRoute('/tables');
    expect(screen.getByText('桌台管理')).toBeInTheDocument();
    expect(screen.getAllByText('A01').length).toBeGreaterThan(0);
  });

  it('renders StorePage', () => {
    renderRoute('/stores');
    expect(screen.getByText('门店信息')).toBeInTheDocument();
  });

  it('renders ProfilePage', async () => {
    renderRoute('/profile');
    expect(await screen.findByText('个人信息')).toBeInTheDocument();
  });

  it('renders NotFoundPage', () => {
    renderRoute('/not-exists');
    expect(screen.getByText('页面不存在')).toBeInTheDocument();
  });
});
