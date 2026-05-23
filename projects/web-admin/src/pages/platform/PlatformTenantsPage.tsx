import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
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
import { useMemo, useState } from 'react';
import {
  createPlatformTenant,
  deletePlatformTenant,
  listPlatformTenants,
  updatePlatformTenant,
} from '../../api/platformTenants';
import { queryClient } from '../../app/queryClient';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { TermHelpIcon, TermTooltip } from '../../components/term-tooltip/TermTooltip';

export function PlatformTenantsPage() {
  const snackbar = useSnackbar();
  const confirm = useConfirmDialog();
  const [type, setType] = useState<'ALL' | 'SINGLE' | 'CHAIN'>('ALL');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState<'SINGLE' | 'CHAIN'>('CHAIN');
  const [brandName, setBrandName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [createdTenantAdmin, setCreatedTenantAdmin] = useState<{
    tenantId: string;
    primaryStoreId: string;
  } | null>(null);

  const [editTenantId, setEditTenantId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [editBrandLogoUrl, setEditBrandLogoUrl] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');

  const q = useQuery({
    queryKey: ['platform_tenants', type, status, keyword, page, rowsPerPage],
    queryFn: () =>
      listPlatformTenants({
        type: type === 'ALL' ? undefined : type,
        status: status === 'ALL' ? undefined : status,
        keyword: keyword.trim() || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      }),
  });
  const list = q.data?.list || [];
  const total = q.data?.pagination.total || 0;

  const createM = useMutation({
    mutationFn: () =>
      createPlatformTenant({
        type: newType,
        brandName: (newType === 'SINGLE' ? storeName.trim() : brandName.trim()) || '',
        storeName: storeName.trim() || undefined,
      }),
    onSuccess: async (data) => {
      setCreateOpen(false);
      setBrandName('');
      setStoreName('');
      await queryClient.invalidateQueries({ queryKey: ['platform_tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin_scopes', 'me'] });
      snackbar.showMessage('已创建');
      setCreatedTenantAdmin({
        tenantId: data.tenantId,
        primaryStoreId: data.primaryStoreId,
      });
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '创建失败'),
  });

  const updateM = useMutation({
    mutationFn: () =>
      updatePlatformTenant(editTenantId as string, {
        brandName: editBrandName.trim() || undefined,
        brandLogoUrl: editBrandLogoUrl.trim() ? editBrandLogoUrl.trim() : null,
        status: editStatus,
      }),
    onSuccess: async () => {
      setEditTenantId(null);
      await queryClient.invalidateQueries({ queryKey: ['platform_tenants'] });
      snackbar.showMessage('已保存');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '保存失败'),
  });

  const delM = useMutation({
    mutationFn: (tenantId: string) => deletePlatformTenant(tenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform_tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin_scopes', 'me'] });
      snackbar.showMessage('已删除');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '删除失败'),
  });

  const canCreate = useMemo(
    () => (newType === 'SINGLE' ? storeName.trim() : brandName.trim()),
    [brandName, newType, storeName],
  );

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          租户管理
          <TermHelpIcon term="tenant" size={18} />
        </Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>
          新增租户
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              select
              label="类型"
              size="small"
              sx={{ width: 160 }}
              value={type}
              onChange={(e) => {
                const v = String(e.target.value);
                if (v === 'ALL' || v === 'CHAIN' || v === 'SINGLE') setType(v);
                setPage(0);
              }}
            >
              <MenuItem value="ALL">全部</MenuItem>
              <MenuItem value="CHAIN">连锁</MenuItem>
              <MenuItem value="SINGLE">单店</MenuItem>
            </TextField>
            <TextField
              select
              label="状态"
              size="small"
              sx={{ width: 160 }}
              value={status}
              onChange={(e) => {
                const v = String(e.target.value);
                if (v === 'ALL' || v === 'ACTIVE' || v === 'DISABLED') setStatus(v);
                setPage(0);
              }}
            >
              <MenuItem value="ALL">全部</MenuItem>
              <MenuItem value="ACTIVE">启用</MenuItem>
              <MenuItem value="DISABLED">禁用</MenuItem>
            </TextField>
            <TextField
              label="搜索"
              size="small"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(0);
              }}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Divider sx={{ mb: 2 }} />

          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...nowrapCellSx, minWidth: 200 }}>品牌</TableCell>
                  <TableCell width={110} sx={nowrapCellSx}>
                    类型
                  </TableCell>
                  <TableCell width={90} sx={nowrapCellSx}>
                    状态
                  </TableCell>
                  <TableCell sx={{ ...nowrapCellSx, minWidth: 160 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>主门店</span>
                      <TermHelpIcon term="primaryStore" />
                    </Stack>
                  </TableCell>
                  <TableCell width={220} sx={nowrapCellSx}>
                    TenantId
                  </TableCell>
                  <TableCell width={140} align="right" sx={stickyRightHeadCellSx}>
                    操作
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((t) => {
                  const primaryStoreLabel = t.primaryStoreName || t.primaryStoreId || '-';
                  const primaryStoreTooltip = t.primaryStoreId
                    ? t.primaryStoreName
                      ? `${t.primaryStoreName}（${t.primaryStoreId}）`
                      : t.primaryStoreId
                    : '';
                  return (
                    <TableRow key={t.tenantId}>
                      <TableCell sx={nowrapCellSx}>
                        <Tooltip title={t.brandName || ''} arrow disableHoverListener={!t.brandName}>
                          <Box sx={ellipsisBoxSx('100%')}>{t.brandName || '-'}</Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={nowrapCellSx}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <span>{t.type === 'CHAIN' ? '连锁' : '单店'}</span>
                          <TermHelpIcon term={t.type === 'CHAIN' ? 'chainTenant' : 'singleTenant'} />
                        </Stack>
                      </TableCell>
                      <TableCell sx={nowrapCellSx}>{t.status === 'ACTIVE' ? '启用' : '禁用'}</TableCell>
                      <TableCell sx={nowrapCellSx}>
                        {t.primaryStoreId ? (
                          <Tooltip title={primaryStoreTooltip} arrow>
                            <Box sx={ellipsisBoxSx('100%')}>{primaryStoreLabel}</Box>
                          </Tooltip>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell sx={nowrapCellSx}>
                        <Tooltip title={t.tenantId} arrow>
                          <Box sx={ellipsisBoxSx(220)}>{t.tenantId}</Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={stickyRightCellSx}>
                        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexWrap: 'nowrap' }}>
                          <Button
                            size="small"
                            disabled={t.tenantId === 'store_default'}
                            onClick={() => {
                              setEditTenantId(t.tenantId);
                              setEditBrandName(t.brandName || '');
                              setEditBrandLogoUrl(t.brandLogoUrl || '');
                              setEditStatus(t.status);
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            disabled={delM.isPending || t.tenantId === 'store_default'}
                            onClick={async () => {
                              const ok = await confirm.confirm({
                                title: '确认删除租户？',
                                description: `tenantId=${t.tenantId}（将软删租户、门店与授权）`,
                                confirmText: '删除',
                                cancelText: '取消',
                                confirmColor: 'error',
                              });
                              if (!ok) return;
                              delM.mutate(t.tenantId);
                            }}
                          >
                            删除
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!list.length ? (
                  <TableRow>
                    <TableCell colSpan={6}>{q.isLoading ? '加载中...' : '暂无数据'}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="每页"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count}`}
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>新增租户</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="类型"
              value={newType}
              onChange={(e) => {
                const v = String(e.target.value);
                if (v === 'CHAIN' || v === 'SINGLE') setNewType(v);
              }}
              SelectProps={{
                renderValue: (v) => (v === 'CHAIN' ? '连锁' : '单店'),
              }}
            >
              <MenuItem value="CHAIN">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>连锁</span>
                  <TermHelpIcon term="chainTenant" />
                </Stack>
              </MenuItem>
              <MenuItem value="SINGLE">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>单店</span>
                  <TermHelpIcon term="singleTenant" />
                </Stack>
              </MenuItem>
            </TextField>
            {newType === 'CHAIN' ? (
              <TextField
                label={<TermTooltip term="brandName" />}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            ) : null}
            <TextField
              label={newType === 'SINGLE' ? '店铺名称' : '主门店名称（可选）'}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button variant="contained" disabled={!canCreate || createM.isPending} onClick={() => createM.mutate()}>
            创建
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editTenantId)} onClose={() => setEditTenantId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>编辑租户</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="TenantId" value={editTenantId || ''} disabled />
            <TextField
              label={<TermTooltip term="brandName" />}
              value={editBrandName}
              onChange={(e) => setEditBrandName(e.target.value)}
            />
            <TextField
              label="品牌 Logo URL（可选）"
              value={editBrandLogoUrl}
              onChange={(e) => setEditBrandLogoUrl(e.target.value)}
            />
            <TextField
              select
              label="状态"
              value={editStatus}
              onChange={(e) => {
                const v = String(e.target.value);
                if (v === 'ACTIVE' || v === 'DISABLED') setEditStatus(v);
              }}
            >
              <MenuItem value="ACTIVE">启用</MenuItem>
              <MenuItem value="DISABLED">禁用</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTenantId(null)}>取消</Button>
          <Button variant="contained" disabled={updateM.isPending} onClick={() => updateM.mutate()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(createdTenantAdmin)} onClose={() => setCreatedTenantAdmin(null)} maxWidth="xs" fullWidth>
        <DialogTitle>创建成功</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              TenantId / 主门店
            </Typography>
            <Typography variant="body1">
              {createdTenantAdmin?.tenantId} / {createdTenantAdmin?.primaryStoreId}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setCreatedTenantAdmin(null)}>
            确定
          </Button>
        </DialogActions>
      </Dialog>
      {confirm.dialog}
    </Box>
  );
}
