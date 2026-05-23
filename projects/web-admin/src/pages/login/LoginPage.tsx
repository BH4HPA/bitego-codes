import { Alert, Avatar, Box, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import { getPlatformBranding } from '../../api/platformBranding';
import { useAuthStore } from '../../store/auth';
import { getErrorMessage } from '../../utils/error';

function getFromPath(state: unknown) {
  if (!state || typeof state !== 'object') return null;
  const st = state as Record<string, unknown>;
  const from = st.from;
  if (!from || typeof from !== 'object') return null;
  const fr = from as Record<string, unknown>;
  return typeof fr.pathname === 'string' ? fr.pathname : null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setToken = useAuthStore((s) => s.setToken);

  const brandingQ = useQuery({ queryKey: ['platform_branding', 'login'], queryFn: () => getPlatformBranding() });
  const platformName = brandingQ.data?.platformName || 'BiteGo';
  const platformLogoUrl = brandingQ.data?.platformLogoUrl || null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const m = useMutation({
    mutationFn: () => login({ username, password }),
    onSuccess: (data) => {
      setToken(data.token);
      navigate(getFromPath(location.state) || '/', { replace: true });
    },
  });

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f5f5f5',
      }}
    >
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', width: '100%' }}>
        <Container maxWidth="xs">
          <Paper
            sx={{
              p: 3.5,
              borderRadius: 3,
              border: '1px solid rgba(0,0,0,0.1)',
              bgcolor: '#ffffff',
              boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            }}
          >
            <Stack spacing={2.5} alignItems="center" sx={{ mb: 2 }}>
              <Avatar
                variant="rounded"
                src={platformLogoUrl || undefined}
                sx={{ width: 54, height: 54, bgcolor: '#f0f0f0' }}
              >
                {platformName.slice(0, 1)}
              </Avatar>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ color: '#333' }}>
                  {platformName} 管理后台
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(0,0,0,0.6)' }}>
                  请使用管理员账号登录
                </Typography>
              </Box>
            </Stack>
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                m.mutate();
              }}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <TextField
                label="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                size="small"
                InputLabelProps={{ sx: { color: 'rgba(0,0,0,0.6)' } }}
                sx={{
                  input: { color: '#333' },
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.23)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.4)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1976d2' },
                }}
              />
              <TextField
                label="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                size="small"
                InputLabelProps={{ sx: { color: 'rgba(0,0,0,0.6)' } }}
                sx={{
                  input: { color: '#333' },
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.23)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.4)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1976d2' },
                }}
              />
              {m.isError ? <Alert severity="error">{getErrorMessage(m.error, '登录失败')}</Alert> : null}
              <Button type="submit" variant="contained" disabled={m.isPending}>
                {m.isPending ? '登录中...' : '登录'}
              </Button>
            </Box>
          </Paper>
        </Container>
      </Box>
      <Stack direction="column" spacing={0.5} alignItems="center" sx={{ pt: 2, pb: 10 }}>
        <Typography variant="body2" color="text.secondary">
          © BiteGo.net
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          component="a"
          href="https://beian.miit.gov.cn"
          target="_blank"
          rel="noreferrer"
          sx={{ textDecoration: 'none' }}
        >
          浙ICP备2022018560号-4
        </Typography>
      </Stack>
    </Box>
  );
}
