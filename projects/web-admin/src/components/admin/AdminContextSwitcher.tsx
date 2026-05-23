import { CircularProgress, FormControl, MenuItem, Select, Stack } from '@mui/material';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMyAdminScopes } from '../../api/adminScopes';
import { listPlatformStores } from '../../api/platformStores';
import { listPlatformTenants } from '../../api/platformTenants';
import { listTenantStores } from '../../api/tenantStores';
import { useAdminContextStore } from '../../store/adminContext';

type Board = 'platform' | 'tenant' | 'store';

export function AdminContextSwitcher() {
  const navigate = useNavigate();
  const ctx = useAdminContextStore();
  const setContext = useAdminContextStore((s) => s.setContext);
  const [pending, setPending] = useState(false);

  const scopesQ = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: () => getMyAdminScopes() });
  const scopes = useMemo(() => scopesQ.data?.list ?? [], [scopesQ.data?.list]);

  const allowPlatform = useMemo(() => Boolean(scopesQ.data?.platform), [scopesQ.data?.platform]);
  const hasTenantAdmin = useMemo(() => scopes.some((s) => s.role === 'TENANT_ADMIN'), [scopes]);

  const tenantDims = useMemo(() => scopesQ.data?.tenants ?? [], [scopesQ.data?.tenants]);
  const tenantDimById = useMemo(() => new Map(tenantDims.map((t) => [t.tenantId, t])), [tenantDims]);

  const formatStoreLabel = (opts: { name?: string | null; subName?: string | null; fallback: string }) => {
    const joined = [opts.name, opts.subName].filter(Boolean).join(' · ');
    return joined || opts.fallback;
  };

  const storeDimsByStoreId = useMemo(() => {
    const map = new Map<string, { storeName: string | null; storeSubName: string | null }>();
    for (const t of tenantDims) {
      for (const s of t.stores) {
        map.set(s.storeId, { storeName: s.storeName ?? null, storeSubName: s.storeSubName ?? null });
      }
    }
    return map;
  }, [tenantDims]);

  const storeScopePairs = useMemo(() => {
    const pairs = scopes
      .filter((s) => s.role === 'STORE_ADMIN' && s.storeId)
      .map((s) => {
        const storeId = s.storeId as string;
        const dim = storeDimsByStoreId.get(storeId);
        return {
          tenantId: s.tenantId,
          storeId,
          storeName: dim?.storeName ?? null,
          storeSubName: dim?.storeSubName ?? null,
        };
      });
    const uniq = new Map<string, (typeof pairs)[number]>();
    for (const p of pairs) uniq.set(p.storeId, p);
    return Array.from(uniq.values());
  }, [scopes, storeDimsByStoreId]);

  const hasAnyChainTenant = useMemo(() => tenantDims.some((t) => t.tenantType === 'CHAIN'), [tenantDims]);

  const allowedBoards = useMemo((): Board[] => {
    if (allowPlatform) return hasAnyChainTenant ? ['platform', 'tenant', 'store'] : ['platform', 'store'];
    const chainTenantAdminCount = tenantDims.filter(
      (t) => t.effectiveRole === 'TENANT_ADMIN' && t.tenantType === 'CHAIN',
    ).length;
    if (hasTenantAdmin && chainTenantAdminCount > 0) return ['tenant', 'store'];
    if (hasTenantAdmin) return ['store'];
    if (storeScopePairs.length) return ['store'];
    return ['store'];
  }, [allowPlatform, hasAnyChainTenant, hasTenantAdmin, storeScopePairs.length, tenantDims]);

  const ensureBoardAllowed = (b: Board) => (allowedBoards.includes(b) ? b : allowedBoards[0]);
  const boardValue = ensureBoardAllowed(ctx.board);

  const tenantsQ = useQuery({
    queryKey: ['platform_tenants', 'switcher'],
    queryFn: () => listPlatformTenants({ page: 1, pageSize: 100 }),
    enabled: allowPlatform,
  });
  const platformTenants = useMemo(() => tenantsQ.data?.list ?? [], [tenantsQ.data?.list]);

  const platformTenantById = useMemo(() => new Map(platformTenants.map((t) => [t.tenantId, t])), [platformTenants]);

  const tenantBoardTenants = useMemo(() => {
    if (allowPlatform) {
      return platformTenants
        .filter((t) => t.type === 'CHAIN')
        .map((t) => ({ tenantId: t.tenantId, label: t.brandName }));
    }
    return tenantDims
      .filter((t) => t.effectiveRole === 'TENANT_ADMIN' && t.tenantType === 'CHAIN')
      .map((t) => ({ tenantId: t.tenantId, label: t.tenantName || t.tenantId }));
  }, [allowPlatform, platformTenants, tenantDims]);

  const storeBoardTenants = useMemo(() => {
    if (allowPlatform) {
      return platformTenants.map((t) => ({
        tenantId: t.tenantId,
        label: t.brandName,
        type: t.type,
        primaryStoreId: t.primaryStoreId || null,
      }));
    }
    return tenantDims
      .filter((t) => t.effectiveRole === 'TENANT_ADMIN' || t.stores.some((s) => s.effectiveRole === 'STORE_ADMIN'))
      .map((t) => ({
        tenantId: t.tenantId,
        label: t.tenantName || t.tenantId,
        type: t.tenantType || null,
        primaryStoreId: null,
      }));
  }, [allowPlatform, platformTenants, tenantDims]);

  const selectedTenantIdForTenantBoard = useMemo(() => {
    if (boardValue !== 'tenant') return null;
    const ids = tenantBoardTenants.map((t) => t.tenantId);
    if (ctx.tenantId && ids.includes(ctx.tenantId)) return ctx.tenantId;
    return ids[0] || null;
  }, [boardValue, ctx.tenantId, tenantBoardTenants]);

  const selectedTenantIdForStoreBoard = useMemo(() => {
    if (boardValue !== 'store') return null;
    const ids = storeBoardTenants.map((t) => t.tenantId);
    if (ctx.tenantId && ids.includes(ctx.tenantId)) return ctx.tenantId;
    if (!allowPlatform && !hasTenantAdmin && storeScopePairs.length) return storeScopePairs[0].tenantId;
    return ids[0] || null;
  }, [allowPlatform, boardValue, ctx.tenantId, hasTenantAdmin, storeBoardTenants, storeScopePairs]);

  const platformStoresQ = useQuery({
    queryKey: ['platform_stores', 'switcher', selectedTenantIdForStoreBoard],
    queryFn: () => listPlatformStores({ tenantId: selectedTenantIdForStoreBoard || undefined, page: 1, pageSize: 200 }),
    enabled:
      allowPlatform &&
      boardValue === 'store' &&
      Boolean(selectedTenantIdForStoreBoard) &&
      platformTenantById.get(selectedTenantIdForStoreBoard || '')?.type === 'CHAIN',
  });
  const platformStores = useMemo(() => platformStoresQ.data?.list ?? [], [platformStoresQ.data?.list]);

  const tenantStoresQ = useQuery({
    queryKey: ['tenant_stores', 'switcher', selectedTenantIdForStoreBoard],
    queryFn: () => listTenantStores({ page: 1, pageSize: 200 }),
    enabled: !allowPlatform && boardValue === 'store' && hasTenantAdmin && Boolean(selectedTenantIdForStoreBoard),
  });
  const tenantStores = useMemo(() => tenantStoresQ.data?.list ?? [], [tenantStoresQ.data?.list]);

  const storeOptionsFromDims = useMemo(() => {
    const tenantId = selectedTenantIdForStoreBoard;
    if (!tenantId) return [];
    const t = tenantDimById.get(tenantId);
    if (!t) return [];
    return t.stores.map((s) => ({
      storeId: s.storeId,
      storeName: s.storeName ?? null,
      storeSubName: s.storeSubName ?? null,
      isPrimary: Boolean(s.storeIsPrimary),
    }));
  }, [selectedTenantIdForStoreBoard, tenantDimById]);

  const preferPrimaryStoreId = (rows: Array<{ storeId: string; isPrimary?: boolean | null }>) => {
    const p = rows.find((s) => Boolean(s.isPrimary));
    return p?.storeId || rows[0]?.storeId || '';
  };

  const selectedStoreIdForStoreBoard = useMemo(() => {
    if (boardValue !== 'store') return null;
    const tenantId = selectedTenantIdForStoreBoard;
    if (!tenantId) return null;
    if (allowPlatform) {
      const tenant = platformTenantById.get(tenantId);
      if (tenant?.type === 'SINGLE') return tenant.primaryStoreId || null;
      const ids = platformStores.map((s) => s.storeId);
      if (ctx.storeId && ids.includes(ctx.storeId)) return ctx.storeId;
      return (
        preferPrimaryStoreId(
          platformStores.map((s) => ({ storeId: s.storeId, isPrimary: Number(s.isPrimary || 0) === 1 })),
        ) || null
      );
    }
    if (tenantStores.length) {
      const ids = tenantStores.map((s) => s.storeId);
      if (ctx.storeId && ids.includes(ctx.storeId)) return ctx.storeId;
      return (
        preferPrimaryStoreId(
          tenantStores.map((s) => ({ storeId: s.storeId, isPrimary: Number(s.isPrimary || 0) === 1 })),
        ) || null
      );
    }
    const ids = storeOptionsFromDims.map((s) => s.storeId);
    if (ctx.storeId && ids.includes(ctx.storeId)) return ctx.storeId;
    return preferPrimaryStoreId(storeOptionsFromDims) || null;
  }, [
    allowPlatform,
    boardValue,
    ctx.storeId,
    platformStores,
    platformTenantById,
    selectedTenantIdForStoreBoard,
    storeOptionsFromDims,
    tenantStores,
  ]);

  const storeSelectOptions = useMemo(() => {
    if (tenantStores.length) {
      return tenantStores.map((s) => ({
        storeId: s.storeId,
        label: formatStoreLabel({ name: s.name, subName: s.subName, fallback: s.storeId }),
      }));
    }
    return storeOptionsFromDims.map((s) => ({
      storeId: s.storeId,
      label: formatStoreLabel({ name: s.storeName, subName: s.storeSubName, fallback: s.storeId }),
    }));
  }, [storeOptionsFromDims, tenantStores]);

  const boardLabel = (b: Board) => (b === 'platform' ? '平台' : b === 'tenant' ? '租户' : '门店');

  const applyContext = async (next: { board: Board; tenantId?: string | null; storeId?: string | null }) => {
    setPending(true);
    try {
      const board = ensureBoardAllowed(next.board);
      let platformTenantsResolved = platformTenants;
      if (allowPlatform && (board === 'tenant' || board === 'store') && platformTenantsResolved.length === 0) {
        const r = await tenantsQ.refetch();
        platformTenantsResolved = r.data?.list ?? [];
      }
      let tenantId: string | null = null;
      let storeId: string | null = null;
      if (board === 'platform') {
        tenantId = null;
        storeId = null;
      } else if (board === 'tenant') {
        if (allowPlatform) {
          const chain = platformTenantsResolved.filter((t) => t.type === 'CHAIN');
          tenantId = next.tenantId || chain[0]?.tenantId || null;
        } else {
          tenantId = next.tenantId || tenantBoardTenants[0]?.tenantId || null;
        }
        storeId = null;
      } else {
        // 确保获取有效的租户 ID
        tenantId =
          next.tenantId ||
          (allowPlatform ? platformTenantsResolved[0]?.tenantId : storeBoardTenants[0]?.tenantId) ||
          null;
        if (tenantId) {
          // 为该租户获取有效的门店 ID
          if (allowPlatform) {
            const tenant = platformTenantsResolved.find((t) => t.tenantId === tenantId) || null;
            storeId = tenant?.primaryStoreId || null;
          } else {
            const dim = tenantDimById.get(tenantId) || null;
            const rows = dim?.stores.map((s) => ({ storeId: s.storeId, isPrimary: Boolean(s.storeIsPrimary) })) || [];
            storeId = preferPrimaryStoreId(rows) || null;
          }
        }
        // 允许用户指定的门店 ID 覆盖默认值
        if (next.storeId) {
          storeId = next.storeId;
        }
      }
      if (board === 'store' && (!tenantId || !storeId)) return;
      setContext({ board, tenantId, storeId });

      if (board === 'platform') {
        navigate('/platform/overview', { replace: true });
        return;
      }
      if (board === 'tenant') {
        navigate('/tenant/overview', { replace: true });
        return;
      }
      navigate('/store/overview', { replace: true });
    } finally {
      setPending(false);
    }
  };

  const selectSx = {
    color: '#fff',
    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.8)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
    '.MuiSelect-icon': { color: '#fff' },
  } as const;

  if (scopesQ.isLoading || pending) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <CircularProgress size={18} />
      </Stack>
    );
  }

  if (scopesQ.isError) return null;

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <FormControl size="small" sx={{ width: 'auto' }}>
        <Select
          autoWidth
          value={boardValue}
          onChange={(e) => applyContext({ board: e.target.value as Board })}
          disabled={pending || scopesQ.isLoading}
          sx={selectSx}
        >
          {allowedBoards.map((b) => (
            <MenuItem key={b} value={b}>
              {boardLabel(b)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {boardValue === 'tenant' ? (
        <FormControl size="small" sx={{ width: 'auto' }}>
          <Select
            autoWidth
            value={selectedTenantIdForTenantBoard || ''}
            onChange={(e) => void applyContext({ board: 'tenant', tenantId: String(e.target.value), storeId: null })}
            disabled={pending || scopesQ.isLoading || tenantsQ.isLoading || tenantBoardTenants.length <= 1}
            sx={selectSx}
          >
            {tenantBoardTenants.map((t) => (
              <MenuItem key={t.tenantId} value={t.tenantId} title={t.tenantId}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}

      {boardValue === 'store' && allowPlatform ? (
        <FormControl size="small" sx={{ width: 'auto' }}>
          <Select
            autoWidth
            value={selectedTenantIdForStoreBoard || ''}
            onChange={(e) => {
              const t = String(e.target.value || '');
              const tenant = platformTenantById.get(t);
              if (tenant?.type === 'SINGLE') {
                void applyContext({ board: 'store', tenantId: t, storeId: tenant.primaryStoreId || null });
                return;
              }
              void applyContext({ board: 'store', tenantId: t, storeId: tenant?.primaryStoreId || null });
            }}
            disabled={pending || scopesQ.isLoading || tenantsQ.isLoading}
            sx={selectSx}
          >
            {storeBoardTenants.map((t) => (
              <MenuItem key={t.tenantId} value={t.tenantId} title={t.tenantId}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}

      {boardValue === 'store' && !allowPlatform && hasTenantAdmin && storeBoardTenants.length > 1 ? (
        <FormControl size="small" sx={{ width: 'auto' }}>
          <Select
            autoWidth
            value={selectedTenantIdForStoreBoard || ''}
            onChange={(e) => {
              const t = String(e.target.value || '');
              const dim = tenantDimById.get(t);
              const rows = dim?.stores.map((s) => ({ storeId: s.storeId, isPrimary: Boolean(s.storeIsPrimary) })) || [];
              const storeId = preferPrimaryStoreId(rows);
              void applyContext({ board: 'store', tenantId: t, storeId: storeId || null });
            }}
            disabled={pending || scopesQ.isLoading}
            sx={selectSx}
          >
            {storeBoardTenants.map((t) => (
              <MenuItem key={t.tenantId} value={t.tenantId} title={t.tenantId}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}

      {boardValue === 'store' &&
      allowPlatform &&
      platformTenantById.get(selectedTenantIdForStoreBoard || '')?.type === 'CHAIN' ? (
        <FormControl size="small" sx={{ width: 'auto' }}>
          <Select
            autoWidth
            value={selectedStoreIdForStoreBoard || ''}
            onChange={(e) =>
              void applyContext({
                board: 'store',
                tenantId: selectedTenantIdForStoreBoard,
                storeId: String(e.target.value || ''),
              })
            }
            disabled={pending || scopesQ.isLoading || platformStoresQ.isLoading || !selectedTenantIdForStoreBoard}
            sx={selectSx}
          >
            {platformStores.map((s) => (
              <MenuItem key={s.storeId} value={s.storeId} title={s.storeId}>
                {[s.name, s.subName].filter(Boolean).join(' · ')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}

      {boardValue === 'store' && !allowPlatform && hasTenantAdmin ? (
        tenantDimById.get(selectedTenantIdForStoreBoard || '')?.tenantType === 'SINGLE' &&
        storeOptionsFromDims.length <= 1 ? null : (
          <FormControl size="small" sx={{ width: 'auto' }}>
            <Select
              autoWidth
              value={selectedStoreIdForStoreBoard || ''}
              onChange={(e) =>
                void applyContext({
                  board: 'store',
                  tenantId: selectedTenantIdForStoreBoard,
                  storeId: String(e.target.value || ''),
                })
              }
              disabled={pending || scopesQ.isLoading || tenantStoresQ.isLoading}
              sx={selectSx}
            >
              {storeSelectOptions.map((s) => (
                <MenuItem key={s.storeId} value={s.storeId} title={s.storeId}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )
      ) : null}

      {boardValue === 'store' && !allowPlatform && !hasTenantAdmin && storeScopePairs.length > 1 ? (
        <FormControl size="small" sx={{ width: 'auto' }}>
          <Select
            autoWidth
            value={ctx.storeId || ''}
            onChange={(e) => {
              const storeId = String(e.target.value || '');
              const pair = storeScopePairs.find((x) => x.storeId === storeId);
              if (!pair) return;
              void applyContext({ board: 'store', tenantId: pair.tenantId, storeId: pair.storeId });
            }}
            disabled={pending || scopesQ.isLoading}
            sx={selectSx}
          >
            {storeScopePairs.map((s) => (
              <MenuItem key={s.storeId} value={s.storeId} title={`${s.tenantId} / ${s.storeId}`}>
                {formatStoreLabel({ name: s.storeName, subName: s.storeSubName, fallback: s.storeId })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}
    </Stack>
  );
}
