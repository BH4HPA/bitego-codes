import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ellipsisBoxSx,
  nowrapCellSx,
  stickyRightCellSx,
  stickyRightHeadCellSx,
} from '../../components/table/stickyCells';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { queryClient } from '../../app/queryClient';
import { createCategory, deleteCategory, getCategories, updateCategory } from '../../api/categories';
import type { CategoryDTO } from '../../api/types';
import { getErrorMessage } from '../../utils/error';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { useConfirmDialog } from '../../components/confirm/useConfirmDialog';
import { reorderCategories } from './reorder';
import { useAdminContextStore } from '../../store/adminContext';
import { getMyAdminScopes } from '../../api/adminScopes';
import { getAdminCapabilities } from '../../authz/adminAuthz';
import { TermHelpIcon, TermTooltip } from '../../components/term-tooltip/TermTooltip';

type EditorState =
  | { open: false }
  | {
      open: true;
      mode: 'create';
      init: { name: string; subtitle: string; badgeText: string; sort: number };
    }
  | {
      open: true;
      mode: 'edit';
      init: {
        categoryId: string;
        name: string;
        subtitle: string;
        badgeText: string;
        sort: number;
      };
    };

export function CategoriesPage() {
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);

  const scopesQ = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: getMyAdminScopes });
  const caps = useMemo(
    () => getAdminCapabilities({ scopes: scopesQ.data?.list || [], tenantId, storeId }),
    [scopesQ.data?.list, storeId, tenantId],
  );
  const canEditCatalog = caps.canManageSharedCatalog;

  const q = useQuery({
    queryKey: ['categories', tenantId, storeId, { status: 'ACTIVE', page: 1, pageSize: 1000 }],
    queryFn: () => getCategories({ status: 'ACTIVE', page: 1, pageSize: 1000 }),
  });
  const snackbar = useSnackbar();
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const confirmDialog = useConfirmDialog();
  const [ordered, setOrdered] = useState<CategoryDTO[] | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onClose = () => setEditor({ open: false });

  const mCreate = useMutation({
    mutationFn: (params: { name: string; subtitle: string; badgeText: string; sort: number }) =>
      createCategory({
        name: params.name,
        subtitle: params.subtitle,
        badgeText: params.badgeText,
        sort: params.sort,
        status: 'ACTIVE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      onClose();
      snackbar.showMessage('保存成功');
    },
  });

  const mUpdate = useMutation({
    mutationFn: (params: { categoryId: string; name: string; subtitle: string; badgeText: string; sort: number }) =>
      updateCategory(params.categoryId, {
        name: params.name,
        subtitle: params.subtitle,
        badgeText: params.badgeText,
        sort: params.sort,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      onClose();
      snackbar.showMessage('保存成功');
    },
  });

  const mDelete = useMutation({
    mutationFn: (categoryId: string) => deleteCategory(categoryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      snackbar.showMessage('保存成功');
    },
  });

  const mReorder = useMutation({
    mutationFn: async (nextRows: CategoryDTO[]) => {
      await Promise.all(nextRows.map((c) => updateCategory(c.categoryId, { sort: c.sort })));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      snackbar.showMessage('排序已更新');
    },
    onError: (e) => {
      snackbar.showMessage(getErrorMessage(e, '排序更新失败'));
    },
  });

  const rows = useMemo(() => {
    if (ordered) return ordered;
    return q.data?.list || [];
  }, [ordered, q.data]);

  useEffect(() => {
    if (!q.data?.list) return;
    if (activeDragId) return;
    if (mReorder.isPending) return;
    setOrdered(q.data.list);
  }, [activeDragId, mReorder.isPending, q.data?.list]);

  const commitReorder = async (activeId: string, overId: string) => {
    const base = ordered || q.data?.list || [];
    const fromIndex = base.findIndex((x) => x.categoryId === activeId);
    const toIndex = base.findIndex((x) => x.categoryId === overId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const next = reorderCategories(base, fromIndex, toIndex);
    setOrdered(next);
    try {
      await mReorder.mutateAsync(next);
    } catch {
      setOrdered(base);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="h6" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          菜品分类
          <TermHelpIcon term="goodCategory" size={18} />
        </Typography>
        {canEditCatalog ? (
          <Button
            variant="contained"
            onClick={() =>
              setEditor({
                open: true,
                mode: 'create',
                init: { name: '', subtitle: '', badgeText: '', sort: 0 },
              })
            }
          >
            新增分类
          </Button>
        ) : null}
      </Box>

      {q.isError ? <Alert severity="error">{getErrorMessage(q.error, '加载失败')}</Alert> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragStart={(e) => {
          if (!canEditCatalog) return;
          setActiveDragId(String(e.active.id));
        }}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={(e) => {
          setActiveDragId(null);
          if (!canEditCatalog) return;
          if (mReorder.isPending) return;
          if (!e.over) return;
          const activeId = String(e.active.id);
          const overId = String(e.over.id);
          if (activeId === overId) return;
          void commitReorder(activeId, overId);
        }}
      >
        <SortableContext items={rows.map((c) => c.categoryId)} strategy={verticalListSortingStrategy}>
          <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell width={40} />
                  <TableCell sx={{ ...nowrapCellSx, minWidth: 180 }}>名称</TableCell>
                  <TableCell width={120} sx={nowrapCellSx}>
                    <TermTooltip term="categoryBadge" />
                  </TableCell>
                  <TableCell sx={{ ...nowrapCellSx, minWidth: 200 }}>
                    <TermTooltip term="categorySubtitle" />
                  </TableCell>
                  <TableCell width={100} align="right" sx={nowrapCellSx}>
                    排序
                  </TableCell>
                  <TableCell width={140} align="right" sx={stickyRightHeadCellSx}>
                    操作
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((c: CategoryDTO) => (
                  <SortableCategoryRow
                    key={c.categoryId}
                    category={c}
                    disabled={mReorder.isPending || !canEditCatalog}
                    activeDragId={activeDragId}
                    canEdit={canEditCatalog}
                    onEdit={() =>
                      setEditor({
                        open: true,
                        mode: 'edit',
                        init: {
                          categoryId: c.categoryId,
                          name: c.name,
                          subtitle: String(c.subtitle || ''),
                          badgeText: String(c.badgeText || ''),
                          sort: c.sort,
                        },
                      })
                    }
                    onDelete={() => {
                      if (!canEditCatalog) return;
                      void (async () => {
                        const ok = await confirmDialog.confirm({
                          title: '确认停用分类',
                          description: `确认停用分类「${c.name}」？`,
                          confirmText: '确认停用',
                          confirmColor: 'error',
                        });
                        if (ok) mDelete.mutate(c.categoryId);
                      })();
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SortableContext>
      </DndContext>

      {confirmDialog.dialog}

      <CategoryEditorDialog
        state={editor}
        onClose={onClose}
        onSubmit={(payload) => {
          if (payload.mode === 'create')
            mCreate.mutate({
              name: payload.name,
              subtitle: payload.subtitle,
              badgeText: payload.badgeText,
              sort: payload.sort,
            });
          else
            mUpdate.mutate({
              categoryId: payload.categoryId,
              name: payload.name,
              subtitle: payload.subtitle,
              badgeText: payload.badgeText,
              sort: payload.sort,
            });
        }}
        submitting={mCreate.isPending || mUpdate.isPending}
        errorMessage={
          mCreate.error ? getErrorMessage(mCreate.error) : mUpdate.error ? getErrorMessage(mUpdate.error) : null
        }
      />
    </Box>
  );
}

function SortableCategoryRow(props: {
  category: CategoryDTO;
  disabled: boolean;
  activeDragId: string | null;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.category.categoryId,
    disabled: props.disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      sx={{
        opacity: isDragging ? 0.6 : 1,
        '& .drag-handle': {
          opacity: props.activeDragId ? (props.activeDragId === props.category.categoryId ? 1 : 0) : 1,
        },
      }}
    >
      <TableCell width={40} sx={{ color: 'text.secondary', userSelect: 'none' }}>
        <Box
          className="drag-handle"
          aria-label="拖拽排序"
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: props.disabled ? 'not-allowed' : 'grab',
            touchAction: 'none',
            transition: 'opacity 120ms ease-out',
          }}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      </TableCell>
      <TableCell sx={nowrapCellSx}>
        <Tooltip title={props.category.name} arrow>
          <Box sx={ellipsisBoxSx('100%')}>{props.category.name}</Box>
        </Tooltip>
      </TableCell>
      <TableCell sx={nowrapCellSx}>
        <Tooltip title={props.category.badgeText || ''} arrow disableHoverListener={!props.category.badgeText}>
          <Box sx={ellipsisBoxSx(120)}>{props.category.badgeText || '-'}</Box>
        </Tooltip>
      </TableCell>
      <TableCell sx={nowrapCellSx}>
        <Tooltip title={props.category.subtitle || ''} arrow disableHoverListener={!props.category.subtitle}>
          <Box sx={ellipsisBoxSx('100%')}>{props.category.subtitle || '-'}</Box>
        </Tooltip>
      </TableCell>
      <TableCell width={100} align="right" sx={nowrapCellSx}>
        {props.category.sort}
      </TableCell>
      <TableCell width={140} align="right" sx={stickyRightCellSx}>
        {props.canEdit ? (
          <IconButton size="small" onClick={props.onEdit}>
            <EditIcon fontSize="small" />
          </IconButton>
        ) : null}
        {props.canEdit ? (
          <IconButton size="small" onClick={props.onDelete}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function CategoryEditorDialog(props: {
  state: EditorState;
  onClose: () => void;
  onSubmit: (
    payload:
      | {
          mode: 'create';
          name: string;
          subtitle: string;
          badgeText: string;
          sort: number;
        }
      | {
          mode: 'edit';
          categoryId: string;
          name: string;
          subtitle: string;
          badgeText: string;
          sort: number;
        },
  ) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const open = props.state.open;
  const init = props.state.open ? props.state.init : null;
  const [name, setName] = useState(init?.name || '');
  const [subtitle, setSubtitle] = useState(init?.subtitle || '');
  const [badgeText, setBadgeText] = useState(init?.badgeText || '');
  const [sort, setSort] = useState<number>(init?.sort || 0);

  useEffect(() => {
    if (!open || !init) return;
    setName(init.name);
    setSubtitle(init.subtitle || '');
    setBadgeText(init.badgeText || '');
    setSort(init.sort);
  }, [open, init]);

  const title = !open ? '' : props.state.mode === 'create' ? '新增分类' : '编辑分类';

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!props.submitting) props.onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {props.errorMessage ? <Alert severity="error">{props.errorMessage}</Alert> : null}
          <TextField
            label="分类名称"
            value={open ? name : ''}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 20 }}
            autoFocus
          />
          <TextField
            label={<TermTooltip term="categorySubtitle" />}
            value={open ? subtitle : ''}
            onChange={(e) => setSubtitle(e.target.value)}
            inputProps={{ maxLength: 50 }}
          />
          <TextField
            label={<TermTooltip term="categoryBadge" />}
            value={open ? badgeText : ''}
            onChange={(e) => setBadgeText(e.target.value)}
            inputProps={{ maxLength: 10 }}
          />
          <TextField
            label="排序"
            type="number"
            value={open ? sort : 0}
            onChange={(e) => setSort(parseInt(e.target.value || '0', 10) || 0)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={props.submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={props.submitting || !open || !name.trim()}
          onClick={() => {
            if (!open) return;
            const payloadBase = {
              name: name.trim(),
              subtitle: subtitle.trim(),
              badgeText: badgeText.trim(),
              sort,
            };
            if (props.state.mode === 'create') props.onSubmit({ mode: 'create', ...payloadBase });
            else
              props.onSubmit({
                mode: 'edit',
                categoryId: props.state.init.categoryId,
                ...payloadBase,
              });
          }}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
