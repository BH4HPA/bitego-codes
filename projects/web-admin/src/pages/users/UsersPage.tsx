import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createAdminUser, deleteAdminUser, listUsers } from '../../api/users';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { queryClient } from '../../app/queryClient';

export function UsersPage() {
  const snackbar = useSnackbar();
  const [userType, setUserType] = useState<'ADMIN' | 'CUSTOMER'>('ADMIN');
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const q = useQuery({
    queryKey: ['admin_users', userType, keyword, page, rowsPerPage],
    queryFn: () => listUsers({ userType, keyword: keyword.trim() || undefined, page: page + 1, pageSize: rowsPerPage }),
  });

  const createM = useMutation({
    mutationFn: () =>
      createAdminUser({
        username: newUsername.trim(),
        password: newPassword,
        nickname: newNickname.trim() || undefined,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewNickname('');
      await queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      snackbar.showMessage('已创建');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '创建失败'),
  });

  const delM = useMutation({
    mutationFn: (userId: string) => deleteAdminUser(userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      snackbar.showMessage('已删除');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '删除失败'),
  });

  const list = q.data?.list || [];
  const total = q.data?.pagination.total || 0;
  const showCustomer = userType === 'CUSTOMER';

  const formatTime = (v?: string) => {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const canCreate = useMemo(() => {
    return userType === 'ADMIN' && newUsername.trim() && newPassword.length >= 6;
  }, [userType, newUsername, newPassword]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">用户管理</Typography>
        {userType === 'ADMIN' ? (
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            新增管理员
          </Button>
        ) : null}
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              select
              label="类型"
              value={userType}
              onChange={(e) => {
                setUserType(e.target.value === 'CUSTOMER' ? 'CUSTOMER' : 'ADMIN');
                setPage(0);
              }}
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
              placeholder={showCustomer ? 'userId/昵称/微信ID' : 'userId/账号/昵称'}
              sx={{ flex: 1 }}
            />
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={80}>头像</TableCell>
                <TableCell width={140}>昵称</TableCell>
                {showCustomer ? (
                  <>
                    <TableCell width={220}>微信ID</TableCell>
                    <TableCell width={220}>用户ID</TableCell>
                    <TableCell width={180}>注册时间</TableCell>
                    <TableCell width={180}>上次登录</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell width={180}>账号</TableCell>
                    <TableCell width={260}>用户ID</TableCell>
                    <TableCell width={180}>上次登录</TableCell>
                    <TableCell width={120}>操作</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell>
                    <Avatar src={u.avatarUrl || ''} sx={{ width: 28, height: 28 }} />
                  </TableCell>
                  <TableCell>{u.nickname || '-'}</TableCell>
                  {showCustomer ? (
                    <>
                      <TableCell>{u.wechatOpenid || u.wechatUnionid || '-'}</TableCell>
                      <TableCell>{u.userId}</TableCell>
                      <TableCell>{formatTime(u.createdAt)}</TableCell>
                      <TableCell>{formatTime(u.lastLoginAt || undefined)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{u.username || '-'}</TableCell>
                      <TableCell>{u.userId}</TableCell>
                      <TableCell>{formatTime(u.lastLoginAt || undefined)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          color="error"
                          disabled={delM.isPending}
                          onClick={() => delM.mutate(u.userId)}
                        >
                          删除
                        </Button>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
              {!list.length ? (
                <TableRow>
                  <TableCell colSpan={showCustomer ? 6 : 6}>{q.isLoading ? '加载中...' : '暂无数据'}</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
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
        <DialogTitle>新增管理员</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="账号" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            <TextField label="昵称" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} />
            <TextField
              label="初始密码（≥6位）"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
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
