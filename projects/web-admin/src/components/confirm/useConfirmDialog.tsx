import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useCallback, useMemo, useRef, useState } from 'react';

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
};

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setOpen(false);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.(result);
  }, []);

  const dialog = useMemo(() => {
    const title = options?.title || '';
    const description = options?.description || '';
    const confirmText = options?.confirmText || '确认';
    const cancelText = options?.cancelText || '取消';
    const confirmColor = options?.confirmColor || 'primary';
    return (
      <Dialog open={open} onClose={() => close(false)} fullWidth maxWidth="xs">
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button onClick={() => close(false)}>{cancelText}</Button>
          <Button variant="contained" color={confirmColor} onClick={() => close(true)}>
            {confirmText}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }, [close, open, options]);

  return { confirm, dialog };
}
