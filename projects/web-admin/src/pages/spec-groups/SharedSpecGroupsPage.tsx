import {
  Box,
  Button,
  Collapse,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { deleteSharedSpecGroup, getSharedSpecGroups } from '../../api/sharedSpecGroups';
import { formatCents } from '../../utils/money';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { getErrorMessage } from '../../utils/error';
import { useAdminContextStore } from '../../store/adminContext';
import { getMyAdminScopes } from '../../api/adminScopes';
import { getAdminCapabilities } from '../../authz/adminAuthz';
import { TermHelpIcon, TermTooltip } from '../../components/term-tooltip/TermTooltip';

export function SharedSpecGroupsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
  const confirmDialog = useConfirmDialog();
  const snackbar = useSnackbar();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const scopesQ = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: getMyAdminScopes });
  const caps = useMemo(
    () => getAdminCapabilities({ scopes: scopesQ.data?.list || [], tenantId, storeId }),
    [scopesQ.data?.list, storeId, tenantId],
  );
  const canEditCatalog = caps.canManageSharedCatalog;

  const routePrefix = useMemo(() => {
    if (location.pathname.startsWith('/tenant/shared-data/')) return '/tenant/shared-data';
    if (location.pathname.startsWith('/store/')) return '/store';
    return '';
  }, [location.pathname]);

  const qList = useQuery({
    queryKey: ['sharedSpecGroups', tenantId, storeId],
    queryFn: () => getSharedSpecGroups(),
  });
  const rows = qList.data?.list || [];

  const mDelete = useMutation({
    mutationFn: (sharedSpecGroupId: string) => deleteSharedSpecGroup(sharedSpecGroupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sharedSpecGroups'] });
      snackbar.showMessage('已删除规格组');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '删除失败')),
  });

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6">规格管理</Typography>
          <TermHelpIcon term="sharedNonStockSpecGroup" size={18} />
        </Stack>
        {canEditCatalog ? (
          <Button variant="contained" onClick={() => navigate(`${routePrefix}/spec-groups/new`)}>
            新增规格组
          </Button>
        ) : null}
      </Stack>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell width={48} />
            <TableCell>
              <TermTooltip term="specGroup" label="规格组名称" />
            </TableCell>
            <TableCell width={120}>关联菜品数</TableCell>
            <TableCell width={220} align="right">
              操作
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((g) => (
            <>
              <TableRow key={g.sharedSpecGroupId}>
                <TableCell>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setExpanded((cur) => ({
                        ...cur,
                        [g.sharedSpecGroupId]: !cur[g.sharedSpecGroupId],
                      }))
                    }
                  >
                    {expanded[g.sharedSpecGroupId] ? (
                      <KeyboardArrowUpIcon fontSize="small" />
                    ) : (
                      <KeyboardArrowDownIcon fontSize="small" />
                    )}
                  </IconButton>
                </TableCell>
                <TableCell>{g.name}</TableCell>
                <TableCell>{g.goodsCount ?? 0}</TableCell>
                <TableCell align="right">
                  {canEditCatalog ? (
                    <Button size="small" onClick={() => navigate(`${routePrefix}/spec-groups/${g.sharedSpecGroupId}`)}>
                      编辑
                    </Button>
                  ) : null}
                  {canEditCatalog ? (
                    <Button
                      size="small"
                      color="error"
                      disabled={(g.goodsCount ?? 0) > 0 || mDelete.isPending}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirmDialog.confirm({
                            title: '确认删除规格组',
                            description: `确认删除规格组「${g.name}」？`,
                            confirmText: '删除',
                            confirmColor: 'error',
                          });
                          if (!ok) return;
                          mDelete.mutate(g.sharedSpecGroupId);
                        })();
                      }}
                    >
                      删除
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
              <TableRow key={`${g.sharedSpecGroupId}-options`}>
                <TableCell colSpan={4} sx={{ p: 0 }}>
                  <Collapse in={Boolean(expanded[g.sharedSpecGroupId])} timeout="auto" unmountOnExit>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>规格名称</TableCell>
                          <TableCell width={140}>加价</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(g.options || []).map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>{o.name}</TableCell>
                            <TableCell>{formatCents(o.priceCents)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Collapse>
                </TableCell>
              </TableRow>
            </>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
