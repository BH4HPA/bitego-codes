import { Alert, Box, Button, Card, CardContent, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearTable, forceClearTable, getTable, regenerateTableQrcode, updateTable } from '../../api/tables';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { getErrorMessage } from '../../utils/error';
import { TermHelpIcon, TermTooltip } from '../../components/term-tooltip/TermTooltip';

export function TableDetailPage() {
  const { tableId = '' } = useParams();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const confirm = useConfirmDialog();
  const [envVersion, setEnvVersion] = useState<'release' | 'trial' | 'develop'>('release');
  const [editCode, setEditCode] = useState('');
  const [editStatus, setEditStatus] = useState<'FREE' | 'OCCUPIED'>('FREE');

  const q = useQuery({
    queryKey: ['table', { tableId }],
    queryFn: () => getTable(tableId),
    enabled: Boolean(tableId.trim()),
  });

  const table = q.data;

  useEffect(() => {
    if (!table) return;
    setEditCode(table.code || '');
    setEditStatus(table.status === 'OCCUPIED' ? 'OCCUPIED' : 'FREE');
  }, [table]);

  const updateM = useMutation({
    mutationFn: () => updateTable(tableId, { code: editCode.trim(), status: editStatus }),
    onSuccess: async () => {
      await q.refetch();
      snackbar.showMessage('已保存');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '保存失败')),
  });

  const regenM = useMutation({
    mutationFn: () => regenerateTableQrcode(tableId, { envVersion }),
    onSuccess: async () => {
      await q.refetch();
      snackbar.showMessage('二维码已更新');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '重生成失败')),
  });

  const clearM = useMutation({
    mutationFn: () => clearTable(tableId, { reason: 'web_admin' }),
    onSuccess: async () => {
      await q.refetch();
      snackbar.showMessage('已清台');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '清台失败')),
  });

  const forceClearM = useMutation({
    mutationFn: () => forceClearTable(tableId, { reason: 'web_admin' }),
    onSuccess: async () => {
      await q.refetch();
      snackbar.showMessage('已强制清台');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '强制清台失败')),
  });

  if (!tableId.trim()) {
    return <Alert severity="error">无效的 tableId</Alert>;
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6">桌台详情</Typography>
        <Button variant="outlined" onClick={() => navigate(-1)}>
          返回
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              TableId
            </Typography>
            <Typography variant="body1">{table?.tableId || tableId}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" component="div">
              <TermTooltip term="sessionVersion" />
            </Typography>
            <Typography variant="body1">{table?.sessionVersion ?? '-'}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              二维码
            </Typography>
            {table?.qrcodeUrl ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={() => window.open(table.qrcodeUrl || '', '_blank')}>
                  打开
                </Button>
                <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                  {table.qrcodeUrl}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body1">—</Typography>
            )}
          </Stack>

          <Divider />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label="桌号" value={editCode} onChange={(e) => setEditCode(e.target.value)} sx={{ flex: 1 }} />
            <TextField
              select
              label="状态"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value === 'OCCUPIED' ? 'OCCUPIED' : 'FREE')}
              sx={{ width: 160 }}
            >
              <MenuItem value="FREE">空闲</MenuItem>
              <MenuItem value="OCCUPIED">占用</MenuItem>
            </TextField>
            <Button
              variant="contained"
              disabled={updateM.isPending || !editCode.trim()}
              onClick={() => updateM.mutate()}
            >
              保存
            </Button>
          </Stack>

          <Divider />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <TextField
              select
              label="二维码版本"
              value={envVersion}
              onChange={(e) => {
                const v = String(e.target.value);
                if (v === 'release' || v === 'trial' || v === 'develop') setEnvVersion(v);
              }}
              sx={{ width: 200 }}
            >
              <MenuItem value="release">release</MenuItem>
              <MenuItem value="trial">trial</MenuItem>
              <MenuItem value="develop">develop</MenuItem>
            </TextField>
            <Button variant="outlined" disabled={regenM.isPending} onClick={() => regenM.mutate()}>
              重生成二维码
            </Button>
          </Stack>

          <Divider />

          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button
                color="warning"
                variant="outlined"
                disabled={clearM.isPending}
                onClick={async () => {
                  const ok = await confirm.confirm({
                    title: '确认清台？',
                    description: `tableId=${tableId}`,
                    confirmText: '清台',
                    cancelText: '取消',
                    confirmColor: 'warning',
                  });
                  if (!ok) return;
                  clearM.mutate();
                }}
              >
                清台
              </Button>
              <TermHelpIcon term="clearTable" />
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button
                color="error"
                variant="outlined"
                disabled={forceClearM.isPending}
                onClick={async () => {
                  const ok = await confirm.confirm({
                    title: '确认强制清台？',
                    description: `tableId=${tableId}`,
                    confirmText: '强制清台',
                    cancelText: '取消',
                    confirmColor: 'error',
                  });
                  if (!ok) return;
                  forceClearM.mutate();
                }}
              >
                强制清台
              </Button>
              <TermHelpIcon term="forceClearTable" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
