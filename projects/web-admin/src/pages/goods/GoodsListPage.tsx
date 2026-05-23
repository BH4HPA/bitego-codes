import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { nowrapCellSx, stickyRightCellSx, stickyRightHeadCellSx } from '../../components/table/stickyCells';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { getCategories, reorderCategoryGoods } from '../../api/categories';
import { deleteGood, getGoods, updateGood } from '../../api/goods';
import { getSkus } from '../../api/skus';
import type { GoodListItemDTO } from '../../api/types';
import { getErrorMessage } from '../../utils/error';
import { formatCents } from '../../utils/money';
import { labelGoodStatus, labelSkuStatus } from '../../utils/enums';
import { ImagePreview } from '../../components/image/ImagePreview';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { useConfirmDialog, type ConfirmDialogOptions } from '../../components/confirm/useConfirmDialog';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAdminContextStore } from '../../store/adminContext';
import { getMyAdminScopes } from '../../api/adminScopes';
import { getAdminCapabilities } from '../../authz/adminAuthz';

type GoodsListFilters = {
  status: string;
  categoryId: string;
  name: string;
  page: number;
  pageSize: number;
};

const DEFAULT_GOODS_LIST_FILTERS: GoodsListFilters = {
  status: 'ON_SHELF',
  categoryId: '',
  name: '',
  page: 0,
  pageSize: 50,
};

function readStoredGoodsListFilters(key: string): GoodsListFilters {
  if (typeof window === 'undefined') return DEFAULT_GOODS_LIST_FILTERS;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return DEFAULT_GOODS_LIST_FILTERS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_GOODS_LIST_FILTERS;
    const p = parsed as Partial<GoodsListFilters>;
    return {
      status: typeof p.status === 'string' ? p.status : DEFAULT_GOODS_LIST_FILTERS.status,
      categoryId: typeof p.categoryId === 'string' ? p.categoryId : DEFAULT_GOODS_LIST_FILTERS.categoryId,
      name: typeof p.name === 'string' ? p.name : DEFAULT_GOODS_LIST_FILTERS.name,
      page: Number.isInteger(p.page) && (p.page as number) >= 0 ? (p.page as number) : DEFAULT_GOODS_LIST_FILTERS.page,
      pageSize:
        Number.isInteger(p.pageSize) && (p.pageSize as number) > 0
          ? (p.pageSize as number)
          : DEFAULT_GOODS_LIST_FILTERS.pageSize,
    };
  } catch {
    return DEFAULT_GOODS_LIST_FILTERS;
  }
}

export function GoodsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
  const snackbar = useSnackbar();
  const confirmDialog = useConfirmDialog();

  const routePrefix = useMemo(() => {
    if (location.pathname.startsWith('/tenant/shared-data/')) return '/tenant/shared-data';
    if (location.pathname.startsWith('/store/')) return '/store';
    return '';
  }, [location.pathname]);

  const storageKey = useMemo(
    () => `goodsListFilters|${routePrefix || '/'}|${tenantId ?? ''}|${storeId ?? ''}`,
    [routePrefix, tenantId, storeId],
  );

  const initialFiltersRef = useRef<GoodsListFilters | null>(null);
  if (initialFiltersRef.current === null) {
    initialFiltersRef.current = readStoredGoodsListFilters(storageKey);
  }
  const initialFilters = initialFiltersRef.current;
  const lastSyncedKeyRef = useRef(storageKey);
  const didInitFilterResetRef = useRef(false);

  const [status, setStatus] = useState(initialFilters.status);
  const [categoryId, setCategoryId] = useState<string>(initialFilters.categoryId);
  const [name, setName] = useState(initialFilters.name);
  const [page, setPage] = useState(initialFilters.page);
  const [pageSize, setPageSize] = useState(initialFilters.pageSize);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [sortMode, setSortMode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lastSyncedKeyRef.current !== storageKey) {
      // Admin context (tenant / store / route board) changed while this page stayed mounted.
      // Reload filters from the new slot rather than writing the previous slot's state into it.
      const next = readStoredGoodsListFilters(storageKey);
      lastSyncedKeyRef.current = storageKey;
      didInitFilterResetRef.current = false;
      setStatus(next.status);
      setCategoryId(next.categoryId);
      setName(next.name);
      setPage(next.page);
      setPageSize(next.pageSize);
      return;
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ status, categoryId, name, page, pageSize }));
    } catch {
      // ignore quota / serialization errors
    }
  }, [storageKey, status, categoryId, name, page, pageSize]);
  const dragMode = sortMode && Boolean(categoryId);
  const effectivePage = dragMode ? 0 : page;
  const effectivePageSize = dragMode ? 500 : pageSize;
  const [orderedGoods, setOrderedGoods] = useState<GoodListItemDTO[]>([]);

  const scopesQ = useQuery({ queryKey: ['admin_scopes', 'me'], queryFn: getMyAdminScopes });
  const caps = useMemo(
    () => getAdminCapabilities({ scopes: scopesQ.data?.list || [], tenantId, storeId }),
    [scopesQ.data?.list, storeId, tenantId],
  );
  const canEditCatalog = caps.canManageSharedCatalog;

  const qCats = useQuery({
    queryKey: ['categories', tenantId, storeId],
    queryFn: () => getCategories({ status: 'ACTIVE', page: 1, pageSize: 100 }),
  });
  const qGoods = useQuery({
    queryKey: [
      'goods',
      tenantId,
      storeId,
      { status, categoryId, name, page: effectivePage, pageSize: effectivePageSize },
    ],
    queryFn: () =>
      getGoods({
        status,
        categoryId: categoryId || undefined,
        name: name || undefined,
        page: effectivePage + 1,
        pageSize: effectivePageSize,
      }),
  });

  const mDelete = useMutation({
    mutationFn: (goodId: string) => deleteGood(goodId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goods'] });
      snackbar.showMessage('保存成功');
    },
  });

  const mShelf = useMutation({
    mutationFn: (p: { goodId: string; status: string }) => updateGood(p.goodId, { status: p.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goods'] });
      snackbar.showMessage('保存成功');
    },
  });

  const mBulkUpdate = useMutation({
    mutationFn: async (p: { goodIds: string[]; status?: string; categoryId?: string }) => {
      await Promise.all(p.goodIds.map((id) => updateGood(id, { status: p.status, categoryId: p.categoryId })));
      return true;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goods'] });
      snackbar.showMessage('保存成功');
    },
  });

  const categories = useMemo(() => qCats.data?.list || [], [qCats.data]);
  const goods = useMemo(() => qGoods.data?.list || [], [qGoods.data]);
  const total = qGoods.data?.pagination?.total ?? 0;
  const displayGoods: GoodListItemDTO[] = dragMode ? orderedGoods : goods;

  useEffect(() => {
    if (!dragMode) {
      setOrderedGoods([]);
      return;
    }
    setOrderedGoods(goods);
  }, [dragMode, goods]);

  useEffect(() => {
    if (!didInitFilterResetRef.current) {
      didInitFilterResetRef.current = true;
      return;
    }
    setPage(0);
    setSelected({});
    setExpanded({});
    setSortMode(false);
  }, [status, categoryId, name]);
  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, v]) => v)
        .map(([k]) => k),
    [selected],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const mReorder = useMutation({
    mutationFn: (p: { categoryId: string; goodIds: string[] }) =>
      reorderCategoryGoods(p.categoryId, { goodIds: p.goodIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goods'] });
      snackbar.showMessage('排序已保存');
    },
    onError: (e) => snackbar.showMessage(getErrorMessage(e, '排序保存失败')),
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="h6">菜品管理</Typography>
        {canEditCatalog ? (
          <Button variant="contained" onClick={() => navigate(`${routePrefix}/goods/new`)}>
            新增菜品
          </Button>
        ) : null}
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>状态</InputLabel>
          <Select value={status} label="状态" onChange={(e) => setStatus(String(e.target.value))}>
            <MenuItem value="ON_SHELF">上架</MenuItem>
            <MenuItem value="OFF_SHELF">下架</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>分类</InputLabel>
          <Select
            value={categoryId}
            label="分类"
            onChange={(e) => {
              setCategoryId(String(e.target.value));
              setName('');
            }}
          >
            <MenuItem value="">全部</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.categoryId} value={c.categoryId}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          size="small"
          variant="outlined"
          disabled={!categoryId || !canEditCatalog}
          onClick={() => setSortMode((cur) => !cur)}
          sx={{ height: 40 }}
        >
          {dragMode ? '退出排序' : '排序该分类'}
        </Button>
        <TextField
          size="small"
          label="名称"
          value={name}
          disabled={dragMode}
          onChange={(e) => setName(e.target.value)}
          sx={{ minWidth: 240 }}
        />
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          已选择：{selectedIds.length} 项
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            size="small"
            variant="outlined"
            disabled={!selectedIds.length || mBulkUpdate.isPending}
            onClick={() => mBulkUpdate.mutate({ goodIds: selectedIds, status: 'ON_SHELF' })}
          >
            批量上架
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!selectedIds.length || mBulkUpdate.isPending}
            onClick={() => mBulkUpdate.mutate({ goodIds: selectedIds, status: 'OFF_SHELF' })}
          >
            批量下架
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!selectedIds.length || mBulkUpdate.isPending || !canEditCatalog}
            onClick={() => {
              setBulkCategoryId('');
              setCategoryDialogOpen(true);
            }}
          >
            批量调整分类
          </Button>
          {dragMode && !canEditCatalog ? (
            <Alert severity="info" sx={{ py: 0, px: 1 }}>
              连锁门店仅支持查看与上下架
            </Alert>
          ) : null}
        </Stack>
      </Stack>

      {qGoods.isError ? <Alert severity="error">{getErrorMessage(qGoods.error, '加载失败')}</Alert> : null}

      <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1200 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={displayGoods.length > 0 && selectedIds.length === displayGoods.length}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < displayGoods.length}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const next: Record<string, boolean> = {};
                    if (checked) displayGoods.forEach((g) => (next[g.goodId] = true));
                    setSelected(next);
                  }}
                />
              </TableCell>
              <TableCell width={44} />
              {dragMode ? <TableCell width={100}>排序</TableCell> : null}
              <TableCell width={80}>图片</TableCell>
              <TableCell sx={{ ...nowrapCellSx, minWidth: 200 }}>名称</TableCell>
              <TableCell width={220} sx={nowrapCellSx}>
                分类
              </TableCell>
              <TableCell width={100} sx={nowrapCellSx}>
                状态
              </TableCell>
              <TableCell width={110} sx={nowrapCellSx}>
                起步价
              </TableCell>
              <TableCell width={110} sx={nowrapCellSx}>
                基础价
              </TableCell>
              <TableCell width={90} sx={nowrapCellSx}>
                销量
              </TableCell>
              <TableCell width={200} align="right" sx={stickyRightHeadCellSx}>
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dragMode ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => {
                  const activeId = String(e.active?.id || '');
                  const overId = String(e.over?.id || '');
                  if (!activeId || !overId || activeId === overId) return;
                  const from = orderedGoods.findIndex((x) => x.goodId === activeId);
                  const to = orderedGoods.findIndex((x) => x.goodId === overId);
                  if (from < 0 || to < 0) return;
                  const next = arrayMove(orderedGoods, from, to);
                  const base = next.length * 10;
                  const nextWithSort = next.map((x, i) => ({
                    ...x,
                    categorySortById: {
                      ...(x.categorySortById || {}),
                      [categoryId]: base - i * 10,
                    },
                  }));
                  setOrderedGoods(nextWithSort);
                  const goodIds = next.map((x) => x.goodId);
                  mReorder.mutate({ categoryId, goodIds });
                }}
              >
                <SortableContext items={orderedGoods.map((x) => x.goodId)} strategy={verticalListSortingStrategy}>
                  {orderedGoods.map((g) => (
                    <SortableGoodRow
                      key={g.goodId}
                      good={g}
                      categories={categories}
                      confirm={confirmDialog.confirm}
                      selected={Boolean(selected[g.goodId])}
                      sortValue={Number(g.categorySortById?.[categoryId] || 0) || 0}
                      disabled={mReorder.isPending || !canEditCatalog}
                      onToggleSelected={(checked) => setSelected((cur) => ({ ...cur, [g.goodId]: checked }))}
                      onEdit={() => navigate(`${routePrefix}/goods/${g.goodId}`)}
                      onDelete={() => mDelete.mutate(g.goodId)}
                      canEdit={canEditCatalog}
                      onOnShelf={() => mShelf.mutate({ goodId: g.goodId, status: 'ON_SHELF' })}
                      onOffShelf={() => mShelf.mutate({ goodId: g.goodId, status: 'OFF_SHELF' })}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              goods.map((g) => (
                <GoodRow
                  key={g.goodId}
                  good={g}
                  categories={categories}
                  confirm={confirmDialog.confirm}
                  selected={Boolean(selected[g.goodId])}
                  expanded={Boolean(expanded[g.goodId])}
                  onToggleSelected={(checked) => setSelected((cur) => ({ ...cur, [g.goodId]: checked }))}
                  onToggleExpanded={() => setExpanded((cur) => ({ ...cur, [g.goodId]: !cur[g.goodId] }))}
                  onEdit={() => navigate(`${routePrefix}/goods/${g.goodId}`)}
                  onDelete={() => mDelete.mutate(g.goodId)}
                  canEdit={canEditCatalog}
                  onOnShelf={() => mShelf.mutate({ goodId: g.goodId, status: 'ON_SHELF' })}
                  onOffShelf={() => mShelf.mutate({ goodId: g.goodId, status: 'OFF_SHELF' })}
                />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!dragMode ? (
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={pageSize}
          onPageChange={(_, next) => {
            setPage(next);
            setSelected({});
            setExpanded({});
          }}
          onRowsPerPageChange={(e) => {
            const next = parseInt(e.target.value, 10) || 10;
            setPageSize(next);
            setPage(0);
            setSelected({});
            setExpanded({});
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="每页"
        />
      ) : null}

      <Dialog
        open={categoryDialogOpen}
        onClose={() => (mBulkUpdate.isPending ? null : setCategoryDialogOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>批量调整分类</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small">
              <InputLabel>分类</InputLabel>
              <Select value={bulkCategoryId} label="分类" onChange={(e) => setBulkCategoryId(String(e.target.value))}>
                {categories.map((c) => (
                  <MenuItem key={c.categoryId} value={c.categoryId}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryDialogOpen(false)} disabled={mBulkUpdate.isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={mBulkUpdate.isPending || !selectedIds.length || !bulkCategoryId}
            onClick={() => {
              mBulkUpdate.mutate({
                goodIds: selectedIds,
                categoryId: bulkCategoryId,
              });
              setCategoryDialogOpen(false);
            }}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {confirmDialog.dialog}
    </Box>
  );
}

function SortableGoodRow(props: {
  good: {
    goodId: string;
    name: string;
    imageUrls: string[];
    categoryId: string;
    categoryIds?: string[];
    status: string;
    minPriceCents: number;
    basePriceCents: number;
    sales: number;
  };
  sortValue: number;
  confirm: (opts: ConfirmDialogOptions) => Promise<boolean>;
  categories: Array<{ categoryId: string; name: string }>;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOffShelf: () => void;
  onOnShelf: () => void;
  canEdit: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.good.goodId,
    disabled: Boolean(props.disabled),
  });
  const cover = props.good.imageUrls?.[0];
  const categoryNames = useMemo(() => {
    const ids =
      Array.isArray(props.good.categoryIds) && props.good.categoryIds.length
        ? Array.from(new Set(props.good.categoryIds.filter(Boolean)))
        : [props.good.categoryId];
    const names = ids.map((id) => props.categories.find((c) => c.categoryId === id)?.name || id);
    return names.join(' / ');
  }, [props.categories, props.good.categoryId, props.good.categoryIds]);
  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
      }}
    >
      <TableCell padding="checkbox">
        <Checkbox checked={props.selected} onChange={(e) => props.onToggleSelected(e.target.checked)} />
      </TableCell>
      <TableCell width={44}>
        <Box
          aria-label="拖拽排序"
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: props.disabled ? 'not-allowed' : 'grab',
            touchAction: 'none',
            userSelect: 'none',
          }}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      </TableCell>
      <TableCell width={100} sx={nowrapCellSx}>
        {props.sortValue}
      </TableCell>
      <TableCell width={80}>{cover ? <ImagePreview src={cover} alt={props.good.name} /> : '-'}</TableCell>
      <TableCell sx={nowrapCellSx}>
        <Tooltip title={props.good.name} arrow>
          <Box sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {props.good.name}
          </Box>
        </Tooltip>
      </TableCell>
      <TableCell width={220} sx={nowrapCellSx}>
        <Tooltip title={categoryNames} placement="top" arrow>
          <Box sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {categoryNames}
          </Box>
        </Tooltip>
      </TableCell>
      <TableCell width={100} sx={nowrapCellSx}>
        {labelGoodStatus(props.good.status)}
      </TableCell>
      <TableCell width={110} sx={nowrapCellSx}>
        {formatCents(props.good.minPriceCents)}
      </TableCell>
      <TableCell width={110} sx={nowrapCellSx}>
        {formatCents(props.good.basePriceCents)}
      </TableCell>
      <TableCell width={90} sx={nowrapCellSx}>
        {props.good.sales}
      </TableCell>
      <TableCell width={200} align="right" sx={stickyRightCellSx}>
        {props.canEdit ? (
          <Button size="small" onClick={props.onEdit}>
            编辑
          </Button>
        ) : null}
        {props.canEdit ? (
          <Button
            size="small"
            color="error"
            onClick={() => {
              void (async () => {
                const ok = await props.confirm({
                  title: '确认删除菜品',
                  description: `确认删除菜品「${props.good.name}」？`,
                  confirmText: '删除',
                  confirmColor: 'error',
                });
                if (ok) props.onDelete();
              })();
            }}
          >
            删除
          </Button>
        ) : null}
        {props.good.status === 'ON_SHELF' ? (
          <Button
            size="small"
            color="error"
            onClick={() => {
              void (async () => {
                const ok = await props.confirm({
                  title: '确认下架菜品',
                  description: `确认下架菜品「${props.good.name}」？`,
                  confirmText: '下架',
                  confirmColor: 'error',
                });
                if (ok) props.onOffShelf();
              })();
            }}
          >
            下架
          </Button>
        ) : (
          <Button
            size="small"
            onClick={() => {
              void (async () => {
                const ok = await props.confirm({
                  title: '确认上架菜品',
                  description: `确认上架菜品「${props.good.name}」？`,
                  confirmText: '上架',
                  confirmColor: 'primary',
                });
                if (ok) props.onOnShelf();
              })();
            }}
          >
            上架
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function GoodRow(props: {
  good: {
    goodId: string;
    name: string;
    imageUrls: string[];
    categoryId: string;
    categoryIds?: string[];
    defaultSkuId?: string | null;
    status: string;
    minPriceCents: number;
    basePriceCents: number;
    sales: number;
  };
  confirm: (opts: ConfirmDialogOptions) => Promise<boolean>;
  categories: Array<{ categoryId: string; name: string }>;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: (checked: boolean) => void;
  onToggleExpanded: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOffShelf: () => void;
  onOnShelf: () => void;
  canEdit: boolean;
}) {
  const qSkus = useQuery({
    queryKey: ['skus', { goodId: props.good.goodId }],
    queryFn: () => getSkus({ goodId: props.good.goodId }),
    enabled: props.expanded,
  });
  const [skuPage, setSkuPage] = useState(0);
  const skuPageSize = 5;
  useEffect(() => {
    if (!props.expanded) setSkuPage(0);
  }, [props.expanded, props.good.goodId]);
  const cover = props.good.imageUrls?.[0];
  const categoryNames = useMemo(() => {
    const ids =
      Array.isArray(props.good.categoryIds) && props.good.categoryIds.length
        ? Array.from(new Set(props.good.categoryIds.filter(Boolean)))
        : [props.good.categoryId];
    const names = ids.map((id) => props.categories.find((c) => c.categoryId === id)?.name || id);
    return names.join(' / ');
  }, [props.categories, props.good.categoryId, props.good.categoryIds]);
  const skuRows = useMemo(() => {
    return qSkus.data?.list || [];
  }, [qSkus.data?.list]);
  const visibleSkus = useMemo(() => {
    const start = skuPage * skuPageSize;
    return skuRows.slice(start, start + skuPageSize);
  }, [skuPage, skuRows]);

  return (
    <>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox checked={props.selected} onChange={(e) => props.onToggleSelected(e.target.checked)} />
        </TableCell>
        <TableCell width={44}>
          <IconButton size="small" onClick={props.onToggleExpanded}>
            {props.expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          {cover ? (
            <Badge
              overlap="rectangular"
              badgeContent={props.good.imageUrls?.length > 1 ? `+${props.good.imageUrls.length - 1}` : null}
              color="primary"
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <ImagePreview src={cover} alt={props.good.name} />
            </Badge>
          ) : (
            '-'
          )}
        </TableCell>
        <TableCell sx={nowrapCellSx}>
          <Tooltip title={props.good.name} arrow>
            <Box sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {props.good.name}
            </Box>
          </Tooltip>
        </TableCell>
        <TableCell sx={nowrapCellSx}>
          <Tooltip title={categoryNames} placement="top" arrow>
            <Box
              sx={{
                maxWidth: 220,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {categoryNames}
            </Box>
          </Tooltip>
        </TableCell>
        <TableCell sx={nowrapCellSx}>{labelGoodStatus(props.good.status)}</TableCell>
        <TableCell sx={nowrapCellSx}>{formatCents(props.good.minPriceCents)}</TableCell>
        <TableCell sx={nowrapCellSx}>{formatCents(props.good.basePriceCents)}</TableCell>
        <TableCell sx={nowrapCellSx}>{props.good.sales}</TableCell>
        <TableCell align="right" sx={stickyRightCellSx}>
          {props.canEdit ? (
            <Button size="small" onClick={props.onEdit}>
              编辑
            </Button>
          ) : null}
          {props.canEdit ? (
            <Button
              size="small"
              color="error"
              onClick={() => {
                void (async () => {
                  const ok = await props.confirm({
                    title: '确认删除菜品',
                    description: `确认删除菜品「${props.good.name}」？`,
                    confirmText: '删除',
                    confirmColor: 'error',
                  });
                  if (ok) props.onDelete();
                })();
              }}
            >
              删除
            </Button>
          ) : null}
          {props.good.status === 'ON_SHELF' ? (
            <Button
              size="small"
              color="error"
              onClick={() => {
                void (async () => {
                  const ok = await props.confirm({
                    title: '确认下架菜品',
                    description: `确认下架菜品「${props.good.name}」？`,
                    confirmText: '下架',
                    confirmColor: 'error',
                  });
                  if (ok) props.onOffShelf();
                })();
              }}
            >
              下架
            </Button>
          ) : (
            <Button
              size="small"
              onClick={() => {
                void (async () => {
                  const ok = await props.confirm({
                    title: '确认上架菜品',
                    description: `确认上架菜品「${props.good.name}」？`,
                    confirmText: '上架',
                    confirmColor: 'primary',
                  });
                  if (ok) props.onOnShelf();
                })();
              }}
            >
              上架
            </Button>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={10} sx={{ py: 0 }}>
          <Collapse in={props.expanded} timeout="auto" unmountOnExit>
            {qSkus.isLoading ? (
              <Typography variant="body2" color="text.secondary">
                加载中...
              </Typography>
            ) : qSkus.isError ? (
              <Alert severity="error">{getErrorMessage(qSkus.error, '加载失败')}</Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>规格组合</TableCell>
                    <TableCell width={140}>价格</TableCell>
                    <TableCell width={120}>库存</TableCell>
                    <TableCell width={120}>状态</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleSkus.map((s) => (
                    <TableRow key={s.skuId}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box>{s.specCombination || '-'}</Box>
                        </Box>
                      </TableCell>
                      <TableCell>{formatCents(s.priceCents)}</TableCell>
                      <TableCell>{s.stock}</TableCell>
                      <TableCell>{labelSkuStatus(s.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!qSkus.isLoading && !qSkus.isError && skuRows.length > skuPageSize ? (
              <TablePagination
                component="div"
                count={skuRows.length}
                page={skuPage}
                rowsPerPage={skuPageSize}
                rowsPerPageOptions={[skuPageSize]}
                onPageChange={(_, next) => setSkuPage(next)}
                labelRowsPerPage="每页"
              />
            ) : null}
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
