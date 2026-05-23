import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { queryClient } from './app/queryClient';
import { theme } from './app/theme';
import { router } from './router/index';
import { SnackbarProvider } from './components/snackbar/SnackbarProvider';

export default function App() {
  useEffect(() => {
    const handler = () => {
      const p = window.location.pathname;
      if (!p.startsWith('/login')) window.location.assign('/login');
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
}
