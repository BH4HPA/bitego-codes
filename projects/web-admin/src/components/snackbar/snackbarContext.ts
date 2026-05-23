import type { AlertColor } from '@mui/material';
import { createContext, useContext } from 'react';

export type SnackbarApi = {
  showMessage: (message: string, severity?: AlertColor) => void;
};

export const SnackbarCtx = createContext<SnackbarApi | null>(null);

export function useSnackbar() {
  const ctx = useContext(SnackbarCtx);
  if (!ctx) throw new Error('SnackbarProvider is missing');
  return ctx;
}
