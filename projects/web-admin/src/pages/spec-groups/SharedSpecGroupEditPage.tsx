import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createSharedSpecGroup,
  deleteSharedSpecGroup,
  getSharedSpecGroup,
  updateSharedSpecGroup,
} from '../../api/sharedSpecGroups';
import { queryClient } from '../../app/queryClient';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { SpecGroupEditor, type GroupEditor } from '../../components/spec-groups/SpecGroupEditor';
import { getErrorMessage } from '../../utils/error';
import { genId } from '../../utils/id';
import { centsToYuanInput, parseYuanToCents } from '../../utils/money';
import { useAdminContextStore } from '../../store/adminContext';
import { getMyAdminScopes } from '../../api/adminScopes';
import { getAdminCapabilities } from '../../authz/adminAuthz';

type Mode = 'create' | 'edit';

const createEmptyGroup = (): GroupEditor => ({
  id: genId('ssg'),
  name: '',
  isStock: false,
  isRequired: false,
  minSelection: 0,
  maxSelection: 1,
  options: [{ id: genId('opt'), name: '', priceYuan: '0.00' }],
  defaultOptionIds: [],
});

export function SharedSpecGroupEditPage(props: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const sharedSpecGroupId = props.mode === 'edit' ? String(params.sharedSpecGroupId || '') : '';
  const snackbar = useSnackbar();
  const confirmDialog = useConfirmDialog();
  const [group, setGroup] = useState<GroupEditor>(createEmptyGroup());
  const [description, setDescription] = useState('');

  const board = useAdminContextStore((s) => s.board);
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
  const scopesQ = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: getMyAdminScopes });
  const caps = useMemo(
    () => getAdminCapabilities({ scopes: scopesQ.data?.list || [], tenantId, storeId }),
    [scopesQ.data?.list, storeId, tenantId],
  );
  const canEditCatalog = caps.canManageSharedCatalog;

  const qDetail = useQuery({
    queryKey: ['sharedSpecGroup', sharedSpecGroupId],
    queryFn: () => getSharedSpecGroup(sharedSpecGroupId),
    enabled: props.mode === 'edit' && !!sharedSpecGroupId,
  });

  useEffect(() => {
    if (props.mode !== 'edit') return;
    if (!qDetail.data) return;
    const g = qDetail.data;
    setGroup({
      id: g.sharedSpecGroupId,
      name: g.name,
      isStock: false,
      isRequired: g.isRequired,
      minSelection: g.minSelection,
      maxSelection: g.maxSelection,
      defaultOptionIds: g.defaultOptionIds || [],
      options: (g.options || []).map((o) => ({
        id: o.id,
        name: o.name,
        priceYuan: centsToYuanInput(o.priceCents),
      })),
    });
    setDescription(g.description || '');
  }, [props.mode, qDetail.data]);

  const goods = useMemo(() => qDetail.data?.goods || [], [qDetail.data]);
  const routePrefix = useMemo(() => {
    if (location.pathname.startsWith('/tenant/shared-data/')) return '/tenant/shared-data';
    if (location.pathname.startsWith('/store/')) return '/store';
    return '';
  }, [location.pathname]);

  useEffect(() => {
    if (board !== 'store') return;
    if (canEditCatalog) return;
    snackbar.showMessage('无权限', 'error');
    navigate(`${routePrefix}/spec-groups`, { replace: true });
  }, [board, canEditCatalog, navigate, routePrefix, snackbar]);

  const buildPayload = (g: GroupEditor) => {
    const name = g.name.trim();
    if (!name) throw new Error('请输入规格组名称');
    if (!g.options.length) throw new Error('请至少添加一个规格项');
    for (const o of g.options) {
      if (!o.name.trim()) throw new Error('请填写规格项名称');
    }
    const minSelection = g.isRequired ? Math.max(1, g.minSelection) : Math.max(0, g.minSelection);
    const maxSelection = Math.min(Math.max(minSelection, g.maxSelection), g.options.length);
    const optionIds = new Set(g.options.map((o) => o.id));
    const defaultOptionIds = (g.defaultOptionIds || [])
      .filter((id) => optionIds.has(id))
      .slice(0, Math.max(0, maxSelection));
    return {
      name,
      description: description.trim() ? description.trim() : null,
      isRequired: g.isRequired,
      minSelection,
      maxSelection,
      defaultOptionIds,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name.trim(),
        priceCents: parseYuanToCents(o.priceYuan),
      })),
    };
  };

  const mSave = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(group);
      if (props.mode === 'create') {
        return await createSharedSpecGroup(payload);
      }
      return await updateSharedSpecGroup(sharedSpecGroupId, payload);
    },
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ['sharedSpecGroups'] });
      if (props.mode === 'create') {
        navigate(`${routePrefix}/spec-groups/${resp.sharedSpecGroupId}`, { replace: true });
      } else {
        await queryClient.invalidateQueries({
          queryKey: ['sharedSpecGroup', sharedSpecGroupId],
        });
      }
      snackbar.showMessage('保存成功');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '保存失败')),
  });

  const mDelete = useMutation({
    mutationFn: () => deleteSharedSpecGroup(sharedSpecGroupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sharedSpecGroups'] });
      snackbar.showMessage('已删除规格组');
      navigate(`${routePrefix}/spec-groups`);
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '删除失败')),
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{props.mode === 'create' ? '新增规格组' : '规格组详情'}</Typography>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => navigate(`${routePrefix}/spec-groups`)}>返回</Button>
            {props.mode === 'edit' && canEditCatalog ? (
              <Button
                color="error"
                disabled={goods.length > 0 || mDelete.isPending}
                onClick={() => {
                  void (async () => {
                    const ok = await confirmDialog.confirm({
                      title: '确认删除规格组',
                      description: `确认删除规格组「${group.name}」？`,
                      confirmText: '删除',
                      confirmColor: 'error',
                    });
                    if (!ok) return;
                    mDelete.mutate();
                  })();
                }}
              >
                删除
              </Button>
            ) : null}
            {canEditCatalog ? (
              <Button variant="contained" onClick={() => mSave.mutate()} disabled={mSave.isPending}>
                保存
              </Button>
            ) : null}
          </Stack>
        </Stack>
        <Box sx={{ mt: 2 }}>
          <TextField
            size="small"
            fullWidth
            label="描述（仅管理端提示）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Box>
        <Box sx={{ mt: 2 }}>
          <SpecGroupEditor group={group} index={0} total={1} mode="shared" onChange={setGroup} />
        </Box>
      </Box>

      {props.mode === 'edit' ? (
        <Box>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            关联菜品
          </Typography>
          {goods.length ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>菜品名称</TableCell>
                  <TableCell width={160} align="right">
                    操作
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {goods.map((g) => (
                  <TableRow key={g.goodId}>
                    <TableCell>{g.name}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => navigate(`/goods/${g.goodId}`)}>
                        查看菜品
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" color="text.secondary">
              暂无关联菜品
            </Typography>
          )}
        </Box>
      ) : null}
    </Box>
  );
}
