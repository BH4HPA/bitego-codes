import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { createAdminScope, deleteAdminScope } from '../../api/adminScopes';
import type { AdminScopeDTO } from '../../api/adminScopes';
import { listPlatformStores } from '../../api/platformStores';
import { listPlatformTenants } from '../../api/platformTenants';
import { deletePlatformUser, getPlatformUserDetail } from '../../api/platformUsers';
import { getStoreUserDetail } from '../../api/storeUsers';
import { listTenantStores } from '../../api/tenantStores';
import { getTenantUserDetail } from '../../api/tenantUsers';
import { resetAdminUserPassword, updateAdminUserProfile } from '../../api/users';
import { queryClient } from '../../app/queryClient';
import { useConfirmDialog } from '../confirm/useConfirmDialog';
import { useSnackbar } from '../snackbar/snackbarContext';
import { getErrorMessage } from '../../utils/error';

type DetailScope = AdminScopeDTO & { tenantName?: string | null; storeName?: string | null };
type DetailData = {
  user: {
    userId: string;
    userType: string;
    username?: string | null;
    nickname?: string | null;
    avatarUrl?: string | null;
    status?: string | null;
    createdAt?: string;
    updatedAt?: string;
    lastLoginAt?: string | null;
  };
  scopes: DetailScope[];
};

export type UserDetailContext =
  | { kind: 'platform' }
  | { kind: 'tenant'; tenantId: string; tenantName?: string; tenantType?: 'SINGLE' | 'CHAIN' | null }
  | {
      kind: 'store';
      tenantId: string;
      storeId: string;
      storeName?: string;
      tenantType?: 'SINGLE' | 'CHAIN' | null;
    };

type Props = {
  open: boolean;
  userId: string;
  context: UserDetailContext;
  invalidateKey: readonly unknown[];
  onClose: () => void;
};

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

export function UserDetailDrawer({ open, userId, context, invalidateKey, onClose }: Props) {
  const snackbar = useSnackbar();
  const confirm = useConfirmDialog();

  const queryKey = useMemo(() => {
    if (context.kind === 'platform') return ['user_detail', 'platform', userId];
    if (context.kind === 'tenant') return ['user_detail', 'tenant', context.tenantId, userId];
    return ['user_detail', 'store', context.tenantId, context.storeId, userId];
  }, [context, userId]);
  const detailQ = useQuery<DetailData>({
    queryKey,
    queryFn: async () => {
      if (context.kind === 'platform') {
        const r = await getPlatformUserDetail(userId);
        return { user: r.user, scopes: r.scopes };
      }
      if (context.kind === 'tenant') {
        const r = await getTenantUserDetail(userId);
        return { user: r.user, scopes: r.scopes };
      }
      const r = await getStoreUserDetail(userId);
      return { user: r.user, scopes: r.scopes };
    },
    enabled: open && Boolean(userId),
  });

  const detail = detailQ.data || null;

  // profile edit
  const [editing, setEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [avatarDraft, setAvatarDraft] = useState('');

  useEffect(() => {
    if (!open) {
      setEditing(false);
    }
  }, [open]);

  useEffect(() => {
    setNicknameDraft(detail?.user.nickname || '');
    setAvatarDraft(detail?.user.avatarUrl || '');
  }, [detail]);

  const profileM = useMutation({
    mutationFn: () =>
      updateAdminUserProfile(userId, {
        nickname: nicknameDraft.trim() || null,
        avatarUrl: avatarDraft.trim() || null,
      }),
    onSuccess: async () => {
      setEditing(false);
      snackbar.showMessage('已更新');
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: invalidateKey as unknown[] });
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '更新失败')),
  });

  // password reset
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState('');

  useEffect(() => {
    if (!open) {
      setPwdOpen(false);
      setNewPwd('');
    }
  }, [open]);

  const pwdM = useMutation({
    mutationFn: () => resetAdminUserPassword(userId, newPwd),
    onSuccess: () => {
      snackbar.showMessage('已重置密码');
      setPwdOpen(false);
      setNewPwd('');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '重置失败')),
  });

  // scope management
  const canAddScope = context.kind !== 'store';
  const canRemoveScope = context.kind !== 'store';
  const canDeleteUser = context.kind === 'platform';

  const contextTenantType: 'SINGLE' | 'CHAIN' | null =
    context.kind === 'tenant' || context.kind === 'store' ? context.tenantType || null : null;
  const defaultAddRole: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN' =
    context.kind === 'platform' ? 'TENANT_ADMIN' : contextTenantType === 'SINGLE' ? 'TENANT_ADMIN' : 'STORE_ADMIN';
  const [addRole, setAddRole] = useState<'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN'>(defaultAddRole);
  const [addTenant, setAddTenant] = useState<{
    tenantId: string;
    brandName: string;
    type?: 'SINGLE' | 'CHAIN';
  } | null>(null);
  const [addTenantInput, setAddTenantInput] = useState('');
  const [addTenantSearch, setAddTenantSearch] = useState('');
  const [addStore, setAddStore] = useState<{ storeId: string; name: string; subName?: string | null } | null>(null);
  const [addStoreInput, setAddStoreInput] = useState('');
  const [addStoreSearch, setAddStoreSearch] = useState('');

  useEffect(() => {
    if (open) return;
    setAddRole(defaultAddRole);
    setAddTenant(null);
    setAddTenantInput('');
    setAddTenantSearch('');
    setAddStore(null);
    setAddStoreInput('');
    setAddStoreSearch('');
  }, [open, context.kind, defaultAddRole]);

  const effectiveTenant = useMemo<{ tenantId: string; brandName: string } | null>(() => {
    if (context.kind === 'tenant')
      return { tenantId: context.tenantId, brandName: context.tenantName || context.tenantId };
    return addTenant;
  }, [addTenant, context]);

  const lockedSingleTenant = contextTenantType === 'SINGLE';

  const platformTenantsQ = useQuery({
    queryKey: ['platform_tenants', 'detail_add', addTenantSearch],
    queryFn: () => listPlatformTenants({ keyword: addTenantSearch.trim() || undefined, page: 1, pageSize: 100 }),
    enabled: open && context.kind === 'platform' && addRole !== 'SUPER_ADMIN',
  });
  const platformTenants = platformTenantsQ.data?.list || [];

  const platformStoresQ = useQuery({
    queryKey: ['platform_stores', 'detail_add', addTenant?.tenantId || '', addStoreSearch],
    queryFn: () =>
      listPlatformStores({
        tenantId: addTenant?.tenantId || undefined,
        keyword: addStoreSearch.trim() || undefined,
        page: 1,
        pageSize: 100,
      }),
    enabled: open && context.kind === 'platform' && addRole === 'STORE_ADMIN' && Boolean(addTenant?.tenantId),
  });

  const tenantStoresQ = useQuery({
    queryKey: ['tenant_stores', 'detail_add', addStoreSearch],
    queryFn: () => listTenantStores({ keyword: addStoreSearch.trim() || undefined, page: 1, pageSize: 100 }),
    enabled: open && context.kind === 'tenant' && addRole === 'STORE_ADMIN',
  });

  const storeOptions = context.kind === 'platform' ? platformStoresQ.data?.list || [] : tenantStoresQ.data?.list || [];
  const storesLoading = context.kind === 'platform' ? platformStoresQ.isLoading : tenantStoresQ.isLoading;

  const canSubmitAddScope = useMemo(() => {
    if (addRole === 'SUPER_ADMIN') return context.kind === 'platform';
    if (!effectiveTenant) return false;
    if (addRole === 'STORE_ADMIN') return Boolean(addStore);
    return true;
  }, [addRole, addStore, effectiveTenant, context.kind]);

  const addScopeM = useMutation({
    mutationFn: async () => {
      if (addRole === 'SUPER_ADMIN') {
        return createAdminScope({ userId, tenantId: 'store_default', role: 'SUPER_ADMIN' });
      }
      const tenant = effectiveTenant!;
      if (addRole === 'TENANT_ADMIN') {
        return createAdminScope({ userId, tenantId: tenant.tenantId, role: 'TENANT_ADMIN' });
      }
      return createAdminScope({
        userId,
        tenantId: tenant.tenantId,
        storeId: addStore!.storeId,
        role: 'STORE_ADMIN',
      });
    },
    onSuccess: async () => {
      snackbar.showMessage('已添加授权');
      setAddStore(null);
      setAddStoreInput('');
      setAddStoreSearch('');
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: invalidateKey as unknown[] });
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '添加失败')),
  });

  const removeScopeM = useMutation({
    mutationFn: (scopeId: string) => deleteAdminScope(scopeId),
    onSuccess: async () => {
      snackbar.showMessage('已移除授权');
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: invalidateKey as unknown[] });
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '移除失败')),
  });

  const deleteUserM = useMutation({
    mutationFn: () => deletePlatformUser(userId),
    onSuccess: async () => {
      snackbar.showMessage('已删除账号');
      onClose();
      await queryClient.invalidateQueries({ queryKey: invalidateKey as unknown[] });
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '删除失败')),
  });

  const renderScopeLabel = (s: DetailScope) => {
    const role = ROLE_LABEL[s.role];
    if (s.role === 'SUPER_ADMIN') return role;
    const tenantPart = s.tenantName || s.tenantId;
    if (s.role === 'TENANT_ADMIN') return `${role} · ${tenantPart}`;
    const storePart = s.storeName || s.storeId || '';
    return `${role} · ${tenantPart} / ${storePart}`;
  };

  return (
    <>
      <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
        <Stack sx={{ height: '100%' }}>
          <Stack direction="row" alignItems="center" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              账号详情
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Divider />

          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {detailQ.isLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }}>
                <CircularProgress size={24} />
              </Stack>
            ) : detailQ.isError ? (
              <Alert severity="error">{getErrorMessage(detailQ.error, '加载失败')}</Alert>
            ) : detail ? (
              <Stack spacing={3}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar src={editing ? avatarDraft : detail.user.avatarUrl || ''} sx={{ width: 56, height: 56 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {editing ? (
                      <Stack spacing={1}>
                        <TextField
                          size="small"
                          label="昵称"
                          value={nicknameDraft}
                          onChange={(e) => setNicknameDraft(e.target.value)}
                          fullWidth
                        />
                        <TextField
                          size="small"
                          label="头像 URL"
                          value={avatarDraft}
                          onChange={(e) => setAvatarDraft(e.target.value)}
                          fullWidth
                        />
                      </Stack>
                    ) : (
                      <>
                        <Typography variant="subtitle1" noWrap>
                          {detail.user.nickname || '-'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          账号：{detail.user.username || '-'}
                        </Typography>
                        <Tooltip title={detail.user.userId}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: 'monospace', display: 'block' }}
                            noWrap
                          >
                            {detail.user.userId}
                          </Typography>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                  {editing ? (
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        onClick={() => {
                          setNicknameDraft(detail.user.nickname || '');
                          setAvatarDraft(detail.user.avatarUrl || '');
                          setEditing(false);
                        }}
                        disabled={profileM.isPending}
                      >
                        取消
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => profileM.mutate()}
                        disabled={profileM.isPending}
                      >
                        保存
                      </Button>
                    </Stack>
                  ) : (
                    <IconButton size="small" onClick={() => setEditing(true)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>

                <Stack spacing={0.5}>
                  <Typography variant="caption" color="text.secondary">
                    上次登录：{formatTime(detail.user.lastLoginAt)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    创建时间：{formatTime(detail.user.createdAt)}
                  </Typography>
                </Stack>

                <Divider />

                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">授权范围</Typography>
                  {detail.scopes.length ? (
                    <Stack spacing={1}>
                      {detail.scopes.map((s) => (
                        <Stack
                          key={s.scopeId}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          sx={{ borderRadius: 1, bgcolor: 'action.hover', px: 1.25, py: 1 }}
                        >
                          <Chip
                            size="small"
                            color={s.role === 'SUPER_ADMIN' ? 'secondary' : 'default'}
                            label={ROLE_LABEL[s.role]}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            {s.role !== 'SUPER_ADMIN' ? (
                              <>
                                <Tooltip title={s.tenantId}>
                                  <Typography variant="body2" noWrap>
                                    {s.tenantName || s.tenantId}
                                  </Typography>
                                </Tooltip>
                                {s.storeId ? (
                                  <Tooltip title={s.storeId}>
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                      {s.storeName || s.storeId}
                                    </Typography>
                                  </Tooltip>
                                ) : null}
                              </>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                全平台
                              </Typography>
                            )}
                          </Box>
                          {canRemoveScope ? (
                            <IconButton
                              size="small"
                              disabled={removeScopeM.isPending}
                              onClick={async () => {
                                const ok = await confirm.confirm({
                                  title: '移除此授权？',
                                  description: renderScopeLabel(s),
                                  confirmText: '移除',
                                  confirmColor: 'error',
                                });
                                if (ok) removeScopeM.mutate(s.scopeId);
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          ) : null}
                        </Stack>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      暂无权限
                    </Typography>
                  )}

                  {canAddScope ? (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        添加授权范围
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <TextField
                          select
                          label="角色"
                          size="small"
                          value={addRole}
                          onChange={(e) => {
                            const v = e.target.value as typeof addRole;
                            setAddRole(v);
                            if (context.kind === 'platform') setAddTenant(null);
                            setAddStore(null);
                          }}
                          sx={{ width: 140 }}
                        >
                          {context.kind === 'platform' ? <MenuItem value="SUPER_ADMIN">平台管理员</MenuItem> : null}
                          <MenuItem value="TENANT_ADMIN">租户管理员</MenuItem>
                          {lockedSingleTenant ? null : <MenuItem value="STORE_ADMIN">门店管理员</MenuItem>}
                        </TextField>
                        {context.kind === 'platform' && addRole !== 'SUPER_ADMIN' ? (
                          <Autocomplete
                            options={platformTenants}
                            value={
                              addTenant
                                ? platformTenants.find((t) => t.tenantId === addTenant.tenantId) || addTenant
                                : null
                            }
                            inputValue={addTenantInput}
                            onInputChange={(_, v, reason) => {
                              setAddTenantInput(v);
                              if (reason === 'input') setAddTenantSearch(v);
                              if (reason === 'clear') setAddTenantSearch('');
                            }}
                            onChange={(_, v) => {
                              setAddTenant(v ? { tenantId: v.tenantId, brandName: v.brandName, type: v.type } : null);
                              setAddStore(null);
                            }}
                            isOptionEqualToValue={(o, v) => o.tenantId === v.tenantId}
                            getOptionLabel={(t) => t.brandName}
                            getOptionDisabled={(t) => addRole === 'STORE_ADMIN' && t.type === 'SINGLE'}
                            renderOption={(props, t) => {
                              const disabled = addRole === 'STORE_ADMIN' && t.type === 'SINGLE';
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
                            sx={{ flex: 2, minWidth: 160 }}
                          />
                        ) : null}
                        {addRole === 'STORE_ADMIN' ? (
                          <Autocomplete
                            options={storeOptions}
                            value={
                              addStore ? storeOptions.find((s) => s.storeId === addStore.storeId) || addStore : null
                            }
                            inputValue={addStoreInput}
                            onInputChange={(_, v, reason) => {
                              setAddStoreInput(v);
                              if (reason === 'input') setAddStoreSearch(v);
                              if (reason === 'clear') setAddStoreSearch('');
                            }}
                            onChange={(_, v) =>
                              setAddStore(v ? { storeId: v.storeId, name: v.name, subName: v.subName } : null)
                            }
                            isOptionEqualToValue={(o, v) => o.storeId === v.storeId}
                            getOptionLabel={(s) => [s.name, s.subName].filter(Boolean).join(' · ') || s.storeId}
                            renderInput={(params) => <TextField {...params} label="门店" size="small" />}
                            loading={storesLoading}
                            disabled={context.kind === 'platform' && !addTenant}
                            sx={{ flex: 2, minWidth: 180 }}
                          />
                        ) : null}
                      </Stack>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => addScopeM.mutate()}
                        disabled={!canSubmitAddScope || addScopeM.isPending}
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        添加授权
                      </Button>
                    </Stack>
                  ) : null}
                </Stack>

                <Divider />

                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">账号维护</Typography>
                  {pwdOpen ? (
                    <Stack direction="row" spacing={1}>
                      <TextField
                        size="small"
                        label="新密码（≥6 位）"
                        type="password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        size="small"
                        onClick={() => {
                          setPwdOpen(false);
                          setNewPwd('');
                        }}
                        disabled={pwdM.isPending}
                      >
                        取消
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => pwdM.mutate()}
                        disabled={newPwd.length < 6 || pwdM.isPending}
                      >
                        重置
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setPwdOpen(true)}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      重置密码
                    </Button>
                  )}
                  {canDeleteUser ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      disabled={deleteUserM.isPending}
                      onClick={async () => {
                        const ok = await confirm.confirm({
                          title: '删除此账号？',
                          description: '删除后账号及其所有授权将失效，不可恢复。',
                          confirmText: '删除',
                          confirmColor: 'error',
                        });
                        if (ok) deleteUserM.mutate();
                      }}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      删除账号
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
            ) : null}
          </Box>
        </Stack>
      </Drawer>
      {confirm.dialog}
    </>
  );
}
