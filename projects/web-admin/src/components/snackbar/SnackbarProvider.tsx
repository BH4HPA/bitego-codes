import { Alert, Snackbar } from '@mui/material';
import type { AlertColor } from '@mui/material';
import { useCallback, useMemo, useState } from 'react';
import { SnackbarCtx } from './snackbarContext';

type SnackbarItem = { open: boolean; message: string; severity: AlertColor };

export function SnackbarProvider(props: { children: React.ReactNode }) {
  const [item, setItem] = useState<SnackbarItem>({ open: false, message: '', severity: 'success' });

  const showMessage = useCallback((message: string, severity: AlertColor = 'success') => {
    setItem({ open: true, message, severity });
  }, []);

  const api = useMemo(() => ({ showMessage }), [showMessage]);

  return (
    <SnackbarCtx.Provider value={api}>
      {props.children}
      <Snackbar
        open={item.open}
        autoHideDuration={2500}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        onClose={() => setItem((cur) => ({ ...cur, open: false }))}
      >
        <Alert
          severity={item.severity}
          variant="filled"
          onClose={() => setItem((cur) => ({ ...cur, open: false }))}
          sx={{ width: '100%' }}
        >
          {item.message}
        </Alert>
      </Snackbar>
    </SnackbarCtx.Provider>
  );
}
