import {
  Avatar,
  Box,
  Card,
  CardContent,
  Divider,
  Grid,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getTenantOverviewStores } from '../../api/overviewStores';
import { queryClient } from '../../app/queryClient';
import { useAdminWsStore } from '../../store/adminWs';

export function TenantOverviewPage() {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const wsConnected = useAdminWsStore((s) => s.connected);
  const connSeq = useAdminWsStore((s) => s.tableConnCountsSeq);
  const statusSeq = useAdminWsStore((s) => s.tableStatusSeq);
  const refetchTimerRef = useRef<number | null>(null);
  const lastRefetchAtRef = useRef(0);

  const q = useQuery({
    queryKey: ['tenant_overview_stores', keyword, page, rowsPerPage],
    queryFn: () =>
      getTenantOverviewStores({
        keyword: keyword.trim() || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      }),
  });

  const list = q.data?.list || [];
  const total = q.data?.pagination.total || 0;

  useEffect(() => {
    if (!wsConnected) return;
    const now = Date.now();
    const minInterval = 1500;
    const since = now - lastRefetchAtRef.current;
    const run = () => {
      lastRefetchAtRef.current = Date.now();
      void queryClient.invalidateQueries({ queryKey: ['tenant_overview_stores'] });
    };
    if (since >= minInterval) {
      run();
      return;
    }
    if (refetchTimerRef.current) return;
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null;
      run();
    }, minInterval - since);
    return () => {
      if (refetchTimerRef.current) window.clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = null;
    };
  }, [connSeq, statusSeq, wsConnected]);

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        连锁概览
      </Typography>
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
              size="small"
              sx={{ flex: 1 }}
            />
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            {list.map((s) => (
              <Grid key={s.storeId} item xs={12} sm={6} md={4} lg={3}>
                <Card variant="outlined">
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar variant="rounded" src={(s.logoUrl || '') as string} sx={{ width: 44, height: 44 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" noWrap>
                          {[s.name, s.subName].filter(Boolean).join(' · ') || '-'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {s.storeId}
                        </Typography>
                      </Box>
                    </Stack>
                    <Divider />
                    <Stack direction="row" spacing={1} justifyContent="space-between">
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          占用桌台
                        </Typography>
                        <Typography variant="h6">{s.occupiedTableCount}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          总桌台
                        </Typography>
                        <Typography variant="h6">{s.totalTableCount}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          在线人数
                        </Typography>
                        <Typography variant="h6">{s.onlineUserCount || 0}</Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
            {!list.length ? (
              <Grid item xs={12}>
                <Box sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
                  {q.isLoading ? '加载中...' : '暂无数据'}
                </Box>
              </Grid>
            ) : null}
          </Grid>
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
    </Box>
  );
}
