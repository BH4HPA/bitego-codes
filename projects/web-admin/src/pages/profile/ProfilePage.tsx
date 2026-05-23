import { Avatar, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { queryClient } from '../../app/queryClient';
import { changeMyPassword, getMe, updateMyProfile } from '../../api/users';
import { uploadImage } from '../../api/files';
import { useAuthStore } from '../../store/auth';

export function ProfilePage() {
  const snackbar = useSnackbar();
  const setToken = useAuthStore((s) => s.setToken);
  const meQ = useQuery({ queryKey: ['me'], queryFn: getMe });
  const me = meQ.data;
  const meUserId = me?.userId;
  const meNickname = me?.nickname || '';
  const meAvatarUrl = me?.avatarUrl || '';

  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const canSaveProfile = useMemo(() => {
    if (!me) return false;
    return nickname.trim() !== (me.nickname || '') || avatarUrl.trim() !== (me.avatarUrl || '');
  }, [me, nickname, avatarUrl]);

  const updM = useMutation({
    mutationFn: async () => updateMyProfile({ nickname: nickname.trim(), avatarUrl: avatarUrl.trim() }),
    onSuccess: async (d) => {
      setToken(d.token);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      snackbar.showMessage('已保存');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '保存失败'),
  });

  const pwdM = useMutation({
    mutationFn: async () => changeMyPassword({ oldPassword, newPassword }),
    onSuccess: () => {
      setOldPassword('');
      setNewPassword('');
      snackbar.showMessage('密码已修改');
    },
    onError: (e) => snackbar.showMessage(e instanceof Error ? e.message : '修改失败'),
  });

  const onPickAvatar = async (f: File | null) => {
    if (!f) return;
    try {
      const r = await uploadImage({ file: f, path: 'avatars' });
      setAvatarUrl(r.publicUrl);
      snackbar.showMessage('头像已上传');
    } catch (e) {
      snackbar.showMessage(e instanceof Error ? e.message : '上传失败');
    }
  };

  useEffect(() => {
    if (!meUserId) return;
    setNickname(meNickname);
    setAvatarUrl(meAvatarUrl);
  }, [meUserId, meNickname, meAvatarUrl]);

  if (meQ.isLoading) return <Typography>加载中...</Typography>;
  if (!me) return <Typography>暂无数据</Typography>;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        个人信息
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1 }}>
              <Avatar src={avatarUrl || me.avatarUrl || ''} sx={{ width: 56, height: 56 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1">{me.nickname || me.username || me.userId}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {me.username ? `账号：${me.username}` : `用户ID：${me.userId}`}
                </Typography>
              </Box>
            </Stack>
            <Button variant="outlined" component="label">
              更换头像
              <input hidden accept="image/*" type="file" onChange={(e) => onPickAvatar(e.target.files?.[0] || null)} />
            </Button>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={2}>
            <TextField label="昵称" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            <TextField label="头像URL" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
            <Button variant="contained" disabled={!canSaveProfile || updM.isPending} onClick={() => updM.mutate()}>
              保存
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
        修改密码
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="旧密码"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <TextField
              label="新密码"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Button
              variant="contained"
              disabled={!oldPassword || !newPassword || newPassword.length < 6 || pwdM.isPending}
              onClick={() => pwdM.mutate()}
            >
              修改
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
