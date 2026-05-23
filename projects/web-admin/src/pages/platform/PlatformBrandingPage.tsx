import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Upload as UploadIcon,
  FileDownload as ExportIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { queryClient } from '../../app/queryClient';
import { uploadImage } from '../../api/files';
import { exportPlatformSnapshot, importPlatformSnapshot, resetPlatformSnapshot } from '../../api/platformSnapshot';
import { getPlatformBranding, updatePlatformBranding } from '../../api/platformBranding';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { getErrorMessage } from '../../utils/error';

export function PlatformBrandingPage() {
  const snackbar = useSnackbar();
  const confirm = useConfirmDialog();
  const q = useQuery({ queryKey: ['platform_branding'], queryFn: getPlatformBranding });
  const [platformName, setPlatformName] = useState('');
  const [platformLogoUrl, setPlatformLogoUrl] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setPlatformName(q.data.platformName || '');
    setPlatformLogoUrl(q.data.platformLogoUrl || '');
  }, [q.data]);

  const m = useMutation({
    mutationFn: () =>
      updatePlatformBranding({
        platformName: platformName.trim() || undefined,
        platformLogoUrl: platformLogoUrl.trim() ? platformLogoUrl.trim() : null,
      }),
    onSuccess: async () => {
      await q.refetch();
      snackbar.showMessage('已保存');
    },
  });

  const uploadM = useMutation({
    mutationFn: async (file: File) => uploadImage({ file, path: 'platform/branding' }),
    onSuccess: async (r) => {
      setPlatformLogoUrl(r.publicUrl);
      snackbar.showMessage('已上传');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '上传失败')),
  });

  const exportSnapshotM = useMutation({
    mutationFn: () => exportPlatformSnapshot(),
    onSuccess: async (r) => {
      try {
        const filename =
          (() => {
            try {
              const u = new URL(r.url);
              const base = u.pathname.split('/').filter(Boolean).pop();
              return base && base.endsWith('.json') ? base : 'platform-snapshot.json';
            } catch {
              return 'platform-snapshot.json';
            }
          })() || 'platform-snapshot.json';
        const resp = await fetch(r.url);
        if (!resp.ok) throw new Error(`download failed: ${resp.status}`);
        const blob = await resp.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        snackbar.showMessage('已开始下载导出文件');
      } catch {
        snackbar.showMessage('下载失败，已在新标签页打开');
        window.open(r.url, '_blank');
      }
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '导出失败')),
  });
  const resetSnapshotM = useMutation({
    mutationFn: () => resetPlatformSnapshot(),
    onSuccess: async () => {
      snackbar.showMessage('已清空平台数据');
      await queryClient.invalidateQueries();
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '清空失败')),
  });
  const importSnapshotM = useMutation({
    mutationFn: (file: File) => importPlatformSnapshot(file),
    onSuccess: async () => {
      snackbar.showMessage('恢复成功');
      await queryClient.invalidateQueries();
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '恢复失败')),
  });

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        平台管理
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}
          {m.isError ? <Alert severity="error">{getErrorMessage(m.error, '保存失败')}</Alert> : null}
          <TextField
            size="small"
            label="平台名称"
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
          />
          <TextField
            size="small"
            label="平台 Logo URL"
            value={platformLogoUrl}
            onChange={(e) => setPlatformLogoUrl(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              uploadM.mutate(file);
            }}
          />
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" disabled={uploadM.isPending} onClick={() => fileRef.current?.click()}>
              {uploadM.isPending ? '上传中...' : '上传 Logo'}
            </Button>
            <Button variant="contained" disabled={m.isPending || !platformName.trim()} onClick={() => m.mutate()}>
              {m.isPending ? '保存中...' : '保存'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
        平台搬家
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {exportSnapshotM.isError ? (
            <Alert severity="error">{getErrorMessage(exportSnapshotM.error, '导出失败')}</Alert>
          ) : null}
          {importSnapshotM.isError ? (
            <Alert severity="error">{getErrorMessage(importSnapshotM.error, '恢复失败')}</Alert>
          ) : null}
          {resetSnapshotM.isError ? (
            <Alert severity="error">{getErrorMessage(resetSnapshotM.error, '清空失败')}</Alert>
          ) : null}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Button
              variant="contained"
              disabled={exportSnapshotM.isPending}
              onClick={() => setExportDialogOpen(true)}
              startIcon={<ExportIcon />}
            >
              {exportSnapshotM.isPending ? '导出中...' : '导出平台数据'}
            </Button>
            <Button
              variant="outlined"
              component="label"
              disabled={importSnapshotM.isPending}
              startIcon={<UploadIcon />}
              color="warning"
            >
              {importSnapshotM.isPending ? '恢复中...' : '恢复平台数据'}
              <input
                hidden
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!file) return;
                  const ok = await confirm.confirm({
                    title: '确认恢复平台数据？',
                    description: '该操作会覆盖平台所有租户/门店/配置数据，并强制所有用户重新登录。',
                    confirmText: '确认恢复',
                    cancelText: '取消',
                    confirmColor: 'warning',
                  });
                  if (!ok) return;
                  importSnapshotM.mutate(file);
                }}
              />
            </Button>
            <Button
              variant="outlined"
              color="error"
              disabled={resetSnapshotM.isPending}
              startIcon={<DeleteForeverIcon />}
              onClick={async () => {
                const ok = await confirm.confirm({
                  title: '确认清空平台数据？',
                  description: '该操作会清空平台数据，并强制所有用户重新登录。建议先导出备份。',
                  confirmText: '确认清空',
                  cancelText: '取消',
                  confirmColor: 'error',
                });
                if (!ok) return;
                resetSnapshotM.mutate();
              }}
            >
              {resetSnapshotM.isPending ? '清空中...' : '一键清空平台数据'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Dialog
        open={exportDialogOpen}
        onClose={() => (exportSnapshotM.isPending ? null : setExportDialogOpen(false))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>导出选项</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            平台导出为全库逻辑快照（默认排除软删除与审计日志表）。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)} disabled={exportSnapshotM.isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={exportSnapshotM.isPending}
            onClick={() => {
              setExportDialogOpen(false);
              exportSnapshotM.mutate();
            }}
          >
            开始导出
          </Button>
        </DialogActions>
      </Dialog>
      {confirm.dialog}
    </Box>
  );
}
