import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ChipProps } from '@mui/material/Chip';
import type { DashboardTableDTO } from '../../api/types';
import { formatCents } from '../../utils/money';
import { labelTableStatus } from '../../utils/enums';
import { TermHelpIcon } from '../../components/term-tooltip/TermTooltip';

export type TablesSortKey = 'code' | 'online' | 'activeOrders' | 'totalOrders' | 'totalAmount';

type Props = {
  tables: DashboardTableDTO[];
  counts: Record<string, number>;
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
  sortKey: TablesSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: TablesSortKey) => void;
  connected: boolean;
  broadcastOn: boolean;
  onBroadcastChange: (next: boolean) => void;
  broadcastSubtitle: string;
  onClear: (table: DashboardTableDTO) => void;
  onForceClear: (table: DashboardTableDTO) => void;
  onCopyTableId: (tableId: string) => void;
  clearDisabled: boolean;
};

function statusColor(status: string): ChipProps['color'] {
  if (status === 'OCCUPIED') return 'warning';
  if (status === 'FREE') return 'success';
  return 'default';
}

const stickyHeadCellSx = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  backgroundColor: 'background.paper',
} as const;

const stickyHeadActionCellSx = {
  position: 'sticky',
  top: 0,
  right: 0,
  zIndex: 4,
  width: '1%',
  whiteSpace: 'nowrap',
  backgroundColor: 'background.paper',
  boxShadow: (theme: { palette: { divider: string } }) => `inset 1px 0 0 ${theme.palette.divider}`,
} as const;

const stickyBodyActionCellSx = {
  position: 'sticky',
  right: 0,
  zIndex: 1,
  width: '1%',
  whiteSpace: 'nowrap',
  backgroundColor: 'background.paper',
  boxShadow: (theme: { palette: { divider: string } }) => `inset 1px 0 0 ${theme.palette.divider}`,
} as const;

const headSortLabelSx = {
  maxWidth: '100%',
  minWidth: 0,
  whiteSpace: 'nowrap',
  '& .MuiTableSortLabel-icon': { flexShrink: 0 },
} as const;

const headSortTextSx = {
  display: 'block',
  maxWidth: '100%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

function SortableHeaderCell(props: {
  label: string;
  width: number;
  sortKey: TablesSortKey;
  activeKey: TablesSortKey;
  dir: 'asc' | 'desc';
  defaultDir?: 'asc' | 'desc';
  onSort: (key: TablesSortKey) => void;
}) {
  const active = props.activeKey === props.sortKey;
  return (
    <TableCell
      width={props.width}
      sortDirection={active ? props.dir : false}
      sx={{ ...stickyHeadCellSx, whiteSpace: 'nowrap' }}
    >
      <Tooltip title={props.label} arrow>
        <TableSortLabel
          active={active}
          direction={active ? props.dir : props.defaultDir || 'asc'}
          onClick={() => props.onSort(props.sortKey)}
          sx={headSortLabelSx}
        >
          <Box component="span" sx={headSortTextSx}>
            {props.label}
          </Box>
        </TableSortLabel>
      </Tooltip>
    </TableCell>
  );
}

export function TablesOverviewCard(props: Props) {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">桌台总览</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControlLabel
            control={<Switch checked={props.broadcastOn} onChange={(e) => props.onBroadcastChange(e.target.checked)} />}
            label="播报"
          />
          <Typography variant="body2" color="text.secondary">
            实时连接：{props.connected ? '已连接' : '未连接'}
          </Typography>
        </Stack>
      </Box>
      {props.broadcastOn && props.broadcastSubtitle ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          {props.broadcastSubtitle}
        </Alert>
      ) : null}
      <Card variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CardContent sx={{ p: 0, height: '100%', '&:last-child': { pb: 0 } }}>
          <TableContainer sx={{ maxHeight: '100%' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <SortableHeaderCell
                    label="桌号"
                    width={80}
                    sortKey="code"
                    activeKey={props.sortKey}
                    dir={props.sortDir}
                    onSort={props.onSort}
                  />
                  <TableCell width={120} sx={stickyHeadCellSx}>
                    <Box sx={headSortLabelSx}>状态</Box>
                  </TableCell>
                  <SortableHeaderCell
                    label="在线"
                    width={140}
                    sortKey="online"
                    defaultDir="desc"
                    activeKey={props.sortKey}
                    dir={props.sortDir}
                    onSort={props.onSort}
                  />
                  <TableCell width={140} sx={stickyHeadCellSx}>
                    <Box sx={headSortLabelSx}>购物车</Box>
                  </TableCell>
                  <SortableHeaderCell
                    label="待完成"
                    width={140}
                    sortKey="activeOrders"
                    defaultDir="desc"
                    activeKey={props.sortKey}
                    dir={props.sortDir}
                    onSort={props.onSort}
                  />
                  <SortableHeaderCell
                    label="总订单"
                    width={140}
                    sortKey="totalOrders"
                    defaultDir="desc"
                    activeKey={props.sortKey}
                    dir={props.sortDir}
                    onSort={props.onSort}
                  />
                  <SortableHeaderCell
                    label="总金额"
                    width={140}
                    sortKey="totalAmount"
                    defaultDir="desc"
                    activeKey={props.sortKey}
                    dir={props.sortDir}
                    onSort={props.onSort}
                  />
                  <TableCell align="center" sx={stickyHeadActionCellSx}>
                    <Box sx={headSortLabelSx}>操作</Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {props.tables.map((t) => {
                  const cartCount = t.cart?.items?.reduce((a, b) => a + b.qty, 0) || 0;
                  const activeOrderCount = t.activeOrders.length;
                  const onlineCount = props.counts[t.tableId] || 0;
                  const totalOrderCount = t.totalOrderCount || 0;
                  const totalAmountExRefundedCents = Number(t.totalAmountExRefunded || 0);
                  const canClear = activeOrderCount === 0 && t.status === 'OCCUPIED';
                  const isSelected = props.selectedTableId === t.tableId;
                  return (
                    <TableRow
                      key={t.tableId}
                      hover
                      selected={isSelected}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => props.onSelectTable(t.tableId)}
                    >
                      <TableCell>
                        <Tooltip title={`${t.code}(${t.tableId})`} arrow>
                          <div
                            style={{
                              width: 80,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                            }}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onCopyTableId(t.tableId);
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter' && e.key !== ' ') return;
                              e.preventDefault();
                              e.stopPropagation();
                              props.onCopyTableId(t.tableId);
                            }}
                          >
                            {t.code}
                          </div>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={labelTableStatus(t.status)} color={statusColor(t.status)} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {onlineCount}
                        </Typography>
                      </TableCell>
                      <TableCell>{cartCount}</TableCell>
                      <TableCell>{activeOrderCount}</TableCell>
                      <TableCell>{totalOrderCount}</TableCell>
                      <TableCell>{formatCents(totalAmountExRefundedCents)}</TableCell>
                      <TableCell sx={stickyBodyActionCellSx}>
                        <Stack direction="row" spacing={0.25} alignItems="center">
                          {canClear ? (
                            <>
                              <Button
                                size="small"
                                variant="text"
                                disabled={props.clearDisabled}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onClear(t);
                                }}
                              >
                                关台
                              </Button>
                              <Box
                                component="span"
                                onClick={(e) => e.stopPropagation()}
                                sx={{ display: 'inline-flex' }}
                              >
                                <TermHelpIcon term="closeTable" />
                              </Box>
                            </>
                          ) : (
                            <>
                              <Button
                                size="small"
                                variant="text"
                                color="error"
                                disabled={props.clearDisabled}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onForceClear(t);
                                }}
                              >
                                清台
                              </Button>
                              <Box
                                component="span"
                                onClick={(e) => e.stopPropagation()}
                                sx={{ display: 'inline-flex' }}
                              >
                                <TermHelpIcon term="forceClearTable" />
                              </Box>
                            </>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </>
  );
}
