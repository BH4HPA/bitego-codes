import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminContextStore } from '../../store/adminContext';
import { AutoEntryRedirect } from './AutoEntryRedirect';

const navigateMock = vi.fn();

vi.mock('../../api/adminScopes', () => ({
  getMyAdminScopes: vi.fn(async () => ({
    list: [
      {
        scopeId: 'sc_1',
        tenantId: 'tenant_single',
        storeId: null,
        role: 'TENANT_ADMIN',
        tenantType: 'SINGLE',
        status: 'ACTIVE',
      },
    ],
    platform: null,
    tenants: [
      {
        tenantId: 'tenant_single',
        tenantType: 'SINGLE',
        effectiveRole: 'TENANT_ADMIN',
        canManageSharedCatalog: true,
        stores: [
          {
            storeId: 'store_primary',
            storeIsPrimary: true,
            effectiveRole: 'TENANT_ADMIN',
            canManageSharedCatalog: true,
          },
        ],
      },
    ],
  })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe('AutoEntryRedirect', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    localStorage.clear();
    useAdminContextStore.getState().reset();
  });

  it('redirects SINGLE tenant admin to primary store context', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AutoEntryRedirect />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(useAdminContextStore.getState()).toMatchObject({
        board: 'store',
        tenantId: 'tenant_single',
        storeId: 'store_primary',
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/store/overview', { replace: true });
  });
});
