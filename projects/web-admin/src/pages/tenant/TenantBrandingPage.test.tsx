import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '../../components/snackbar/SnackbarProvider';
import { TenantBrandingPage } from './TenantBrandingPage';

vi.mock('../../components/confirm/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(async () => false), dialog: null }),
}));

function createQC() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(['tenant_branding'], { brandName: '连锁A', brandLogoUrl: '' });
  return qc;
}

describe('TenantBrandingPage', () => {
  it('renders import-from-store action', () => {
    const qc = createQC();
    render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <TenantBrandingPage />
        </QueryClientProvider>
      </SnackbarProvider>,
    );
    expect(screen.getByText('从独立门店恢复')).toBeInTheDocument();
  });
});
