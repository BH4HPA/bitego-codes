import type { SxProps, Theme } from '@mui/material';

export const stickyRightCellSx: SxProps<Theme> = {
  position: 'sticky',
  right: 0,
  zIndex: 1,
  width: '1%',
  whiteSpace: 'nowrap',
  backgroundColor: 'background.paper',
  boxShadow: (theme) => `inset 1px 0 0 ${theme.palette.divider}`,
};

export const stickyRightHeadCellSx: SxProps<Theme> = {
  position: 'sticky',
  right: 0,
  top: 0,
  zIndex: 3,
  width: '1%',
  whiteSpace: 'nowrap',
  backgroundColor: 'background.paper',
  boxShadow: (theme) => `inset 1px 0 0 ${theme.palette.divider}`,
};

export const ellipsisBoxSx = (maxWidth: number | string): SxProps<Theme> => ({
  maxWidth,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const nowrapCellSx: SxProps<Theme> = {
  whiteSpace: 'nowrap',
};
