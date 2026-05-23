import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import type { DashboardActiveOrderDTO } from '../../api/types';
import { labelOrderStatus } from '../../utils/enums';

type Props = {
  orders: DashboardActiveOrderDTO[];
  selectedTableCode: string | null;
  onClearSelection: () => void;
  serveDisabled: boolean;
  onServeOne: (orderId: string, orderItemId: string) => void;
  onServeAll: (orderId: string, orderItemId: string) => void;
};

export function ActiveOrdersCard(props: Props) {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">活跃订单</Typography>
        {props.selectedTableCode ? (
          <Chip size="small" label={`桌号：${props.selectedTableCode}`} onDelete={props.onClearSelection} />
        ) : null}
      </Box>
      <Card variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CardContent sx={{ height: '100%', overflow: 'auto' }}>
          {props.orders.length ? (
            <List disablePadding>
              {props.orders.map((o, idx) => (
                <Box key={o.orderId}>
                  {idx ? <Divider sx={{ my: 1 }} /> : null}
                  <Typography variant="subtitle2">
                    {o.tableCode} · {o.orderNo} · {labelOrderStatus(o.status)}
                  </Typography>
                  {o.remark ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                      备注：{o.remark}
                    </Typography>
                  ) : null}
                  {o.pendingItems.length ? (
                    <List dense>
                      {o.pendingItems.map((it) => (
                        <ListItem key={it.orderItemId} disableGutters>
                          <ListItemText
                            primary={`${it.goodNameSnapshot} ${it.specTextSnapshot ? `(${it.specTextSnapshot})` : ''}`}
                            secondary={`待上菜：${it.qty - it.servedQty}`}
                          />
                          <Stack direction="row" spacing={1} sx={{ ml: 1, flexShrink: 0 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={props.serveDisabled}
                              onClick={() => props.onServeOne(o.orderId, it.orderItemId)}
                            >
                              +1
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={props.serveDisabled}
                              onClick={() => props.onServeAll(o.orderId, it.orderItemId)}
                            >
                              上齐
                            </Button>
                          </Stack>
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      无待上菜商品
                    </Typography>
                  )}
                </Box>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {props.selectedTableCode ? '该桌暂无活跃订单' : '暂无活跃订单'}
            </Typography>
          )}
        </CardContent>
      </Card>
    </>
  );
}
