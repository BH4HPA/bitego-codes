import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { useAuthStore } from '../store/auth';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <div>LOGIN</div> },
      {
        element: <RequireAuth />,
        children: [{ path: '/dashboard', element: <div>DASH</div> }],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe('RequireAuth', () => {
  it('redirects to /login when no token', async () => {
    useAuthStore.getState().logout();
    renderAt('/dashboard');
    expect(await screen.findByText('LOGIN')).toBeInTheDocument();
  });

  it('renders content when token exists', async () => {
    useAuthStore.getState().setToken('t1');
    renderAt('/dashboard');
    expect(await screen.findByText('DASH')).toBeInTheDocument();
  });
});
