import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Radio,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { createAdminScope } from '../../api/adminScopes';
import { listPlatformStores } from '../../api/platformStores';
import { listPlatformTenants } from '../../api/platformTenants';
import { createPlatformAdminUser } from '../../api/platformUsers';
import { createStoreAdmin } from '../../api/storeUsers';
import { listTenantStores } from '../../api/tenantStores';
import { createTenantAdminUser } from '../../api/tenantUsers';
import { checkAdminUsernameAvailable, searchAdminUsers } from '../../api/users';
import { useSnackbar } from '../snackbar/snackbarContext';
import { getErrorMessage } from '../../utils/error';

export type AddMemberScope =
  | { kind: 'platform' }
  | { kind: 'tenant'; tenantId: string; tenantName?: string; tenantType?: 'SINGLE' | 'CHAIN' | null }
  | {
      kind: 'store';
      tenantId: string;
      storeId: string;
      storeName?: string;
      tenantType?: 'SINGLE' | 'CHAIN' | null;
    };

type Role = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN';

type ScopeDraft =
  | { role: 'SUPER_ADMIN' }
  | { role: 'TENANT_ADMIN'; tenantId: string; tenantName: string }
  | { role: 'STORE_ADMIN'; tenantId: string; tenantName: string; storeId: string; storeName: string };

type Props = {
  open: boolean;
  scope: AddMemberScope;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddMemberDialog({ open, scope, onClose, onSuccess }: Props) {
  const snackbar = useSnackbar();

  const [source, setSource] = useState<'new' | 'existing'>('new');

  // account - new
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // account - existing
  const [bindKeyword, setBindKeyword] = useState('');
  const [bindPage, setBindPage] = useState(0);
  const [bindRowsPerPage, setBindRowsPerPage] = useState(10);
  const [selectedUserId, setSelectedUserId] = useState('');

  // scopes to grant
  const [scopes, setScopes] = useState<ScopeDraft[]>([]);

  // scope editor (platform/tenant modes only)
  const scopeTenantType = scope.kind === 'tenant' || scope.kind === 'store' ? scope.tenantType || null : null;
  const defaultEditorRole: Role =
    scope.kind === 'platform'
      ? 'TENANT_ADMIN'
      : scope.kind === 'tenant'
        ? scopeTenantType === 'SINGLE'
          ? 'TENANT_ADMIN'
          : 'STORE_ADMIN'
        : 'STORE_ADMIN';
  const [editorRole, setEditorRole] = useState<Role>(defaultEditorRole);
  const [editorTenant, setEditorTenant] = useState<{
    tenantId: string;
    brandName: string;
    type?: 'SINGLE' | 'CHAIN';
  } | null>(null);
  const [editorTenantInput, setEditorTenantInput] = useState('');
  const [editorTenantSearch, setEditorTenantSearch] = useState('');
  const [editorStore, setEditorStore] = useState<{ storeId: string; name: string; subName?: string | null } | null>(
    null,
  );
  const [editorStoreInput, setEditorStoreInput] = useState('');
  const [editorStoreSearch, setEditorStoreSearch] = useState('');

  const tenantLocked = scope.kind !== 'platform';
  const showScopeEditor = scope.kind !== 'store';

  useEffect(() => {
    if (open) return;
    setSource('new');
    setUsername('');
    setPassword('');
    setNickname('');
    setAvatarUrl('');
    setUsernameAvailable(null);
    setBindKeyword('');
    setBindPage(0);
    setBindRowsPerPage(10);
    setSelectedUserId('');
    setScopes([]);
    setEditorRole(defaultEditorRole);
    setEditorTenant(null);
    setEditorTenantInput('');
    setEditorTenantSearch('');
    setEditorStore(null);
    setEditorStoreInput('');
    setEditorStoreSearch('');
  }, [open, scope.kind, defaultEditorRole]);

  const resolvedTenant = useMemo<{ tenantId: string; brandName: string } | null>(() => {
    if (scope.kind === 'tenant') return { tenantId: scope.tenantId, brandName: scope.tenantName || scope.tenantId };
    if (scope.kind === 'store') return { tenantId: scope.tenantId, brandName: scope.tenantId };
    return editorTenant;
  }, [editorTenant, scope]);

  const lockedSingleTenant = scopeTenantType === 'SINGLE';

  const usernameCheckM = useMutation({
    mutationFn: () => checkAdminUsernameAvailable(username.trim()),
    onSuccess: (r) => setUsernameAvailable(Boolean(r.available)),
  });

  const searchQ = useQuery({
    queryKey: ['add_member_search', bindKeyword, bindPage, bindRowsPerPage],
    queryFn: () =>
      searchAdminUsers({
        keyword: bindKeyword.trim() || undefined,
        page: bindPage + 1,
        pageSize: bindRowsPerPage,
      }),
    enabled: open && source === 'existing',
  });
  const searchList = searchQ.data?.list || [];
  const searchTotal = searchQ.data?.pagination.total || 0;

  // platform can search any tenant
  const platformTenantsQ = useQuery({
    queryKey: ['platform_tenants', 'add_member', editorTenantSearch],
    queryFn: () => listPlatformTenants({ keyword: editorTenantSearch.trim() || undefined, page: 1, pageSize: 100 }),
    enabled: open && scope.kind === 'platform' && editorRole !== 'SUPER_ADMIN',
  });
  const platformTenants = platformTenantsQ.data?.list || [];

  // platform: stores under chosen tenant
  const platformStoresQ = useQuery({
    queryKey: ['platform_stores', 'add_member', editorTenant?.tenantId || '', editorStoreSearch],
    queryFn: () =>
      listPlatformStores({
        tenantId: editorTenant?.tenantId || undefined,
        keyword: editorStoreSearch.trim() || undefined,
        page: 1,
        pageSize: 100,
      }),
    enabled: open && scope.kind === 'platform' && editorRole === 'STORE_ADMIN' && Boolean(editorTenant?.tenantId),
  });
  const platformStores = platformStoresQ.data?.list || [];

  // tenant: stores under current tenant
  const tenantStoresQ = useQuery({
    queryKey: ['tenant_stores', 'add_member', editorStoreSearch],
    queryFn: () => listTenantStores({ keyword: editorStoreSearch.trim() || undefined, page: 1, pageSize: 100 }),
    enabled: open && scope.kind === 'tenant' && editorRole === 'STORE_ADMIN',
  });
  const tenantStores = tenantStoresQ.data?.list || [];

  const storeOptions = scope.kind === 'platform' ? platformStores : tenantStores;
  const storesLoading = scope.kind === 'platform' ? platformStoresQ.isLoading : tenantStoresQ.isLoading;

  const canAddEditorScope = useMemo(() => {
    if (editorRole === 'SUPER_ADMIN') return scope.kind === 'platform';
    if (!resolvedTenant) return false;
    if (editorRole === 'STORE_ADMIN') return Boolean(editorStore);
    return true;
  }, [editorRole, editorStore, resolvedTenant, scope.kind]);

  const appendScope = () => {
    if (!canAddEditorScope) return;
    if (editorRole === 'SUPER_ADMIN') {
      if (scopes.some((s) => s.role === 'SUPER_ADMIN')) return;
      setScopes((prev) => [...prev, { role: 'SUPER_ADMIN' }]);
      return;
    }
    const tenant = resolvedTenant!;
    if (editorRole === 'TENANT_ADMIN') {
      if (scopes.some((s) => s.role === 'TENANT_ADMIN' && s.tenantId === tenant.tenantId)) return;
      setScopes((prev) => [...prev, { role: 'TENANT_ADMIN', tenantId: tenant.tenantId, tenantName: tenant.brandName }]);
      return;
    }
    const store = editorStore!;
    const storeName = [store.name, store.subName].filter(Boolean).join(' · ') || store.storeId;
    if (scopes.some((s) => s.role === 'STORE_ADMIN' && s.storeId === store.storeId)) return;
    setScopes((prev) => [
      ...prev,
      {
        role: 'STORE_ADMIN',
        tenantId: tenant.tenantId,
        tenantName: tenant.brandName,
        storeId: store.storeId,
        storeName,
      },
    ]);
    setEditorStore(null);
    setEditorStoreInput('');
    setEditorStoreSearch('');
  };

  const createNewM = useMutation({
    mutationFn: async () => {
      const common = {
        username: username.trim(),
        password,
        nickname: nickname.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
      };
      if (scope.kind === 'store') {
        await createStoreAdmin(common);
        return;
      }
      if (scope.kind === 'tenant') {
        const first = scopes[0];
        if (!first) throw new Error('请至少添加一条授权范围');
        if (first.role === 'SUPER_ADMIN') throw new Error('租户侧不可授予平台管理员');
        const created =
          first.role === 'TENANT_ADMIN'
            ? await createTenantAdminUser({ ...common, role: 'TENANT_ADMIN' })
            : await createTenantAdminUser({ ...common, role: 'STORE_ADMIN', storeId: first.storeId });
        for (const s of scopes.slice(1)) {
          if (s.role === 'SUPER_ADMIN') throw new Error('租户侧不可授予平台管理员');
          await createAdminScope(
            s.role === 'TENANT_ADMIN'
              ? { userId: created.userId, tenantId: s.tenantId, role: 'TENANT_ADMIN' }
              : { userId: created.userId, tenantId: s.tenantId, storeId: s.storeId, role: 'STORE_ADMIN' },
          );
        }
        return;
      }
      const normalized = scopes.map((s) =>
        s.role === 'SUPER_ADMIN'
          ? { tenantId: 'store_default', role: 'SUPER_ADMIN' as const }
          : s.role === 'TENANT_ADMIN'
            ? { tenantId: s.tenantId, role: 'TENANT_ADMIN' as const }
            : { tenantId: s.tenantId, storeId: s.storeId, role: 'STORE_ADMIN' as const },
      );
      await createPlatformAdminUser({ ...common, scopes: normalized });
    },
    onSuccess: () => {
      snackbar.showMessage('已创建');
      onSuccess();
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '创建失败')),
  });

  const bindExistingM = useMutation({
    mutationFn: async () => {
      const uid = selectedUserId.trim();
      if (!uid) throw new Error('请选择账号');
      let toApply: ScopeDraft[] = scopes;
      if (scope.kind === 'store') {
        toApply = [
          {
            role: 'STORE_ADMIN',
            tenantId: scope.tenantId,
            tenantName: scope.tenantId,
            storeId: scope.storeId,
            storeName: scope.storeName || scope.storeId,
          },
        ];
      }
      if (!toApply.length) throw new Error('请至少添加一条授权范围');
      await Promise.all(
        toApply.map((s) =>
          createAdminScope(
            s.role === 'SUPER_ADMIN'
              ? { userId: uid, tenantId: 'store_default', role: 'SUPER_ADMIN' }
              : s.role === 'TENANT_ADMIN'
                ? { userId: uid, tenantId: s.tenantId, role: 'TENANT_ADMIN' }
                : { userId: uid, tenantId: s.tenantId, storeId: s.storeId, role: 'STORE_ADMIN' },
          ),
        ),
      );
    },
    onSuccess: () => {
      snackbar.showMessage('已绑定');
      onSuccess();
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '绑定失败')),
  });

  const canSubmit = useMemo(() => {
    if (source === 'new') {
      const okAccount = Boolean(username.trim()) && password.length >= 6 && usernameAvailable !== false;
      if (!okAccount) return false;
      if (scope.kind === 'store') return true;
      return scopes.length > 0;
    }
    if (!selectedUserId) return false;
    if (scope.kind === 'store') return true;
    return scopes.length > 0;
  }, [password.length, scope.kind, scopes.length, selectedUserId, source, username, usernameAvailable]);

  const pending = createNewM.isPending || bindExistingM.isPending;
  const error = createNewM.error || bindExistingM.error;

  const submit = () => {
    if (source === 'new') createNewM.mutate();
    else bindExistingM.mutate();
  };

  const removeScope = (idx: number) => setScopes((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>添加成员</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Tabs value={source} onChange={(_, v) => setSource(v)}>
            <Tab value="new" label="新建账号" />
            <Tab value="existing" label="从已有账号选择" />
          </Tabs>

          {error ? <Alert severity="error">{getErrorMessage(error, '提交失败')}</Alert> : null}

          {source === 'new' ? (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="账号"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameAvailable(null);
                  }}
                  onBlur={() => {
                    if (!username.trim()) return;
                    usernameCheckM.mutate();
                  }}
                  error={usernameAvailable === false}
                  helperText={
                    usernameAvailable === false ? '账号已被占用' : usernameAvailable === true ? '账号可用' : ' '
                  }
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="昵称（可选）"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                label="初始密码（≥6 位）"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <TextField label="头像 URL（可选）" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <TextField
                label="搜索账号"
                placeholder="userId / 账号 / 昵称"
                value={bindKeyword}
                onChange={(e) => {
                  setBindKeyword(e.target.value);
                  setBindPage(0);
                }}
                size="small"
              />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={44}></TableCell>
                    <TableCell width={56}>头像</TableCell>
                    <TableCell width={140}>昵称</TableCell>
                    <TableCell width={180}>账号</TableCell>
                    <TableCell>用户 ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {searchList.map((u) => (
                    <TableRow
                      key={u.userId}
                      hover
                      selected={selectedUserId === u.userId}
                      onClick={() => setSelectedUserId(u.userId)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Radio checked={selectedUserId === u.userId} size="small" />
                      </TableCell>
                      <TableCell>
                        <Avatar src={u.avatarUrl || ''} sx={{ width: 28, height: 28 }} />
                      </TableCell>
                      <TableCell>{u.nickname || '-'}</TableCell>
                      <TableCell>{u.username || '-'}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {u.userId}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!searchList.length ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          {searchQ.isLoading ? '加载中...' : '暂无数据'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={searchTotal}
                page={bindPage}
                onPageChange={(_, p) => setBindPage(p)}
                rowsPerPage={bindRowsPerPage}
                onRowsPerPageChange={(e) => {
                  setBindRowsPerPage(parseInt(e.target.value, 10) || 10);
                  setBindPage(0);
                }}
                rowsPerPageOptions={[10, 20, 50]}
                labelRowsPerPage="每页"
                labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count}`}
              />
            </Stack>
          )}

          {showScopeEditor ? (
            <>
              <Divider />
              <Stack spacing={1.5}>
                <Typography variant="subtitle2">授权范围</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
                  <TextField
                    select
                    label="角色"
                    value={editorRole}
                    onChange={(e) => {
                      const v = e.target.value as Role;
                      setEditorRole(v);
                      if (!tenantLocked) setEditorTenant(null);
                      setEditorTenantInput('');
                      setEditorTenantSearch('');
                      setEditorStore(null);
                      setEditorStoreInput('');
                      setEditorStoreSearch('');
                    }}
                    size="small"
                    sx={{ width: 160 }}
                  >
                    {scope.kind === 'platform' ? <MenuItem value="SUPER_ADMIN">平台管理员</MenuItem> : null}
                    <MenuItem value="TENANT_ADMIN">租户管理员</MenuItem>
                    {lockedSingleTenant ? null : <MenuItem value="STORE_ADMIN">门店管理员</MenuItem>}
                  </TextField>
                  {scope.kind === 'platform' && editorRole !== 'SUPER_ADMIN' ? (
                    <Autocomplete
                      options={platformTenants}
                      value={
                        editorTenant
                          ? platformTenants.find((t) => t.tenantId === editorTenant.tenantId) || editorTenant
                          : null
                      }
                      inputValue={editorTenantInput}
                      onInputChange={(_, v, reason) => {
                        setEditorTenantInput(v);
                        if (reason === 'input') setEditorTenantSearch(v);
                        if (reason === 'clear') setEditorTenantSearch('');
                      }}
                      onChange={(_, v) => {
                        setEditorTenant(v ? { tenantId: v.tenantId, brandName: v.brandName, type: v.type } : null);
                        setEditorStore(null);
                        setEditorStoreInput('');
                        setEditorStoreSearch('');
                      }}
                      isOptionEqualToValue={(o, v) => o.tenantId === v.tenantId}
                      getOptionLabel={(t) => t.brandName}
                      getOptionDisabled={(t) => editorRole === 'STORE_ADMIN' && t.type === 'SINGLE'}
                      renderOption={(props, t) => {
                        const disabled = editorRole === 'STORE_ADMIN' && t.type === 'SINGLE';
                        return (
                          <li {...props} key={t.tenantId}>
                            <Tooltip title={disabled ? '单店租户仅支持租户管理员' : t.tenantId} placement="right">
                              <Box component="span" sx={{ width: '100%', pointerEvents: 'auto' }}>
                                {t.brandName}
                              </Box>
                            </Tooltip>
                          </li>
                        );
                      }}
                      renderInput={(params) => <TextField {...params} label="租户" size="small" />}
                      loading={platformTenantsQ.isLoading}
                      sx={{ flex: 3, minWidth: 180 }}
                    />
                  ) : null}
                  {editorRole === 'STORE_ADMIN' ? (
                    <Autocomplete
                      options={storeOptions}
                      value={
                        editorStore ? storeOptions.find((s) => s.storeId === editorStore.storeId) || editorStore : null
                      }
                      inputValue={editorStoreInput}
                      onInputChange={(_, v, reason) => {
                        setEditorStoreInput(v);
                        if (reason === 'input') setEditorStoreSearch(v);
                        if (reason === 'clear') setEditorStoreSearch('');
                      }}
                      onChange={(_, v) =>
                        setEditorStore(v ? { storeId: v.storeId, name: v.name, subName: v.subName } : null)
                      }
                      isOptionEqualToValue={(o, v) => o.storeId === v.storeId}
                      getOptionLabel={(s) => [s.name, s.subName].filter(Boolean).join(' · ') || s.storeId}
                      renderOption={(props, s) => (
                        <li {...props} key={s.storeId}>
                          <Tooltip title={s.storeId}>
                            <Box component="span">{[s.name, s.subName].filter(Boolean).join(' · ') || s.storeId}</Box>
                          </Tooltip>
                        </li>
                      )}
                      renderInput={(params) => <TextField {...params} label="门店" size="small" />}
                      loading={storesLoading}
                      disabled={scope.kind === 'platform' && !editorTenant}
                      sx={{ flex: 4, minWidth: 200 }}
                    />
                  ) : null}
                  <Button variant="outlined" onClick={appendScope} disabled={!canAddEditorScope}>
                    添加
                  </Button>
                </Stack>
                {scopes.length ? (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {scopes.map((s, idx) => (
                      <Chip
                        key={idx}
                        color={s.role === 'SUPER_ADMIN' ? 'secondary' : 'default'}
                        label={
                          s.role === 'SUPER_ADMIN'
                            ? '平台管理员'
                            : s.role === 'TENANT_ADMIN'
                              ? `租户管理员 · ${s.tenantName}`
                              : `门店管理员 · ${s.storeName}`
                        }
                        onDelete={() => removeScope(idx)}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    请添加至少一条授权范围
                  </Typography>
                )}
              </Stack>
            </>
          ) : (
            <Alert severity="info" variant="outlined">
              成员将获得「当前门店 {scope.kind === 'store' ? scope.storeName || scope.storeId : ''} 的门店管理员」权限。
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          取消
        </Button>
        <Button variant="contained" disabled={!canSubmit || pending} onClick={submit}>
          {source === 'new' ? '创建' : '绑定'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
