import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getMyAdminScopes } from '../../api/adminScopes';
import { listStoreUsers } from '../../api/storeUsers';
import { AddMemberDialog } from '../../components/admin/AddMemberDialog';
import { UserDetailDrawer } from '../../components/admin/UserDetailDrawer';
import { useAdminContextStore } from '../../store/adminContext';
import { getErrorMessage } from '../../utils/error';
import { TenantUsersPage } from '../tenant/TenantUsersPage';

const ROLE_LABEL: Record<'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN', string> = {
  SUPER_ADMIN: '平台管理员',
  TENANT_ADMIN: '租户管理员',
  STORE_ADMIN: '门店管理员',
};

function formatTime(v?: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export function StoreUsersPage() {
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
  const scopesQ = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: getMyAdminScopes });
  const tenantType = scopesQ.data?.tenants.find((t) => t.tenantId === tenantId)?.tenantType || null;
  const [userType, setUserType] = useState<'ADMIN' | 'CUSTOMER'>('ADMIN');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [addOpen, setAddOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['store_users', userType, keyword, page, rowsPerPage],
    queryFn: () =>
      listStoreUsers({
        userType,
        keyword: keyword.trim() || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      }),
    enabled: tenantType !== 'SINGLE',
  });
  const list = q.data?.list || [];
  const total = q.data?.pagination.total || 0;

  if (tenantType === 'SINGLE') return <TenantUsersPage />;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">用户管理</Typography>
        {userType === 'ADMIN' ? (
          <Button variant="contained" onClick={() => setAddOpen(true)}>
            添加成员
          </Button>
        ) : null}
      </Stack>

      <Card variant="outlined">
        <CardContent>
          {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              select
              label="类型"
              value={userType}
              onChange={(e) => {
                setUserType(e.target.value === 'CUSTOMER' ? 'CUSTOMER' : 'ADMIN');
                setPage(0);
              }}
              size="small"
              sx={{ width: 200 }}
            >
              <MenuItem value="ADMIN">管理员</MenuItem>
              <MenuItem value="CUSTOMER">下单用户</MenuItem>
            </TextField>
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

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={64}>头像</TableCell>
                <TableCell width={160}>昵称</TableCell>
                <TableCell width={180}>{userType === 'ADMIN' ? '账号' : '用户 ID'}</TableCell>
                <TableCell>{userType === 'ADMIN' ? '授权范围' : '微信 ID'}</TableCell>
                <TableCell width={160}>{userType === 'ADMIN' ? '上次登录' : '最近下单'}</TableCell>
                {userType === 'ADMIN' ? (
                  <TableCell width={80} align="right">
                    操作
                  </TableCell>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((u) => (
                <TableRow
                  key={u.userId}
                  hover={userType === 'ADMIN'}
                  sx={userType === 'ADMIN' ? { cursor: 'pointer' } : undefined}
                  onClick={userType === 'ADMIN' ? () => setDetailUserId(u.userId) : undefined}
                >
                  <TableCell>
                    <Avatar src={u.avatarUrl || ''} sx={{ width: 28, height: 28 }} />
                  </TableCell>
                  <TableCell>{u.nickname || '-'}</TableCell>
                  <TableCell>
                    {userType === 'ADMIN' ? (
                      u.username || '-'
                    ) : (
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {u.userId}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {userType === 'ADMIN' ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {(u.scopes || []).map((s) => {
                          const label =
                            s.role === 'STORE_ADMIN'
                              ? `${ROLE_LABEL[s.role]} · ${s.storeName || s.storeId || ''}`
                              : ROLE_LABEL[s.role];
                          return (
                            <Tooltip key={s.scopeId} title={s.storeId || s.tenantId}>
                              <Chip size="small" label={label} />
                            </Tooltip>
                          );
                        })}
                        {!u.scopes?.length ? '-' : null}
                      </Stack>
                    ) : (
                      <Typography variant="body2">{u.wechatOpenid || u.wechatUnionid || '-'}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{userType === 'ADMIN' ? formatTime(u.lastLoginAt) : formatTime(u.lastOrderAt)}</TableCell>
                  {userType === 'ADMIN' ? (
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Button size="small" onClick={() => setDetailUserId(u.userId)}>
                        详情
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!list.length ? (
                <TableRow>
                  <TableCell colSpan={userType === 'ADMIN' ? 6 : 5}>
                    <Typography variant="body2" color="text.secondary">
                      {q.isLoading ? '加载中...' : '暂无数据'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

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

      {tenantId && storeId ? (
        <>
          <AddMemberDialog
            open={addOpen}
            scope={{ kind: 'store', tenantId, storeId, tenantType }}
            onClose={() => setAddOpen(false)}
            onSuccess={() => {
              setAddOpen(false);
              q.refetch();
            }}
          />

          <UserDetailDrawer
            open={Boolean(detailUserId)}
            userId={detailUserId || ''}
            context={{ kind: 'store', tenantId, storeId, tenantType }}
            invalidateKey={['store_users']}
            onClose={() => setDetailUserId(null)}
          />
        </>
      ) : null}
    </Box>
  );
}
