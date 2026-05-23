import {
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { NotificationsNone as NotificationsNoneIcon, DoneAll as DoneAllIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationHandled,
  markNotificationRead,
  NotificationDTO,
} from '../../api/users';
import { queryClient } from '../../app/queryClient';
import { useSnackbar } from '../snackbar/snackbarContext';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminContextStore } from '../../store/adminContext';
import { useAdminWsStore } from '../../store/adminWs';

function formatTime(v?: string) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

type PlatformRestoreWarning =
  | { kind: 'DROPPED_COLUMNS'; table: string; columns: string[] }
  | { kind: 'UNKNOWN_TABLE'; table: string; rowCount: number }
  | { kind: 'MISSING_TABLE'; table: string };

type PlatformRestoreSuccessPayload = { restoredAt?: string; warnings?: PlatformRestoreWarning[] };
type PlatformRestoreFailurePayload = { errorMessage?: string };

function hasDetailView(n: NotificationDTO): boolean {
  if (n.type === 'PLATFORM_RESTORE_SUCCEEDED') {
    const p = n.payload as PlatformRestoreSuccessPayload | null | undefined;
    return Array.isArray(p?.warnings) && p.warnings.length > 0;
  }
  if (n.type === 'PLATFORM_RESTORE_FAILED') {
    const p = n.payload as PlatformRestoreFailurePayload | null | undefined;
    return Boolean(p?.errorMessage);
  }
  return false;
}

function PlatformRestoreDetails({ notification }: { notification: NotificationDTO }) {
  if (notification.type === 'PLATFORM_RESTORE_SUCCEEDED') {
    const payload = (notification.payload as PlatformRestoreSuccessPayload | null | undefined) ?? {};
    const warnings = payload.warnings ?? [];
    return (
      <Stack spacing={2}>
        {payload.restoredAt ? (
          <Typography variant="body2" color="text.secondary">
            完成时间：{formatTime(payload.restoredAt)}
          </Typography>
        ) : null}
        {warnings.length === 0 ? (
          <Typography variant="body2">无警告。</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>类型</TableCell>
                <TableCell>表</TableCell>
                <TableCell>详情</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {warnings.map((w, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Chip size="small" label={w.kind} />
                  </TableCell>
                  <TableCell>
                    <code>{w.table}</code>
                  </TableCell>
                  <TableCell>
                    {w.kind === 'DROPPED_COLUMNS' ? `丢弃列：${w.columns.join(', ')}` : null}
                    {w.kind === 'UNKNOWN_TABLE' ? `跳过 ${w.rowCount} 行（本地模式未注册）` : null}
                    {w.kind === 'MISSING_TABLE' ? '快照未覆盖，已被清空且无数据回填' : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Stack>
    );
  }
  if (notification.type === 'PLATFORM_RESTORE_FAILED') {
    const payload = (notification.payload as PlatformRestoreFailurePayload | null | undefined) ?? {};
    return (
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          backgroundColor: 'action.hover',
          borderRadius: 1,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 13,
        }}
      >
        {payload.errorMessage || '（无错误信息）'}
      </Box>
    );
  }
  return null;
}

export function NotificationsPopover() {
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [detailsFor, setDetailsFor] = useState<NotificationDTO | null>(null);
  const open = Boolean(anchorEl);
  const board = useAdminContextStore((s) => s.board);
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
  const wsConnected = useAdminWsStore((s) => s.connected);
  const wsSupported = useAdminWsStore((s) => s.supported);

  const unreadQ = useQuery({
    queryKey: ['admin_notifications', board, tenantId, storeId, 'UNREAD'],
    queryFn: () => listNotifications({ status: 'UNREAD', page: 1, pageSize: 20 }),
    refetchInterval: wsSupported && wsConnected ? false : 5000,
  });
  const allQ = useQuery({
    queryKey: ['admin_notifications', board, tenantId, storeId, 'ALL'],
    queryFn: () => listNotifications({ page: 1, pageSize: 20 }),
    enabled: open,
  });

  const unreadCount = unreadQ.data?.pagination.total || 0;
  const list = allQ.data?.list || unreadQ.data?.list || [];

  const readM = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin_notifications'],
      });
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '操作失败'),
  });

  const readAllM = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({
        queryKey: ['admin_notifications'],
      });
      snackbar.showMessage(`已标注 ${r.updated} 条通知为已读`);
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '操作失败', 'error'),
  });

  const handledM = useMutation({
    mutationFn: (id: string) => markNotificationHandled(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin_notifications'],
      });
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '操作失败'),
  });

  const title = useMemo(() => (unreadCount ? `通知（${unreadCount} 未读）` : '通知'), [unreadCount]);

  const renderItemActions = (n: NotificationDTO) => {
    const canGoOrder = Boolean(n.orderId);
    const canViewDetails = hasDetailView(n);
    return (
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        {canGoOrder ? (
          <Button
            size="small"
            onClick={async () => {
              if (n.status === 'UNREAD') await readM.mutateAsync(n.notificationId);
              navigate(`/orders/${n.orderId}`);
              setAnchorEl(null);
            }}
          >
            查看订单
          </Button>
        ) : null}
        {canViewDetails ? (
          <Button
            size="small"
            onClick={async () => {
              if (n.status === 'UNREAD') await readM.mutateAsync(n.notificationId);
              setDetailsFor(n);
            }}
          >
            查看详情
          </Button>
        ) : null}
        {n.type === 'REFUND_REQUESTED' ? (
          <Button
            size="small"
            color="warning"
            onClick={async () => {
              await handledM.mutateAsync(n.notificationId);
              if (n.orderId) navigate(`/orders/${n.orderId}`);
              setAnchorEl(null);
            }}
          >
            去处理
          </Button>
        ) : null}
        {n.status === 'UNREAD' ? (
          <Button size="small" onClick={() => readM.mutate(n.notificationId)}>
            标记已读
          </Button>
        ) : null}
      </Stack>
    );
  };

  return (
    <>
      <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
        <Badge color="error" badgeContent={unreadCount} max={99}>
          <NotificationsNoneIcon />
        </Badge>
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 380, maxWidth: '90vw' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {unreadCount ? (
              <Button
                endIcon={<DoneAllIcon />}
                size="small"
                disabled={readAllM.isPending}
                onClick={() => readAllM.mutate()}
              >
                全部已读
              </Button>
            ) : null}
          </Stack>
          <Divider />
          <List dense sx={{ maxHeight: 460, overflow: 'auto' }}>
            {list.map((n) => (
              <ListItem key={n.notificationId} alignItems="flex-start" sx={{ py: 1.2 }}>
                <ListItemText
                  primaryTypographyProps={{ component: 'div' }}
                  secondaryTypographyProps={{ component: 'div' }}
                  primary={
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {n.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTime(n.createdAt)}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {n.message}
                      </Typography>
                      {renderItemActions(n)}
                    </Box>
                  }
                />
              </ListItem>
            ))}
            {!list.length ? <ListItem>暂无通知</ListItem> : null}
          </List>
        </Box>
      </Popover>
      <Dialog open={Boolean(detailsFor)} onClose={() => setDetailsFor(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detailsFor?.title ?? '通知详情'}</DialogTitle>
        <DialogContent dividers>
          {detailsFor ? <PlatformRestoreDetails notification={detailsFor} /> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsFor(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
