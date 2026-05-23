import { CircularProgress, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyAdminScopes } from '../../api/adminScopes';
import { useAdminContextStore } from '../../store/adminContext';

export function AutoEntryRedirect() {
  const navigate = useNavigate();
  const setContext = useAdminContextStore((s) => s.setContext);
  const reset = useAdminContextStore((s) => s.reset);
  const q = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: getMyAdminScopes });
  const tenantScope = q.data?.list?.find((s) => s.role === 'TENANT_ADMIN') || null;

  useEffect(() => {
    if (!q.data) return;
    const scopes = q.data.list || [];
    const tenants = q.data.tenants || [];

    const hasSuper = Boolean(q.data.platform);
    if (hasSuper) {
      setContext({ board: 'platform', tenantId: null, storeId: null });
      navigate('/platform/overview', { replace: true });
      return;
    }

    if (tenantScope) {
      if (tenantScope.tenantType === 'SINGLE') {
        const dimTenant = tenants.find((t) => t.tenantId === tenantScope.tenantId) || null;
        const stores = dimTenant?.stores || [];
        const primary = stores.find((s) => s.storeIsPrimary)?.storeId || stores[0]?.storeId || null;
        if (!primary) {
          setContext({ board: 'tenant', tenantId: tenantScope.tenantId, storeId: null });
          navigate('/tenant/overview', { replace: true });
          return;
        }
        setContext({ board: 'store', tenantId: tenantScope.tenantId, storeId: primary });
        navigate('/store/overview', { replace: true });
        return;
      }
      setContext({ board: 'tenant', tenantId: tenantScope.tenantId, storeId: null });
      navigate('/tenant/overview', { replace: true });
      return;
    }

    const storeScope = scopes.find((s) => s.role === 'STORE_ADMIN' && s.storeId);
    if (storeScope && storeScope.storeId) {
      setContext({ board: 'store', tenantId: storeScope.tenantId, storeId: storeScope.storeId });
      navigate('/store/overview', { replace: true });
      return;
    }

    reset();
    navigate('/login', { replace: true });
  }, [navigate, q.data, reset, setContext, tenantScope]);

  return (
    <Stack direction="row" alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
      <CircularProgress />
    </Stack>
  );
}
