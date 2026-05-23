import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { CategoriesPage } from './CategoriesPage';
import { reorderCategories } from './reorder';
import type { CategoryDTO } from '../../api/types';

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(async () => false), dialog: null }),
}));

describe('CategoriesPage', () => {
  it('reorders categories and recalculates sort descending', () => {
    const list: CategoryDTO[] = [
      { categoryId: 'cat_1', name: '分类1', sort: 20 },
      { categoryId: 'cat_2', name: '分类2', sort: 10 },
    ];
    const next = reorderCategories(list, 1, 0);
    expect(next[0].categoryId).toBe('cat_2');
    expect(next[1].categoryId).toBe('cat_1');
    expect(next[0].sort).toBeGreaterThan(next[1].sort);
    expect(next[0].sort).toBe(20);
    expect(next[1].sort).toBe(10);
  });

  it('updates list when categories query data changes', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const key = ['categories', null, null, { status: 'ACTIVE', page: 1, pageSize: 1000 }];

    qc.setQueryData(key, {
      list: [
        { categoryId: 'cat_1', name: '分类1', sort: 20 },
        { categoryId: 'cat_2', name: '分类2', sort: 10 },
      ],
      pagination: { page: 1, pageSize: 1000, total: 2 },
    });

    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <CategoriesPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );

    await waitFor(() => expect(screen.getByText('分类1')).toBeInTheDocument());
    expect(screen.queryByText('分类3')).toBeNull();

    qc.setQueryData(key, {
      list: [
        { categoryId: 'cat_1', name: '分类1', sort: 30 },
        { categoryId: 'cat_2', name: '分类2', sort: 20 },
        { categoryId: 'cat_3', name: '分类3', sort: 10 },
      ],
      pagination: { page: 1, pageSize: 1000, total: 3 },
    });

    await waitFor(() => expect(screen.getByText('分类3')).toBeInTheDocument());
  });
});
