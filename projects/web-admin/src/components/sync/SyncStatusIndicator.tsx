import SyncIcon from '@mui/icons-material/Sync';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import {
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { getStoreById } from '../../api/stores';
import { getMyAdminScopes } from '../../api/adminScopes';
import { getTenantSyncSharedCatalogStatus, triggerTenantSyncSharedCatalog } from '../../api/tenantSync';
import { listTenantStores } from '../../api/tenantStores';
import { useAdminContextStore } from '../../store/adminContext';
import { getAdminCapabilities } from '../../authz/adminAuthz';
import { useAdminWsStore } from '../../store/adminWs';
import { useSnackbar } from '../snackbar/snackbarContext';
import { queryClient } from '../../app/queryClient';
import { sendAdminWsMessage } from '../../ws/adminWsClient';
import { TermHelpIcon } from '../term-tooltip/TermTooltip';

type ViewState = 'synced' | 'dirty' | 'syncing' | 'failed' | 'unknown';

function getJobCount(counts: Record<string, number> | undefined, key: string) {
  return Number(counts?.[key] || 0);
}

export function SyncStatusIndicator() {
  const snackbar = useSnackbar();
  const board = useAdminContextStore((s) => s.board);
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
  const wsConnected = useAdminWsStore((s) => s.connected);
  const scopesQ = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: getMyAdminScopes });

  const caps = useMemo(
    () => getAdminCapabilities({ scopes: scopesQ.data?.list || [], tenantId, storeId }),
    [scopesQ.data?.list, storeId, tenantId],
  );
  const canAccessSync = caps.canAccessTenant;

  const tenantStoresQ = useQuery({
    queryKey: ['tenant_stores', 'sync_indicator'],
    queryFn: () => listTenantStores({ page: 1, pageSize: 200 }),
    enabled: board === 'tenant' && Boolean(tenantId) && canAccessSync,
  });
  const tenantPrimaryStoreId = useMemo(() => {
    const rows = tenantStoresQ.data?.list || [];
    return rows.find((s) => Number(s.isPrimary || 0) === 1)?.storeId || '';
  }, [tenantStoresQ.data?.list]);

  const effectiveStoreId = board === 'tenant' ? tenantPrimaryStoreId : storeId || '';
  const storeQ = useQuery({
    queryKey: ['store', { storeId: effectiveStoreId }],
    queryFn: () => getStoreById(effectiveStoreId),
    enabled: board === 'store' && Boolean(effectiveStoreId) && canAccessSync,
  });

  const enabled = Boolean(
    effectiveStoreId && canAccessSync && (board === 'tenant' || Number(storeQ.data?.isPrimary || 0) === 1),
  );

  const statusQ = useQuery({
    queryKey: ['tenantSyncStatus', { tenantId: tenantId || '', storeId: effectiveStoreId }],
    queryFn: () => getTenantSyncSharedCatalogStatus(),
    enabled: enabled && !(wsConnected && Boolean(effectiveStoreId)),
    refetchInterval: wsConnected ? false : 30_000,
  });

  const status = statusQ.data;

  useEffect(() => {
    if (!enabled) return;
    if (!wsConnected) return;
    if (!effectiveStoreId) return;
    sendAdminWsMessage({ type: 'SUBSCRIBE_TENANT_SYNC_STATUS', storeId: effectiveStoreId });
    return () => sendAdminWsMessage({ type: 'UNSUBSCRIBE_TENANT_SYNC_STATUS' });
  }, [effectiveStoreId, enabled, wsConnected]);

  const view = useMemo<ViewState>(() => {
    if (!enabled) return 'unknown';
    if (statusQ.isLoading) return 'unknown';
    const counts = status?.jobSummary?.counts || {};
    const running = getJobCount(counts, 'RUNNING') + getJobCount(counts, 'PENDING');
    const failed = getJobCount(counts, 'FAILED');
    if (running > 0) return 'syncing';
    if (failed > 0) return 'failed';
    if (status?.dirty) return 'dirty';
    return 'synced';
  }, [enabled, statusQ.isLoading, status?.dirty, status?.jobSummary?.counts]);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const triggerM = useMutation({
    mutationFn: () => triggerTenantSyncSharedCatalog(),
    onSuccess: async (r) => {
      snackbar.showMessage(r.enqueued ? `已提交同步任务（${r.enqueued} 家门店）` : '无需同步', 'success');
      await queryClient.invalidateQueries({ queryKey: ['tenantSyncStatus'] });
      sendAdminWsMessage({ type: 'SUBSCRIBE_TENANT_SYNC_STATUS', storeId: effectiveStoreId });
    },
    onError: (e: unknown) => {
      snackbar.showMessage(e instanceof Error ? e.message : '提交同步失败', 'error');
    },
  });

  if (!enabled) return null;

  const counts = status?.jobSummary?.counts || {};
  const tooltip = status
    ? `待同步：${status.dirty ? '是' : '否'}；未同步变更：${Object.values(status.summary || {}).reduce(
        (a, b) => a + b,
        0,
      )}；上次同步：${status.jobSummary?.lastSyncedAt || '—'}`
    : '加载中';

  const chipSxByColor = {
    info: {
      bgcolor: 'rgba(255,255,255,0.92)',
      border: '1px solid',
      borderColor: 'info.main',
      color: 'info.main',
      '& .MuiChip-icon': { color: 'info.main' },
      '&:hover': { bgcolor: 'rgba(255,255,255,1) !important' },
    },
    error: {
      bgcolor: 'rgba(255,255,255,0.92)',
      border: '1px solid',
      borderColor: 'error.main',
      color: 'error.main',
      '& .MuiChip-icon': { color: 'error.main' },
      '&:hover': { bgcolor: 'rgba(255,255,255,1) !important' },
    },
    warning: {
      bgcolor: 'rgba(255,255,255,0.92)',
      border: '1px solid',
      borderColor: 'warning.main',
      color: 'warning.main',
      '& .MuiChip-icon': { color: 'warning.main' },
      '&:hover': { bgcolor: 'rgba(255,255,255,1) !important' },
    },
    success: {
      bgcolor: 'rgba(255,255,255,0.92)',
      border: '1px solid',
      borderColor: 'success.main',
      color: 'success.main',
      '& .MuiChip-icon': { color: 'success.main' },
      '&:hover': { bgcolor: 'rgba(255,255,255,1) !important' },
    },
  } as const;

  const chip = (() => {
    if (view === 'syncing') {
      return (
        <Chip
          size="small"
          icon={<CircularProgress size={14} />}
          label="同步中"
          color="default"
          variant="filled"
          sx={chipSxByColor.info}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        />
      );
    }
    if (view === 'failed') {
      return (
        <Badge color="error" variant="dot">
          <Chip
            size="small"
            icon={<ErrorOutlineIcon />}
            label="同步失败"
            color="default"
            variant="filled"
            sx={chipSxByColor.error}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          />
        </Badge>
      );
    }
    if (view === 'dirty') {
      return (
        <Badge color="error" variant="dot">
          <Chip
            size="small"
            icon={<WarningAmberIcon />}
            label="待同步"
            color="default"
            variant="filled"
            sx={chipSxByColor.warning}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          />
        </Badge>
      );
    }
    return (
      <Chip
        size="small"
        icon={<CheckCircleOutlineIcon />}
        label="已同步"
        color="default"
        variant="filled"
        sx={chipSxByColor.success}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      />
    );
  })();

  return (
    <>
      <Tooltip title={tooltip}>
        <Box>{chip}</Box>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 420, p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <SyncIcon fontSize="small" />
              <Typography variant="subtitle1">共享数据同步</Typography>
              <TermHelpIcon term="sharedDataSync" />
            </Stack>
            <Button
              size="small"
              variant="contained"
              disabled={triggerM.isPending || view === 'syncing'}
              onClick={() => triggerM.mutate()}
            >
              立即同步
            </Button>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Stack spacing={1}>
            <Typography variant="body2">
              未同步变更：{Object.values(status?.summary || {}).reduce((a, b) => a + b, 0)} 条
            </Typography>
            <Typography variant="body2">
              任务状态：PENDING {getJobCount(counts, 'PENDING')} / RUNNING {getJobCount(counts, 'RUNNING')} / SUCCEEDED{' '}
              {getJobCount(counts, 'SUCCEEDED')} / FAILED {getJobCount(counts, 'FAILED')}
            </Typography>
            <Typography variant="body2">上次同步：{status?.jobSummary?.lastSyncedAt || '—'}</Typography>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            最近未同步变更（最多 10 条）
          </Typography>
          <List dense sx={{ maxHeight: 240, overflow: 'auto', p: 0 }}>
            {(status?.recentChanges || []).map((c) => (
              <ListItem key={c.id} sx={{ px: 0 }}>
                <ListItemText
                  primary={`${c.entityType} ${c.action} · ${c.name}`}
                  secondary={c.changedAt || ''}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
            {!status?.recentChanges?.length ? (
              <ListItem sx={{ px: 0 }}>
                <ListItemText primary="暂无" primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            ) : null}
          </List>
        </Box>
      </Popover>
    </>
  );
}
