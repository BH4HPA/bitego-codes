import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '../components/snackbar/SnackbarProvider';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

export function renderWithProviders(ui: React.ReactElement, opts?: { route?: string; queryClient?: QueryClient }) {
  const qc = opts?.queryClient || createTestQueryClient();
  const route = opts?.route || '/';
  return {
    qc,
    ...render(
      <SnackbarProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </SnackbarProvider>,
    ),
  };
}
