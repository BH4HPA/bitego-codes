import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ellipsisBoxSx,
  nowrapCellSx,
  stickyRightCellSx,
  stickyRightHeadCellSx,
} from '../../components/table/stickyCells';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import {
  createTable,
  forceClearTable,
  getTables,
  regenerateTableH5Qrcode,
  regenerateTableQrcode,
  updateTable,
} from '../../api/tables';
import type { TableDTO } from '../../api/types';
import { getErrorMessage } from '../../utils/error';
import { labelTableStatus } from '../../utils/enums';
import { ImagePreview } from '../../components/image/ImagePreview';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { TermHelpIcon, TermTooltip } from '../../components/term-tooltip/TermTooltip';

type EditorState =
  | { open: false }
  | { open: true; mode: 'create'; init: { code: string } }
  | { open: true; mode: 'edit'; init: { tableId: string; code: string } };

type QrcodeDialogState = { open: false } | { open: true; tableId: string; code: string };

export function TablesPage() {
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [qrcodeDialog, setQrcodeDialog] = useState<QrcodeDialogState>({ open: false });
  const confirmDialog = useConfirmDialog();

  const q = useQuery({
    queryKey: ['tables', { status, page, pageSize }],
    queryFn: () => getTables({ status: status || undefined, page: page + 1, pageSize }),
  });

  const rows = useMemo(() => q.data?.list || [], [q.data]);
  const total = q.data?.pagination?.total ?? 0;

  useEffect(() => {
    setPage(0);
  }, [status]);

  const mCreate = useMutation({
    mutationFn: (p: { code: string }) => createTable({ code: p.code, status: 'FREE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      setEditor({ open: false });
      snackbar.showMessage('保存成功');
    },
  });

  const mUpdate = useMutation({
    mutationFn: (p: { tableId: string; code: string }) => updateTable(p.tableId, { code: p.code }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      setEditor({ open: false });
      snackbar.showMessage('保存成功');
    },
  });

  const mSetStatus = useMutation({
    mutationFn: (p: { tableId: string; status: string }) => updateTable(p.tableId, { status: p.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
      snackbar.showMessage('保存成功');
    },
  });

  const mForceClear = useMutation({
    mutationFn: (tableId: string) => forceClearTable(tableId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
      snackbar.showMessage('保存成功');
    },
  });

  const mRegenQrcode = useMutation({
    mutationFn: (p: { tableId: string; envVersion: 'release' | 'trial' | 'develop' }) =>
      regenerateTableQrcode(p.tableId, { envVersion: p.envVersion }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      setQrcodeDialog({ open: false });
      snackbar.showMessage('二维码已更新');
    },
  });

  const mRegenH5Qrcode = useMutation({
    mutationFn: (p: { tableId: string }) => regenerateTableH5Qrcode(p.tableId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      snackbar.showMessage('二维码已更新');
    },
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">桌台管理</Typography>
        <Button variant="contained" onClick={() => setEditor({ open: true, mode: 'create', init: { code: '' } })}>
          新增桌台
        </Button>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>状态</InputLabel>
          <Select value={status} label="状态" onChange={(e) => setStatus(String(e.target.value))}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="FREE">空闲</MenuItem>
            <MenuItem value="OCCUPIED">占用</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}

      <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1080 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={nowrapCellSx}>桌号</TableCell>
              <TableCell width={200} sx={nowrapCellSx}>
                桌台ID
              </TableCell>
              <TableCell sx={nowrapCellSx}>状态</TableCell>
              <TableCell sx={nowrapCellSx}>
                <TermTooltip term="sessionVersion" />
              </TableCell>
              <TableCell sx={nowrapCellSx}>小程序码</TableCell>
              <TableCell sx={nowrapCellSx}>H5 二维码</TableCell>
              <TableCell align="right" sx={stickyRightHeadCellSx}>
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((t: TableDTO) => (
              <TableRow key={t.tableId}>
                <TableCell sx={nowrapCellSx}>{t.code}</TableCell>
                <TableCell sx={nowrapCellSx}>
                  <Tooltip title={`点击复制 ${t.tableId}`} arrow>
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(t.tableId);
                          snackbar.showMessage('已复制桌台 ID');
                        } catch {
                          snackbar.showMessage('复制失败');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        void (async () => {
                          try {
                            await navigator.clipboard.writeText(t.tableId);
                            snackbar.showMessage('已复制桌台 ID');
                          } catch {
                            snackbar.showMessage('复制失败');
                          }
                        })();
                      }}
                      sx={{
                        ...ellipsisBoxSx(200),
                        color: 'text.secondary',
                        cursor: 'pointer',
                      }}
                    >
                      {t.tableId}
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={nowrapCellSx}>{labelTableStatus(t.status)}</TableCell>
                <TableCell sx={nowrapCellSx}>{t.sessionVersion}</TableCell>
                <TableCell sx={nowrapCellSx}>
                  {t.qrcodeUrl ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ImagePreview src={t.qrcodeUrl} alt={`${t.code} 二维码`} height={72} />
                      <Stack direction="column" spacing={0.5} alignItems="flex-start">
                        <Button
                          size="small"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(t.qrcodeUrl || '');
                              snackbar.showMessage('已复制');
                            } catch {
                              snackbar.showMessage('复制失败');
                            }
                          }}
                        >
                          复制
                        </Button>
                        <Button size="small" onClick={() => window.open(t.qrcodeUrl || '', '_blank')}>
                          打开
                        </Button>
                        <Button
                          size="small"
                          disabled={mRegenQrcode.isPending}
                          onClick={() => setQrcodeDialog({ open: true, tableId: t.tableId, code: t.code })}
                        >
                          重新生成
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        -
                      </Typography>
                      <Button
                        size="small"
                        disabled={mRegenQrcode.isPending}
                        onClick={() => setQrcodeDialog({ open: true, tableId: t.tableId, code: t.code })}
                      >
                        生成
                      </Button>
                    </Stack>
                  )}
                </TableCell>
                <TableCell sx={nowrapCellSx}>
                  {t.h5QrcodeUrl ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ImagePreview src={t.h5QrcodeUrl} alt={`${t.code} H5 二维码`} height={72} />
                      <Stack direction="column" spacing={0.5} alignItems="flex-start">
                        <Button
                          size="small"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(t.h5QrcodeUrl || '');
                              snackbar.showMessage('已复制');
                            } catch {
                              snackbar.showMessage('复制失败');
                            }
                          }}
                        >
                          复制
                        </Button>
                        <Button size="small" onClick={() => window.open(t.h5QrcodeUrl || '', '_blank')}>
                          打开
                        </Button>
                        <Button
                          size="small"
                          disabled={mRegenH5Qrcode.isPending}
                          onClick={() => mRegenH5Qrcode.mutate({ tableId: t.tableId })}
                        >
                          重新生成
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        -
                      </Typography>
                      <Button
                        size="small"
                        disabled={mRegenH5Qrcode.isPending}
                        onClick={() => mRegenH5Qrcode.mutate({ tableId: t.tableId })}
                      >
                        生成
                      </Button>
                    </Stack>
                  )}
                </TableCell>
                <TableCell align="right" sx={stickyRightCellSx}>
                  <Stack direction="column" spacing={0.5} alignItems="flex-end">
                    <Button size="small" onClick={() => navigate(`/store/tables/${encodeURIComponent(t.tableId)}`)}>
                      详情
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        setEditor({ open: true, mode: 'edit', init: { tableId: t.tableId, code: t.code } })
                      }
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      disabled={mSetStatus.isPending}
                      onClick={() =>
                        mSetStatus.mutate({ tableId: t.tableId, status: t.status === 'FREE' ? 'OCCUPIED' : 'FREE' })
                      }
                    >
                      {t.status === 'FREE' ? '标记占用' : '标记空闲'}
                    </Button>
                    {t.status !== 'FREE' ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Button
                          size="small"
                          color="error"
                          disabled={mForceClear.isPending}
                          onClick={() => {
                            void (async () => {
                              const ok = await confirmDialog.confirm({
                                title: '确认强制清台',
                                description: `确认强制清台「${t.code}」？`,
                                confirmText: '确认清台',
                                confirmColor: 'error',
                              });
                              if (ok) mForceClear.mutate(t.tableId);
                            })();
                          }}
                        >
                          强制清台
                        </Button>
                        <TermHelpIcon term="forceClearTable" />
                      </Stack>
                    ) : null}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={pageSize}
        onPageChange={(_, next) => setPage(next)}
        onRowsPerPageChange={(e) => {
          const next = parseInt(e.target.value, 10) || 10;
          setPageSize(next);
          setPage(0);
        }}
        rowsPerPageOptions={[10, 20, 50, 100]}
        labelRowsPerPage="每页"
      />

      {confirmDialog.dialog}

      <TableEditorDialog
        state={editor}
        onClose={() => setEditor({ open: false })}
        submitting={mCreate.isPending || mUpdate.isPending}
        onSubmit={(p) => {
          if (p.mode === 'create') mCreate.mutate({ code: p.code });
          else mUpdate.mutate({ tableId: p.tableId, code: p.code });
        }}
        errorMessage={
          mCreate.error ? getErrorMessage(mCreate.error) : mUpdate.error ? getErrorMessage(mUpdate.error) : null
        }
      />

      <QrcodeRegenerateDialog
        state={qrcodeDialog}
        submitting={mRegenQrcode.isPending}
        onClose={() => setQrcodeDialog({ open: false })}
        onSubmit={(p) => mRegenQrcode.mutate(p)}
        errorMessage={mRegenQrcode.error ? getErrorMessage(mRegenQrcode.error) : null}
      />
    </Box>
  );
}

function TableEditorDialog(props: {
  state: EditorState;
  onClose: () => void;
  onSubmit: (payload: { mode: 'create'; code: string } | { mode: 'edit'; tableId: string; code: string }) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const open = props.state.open;
  const init = props.state.open ? props.state.init : null;
  const [code, setCode] = useState(init?.code || '');

  useEffect(() => {
    if (!open || !init) return;
    setCode(init.code);
  }, [open, init]);

  const title = !open ? '' : props.state.mode === 'create' ? '新增桌台' : '编辑桌台';

  return (
    <Dialog open={open} onClose={() => (props.submitting ? null : props.onClose())} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {props.errorMessage ? <Alert severity="error">{props.errorMessage}</Alert> : null}
          <TextField size="small" label="桌号" value={open ? code : ''} onChange={(e) => setCode(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={props.submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={props.submitting || !code.trim()}
          onClick={() => {
            if (!open) return;
            if (props.state.mode === 'create') props.onSubmit({ mode: 'create', code: code.trim() });
            else props.onSubmit({ mode: 'edit', tableId: props.state.init.tableId, code: code.trim() });
          }}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function QrcodeRegenerateDialog(props: {
  state: QrcodeDialogState;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { tableId: string; envVersion: 'release' | 'trial' | 'develop' }) => void;
  errorMessage: string | null;
}) {
  const open = props.state.open;
  const init = props.state.open ? props.state : null;
  const [envVersion, setEnvVersion] = useState<'release' | 'trial' | 'develop'>('release');

  useEffect(() => {
    if (!open) return;
    setEnvVersion('release');
  }, [open]);

  return (
    <Dialog open={open} onClose={props.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>重新生成桌台二维码</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            桌台：{init?.code || ''}（{init?.tableId || ''}）
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>envVersion</InputLabel>
            <Select
              value={envVersion}
              label="envVersion"
              onChange={(e) => {
                const v = String(e.target.value || '');
                if (v === 'release' || v === 'trial' || v === 'develop') setEnvVersion(v);
              }}
            >
              <MenuItem value="release">release</MenuItem>
              <MenuItem value="trial">trial</MenuItem>
              <MenuItem value="develop">develop</MenuItem>
            </Select>
          </FormControl>
          {props.errorMessage ? <Alert severity="error">{props.errorMessage}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={props.submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={props.submitting || !init?.tableId}
          onClick={() => {
            if (!init?.tableId) return;
            props.onSubmit({ tableId: init.tableId, envVersion });
          }}
        >
          生成
        </Button>
      </DialogActions>
    </Dialog>
  );
}
