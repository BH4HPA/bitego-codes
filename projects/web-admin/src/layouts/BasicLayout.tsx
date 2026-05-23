import {
  AppBar,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import PersonIcon from '@mui/icons-material/Person';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NotificationsPopover } from '../components/notifications/NotificationsPopover';
import { SyncStatusIndicator } from '../components/sync/SyncStatusIndicator';
import { UserMenu } from '../components/user/UserMenu';
import { useAdminContextStore } from '../store/adminContext';
import { AdminContextSwitcher } from '../components/admin/AdminContextSwitcher';
import { getPlatformBranding } from '../api/platformBranding';
import { getAdminMaintenance } from '../api/adminMaintenance';
import { getMe } from '../api/users';
import { useAuthStore } from '../store/auth';
import { useAdminWsStore } from '../store/adminWs';
import { startAdminWsClient } from '../ws/adminWsClient';

const drawerWidth = 160;
const sidebarCollapsedKey = 'bitego_admin_sidebar_collapsed';

function readInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(sidebarCollapsedKey) === '1';
}

function getNavItems(params: {
  board: 'platform' | 'tenant' | 'store';
  tenantId: string | null;
  storeId: string | null;
}): Array<{ label: string; path: string }> {
  if (params.board === 'platform') {
    return [
      { label: '概览', path: '/platform/overview' },
      { label: '租户管理', path: '/platform/tenants' },
      { label: '门店管理', path: '/platform/stores' },
      { label: '用户管理', path: '/platform/users' },
      { label: '平台管理', path: '/platform/branding' },
    ];
  }
  if (params.board === 'tenant') {
    return [
      { label: '概览', path: '/tenant/overview' },
      { label: '门店管理', path: '/tenant/stores' },
      { label: '用户管理', path: '/tenant/users' },
      { label: '分类管理', path: '/tenant/shared-data/categories' },
      { label: '规格管理', path: '/tenant/shared-data/spec-groups' },
      { label: '菜品管理', path: '/tenant/shared-data/goods' },
      { label: '连锁管理', path: '/tenant/brand' },
    ];
  }
  const items: Array<{ label: string; path: string }> = [
    { label: '概览', path: '/store/overview' },
    { label: '订单管理', path: '/store/orders' },
    { label: '桌台管理', path: '/store/tables' },
    { label: '分类管理', path: '/store/categories' },
    { label: '规格管理', path: '/store/spec-groups' },
    { label: '菜品管理', path: '/store/goods' },
    { label: '用户管理', path: '/store/users' },
    { label: '门店管理', path: '/store/store' },
  ];
  return items;
}

export function BasicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const board = useAdminContextStore((s) => s.board);
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [collapsed, setCollapsed] = useState<boolean>(() => readInitialCollapsed());
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(sidebarCollapsedKey, next ? '1' : '0');
      return next;
    });
  };
  const meQ = useQuery({ queryKey: ['me'], queryFn: getMe, enabled: Boolean(token) });
  const me = meQ.data;
  const meName = me?.nickname || me?.username || '管理员';
  const wsSupported = useAdminWsStore((s) => s.supported);
  const wsConnected = useAdminWsStore((s) => s.connected);
  const wsMaintenance = useAdminWsStore((s) => s.maintenance);
  const requiredBoard = useMemo<'platform' | 'tenant' | 'store' | null>(() => {
    if (location.pathname.startsWith('/platform/')) return 'platform';
    if (location.pathname.startsWith('/tenant/')) return 'tenant';
    if (location.pathname.startsWith('/store/')) return 'store';
    return null;
  }, [location.pathname]);
  const hasRequiredContext = useMemo(() => {
    if (!requiredBoard) return true;
    if (requiredBoard === 'platform') return board === 'platform';
    if (requiredBoard === 'tenant') return board === 'tenant' && Boolean(tenantId);
    return board === 'store' && Boolean(tenantId) && Boolean(storeId);
  }, [board, requiredBoard, storeId, tenantId]);
  const navItems = getNavItems({ board, tenantId, storeId });
  const brandingQ = useQuery({ queryKey: ['platform_branding'], queryFn: () => getPlatformBranding() });
  const platformName = brandingQ.data?.platformName || 'BiteGo';
  const platformLogoUrl = brandingQ.data?.platformLogoUrl || null;
  const maintenanceQ = useQuery({
    queryKey: ['admin_maintenance', tenantId, storeId],
    queryFn: () => getAdminMaintenance(),
    refetchInterval: wsSupported && wsConnected ? false : 2000,
    enabled: !(wsSupported && wsConnected),
  });
  const maintenance = wsSupported && wsConnected ? wsMaintenance : maintenanceQ.data;
  const isRestoring = Boolean(
    maintenance?.platform.enabled || maintenance?.tenant.enabled || maintenance?.store.enabled,
  );

  useEffect(() => {
    if (!token || !requiredBoard || hasRequiredContext) return;
    navigate('/', { replace: true });
  }, [hasRequiredContext, navigate, requiredBoard, token]);

  useEffect(() => {
    if (!token) {
      useAdminWsStore.getState().reset();
      return;
    }
    if (requiredBoard === 'tenant' && !tenantId) return;
    if (requiredBoard === 'store' && (!tenantId || !storeId)) return;
    const stop = startAdminWsClient({ token, board, tenantId, storeId });
    return () => stop();
  }, [board, requiredBoard, storeId, tenantId, token]);

  const [restoreAnchorEl, setRestoreAnchorEl] = useState<HTMLElement | null>(null);
  const restoreOpen = Boolean(restoreAnchorEl);
  const restoringTooltip = useMemo(() => {
    const s = maintenance;
    if (!s) return '加载中';
    const segs: string[] = [];
    if (s.platform.enabled) segs.push(`平台：${s.platform.message || '恢复中'}`);
    if (s.tenant.enabled) segs.push(`租户：${s.tenant.message || '恢复中'}`);
    if (s.store.enabled) segs.push(`门店：${s.store.message || '恢复中'}`);
    return segs.length ? segs.join('；') : '未恢复';
  }, [maintenance]);

  const restoringDetail = useMemo(() => {
    const s = maintenance;
    return {
      platform: s?.platform.enabled ? s.platform.message || '恢复中' : '—',
      tenant: s?.tenant.enabled ? s.tenant.message || '恢复中' : '—',
      store: s?.store.enabled ? s.store.message || '恢复中' : '—',
    };
  }, [maintenance]);

  const restoringChipSx = useMemo(
    () => ({
      bgcolor: 'rgba(255,255,255,0.92)',
      border: '1px solid',
      borderColor: 'warning.main',
      color: 'warning.main',
      '& .MuiChip-icon': { color: 'warning.main' },
      '&:hover': { bgcolor: 'rgba(255,255,255,1) !important' },
    }),
    [],
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          {collapsed ? (
            <Tooltip title="展开菜单">
              <IconButton color="inherit" edge="start" onClick={toggleCollapsed} sx={{ mr: 1 }} aria-label="展开菜单">
                <MenuIcon />
              </IconButton>
            </Tooltip>
          ) : null}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              {platformLogoUrl ? (
                <Avatar src={platformLogoUrl} sx={{ width: 22, height: 22 }} variant="rounded" />
              ) : null}
              <Typography variant="h6" noWrap>
                {platformName} 管理后台
              </Typography>
            </Stack>
            <AdminContextSwitcher />
          </Stack>
          {isRestoring ? (
            <>
              <Tooltip title={restoringTooltip}>
                <Box sx={{ mr: 2 }}>
                  <Chip
                    size="small"
                    icon={<CircularProgress size={14} />}
                    label="恢复中"
                    color="default"
                    variant="filled"
                    sx={restoringChipSx}
                    onClick={(e) => setRestoreAnchorEl(e.currentTarget)}
                  />
                </Box>
              </Tooltip>
              <Popover
                open={restoreOpen}
                anchorEl={restoreAnchorEl}
                onClose={() => setRestoreAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <Box sx={{ width: 360, p: 2 }}>
                  <Typography variant="subtitle1">恢复中</Typography>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack spacing={1}>
                    <Typography variant="body2">平台：{restoringDetail.platform}</Typography>
                    <Typography variant="body2">租户：{restoringDetail.tenant}</Typography>
                    <Typography variant="body2">门店：{restoringDetail.store}</Typography>
                  </Stack>
                </Box>
              </Popover>
            </>
          ) : null}
          <Stack direction="row" spacing={1} alignItems="center">
            <SyncStatusIndicator />
            <NotificationsPopover />
            <UserMenu />
          </Stack>
        </Toolbar>
      </AppBar>
      {collapsed ? null : (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: {
              width: drawerWidth,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
            },
          }}
        >
          <Toolbar />
          <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
            <List>
              {navItems.map((it) => {
                const selected = location.pathname === it.path || location.pathname.startsWith(`${it.path}/`);
                return (
                  <ListItemButton key={it.path} selected={selected} onClick={() => navigate(it.path)}>
                    <ListItemText primary={it.label} />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
          <Divider />
          <List dense sx={{ flexShrink: 0 }}>
            <ListItemButton onClick={() => navigate('/profile')}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Avatar src={me?.avatarUrl || ''} sx={{ width: 24, height: 24 }}>
                  <PersonIcon sx={{ fontSize: 16 }} />
                </Avatar>
              </ListItemIcon>
              <ListItemText
                primary={meName}
                primaryTypographyProps={{
                  variant: 'body2',
                  noWrap: true,
                  title: meName,
                }}
              />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="退出登录" primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
            <ListItemButton onClick={toggleCollapsed}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <ChevronLeftIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="收起菜单" primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          </List>
        </Drawer>
      )}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <Toolbar />
        {requiredBoard && !hasRequiredContext ? (
          <Stack direction="row" alignItems="center" justifyContent="center" sx={{ minHeight: 320, flexGrow: 1 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Outlet />
          </Box>
        )}
        <Stack direction="column" spacing={0.5} alignItems="center" sx={{ pt: 2, pb: 1 }}>
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
    </Box>
  );
}
