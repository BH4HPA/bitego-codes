import { Box, Dialog, DialogContent } from '@mui/material';
import { useState } from 'react';

export function ImagePreview(props: { src: string; alt?: string; height?: number }) {
  const [open, setOpen] = useState(false);
  const h = props.height || 56;
  if (!props.src) return null;
  return (
    <>
      <Box
        component="img"
        src={props.src}
        alt={props.alt || ''}
        draggable={false}
        sx={{
          height: h,
          width: h,
          objectFit: 'cover',
          borderRadius: 1,
          cursor: 'pointer',
          border: '1px solid rgba(0,0,0,0.12)',
        }}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg">
        <DialogContent sx={{ p: 1 }}>
          <Box
            component="img"
            src={props.src}
            alt={props.alt || ''}
            draggable={false}
            sx={{ maxWidth: '80vw', maxHeight: '80vh' }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
