import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlatformOverviewPage } from './PlatformOverviewPage';

describe('PlatformOverviewPage', () => {
  it('renders card title/description and metrics section', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(['platform_tenants', 'overview', ''], {
      list: [{ tenantId: 't_1', brandName: '品牌A', type: 'CHAIN', primaryStoreId: 's_1', status: 'ACTIVE' }],
      pagination: { page: 1, pageSize: 100, total: 1 },
    });
    qc.setQueryData(['platform_overview_stores', '', '', 0, 20], {
      list: [
        {
          storeId: 's_2',
          tenantId: 't_1',
          isPrimary: 0,
          name: '二店',
          subName: null,
          logoUrl: null,
          tenantBrandName: '品牌A',
          tenantBrandLogoUrl: null,
          totalTableCount: 10,
          occupiedTableCount: 2,
          onlineUserCount: 1,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });

    render(
      <QueryClientProvider client={qc}>
        <PlatformOverviewPage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('平台概览')).toBeInTheDocument());
    expect(screen.getByLabelText('租户')).toBeInTheDocument();

    expect(screen.getByText('二店')).toBeInTheDocument();
    expect(screen.getByText('品牌A')).toBeInTheDocument();

    expect(screen.getByText('占用桌台')).toBeInTheDocument();
    expect(screen.getByText('总桌台')).toBeInTheDocument();
    expect(screen.getByText('在线人数')).toBeInTheDocument();
  });
});
