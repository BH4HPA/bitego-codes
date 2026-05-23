import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { ApiRequestError } from '../../api/client';
import {
  getOrder,
  getOrderRefunds,
  requestRefund,
  reviewRefund,
  serveOrderItem,
  updateOrderStatus,
} from '../../api/orders';
import { getErrorMessage } from '../../utils/error';
import { formatCents } from '../../utils/money';
import { labelOrderStatus } from '../../utils/enums';
import { useSnackbar } from '../../components/snackbar/snackbarContext';

export function OrderDetailPage() {
  const navigate = useNavigate();
  const { orderId = '' } = useParams();
  const snackbar = useSnackbar();
  const q = useQuery({ queryKey: ['order', orderId], queryFn: () => getOrder(orderId), enabled: !!orderId });
  const [refundReason, setRefundReason] = useState('');
  const [refundRejectReason, setRefundRejectReason] = useState('');
  const qRefunds = useQuery({
    queryKey: ['order', orderId, 'refunds'],
    queryFn: () => getOrderRefunds(orderId),
    enabled: !!orderId,
  });

  const mStatus = useMutation({
    mutationFn: (p: { status: 'Making' | 'Completed' | 'Canceled' }) =>
      updateOrderStatus(orderId, { status: p.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      snackbar.showMessage('保存成功');
    },
  });

  const mServe = useMutation({
    mutationFn: (p: { orderItemId: string; mode?: 'SET_ALL' }) =>
      serveOrderItem({ orderId, orderItemId: p.orderItemId, mode: p.mode }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
      snackbar.showMessage('保存成功');
    },
  });

  const refundRequestIdRef = useRef<string | null>(null);
  const mRefund = useMutation({
    mutationFn: () => {
      if (!refundRequestIdRef.current) refundRequestIdRef.current = crypto.randomUUID();
      return requestRefund({ orderId, reason: refundReason || undefined, requestId: refundRequestIdRef.current });
    },
    onSuccess: async () => {
      refundRequestIdRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order', orderId, 'refunds'] });
      snackbar.showMessage('保存成功');
    },
    onError: (err) => {
      const serverResponded = err instanceof ApiRequestError || (axios.isAxiosError(err) && Boolean(err.response));
      if (serverResponded) refundRequestIdRef.current = null;
    },
  });

  const mRefundReview = useMutation({
    mutationFn: (p: { refundId: string; decision: 'APPROVE' | 'REJECT'; reason?: string }) =>
      reviewRefund({ orderId, refundId: p.refundId, decision: p.decision, reason: p.reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order', orderId, 'refunds'] });
      snackbar.showMessage('保存成功');
    },
  });

  const order = q.data;
  const items = useMemo(() => order?.items || [], [order]);
  const refunds = useMemo(() => qRefunds.data?.list || [], [qRefunds.data]);
  const activeRefund = refunds.find((r) => r.status === 'REVIEWING' || r.status === 'PENDING') || null;

  const labelRefundStatus = (s: string) => {
    if (s === 'REVIEWING') return '待审核';
    if (s === 'PENDING') return '退款处理中';
    if (s === 'SUCCESS') return '已退款';
    if (s === 'REJECTED') return '已驳回';
    return s;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">订单详情</Typography>
        <Button onClick={() => navigate('/orders')}>返回列表</Button>
      </Box>

      {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}

      {order ? (
        <>
          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle1">
                {order.orderNo} · {labelOrderStatus(order.status)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                金额：{formatCents(order.totalAmountCents)}
              </Typography>
              {order.remark ? (
                <Typography variant="body2" color="text.secondary">
                  备注：{order.remark}
                </Typography>
              ) : null}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  disabled={mStatus.isPending}
                  onClick={() => mStatus.mutate({ status: 'Making' })}
                >
                  标记制作中
                </Button>
                <Button
                  variant="outlined"
                  disabled={mStatus.isPending}
                  onClick={() => mStatus.mutate({ status: 'Completed' })}
                >
                  标记完成
                </Button>
                <Button
                  color="error"
                  variant="outlined"
                  disabled={mStatus.isPending}
                  onClick={() => mStatus.mutate({ status: 'Canceled' })}
                >
                  取消订单
                </Button>
              </Stack>
              {mStatus.isError ? <Alert severity="error">{getErrorMessage(mStatus.error, '操作失败')}</Alert> : null}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1">明细</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>菜品</TableCell>
                    <TableCell width={140}>单价</TableCell>
                    <TableCell width={120}>数量</TableCell>
                    <TableCell width={120}>已上菜</TableCell>
                    <TableCell width={200} align="right">
                      上菜操作
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.orderItemId}>
                      <TableCell>
                        {it.goodNameSnapshot} {it.specTextSnapshot ? `(${it.specTextSnapshot})` : ''}
                      </TableCell>
                      <TableCell>{formatCents(it.unitPriceSnapshotCents)}</TableCell>
                      <TableCell>{it.qty}</TableCell>
                      <TableCell>
                        {it.servedQty}/{it.qty}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          disabled={mServe.isPending}
                          onClick={() => mServe.mutate({ orderItemId: it.orderItemId })}
                        >
                          +1
                        </Button>
                        <Button
                          size="small"
                          disabled={mServe.isPending}
                          onClick={() => mServe.mutate({ orderItemId: it.orderItemId, mode: 'SET_ALL' })}
                        >
                          全部上齐
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {mServe.isError ? <Alert severity="error">{getErrorMessage(mServe.error, '上菜失败')}</Alert> : null}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle1">退款</Typography>
              <Typography variant="body2" color="text.secondary">
                退款接口带幂等头 X-Request-Id（前端自动生成）
              </Typography>
              <Divider sx={{ my: 1 }} />
              {order.status === 'Paid' ? (
                <>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                    <TextField
                      size="small"
                      fullWidth
                      label="退款原因（可选）"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                    <Button
                      variant="contained"
                      disabled={mRefund.isPending}
                      onClick={() => mRefund.mutate()}
                      sx={{ minWidth: 120, whiteSpace: 'nowrap' }}
                    >
                      {mRefund.isPending ? '提交中...' : '发起退款申请'}
                    </Button>
                  </Stack>
                  {mRefund.isError ? (
                    <Alert severity="error">{getErrorMessage(mRefund.error, '提交失败')}</Alert>
                  ) : null}
                </>
              ) : null}

              {order.status === 'Refunding' && activeRefund ? (
                <>
                  <Typography variant="body2" color="text.secondary">
                    当前退款单：{activeRefund.refundId} · {labelRefundStatus(activeRefund.status)}
                  </Typography>
                  {activeRefund.status === 'REVIEWING' ? (
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1}
                      alignItems={{ md: 'center' }}
                      sx={{ mt: 1 }}
                    >
                      <TextField
                        size="small"
                        fullWidth
                        label="驳回原因（驳回时必填）"
                        value={refundRejectReason}
                        onChange={(e) => setRefundRejectReason(e.target.value)}
                      />
                      <Button
                        variant="outlined"
                        disabled={mRefundReview.isPending}
                        onClick={() => mRefundReview.mutate({ refundId: activeRefund.refundId, decision: 'APPROVE' })}
                        sx={{ minWidth: 120, whiteSpace: 'nowrap' }}
                      >
                        通过
                      </Button>
                      <Button
                        color="error"
                        variant="contained"
                        disabled={mRefundReview.isPending || !refundRejectReason.trim()}
                        onClick={() =>
                          mRefundReview.mutate({
                            refundId: activeRefund.refundId,
                            decision: 'REJECT',
                            reason: refundRejectReason.trim(),
                          })
                        }
                        sx={{ minWidth: 120, whiteSpace: 'nowrap' }}
                      >
                        驳回
                      </Button>
                    </Stack>
                  ) : null}
                  {mRefundReview.isError ? (
                    <Alert severity="error">{getErrorMessage(mRefundReview.error, '审核失败')}</Alert>
                  ) : null}
                </>
              ) : null}

              {refunds.length ? (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2">退款记录</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>退款单号</TableCell>
                        <TableCell width={120}>状态</TableCell>
                        <TableCell>申请原因</TableCell>
                        <TableCell>驳回原因</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {refunds.map((r) => (
                        <TableRow key={r.refundId}>
                          <TableCell>{r.refundId}</TableCell>
                          <TableCell>{labelRefundStatus(r.status)}</TableCell>
                          <TableCell>{r.reason || '-'}</TableCell>
                          <TableCell>{r.reviewRejectReason || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </Box>
  );
}
