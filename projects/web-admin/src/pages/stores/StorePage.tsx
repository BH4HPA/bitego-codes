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
import { useEffect, useState } from 'react';
import { queryClient } from '../../app/queryClient';
import { uploadImage } from '../../api/files';
import {
  exportStoreConfig,
  getCurrentStore,
  importStoreConfig,
  resetStoreConfig,
  updateCurrentStore,
} from '../../api/stores';
import { getErrorMessage } from '../../utils/error';
import { ImagePreview } from '../../components/image/ImagePreview';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { useAdminContextStore } from '../../store/adminContext';
import { TermHelpIcon } from '../../components/term-tooltip/TermTooltip';

export function StorePage() {
  const storeId = useAdminContextStore((s) => s.storeId);
  const q = useQuery({
    queryKey: ['store', 'current', storeId],
    queryFn: getCurrentStore,
    enabled: Boolean(storeId),
  });
  const isIndependentStore = q.data?.tenantType === 'SINGLE';
  const isChainTenant = q.data?.tenantType === 'CHAIN';
  const snackbar = useSnackbar();
  const confirm = useConfirmDialog();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportIncludeInactive, setExportIncludeInactive] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setName(q.data.name || '');
    setLogoUrl(q.data.logoUrl || '');
    setPhone(q.data.phone || '');
    setAddress(q.data.address || '');
    setDescription(q.data.description || '');
  }, [q.data]);

  const mUpload = useMutation({
    mutationFn: (file: File) => uploadImage({ file, path: 'stores' }),
    onSuccess: (r) => {
      setLogoUrl(r.publicUrl);
      snackbar.showMessage('上传成功');
    },
  });

  const mSave = useMutation({
    mutationFn: () =>
      updateCurrentStore({
        name: name.trim(),
        // Chain tenants: store logo is managed by tenant brand logo; don't send it.
        ...(isChainTenant ? {} : { logoUrl: logoUrl.trim() }),
        phone: phone.trim(),
        address: address.trim(),
        description: description.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['store', 'current'] });
      snackbar.showMessage('保存成功');
    },
  });

  const mExport = useMutation({
    mutationFn: (p: { includeInactive: boolean }) => exportStoreConfig({ includeInactive: p.includeInactive }),
    onSuccess: async (r) => {
      try {
        const filename =
          (() => {
            try {
              const u = new URL(r.publicUrl);
              const base = u.pathname.split('/').filter(Boolean).pop();
              return base && base.endsWith('.json') ? base : 'store-export.json';
            } catch {
              return 'store-export.json';
            }
          })() || 'store-export.json';
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
  });

  const mImport = useMutation({
    mutationFn: (file: File) => importStoreConfig(file),
    onSuccess: (r) => {
      snackbar.showMessage('恢复成功');
      void queryClient.invalidateQueries();
      void r;
    },
  });

  const mReset = useMutation({
    mutationFn: resetStoreConfig,
    onSuccess: async () => {
      snackbar.showMessage('已清空全店数据');
      await queryClient.invalidateQueries();
    },
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        门店管理
        <TermHelpIcon term="store" size={18} />
      </Typography>
      {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1">门店信息</Typography>
          {mSave.isError ? <Alert severity="error">{getErrorMessage(mSave.error, '保存失败')}</Alert> : null}
          <TextField
            size="small"
            label="门店名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText={
              isChainTenant
                ? `连锁门店对外展示为「${q.data?.tenantBrandName || '品牌名称'}(${name || '门店名称'})」`
                : undefined
            }
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            {logoUrl ? <ImagePreview src={logoUrl} alt="门店 Logo" /> : null}
            <TextField
              size="small"
              fullWidth
              label="Logo URL"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              disabled={isChainTenant}
              helperText={isChainTenant ? '连锁门店 Logo 由品牌 Logo 统一管理，请在租户品牌设置中修改' : undefined}
            />
            <Button
              variant="outlined"
              component="label"
              disabled={mUpload.isPending || isChainTenant}
              sx={{ minWidth: 120, whiteSpace: 'nowrap' }}
            >
              {mUpload.isPending ? '上传中...' : '上传 Logo'}
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) mUpload.mutate(file);
                }}
              />
            </Button>
          </Stack>
          {mUpload.isError ? <Alert severity="error">{getErrorMessage(mUpload.error, '上传失败')}</Alert> : null}
          <TextField size="small" label="联系电话" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField size="small" label="地址" value={address} onChange={(e) => setAddress(e.target.value)} />
          <TextField
            size="small"
            label="描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
          />
          <Button variant="contained" disabled={mSave.isPending || !name.trim()} onClick={() => mSave.mutate()}>
            {mSave.isPending ? '保存中...' : '保存'}
          </Button>
        </CardContent>
      </Card>

      {!isIndependentStore ? null : (
        <Card variant="outlined">
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle1">门店搬家</Typography>
            {mExport.isError ? <Alert severity="error">{getErrorMessage(mExport.error, '导出失败')}</Alert> : null}
            {mImport.isError ? <Alert severity="error">{getErrorMessage(mImport.error, '恢复失败')}</Alert> : null}
            {mReset.isError ? <Alert severity="error">{getErrorMessage(mReset.error, '清空失败')}</Alert> : null}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Button
                variant="contained"
                disabled={mExport.isPending}
                onClick={() => {
                  setExportIncludeInactive(false);
                  setExportDialogOpen(true);
                }}
                startIcon={<ExportIcon />}
              >
                {mExport.isPending ? '导出中...' : '导出全店配置'}
              </Button>
              <Button
                variant="outlined"
                component="label"
                disabled={mImport.isPending}
                startIcon={<UploadIcon />}
                color="warning"
              >
                {mImport.isPending ? '恢复中...' : '恢复全店配置'}
                <input
                  hidden
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (!file) return;
                    const ok = await confirm.confirm({
                      title: '确认恢复全店配置？',
                      description:
                        '该操作会覆盖当前分类/菜品/SKU/桌台/门店信息，并清空订单等历史数据（不影响管理员账号）。',
                      confirmText: '确认恢复',
                      cancelText: '取消',
                      confirmColor: 'warning',
                    });
                    if (!ok) return;
                    mImport.mutate(file);
                  }}
                />
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={mReset.isPending}
                startIcon={<DeleteForeverIcon />}
                onClick={async () => {
                  const ok = await confirm.confirm({
                    title: '确认清空全店数据？',
                    description:
                      '该操作会清空当前分类/菜品/SKU/桌台等配置，并清空订单等历史数据（不影响管理员账号）。如需恢复，请先执行导出。',
                    confirmText: '确认清空',
                    cancelText: '取消',
                    confirmColor: 'error',
                  });
                  if (!ok) return;
                  mReset.mutate();
                }}
              >
                {mReset.isPending ? '清空中...' : '一键清空全店数据'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Dialog
        open={exportDialogOpen}
        onClose={() => (mExport.isPending ? null : setExportDialogOpen(false))}
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
          <Button onClick={() => setExportDialogOpen(false)} disabled={mExport.isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={mExport.isPending}
            onClick={() => {
              setExportDialogOpen(false);
              mExport.mutate({ includeInactive: exportIncludeInactive });
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
