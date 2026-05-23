import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { useAdminContextStore } from '../../store/adminContext';
import { GoodEditPage } from './GoodEditPage';

function renderEdit() {
  useAdminContextStore.setState({ board: 'store', tenantId: 'store_default', storeId: 'store_default' });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['categories'], { list: [{ categoryId: 'cat1', name: '分类1', sort: 1, status: 'ACTIVE' }] });
  qc.setQueryData(['admin_scopes', 'me'], {
    list: [
      {
        scopeId: 'sc1',
        tenantId: 'store_default',
        storeId: 'store_default',
        role: 'STORE_ADMIN',
        tenantType: 'SINGLE',
        status: 'ACTIVE',
      },
    ],
  });
  qc.setQueryData(['good', 'g1'], {
    goodId: 'g1',
    categoryId: 'cat1',
    name: '菜品1',
    description: '',
    imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
    status: 'OFF_SHELF',
    basePriceCents: 500,
    defaultSkuId: 'sku1',
    optionGroups: [
      {
        id: 'og1',
        name: '杯型',
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        options: [{ id: 'op1', name: '小杯', priceCents: 0 }],
      },
    ],
    skus: [{ skuId: 'sku1', specCombination: '默认', price: '5.00', priceCents: 500, stock: 3, status: 'OFF_SHELF' }],
  });

  return render(
    <SnackbarProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/goods/g1']}>
          <Routes>
            <Route path="/goods/:goodId" element={<GoodEditPage mode="edit" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </SnackbarProvider>,
  );
}

describe('GoodEditPage', () => {
  it('shows confirm dialog when changing optionGroups', async () => {
    renderEdit();

    await waitFor(() => expect(screen.getByDisplayValue('杯型')).toBeInTheDocument());
    const imgs1 = screen.getAllByRole('img', { name: '菜品1' });
    expect(imgs1.length).toBe(2);
    expect(screen.getByText('封面')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('设为封面'));
    const imgs2 = screen.getAllByRole('img', { name: '菜品1' });
    expect(imgs2[0]).toHaveAttribute('src', 'https://example.com/b.png');
    fireEvent.click(screen.getByRole('button', { name: '新增规格组' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('变更规格组确认')).toBeInTheDocument();
    expect(screen.getByText(/此操作将删除该菜品所有历史 SKU/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认变更' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('shows sku action buttons', async () => {
    renderEdit();
    await waitFor(() => expect(screen.getAllByText('SKU 列表').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('button', { name: '上架' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '+1' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '编辑库存' }).length).toBeGreaterThan(0);
  });
});
