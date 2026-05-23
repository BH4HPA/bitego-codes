import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
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
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listPlatformUsers } from '../../api/platformUsers';
import { AddMemberDialog } from '../../components/admin/AddMemberDialog';
import { UserDetailDrawer } from '../../components/admin/UserDetailDrawer';

function formatTime(v?: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export function PlatformUsersPage() {
  const [userType, setUserType] = useState<'ADMIN' | 'CUSTOMER'>('ADMIN');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [addOpen, setAddOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const listKey = ['platform_users', userType, keyword, page, rowsPerPage] as const;
  const q = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listPlatformUsers({
        userType,
        keyword: keyword.trim() || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      }),
  });

  const list = q.data?.list || [];
  const total = q.data?.pagination.total || 0;

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
          {q.isError ? <Alert severity="error">加载失败</Alert> : null}
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
              <MenuItem value="CUSTOMER">小程序用户</MenuItem>
            </TextField>
            <TextField
              label="搜索"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(0);
              }}
              placeholder={userType === 'CUSTOMER' ? 'userId/昵称/微信ID' : 'userId/账号/昵称'}
              size="small"
              sx={{ flex: 1 }}
            />
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={64}>头像</TableCell>
                <TableCell width={180}>昵称</TableCell>
                {userType === 'CUSTOMER' ? (
                  <>
                    <TableCell width={240}>微信 ID</TableCell>
                    <TableCell width={240}>用户 ID</TableCell>
                    <TableCell width={180}>注册时间</TableCell>
                    <TableCell width={180}>上次登录</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell width={200}>账号</TableCell>
                    <TableCell>用户 ID</TableCell>
                    <TableCell width={180}>上次登录</TableCell>
                    <TableCell width={100} align="right">
                      操作
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((u) => (
                <TableRow
                  key={u.userId}
                  hover={userType === 'ADMIN'}
                  onClick={userType === 'ADMIN' ? () => setDetailUserId(u.userId) : undefined}
                  sx={userType === 'ADMIN' ? { cursor: 'pointer' } : undefined}
                >
                  <TableCell>
                    <Avatar src={u.avatarUrl || ''} sx={{ width: 28, height: 28 }} />
                  </TableCell>
                  <TableCell>{u.nickname || '-'}</TableCell>
                  {userType === 'CUSTOMER' ? (
                    <>
                      <TableCell>{u.wechatOpenid || u.wechatUnionid || '-'}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {u.userId}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatTime(u.createdAt)}</TableCell>
                      <TableCell>{formatTime(u.lastLoginAt)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{u.username || '-'}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {u.userId}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatTime(u.lastLoginAt)}</TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Button size="small" onClick={() => setDetailUserId(u.userId)}>
                          详情
                        </Button>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
              {!list.length ? (
                <TableRow>
                  <TableCell colSpan={userType === 'CUSTOMER' ? 6 : 5}>
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

      <AddMemberDialog
        open={addOpen}
        scope={{ kind: 'platform' }}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false);
          q.refetch();
        }}
      />

      <UserDetailDrawer
        open={Boolean(detailUserId)}
        userId={detailUserId || ''}
        context={{ kind: 'platform' }}
        invalidateKey={['platform_users']}
        onClose={() => setDetailUserId(null)}
      />
    </Box>
  );
}
