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
  createPlatformStore,
  deletePlatformStore,
  listPlatformStores,
  updatePlatformStore,
} from '../../api/platformStores';
import { listPlatformTenants } from '../../api/platformTenants';
import { queryClient } from '../../app/queryClient';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { TermHelpIcon } from '../../components/term-tooltip/TermTooltip';

export function PlatformStoresPage() {
  const snackbar = useSnackbar();
  const confirm = useConfirmDialog();
  const [tenantKeyword, setTenantKeyword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [groupByTenant, setGroupByTenant] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTenantKeyword, setNewTenantKeyword] = useState('');
  const [newTenantId, setNewTenantId] = useState('');
  const [newName, setNewName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newIsPrimary, setNewIsPrimary] = useState(false);

  const [editStoreId, setEditStoreId] = useState<string | null>(null);
  const [editTenantType, setEditTenantType] = useState<'SINGLE' | 'CHAIN' | null>(null);
  const [editTenantBrandName, setEditTenantBrandName] = useState<string>('');
  const [editName, setEditName] = useState('');
  const [editSubName, setEditSubName] = useState('');
  const [editIsPrimary, setEditIsPrimary] = useState(false);

  const tenantsQ = useQuery({
    queryKey: ['platform_tenants', 'stores_page', tenantKeyword],
    queryFn: () => listPlatformTenants({ keyword: tenantKeyword.trim() || undefined, page: 1, pageSize: 100 }),
  });
  const tenants = tenantsQ.data?.list || [];
  const tenantById = useMemo(() => {
    const rows = tenantsQ.data?.list || [];
    return new Map(rows.map((t) => [t.tenantId, t]));
  }, [tenantsQ.data?.list]);

  const createTenantsQ = useQuery({
    queryKey: ['platform_tenants', 'stores_create', newTenantKeyword],
    queryFn: () => listPlatformTenants({ keyword: newTenantKeyword.trim() || undefined, page: 1, pageSize: 100 }),
    enabled: createOpen,
  });
  const createTenants = createTenantsQ.data?.list || [];
  const createTenantById = useMemo(() => {
    const rows = createTenantsQ.data?.list || [];
    return new Map(rows.map((t) => [t.tenantId, t]));
  }, [createTenantsQ.data?.list]);
  const selectedCreateTenant = createTenantById.get(newTenantId) || null;

  const q = useQuery({
    queryKey: ['platform_stores', tenantId, keyword, page, rowsPerPage],
    queryFn: () =>
      listPlatformStores({
        tenantId: tenantId.trim() || undefined,
        keyword: keyword.trim() || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      }),
  });
  const list = useMemo(() => q.data?.list || [], [q.data?.list]);
  const total = q.data?.pagination.total || 0;

  const groups = useMemo(() => {
    if (!groupByTenant) return [{ key: 'all', tenantId: null as string | null, list }];
    const by = new Map<string, typeof list>();
    for (const s of list) {
      const tid = s.tenantId || '';
      if (!by.has(tid)) by.set(tid, []);
      by.get(tid)!.push(s);
    }
    return Array.from(by.entries()).map(([tid, items]) => ({
      key: tid || 'unknown',
      tenantId: tid || null,
      list: items,
    }));
  }, [groupByTenant, list]);

  const getTypeLabel = (s: (typeof list)[number]) => {
    if (s.storeType === 'SINGLE_STORE' || s.tenantType === 'SINGLE') return '独立店';
    if (s.storeType === 'CHAIN_PRIMARY') return '连锁主店';
    if (s.storeType === 'CHAIN_BRANCH') return '连锁子店';
    return s.isPrimary === 1 ? '连锁主店' : '连锁子店';
  };
  const getTypeTerm = (label: string): 'singleTenant' | 'primaryStore' => {
    if (label === '独立店') return 'singleTenant';
    return 'primaryStore';
  };

  const createM = useMutation({
    mutationFn: () =>
      createPlatformStore({
        tenantId: newTenantId.trim(),
        name: newName.trim(),
        subName: newSubName.trim() ? newSubName.trim() : null,
        isPrimary: selectedCreateTenant?.type === 'SINGLE' ? 1 : newIsPrimary ? 1 : 0,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setNewTenantId('');
      setNewName('');
      setNewSubName('');
      setNewIsPrimary(false);
      await queryClient.invalidateQueries({ queryKey: ['platform_stores'] });
      snackbar.showMessage('已创建');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '创建失败'),
  });

  const updateM = useMutation({
    mutationFn: () =>
      updatePlatformStore(editStoreId as string, {
        name: editName.trim() || undefined,
        subName: editSubName.trim() ? editSubName.trim() : null,
        isPrimary: editIsPrimary ? 1 : 0,
      }),
    onSuccess: async () => {
      setEditStoreId(null);
      await queryClient.invalidateQueries({ queryKey: ['platform_stores'] });
      snackbar.showMessage('已保存');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '保存失败'),
  });

  const delM = useMutation({
    mutationFn: (storeId: string) => deletePlatformStore(storeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform_stores'] });
      snackbar.showMessage('已删除');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '删除失败'),
  });

  const canCreate = useMemo(() => {
    if (!newTenantId.trim() || !newName.trim()) return false;
    if (selectedCreateTenant?.type === 'SINGLE') return false;
    return true;
  }, [newName, newTenantId, selectedCreateTenant?.type]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          门店管理
          <TermHelpIcon term="store" size={18} />
        </Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>
          新增门店
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="搜索租户"
              value={tenantKeyword}
              onChange={(e) => setTenantKeyword(e.target.value)}
              sx={{ width: 220 }}
            />
            <TextField
              select
              size="small"
              label="租户筛选"
              value={tenantId}
              onChange={(e) => {
                setTenantId(String(e.target.value));
                setPage(0);
              }}
              sx={{ width: 280 }}
            >
              <MenuItem value="">全部租户</MenuItem>
              {tenants.map((t) => (
                <MenuItem key={t.tenantId} value={t.tenantId}>
                  {t.type === 'SINGLE' ? '单店' : '连锁'} · {t.brandName}（{t.tenantId}）
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="展示方式"
              value={groupByTenant ? 'GROUP' : 'LIST'}
              onChange={(e) => setGroupByTenant(String(e.target.value) === 'GROUP')}
              sx={{ width: 200 }}
            >
              <MenuItem value="GROUP">按租户分组</MenuItem>
              <MenuItem value="LIST">不分组</MenuItem>
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
            <Table size="small" sx={{ minWidth: groupByTenant ? 720 : 880 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...nowrapCellSx, minWidth: 200 }}>名称</TableCell>
                  <TableCell width={140} sx={nowrapCellSx}>
                    类型
                  </TableCell>
                  {!groupByTenant ? (
                    <TableCell width={200} sx={nowrapCellSx}>
                      TenantId
                    </TableCell>
                  ) : null}
                  <TableCell width={200} sx={nowrapCellSx}>
                    StoreId
                  </TableCell>
                  <TableCell width={140} align="right" sx={stickyRightHeadCellSx}>
                    操作
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.flatMap((g) => {
                  const t = g.tenantId ? tenantById.get(g.tenantId) : null;
                  const colSpan = groupByTenant ? 4 : 5;
                  const headerRow = groupByTenant ? (
                    <TableRow key={`g_${g.key}`}>
                      <TableCell colSpan={colSpan} sx={{ bgcolor: 'action.hover', fontWeight: 600 }}>
                        {g.tenantId
                          ? `${t?.type === 'SINGLE' ? '单店' : '连锁'} · ${t?.brandName || g.tenantId}（${g.tenantId}）`
                          : '未知租户'}
                      </TableCell>
                    </TableRow>
                  ) : null;
                  const rows = g.list.map((s) => {
                    const displayName = [s.name, s.subName].filter(Boolean).join(' · ') || '-';
                    return (
                      <TableRow key={s.storeId}>
                        <TableCell sx={nowrapCellSx}>
                          <Tooltip title={displayName} arrow>
                            <Box sx={ellipsisBoxSx('100%')}>{displayName}</Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={nowrapCellSx}>
                          {(() => {
                            const label = getTypeLabel(s);
                            return (
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <span>{label}</span>
                                <TermHelpIcon term={getTypeTerm(label)} />
                              </Stack>
                            );
                          })()}
                        </TableCell>
                        {!groupByTenant ? (
                          <TableCell sx={nowrapCellSx}>
                            <Tooltip title={s.tenantId || ''} arrow disableHoverListener={!s.tenantId}>
                              <Box sx={ellipsisBoxSx(200)}>{s.tenantId || '-'}</Box>
                            </Tooltip>
                          </TableCell>
                        ) : null}
                        <TableCell sx={nowrapCellSx}>
                          <Tooltip title={s.storeId} arrow>
                            <Box sx={ellipsisBoxSx(200)}>{s.storeId}</Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right" sx={stickyRightCellSx}>
                          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexWrap: 'nowrap' }}>
                            <Button
                              size="small"
                              onClick={() => {
                                setEditStoreId(s.storeId);
                                setEditTenantType(s.tenantType || null);
                                setEditTenantBrandName(s.tenantBrandName || '');
                                setEditName(s.name || '');
                                setEditSubName(s.subName || '');
                                setEditIsPrimary(s.isPrimary === 1);
                              }}
                            >
                              编辑
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              disabled={delM.isPending || s.storeId === 'store_default'}
                              onClick={async () => {
                                const ok = await confirm.confirm({
                                  title: '确认删除门店？',
                                  description: `storeId=${s.storeId}`,
                                  confirmText: '删除',
                                  cancelText: '取消',
                                  confirmColor: 'error',
                                });
                                if (!ok) return;
                                delM.mutate(s.storeId);
                              }}
                            >
                              删除
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  });
                  return headerRow ? [headerRow, ...rows] : rows;
                })}
                {!list.length ? (
                  <TableRow>
                    <TableCell colSpan={groupByTenant ? 4 : 5}>{q.isLoading ? '加载中...' : '暂无数据'}</TableCell>
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
        <DialogTitle>新增门店</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="搜索租户"
              value={newTenantKeyword}
              onChange={(e) => setNewTenantKeyword(e.target.value)}
              size="small"
            />
            <TextField
              select
              label="选择租户"
              value={newTenantId}
              onChange={(e) => setNewTenantId(String(e.target.value))}
              size="small"
            >
              {createTenants.map((t) => (
                <MenuItem key={t.tenantId} value={t.tenantId}>
                  {t.type === 'SINGLE' ? '单店' : '连锁'} · {t.brandName}（{t.tenantId}）
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="门店名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              helperText={
                selectedCreateTenant?.type === 'CHAIN'
                  ? `连锁门店对外展示为「${selectedCreateTenant?.brandName || '品牌名称'}(${newName || '门店名称'})」`
                  : undefined
              }
            />
            <TextField label="别名（可选）" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} />
            <TextField
              select
              label="类型"
              value={newIsPrimary ? '1' : '0'}
              onChange={(e) => setNewIsPrimary(e.target.value === '1')}
              disabled={selectedCreateTenant?.type === 'SINGLE'}
              SelectProps={{
                renderValue: (v) => {
                  const isSingle = selectedCreateTenant?.type === 'SINGLE';
                  if (isSingle) return '独立店';
                  return v === '1' ? '连锁主店' : '连锁子店';
                },
              }}
            >
              <MenuItem value="0">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>{selectedCreateTenant?.type === 'SINGLE' ? '独立店' : '连锁子店'}</span>
                  <TermHelpIcon term={selectedCreateTenant?.type === 'SINGLE' ? 'singleTenant' : 'primaryStore'} />
                </Stack>
              </MenuItem>
              <MenuItem value="1">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>{selectedCreateTenant?.type === 'SINGLE' ? '独立店' : '连锁主店'}</span>
                  <TermHelpIcon term={selectedCreateTenant?.type === 'SINGLE' ? 'singleTenant' : 'primaryStore'} />
                </Stack>
              </MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button variant="contained" disabled={!canCreate || createM.isPending} onClick={() => createM.mutate()}>
            创建
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editStoreId)}
        onClose={() => {
          setEditStoreId(null);
          setEditTenantType(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>编辑门店</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="StoreId" value={editStoreId || ''} disabled />
            <TextField
              label="门店名称"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              helperText={
                editTenantType === 'CHAIN'
                  ? `连锁门店对外展示为「${editTenantBrandName || '品牌名称'}(${editName || '门店名称'})」`
                  : undefined
              }
            />
            <TextField label="别名（可选）" value={editSubName} onChange={(e) => setEditSubName(e.target.value)} />
            <TextField
              select
              label="类型"
              value={editIsPrimary ? '1' : '0'}
              onChange={(e) => setEditIsPrimary(e.target.value === '1')}
              disabled={editTenantType === 'SINGLE'}
              SelectProps={{
                renderValue: (v) => {
                  const isSingle = editTenantType === 'SINGLE';
                  if (isSingle) return '独立店';
                  return v === '1' ? '连锁主店' : '连锁子店';
                },
              }}
            >
              <MenuItem value="0">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>{editTenantType === 'SINGLE' ? '独立店' : '连锁子店'}</span>
                  <TermHelpIcon term={editTenantType === 'SINGLE' ? 'singleTenant' : 'primaryStore'} />
                </Stack>
              </MenuItem>
              <MenuItem value="1">
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>{editTenantType === 'SINGLE' ? '独立店' : '连锁主店'}</span>
                  <TermHelpIcon term={editTenantType === 'SINGLE' ? 'singleTenant' : 'primaryStore'} />
                </Stack>
              </MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEditStoreId(null);
              setEditTenantType(null);
            }}
          >
            取消
          </Button>
          <Button variant="contained" disabled={updateM.isPending} onClick={() => updateM.mutate()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
      {confirm.dialog}
    </Box>
  );
}
