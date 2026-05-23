import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { useAuthStore } from '../../store/auth';

vi.mock('../../api/auth', () => ({
  login: vi.fn(async () => ({ token: 't1' })),
}));

vi.mock('../../api/platformBranding', () => ({
  getPlatformBranding: vi.fn(async () => ({ platformName: 'P', platformLogoUrl: null })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ state: null }),
  };
});

describe('LoginPage', () => {
  it('stores token on successful login', async () => {
    useAuthStore.setState({ token: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LoginPage />
      </QueryClientProvider>,
    );
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('');
    fireEvent.submit(screen.getByRole('button', { name: '登录' }).closest('form')!);
    await waitFor(() => expect(useAuthStore.getState().token).toBe('t1'));
  });
});
