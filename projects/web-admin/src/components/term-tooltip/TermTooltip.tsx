import { Box, Tooltip } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { ReactNode } from 'react';
import { GLOSSARY, type TermKey } from './glossary';

type IconProps = {
  term: TermKey;
  size?: number;
  sx?: Parameters<typeof Box>[0]['sx'];
};

export function TermHelpIcon(props: IconProps) {
  const entry = GLOSSARY[props.term];
  const size = props.size ?? 16;
  return (
    <Tooltip title={entry.description} arrow placement="top">
      <Box
        component="span"
        role="button"
        tabIndex={0}
        aria-label={`${entry.label} 说明`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          color: 'text.secondary',
          opacity: 0.7,
          cursor: 'help',
          lineHeight: 0,
          borderRadius: '50%',
          '&:hover, &:focus-visible': { opacity: 1, color: 'primary.main' },
          '&:focus': { outline: 'none' },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 1,
          },
          ...props.sx,
        }}
      >
        <HelpOutlineIcon sx={{ fontSize: size }} />
      </Box>
    </Tooltip>
  );
}

type LabelProps = {
  term: TermKey;
  label?: ReactNode;
  size?: number;
};

export function TermTooltip(props: LabelProps) {
  const entry = GLOSSARY[props.term];
  const text = props.label ?? entry.label;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <span>{text}</span>
      <TermHelpIcon term={props.term} size={props.size} />
    </Box>
  );
}
