import {
  Alert,
  Box,
  Button,
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
  Typography,
} from '@mui/material';
import { nowrapCellSx, stickyRightCellSx, stickyRightHeadCellSx } from '../../components/table/stickyCells';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrders } from '../../api/orders';
import { getErrorMessage } from '../../utils/error';
import { formatCents } from '../../utils/money';
import { labelOrderStatus } from '../../utils/enums';

const statusOptions = ['Paid', 'Making', 'Completed', 'Canceled', 'Refunding', 'Refunded', 'Created'];

export function OrdersListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('');
  const [tableId, setTableId] = useState<string>('');
  const [orderNo, setOrderNo] = useState<string>('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const q = useQuery({
    queryKey: ['orders', { status, tableId, orderNo, page, pageSize }],
    queryFn: () =>
      getOrders({
        status: status || undefined,
        tableId: tableId || undefined,
        orderNo: orderNo.trim() || undefined,
        page: page + 1,
        pageSize,
      }),
  });

  const rows = useMemo(() => q.data?.list || [], [q.data]);
  const total = q.data?.pagination?.total ?? 0;

  useEffect(() => {
    setPage(0);
  }, [orderNo, status, tableId]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6">订单管理</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>状态</InputLabel>
          <Select value={status} label="状态" onChange={(e) => setStatus(String(e.target.value))}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="Paid,Making">已支付 / 制作中</MenuItem>
            {statusOptions.map((s) => (
              <MenuItem key={s} value={s}>
                {labelOrderStatus(s)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="订单号（可选）"
          value={orderNo}
          onChange={(e) => setOrderNo(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <TextField
          size="small"
          label="桌台 ID（可选）"
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          sx={{ minWidth: 280 }}
        />
      </Stack>

      {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}

      <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...nowrapCellSx, minWidth: 220 }}>订单号</TableCell>
              <TableCell sx={nowrapCellSx}>状态</TableCell>
              <TableCell sx={{ ...nowrapCellSx, minWidth: 200 }}>桌台</TableCell>
              <TableCell sx={nowrapCellSx}>金额</TableCell>
              <TableCell align="right" sx={stickyRightHeadCellSx}>
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((o) => (
              <TableRow key={o.orderId}>
                <TableCell sx={nowrapCellSx}>{o.orderNo}</TableCell>
                <TableCell sx={nowrapCellSx}>{labelOrderStatus(o.status)}</TableCell>
                <TableCell sx={nowrapCellSx}>{o.tableId}</TableCell>
                <TableCell sx={nowrapCellSx}>{formatCents(o.totalAmountCents)}</TableCell>
                <TableCell align="right" sx={stickyRightCellSx}>
                  <Button size="small" onClick={() => navigate(`/orders/${o.orderId}`)}>
                    详情
                  </Button>
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
    </Box>
  );
}
