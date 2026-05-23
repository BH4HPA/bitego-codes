import {
  Alert,
  Box,
  Card,
  CardContent,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useQuery } from '@tanstack/react-query';
import { getOrder } from '../../api/orders';
import type { OrderListItemDTO } from '../../api/types';
import { formatCents } from '../../utils/money';
import { labelOrderStatus } from '../../utils/enums';

const stickyHeadCellSx = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  whiteSpace: 'nowrap',
  backgroundColor: 'background.paper',
} as const;

const nowrapBodyCellSx = { whiteSpace: 'nowrap' } as const;

function formatDateTime(dt: string | null) {
  if (!dt) return '-';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return new Intl.DateTimeFormat('zh-CN', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

type Totals = { qty: number; amountCents: number };

type Props = {
  orders: OrderListItemDTO[];
  totals: Totals;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  expandedOrderIds: Record<string, boolean>;
  onToggleExpand: (orderId: string) => void;
};

export function AllOrdersCard(props: Props) {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">所有订单</Typography>
        <Typography variant="body2" color="text.secondary">
          总数量：{props.totals.qty} · 总金额：{formatCents(props.totals.amountCents)}
        </Typography>
      </Box>
      <Card variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CardContent sx={{ p: 0, height: '100%', '&:last-child': { pb: 0 } }}>
          {props.isError ? (
            <Alert severity="error" sx={{ m: 2 }}>
              {props.error instanceof Error ? props.error.message : '加载失败'}
            </Alert>
          ) : (
            <TableContainer sx={{ maxHeight: '100%' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={44} sx={stickyHeadCellSx} />
                    <TableCell width={80} sx={stickyHeadCellSx}>
                      序号
                    </TableCell>
                    <TableCell width={160} sx={stickyHeadCellSx}>
                      下单时间
                    </TableCell>
                    <TableCell width={90} sx={stickyHeadCellSx}>
                      数量
                    </TableCell>
                    <TableCell width={120} sx={stickyHeadCellSx}>
                      金额
                    </TableCell>
                    <TableCell width={120} sx={stickyHeadCellSx}>
                      状态
                    </TableCell>
                    <TableCell sx={stickyHeadCellSx}>备注</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {props.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          加载中...
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : props.orders.length ? (
                    props.orders.map((o, idx) => (
                      <DashboardOrderRow
                        key={o.orderId}
                        index={idx + 1}
                        order={o}
                        expanded={Boolean(props.expandedOrderIds[o.orderId])}
                        onToggleExpanded={() => props.onToggleExpand(o.orderId)}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          暂无订单
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function DashboardOrderRow(props: {
  index: number;
  order: OrderListItemDTO;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const qDetail = useQuery({
    queryKey: ['order', props.order.orderId],
    queryFn: () => getOrder(props.order.orderId),
    enabled: props.expanded,
    staleTime: 0,
  });
  const remark = String(props.order.remark || '').trim();
  const dt = props.order.paidAt || props.order.createdAt;
  const qty = Number(props.order.totalQty || 0);

  return (
    <>
      <TableRow hover>
        <TableCell width={44}>
          <IconButton size="small" onClick={props.onToggleExpanded}>
            {props.expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell width={60} sx={nowrapBodyCellSx}>
          {props.index}
        </TableCell>
        <TableCell width={160} sx={nowrapBodyCellSx}>
          <Typography variant="body2" noWrap>
            {formatDateTime(dt)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {props.order.orderNo}
          </Typography>
        </TableCell>
        <TableCell width={90} sx={nowrapBodyCellSx}>
          {qty}
        </TableCell>
        <TableCell width={120} sx={nowrapBodyCellSx}>
          {formatCents(props.order.totalAmountCents)}
        </TableCell>
        <TableCell width={120} sx={nowrapBodyCellSx}>
          {labelOrderStatus(props.order.status)}
        </TableCell>
        <TableCell sx={nowrapBodyCellSx}>
          {remark ? (
            <Tooltip title={remark} placement="top" arrow>
              <Box
                sx={{
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {remark}
              </Box>
            </Tooltip>
          ) : (
            '-'
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0 }}>
          <Collapse in={props.expanded} timeout="auto" unmountOnExit>
            <Box>
              {qDetail.isLoading ? (
                <Typography variant="body2" color="text.secondary">
                  加载中...
                </Typography>
              ) : qDetail.isError ? (
                <Alert severity="error">{qDetail.error instanceof Error ? qDetail.error.message : '加载失败'}</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>菜品</TableCell>
                      <TableCell>规格</TableCell>
                      <TableCell width={100}>单价</TableCell>
                      <TableCell width={80}>数量</TableCell>
                      <TableCell width={80}>已上</TableCell>
                      <TableCell width={120}>小计</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(qDetail.data?.items || []).map((it) => (
                      <TableRow key={it.orderItemId}>
                        <TableCell>{it.goodNameSnapshot}</TableCell>
                        <TableCell>{it.specTextSnapshot || '-'}</TableCell>
                        <TableCell>{formatCents(it.unitPriceSnapshotCents)}</TableCell>
                        <TableCell>{it.qty}</TableCell>
                        <TableCell>{it.servedQty}</TableCell>
                        <TableCell>{formatCents(it.unitPriceSnapshotCents * it.qty)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
