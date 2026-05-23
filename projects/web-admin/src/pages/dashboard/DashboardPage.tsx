import { Alert, Box, Grid, Stack, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDashboardOverview } from '../../api/dashboard';
import { getOrders, serveOrderItem } from '../../api/orders';
import { clearTable, forceClearTable } from '../../api/tables';
import type { DashboardTableDTO } from '../../api/types';
import { queryClient } from '../../app/queryClient';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { useAdminTableConnCounts } from '../../hooks/useAdminTableConnCounts';
import { useAdminContextStore } from '../../store/adminContext';
import { sendAdminWsMessage } from '../../ws/adminWsClient';
import { ActiveOrdersCard } from './ActiveOrdersCard';
import { AllOrdersCard } from './AllOrdersCard';
import { TablesOverviewCard, type TablesSortKey } from './TablesOverviewCard';
import { useSpeechBroadcast } from './useSpeechBroadcast';

async function copyToClipboard(text: string) {
  const s = String(text || '');
  if (!s) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(s);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = s;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export function DashboardPage() {
  const snackbar = useSnackbar();
  const { counts, connected } = useAdminTableConnCounts();
  const storeId = useAdminContextStore((s) => s.storeId);
  const [sortKey, setSortKey] = useState<TablesSortKey>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { confirm, dialog } = useConfirmDialog();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  const broadcast = useSpeechBroadcast();

  const q = useQuery({
    queryKey: ['dashboard', 'overview', storeId],
    queryFn: getDashboardOverview,
    refetchInterval: connected ? false : 3000,
    enabled: !connected && Boolean(storeId),
  });

  useEffect(() => {
    if (!connected) return;
    sendAdminWsMessage({ type: 'SUBSCRIBE_DASHBOARD_OVERVIEW' });
    return () => sendAdminWsMessage({ type: 'UNSUBSCRIBE_DASHBOARD_OVERVIEW' });
  }, [connected]);

  const invalidateDashboard = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
    sendAdminWsMessage({ type: 'SUBSCRIBE_DASHBOARD_OVERVIEW' });
  }, []);

  const mServe = useMutation({
    mutationFn: (p: { orderId: string; orderItemId: string; mode?: 'SET_ALL' }) =>
      serveOrderItem({ orderId: p.orderId, orderItemId: p.orderItemId, mode: p.mode }),
    onSuccess: async () => {
      await invalidateDashboard();
      snackbar.showMessage('保存成功');
    },
  });

  const mClear = useMutation({
    mutationFn: (tableId: string) => clearTable(tableId),
    onSuccess: async () => {
      await invalidateDashboard();
      snackbar.showMessage('已关台');
    },
  });

  const mForceClear = useMutation({
    mutationFn: (tableId: string) => forceClearTable(tableId),
    onSuccess: async () => {
      await invalidateDashboard();
      snackbar.showMessage('已强制清台');
    },
  });

  const data = q.data;
  const tables = useMemo(() => {
    const list = [...(data?.tables || [])];
    list.sort((a, b) => {
      const codeCmp = String(a.code).localeCompare(String(b.code));
      const withTie = (cmp: number) =>
        cmp !== 0 ? cmp : codeCmp || String(a.tableId).localeCompare(String(b.tableId));
      const numCmp = (av: number, bv: number) => withTie(sortDir === 'asc' ? av - bv : bv - av);

      if (sortKey === 'code') return withTie(sortDir === 'asc' ? codeCmp : -codeCmp);
      if (sortKey === 'online') return numCmp(counts[a.tableId] || 0, counts[b.tableId] || 0);
      if (sortKey === 'activeOrders') return numCmp(a.activeOrders.length || 0, b.activeOrders.length || 0);
      if (sortKey === 'totalOrders') return numCmp(Number(a.totalOrderCount || 0), Number(b.totalOrderCount || 0));
      return numCmp(Number(a.totalAmountExRefunded || 0), Number(b.totalAmountExRefunded || 0));
    });
    return list;
  }, [data?.tables, counts, sortDir, sortKey]);

  const onSort = useCallback((key: TablesSortKey) => {
    setSortKey((curKey) => {
      if (curKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return curKey;
      }
      setSortDir(key === 'code' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null;
    return (data?.tables || []).find((x) => x.tableId === selectedTableId) || null;
  }, [data?.tables, selectedTableId]);
  const selectedTableCode = selectedTable?.code || null;

  const activeOrders = useMemo(() => {
    const list = data?.activeOrders || [];
    if (!selectedTableCode) return list;
    return list.filter((o) => o.tableCode === selectedTableCode);
  }, [data?.activeOrders, selectedTableCode]);

  useEffect(() => {
    setExpandedOrderIds({});
  }, [selectedTableId]);

  const qAllOrders = useQuery({
    queryKey: ['orders', { tableId: selectedTableId, tableSessionVersion: selectedTable?.sessionVersion }],
    queryFn: () =>
      getOrders({
        tableId: selectedTableId || undefined,
        tableSessionVersion: selectedTable?.sessionVersion,
        page: 1,
        pageSize: 100,
      }),
    enabled: Boolean(selectedTableId && selectedTable),
    staleTime: 3000,
  });

  const selectedTableTotalOrderCount = selectedTable?.totalOrderCount;
  useEffect(() => {
    if (!selectedTableId) return;
    void queryClient.invalidateQueries({
      queryKey: ['orders', { tableId: selectedTableId, tableSessionVersion: selectedTable?.sessionVersion }],
    });
  }, [selectedTableId, selectedTable?.sessionVersion, selectedTableTotalOrderCount]);

  const allOrders = useMemo(() => qAllOrders.data?.list || [], [qAllOrders.data?.list]);
  const allOrdersTotals = useMemo(() => {
    let qty = 0;
    let amountCents = 0;
    for (const o of allOrders) {
      if (o.status === 'Refunded') continue;
      qty += Number(o.totalQty || 0);
      amountCents += Number(o.totalAmountCents || 0);
    }
    return { qty, amountCents };
  }, [allOrders]);

  const handleClear = useCallback(
    async (t: DashboardTableDTO) => {
      const ok = await confirm({
        title: '确认关台？',
        description: `将清空购物车并结束当前桌台会话（仅允许在无活跃订单时）。桌号：${t.code}`,
        confirmText: '关台',
        confirmColor: 'warning',
      });
      if (!ok) return;
      mClear.mutate(t.tableId);
    },
    [confirm, mClear],
  );

  const handleForceClear = useCallback(
    async (t: DashboardTableDTO) => {
      const ok = await confirm({
        title: '确认强制清台？',
        description: `将清空购物车并结束当前桌台会话（存在未完成订单也会执行）。桌号：${t.code}`,
        confirmText: '强制清台',
        confirmColor: 'error',
      });
      if (!ok) return;
      mForceClear.mutate(t.tableId);
    },
    [confirm, mForceClear],
  );

  const handleCopyTableId = useCallback(
    async (tableId: string) => {
      try {
        await copyToClipboard(tableId);
        snackbar.showMessage('已复制桌台ID');
      } catch (e) {
        snackbar.showMessage(e instanceof Error ? e.message : '复制失败');
      }
    },
    [snackbar],
  );

  if (q.isLoading) return <Typography>加载中...</Typography>;
  if (q.isError) return <Alert severity="error">{q.error instanceof Error ? q.error.message : '加载失败'}</Alert>;
  if (!q.data) return <Typography>暂无数据</Typography>;

  return (
    <Box sx={{ height: 'calc(100vh - 64px - 32px)', overflow: 'hidden' }}>
      <Grid container spacing={2} sx={{ height: '100%' }}>
        <Grid item xs={12} md={6} sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TablesOverviewCard
            tables={tables}
            counts={counts}
            selectedTableId={selectedTableId}
            onSelectTable={(tableId) => setSelectedTableId((cur) => (cur === tableId ? null : tableId))}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            connected={connected}
            broadcastOn={broadcast.enabled}
            onBroadcastChange={broadcast.setEnabled}
            broadcastSubtitle={broadcast.subtitle}
            onClear={handleClear}
            onForceClear={handleForceClear}
            onCopyTableId={handleCopyTableId}
            clearDisabled={mClear.isPending || mForceClear.isPending}
          />
        </Grid>
        <Grid item xs={12} md={6} sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stack spacing={2} sx={{ height: '100%', minHeight: 0 }}>
            <ActiveOrdersCard
              orders={activeOrders}
              selectedTableCode={selectedTableCode}
              onClearSelection={() => setSelectedTableId(null)}
              serveDisabled={mServe.isPending}
              onServeOne={(orderId, orderItemId) => mServe.mutate({ orderId, orderItemId })}
              onServeAll={(orderId, orderItemId) => mServe.mutate({ orderId, orderItemId, mode: 'SET_ALL' })}
            />

            {selectedTable ? (
              <AllOrdersCard
                orders={allOrders}
                totals={allOrdersTotals}
                isLoading={qAllOrders.isLoading}
                isError={qAllOrders.isError}
                error={qAllOrders.error}
                expandedOrderIds={expandedOrderIds}
                onToggleExpand={(orderId) => setExpandedOrderIds((cur) => ({ ...cur, [orderId]: !cur[orderId] }))}
              />
            ) : null}
          </Stack>
        </Grid>
        {dialog}
      </Grid>
    </Box>
  );
}
