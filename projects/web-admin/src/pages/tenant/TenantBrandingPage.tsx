import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
import {
  exportTenantSnapshot,
  importTenantSnapshot,
  importTenantSnapshotFromStore,
  resetTenantSnapshot,
} from '../../api/tenantSnapshot';
import { getTenantBranding, updateTenantBranding } from '../../api/tenantBranding';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { getErrorMessage } from '../../utils/error';
import { TermHelpIcon, TermTooltip } from '../../components/term-tooltip/TermTooltip';

export function TenantBrandingPage() {
  const snackbar = useSnackbar();
  const confirm = useConfirmDialog();
  const q = useQuery({ queryKey: ['tenant_branding'], queryFn: getTenantBranding });
  const [brandName, setBrandName] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportIncludeInactive, setExportIncludeInactive] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setBrandName(q.data.brandName || '');
    setBrandLogoUrl(q.data.brandLogoUrl || '');
  }, [q.data]);

  const m = useMutation({
    mutationFn: () =>
      updateTenantBranding({
        brandName: brandName.trim() || undefined,
        brandLogoUrl: brandLogoUrl.trim() ? brandLogoUrl.trim() : null,
      }),
    onSuccess: async () => {
      await q.refetch();
      snackbar.showMessage('已保存');
    },
  });

  const uploadM = useMutation({
    mutationFn: async (file: File) => uploadImage({ file, path: 'tenant/branding' }),
    onSuccess: async (r) => {
      setBrandLogoUrl(r.publicUrl);
      snackbar.showMessage('已上传');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '上传失败')),
  });

  const exportSnapshotM = useMutation({
    mutationFn: (p: { includeInactive: boolean }) => exportTenantSnapshot({ includeInactive: p.includeInactive }),
    onSuccess: async (r) => {
      try {
        const filename =
          (() => {
            try {
              const u = new URL(r.publicUrl);
              const base = u.pathname.split('/').filter(Boolean).pop();
              return base && base.endsWith('.json') ? base : 'tenant-snapshot.json';
            } catch {
              return 'tenant-snapshot.json';
            }
          })() || 'tenant-snapshot.json';
        const resp = await fetch(r.publicUrl);
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
        window.open(r.publicUrl, '_blank');
      }
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '导出失败')),
  });
  const resetSnapshotM = useMutation({
    mutationFn: () => resetTenantSnapshot(),
    onSuccess: async () => {
      snackbar.showMessage('已清空租户数据');
      await queryClient.invalidateQueries();
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '清空失败')),
  });
  const importSnapshotM = useMutation({
    mutationFn: (file: File) => importTenantSnapshot(file),
    onSuccess: async () => {
      snackbar.showMessage('恢复成功');
      await queryClient.invalidateQueries();
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '恢复失败')),
  });

  const importFromStoreM = useMutation({
    mutationFn: (file: File) => importTenantSnapshotFromStore(file),
    onSuccess: async () => {
      snackbar.showMessage('恢复成功');
      await queryClient.invalidateQueries();
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '恢复失败')),
  });

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        连锁管理
        <TermHelpIcon term="chainTenant" size={18} />
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}
          {m.isError ? <Alert severity="error">{getErrorMessage(m.error, '保存失败')}</Alert> : null}
          <TextField
            size="small"
            label={<TermTooltip term="brandName" />}
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
          />
          <TextField
            size="small"
            label="品牌 Logo URL"
            value={brandLogoUrl}
            onChange={(e) => setBrandLogoUrl(e.target.value)}
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
            <Button variant="contained" disabled={m.isPending || !brandName.trim()} onClick={() => m.mutate()}>
              {m.isPending ? '保存中...' : '保存'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
        连锁搬家
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
              onClick={() => {
                setExportIncludeInactive(false);
                setExportDialogOpen(true);
              }}
              startIcon={<ExportIcon />}
            >
              {exportSnapshotM.isPending ? '导出中...' : '导出租户数据'}
            </Button>
            <Button
              variant="outlined"
              component="label"
              disabled={importSnapshotM.isPending || importFromStoreM.isPending}
              startIcon={<UploadIcon />}
              color="warning"
            >
              {importSnapshotM.isPending ? '恢复中...' : '恢复租户数据'}
              <input
                hidden
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!file) return;
                  const ok = await confirm.confirm({
                    title: '确认恢复租户数据？',
                    description:
                      '该操作会覆盖当前租户下所有门店的分类/菜品/SKU/桌台等配置，并清理租户内的相关业务数据。',
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
              component="label"
              disabled={importSnapshotM.isPending || importFromStoreM.isPending}
              startIcon={<UploadIcon />}
              color="warning"
            >
              {importFromStoreM.isPending ? '恢复中...' : '从独立门店恢复'}
              <input
                hidden
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!file) return;
                  const ok = await confirm.confirm({
                    title: '确认从独立门店恢复到连锁主店？',
                    description:
                      '该操作会先清空并删除当前租户下所有子门店与旧主店，然后新建一个干净的主门店，并把独立门店导出数据导入到新主门店中。',
                    confirmText: '确认恢复',
                    cancelText: '取消',
                    confirmColor: 'warning',
                  });
                  if (!ok) return;
                  importFromStoreM.mutate(file);
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
                  title: '确认清空租户数据？',
                  description: '该操作会清空当前租户下所有门店的配置与相关业务数据。建议先导出备份。',
                  confirmText: '确认清空',
                  cancelText: '取消',
                  confirmColor: 'error',
                });
                if (!ok) return;
                resetSnapshotM.mutate();
              }}
            >
              {resetSnapshotM.isPending ? '清空中...' : '一键清空租户数据'}
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
            默认不保留已删除/停用的配置项（管理端无恢复入口）。如需审计/回放，可选择保留。
          </Typography>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox checked={exportIncludeInactive} onChange={(e) => setExportIncludeInactive(e.target.checked)} />
            }
            label="保留审计信息（包含已删除/停用配置项）"
          />
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
              exportSnapshotM.mutate({ includeInactive: exportIncludeInactive });
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
