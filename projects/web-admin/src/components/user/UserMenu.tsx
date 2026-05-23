import { Avatar, Button, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../../api/users';
import { useAuthStore } from '../../store/auth';

export function UserMenu() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const meQ = useQuery({ queryKey: ['me'], queryFn: getMe });
  const me = meQ.data;

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const name = me?.nickname || me?.username || '管理员';

  return (
    <>
      <Button color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ textTransform: 'none' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar src={me?.avatarUrl || ''} sx={{ width: 28, height: 28 }} />
          <Typography
            variant="body2"
            sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {name}
          </Typography>
        </Stack>
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            navigate('/profile');
          }}
        >
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>个人信息</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            logout();
            navigate('/login', { replace: true });
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>退出登录</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
