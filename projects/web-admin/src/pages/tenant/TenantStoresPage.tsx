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
import { createTenantStore, deleteTenantStore, listTenantStores } from '../../api/tenantStores';
import { queryClient } from '../../app/queryClient';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { TermHelpIcon } from '../../components/term-tooltip/TermTooltip';

export function TenantStoresPage() {
  const snackbar = useSnackbar();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [subName, setSubName] = useState('');

  const q = useQuery({
    queryKey: ['tenant_stores', keyword, page, rowsPerPage],
    queryFn: () => listTenantStores({ keyword: keyword.trim() || undefined, page: page + 1, pageSize: rowsPerPage }),
  });
  const list = q.data?.list || [];
  const total = q.data?.pagination.total || 0;
  const tenantBrandName = list[0]?.tenantBrandName || '';
  const isChainTenant = (list[0]?.tenantType || '') === 'CHAIN';

  const createM = useMutation({
    mutationFn: () => createTenantStore({ name: name.trim(), subName: subName.trim() || null }),
    onSuccess: async () => {
      setCreateOpen(false);
      setName('');
      setSubName('');
      await queryClient.invalidateQueries({ queryKey: ['tenant_stores'] });
      snackbar.showMessage('已创建');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '创建失败'),
  });

  const delM = useMutation({
    mutationFn: (storeId: string) => deleteTenantStore(storeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant_stores'] });
      snackbar.showMessage('已删除');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '删除失败'),
  });

  const canCreate = useMemo(() => name.trim(), [name]);

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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="搜索"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(0);
              }}
              placeholder="storeId/名称/别名"
              size="small"
              sx={{ flex: 1 }}
            />
          </Stack>
          <Divider sx={{ mb: 2 }} />

          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...nowrapCellSx, minWidth: 200 }}>名称</TableCell>
                  <TableCell width={100} sx={nowrapCellSx}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>主店</span>
                      <TermHelpIcon term="primaryStore" />
                    </Stack>
                  </TableCell>
                  <TableCell width={220} sx={nowrapCellSx}>
                    StoreId
                  </TableCell>
                  <TableCell width={120} align="right" sx={stickyRightHeadCellSx}>
                    操作
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((s) => {
                  const displayName = [s.name, s.subName].filter(Boolean).join(' · ') || '-';
                  return (
                    <TableRow key={s.storeId}>
                      <TableCell sx={nowrapCellSx}>
                        <Tooltip title={displayName} arrow>
                          <Box sx={ellipsisBoxSx('100%')}>{displayName}</Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={nowrapCellSx}>{s.isPrimary === 1 ? '是' : '-'}</TableCell>
                      <TableCell sx={nowrapCellSx}>
                        <Tooltip title={s.storeId} arrow>
                          <Box sx={ellipsisBoxSx(220)}>{s.storeId}</Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={stickyRightCellSx}>
                        <Button
                          size="small"
                          color="error"
                          disabled={delM.isPending || s.isPrimary === 1}
                          onClick={() => delM.mutate(s.storeId)}
                        >
                          删除
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!list.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>{q.isLoading ? '加载中...' : '暂无数据'}</TableCell>
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
              label="门店名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              helperText={
                isChainTenant
                  ? `连锁门店对外展示为「${tenantBrandName || '品牌名称'}(${name || '门店名称'})」`
                  : undefined
              }
            />
            <TextField label="别名（可选）" value={subName} onChange={(e) => setSubName(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button variant="contained" disabled={!canCreate || createM.isPending} onClick={() => createM.mutate()}>
            创建
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
