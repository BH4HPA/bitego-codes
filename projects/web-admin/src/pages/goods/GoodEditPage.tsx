import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
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
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { getCategories } from '../../api/categories';
import { createGood, getGood, updateGood } from '../../api/goods';
import { uploadImage } from '../../api/files';
import { getSharedSpecGroups } from '../../api/sharedSpecGroups';
import { bulkUpdateSkus, updateSku } from '../../api/skus';
import type { GoodOptionGroupDTO, SKUDTO } from '../../api/types';
import { getErrorMessage } from '../../utils/error';
import { ImagePreview } from '../../components/image/ImagePreview';
import { useSnackbar } from '../../components/snackbar/snackbarContext';
import { SpecGroupEditor, type GroupEditor } from '../../components/spec-groups/SpecGroupEditor';
import { TermTooltip } from '../../components/term-tooltip/TermTooltip';
import { formatCents, parseYuanToCents, centsToYuanInput } from '../../utils/money';
import { labelGoodStatus, labelSkuStatus } from '../../utils/enums';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import { genId } from '../../utils/id';
import { useAdminContextStore } from '../../store/adminContext';
import { getMyAdminScopes } from '../../api/adminScopes';
import { getAdminCapabilities } from '../../authz/adminAuthz';

type Mode = 'create' | 'edit';

export function GoodEditPage(props: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const goodId = props.mode === 'edit' ? String(params.goodId || '') : '';
  const snackbar = useSnackbar();

  const board = useAdminContextStore((s) => s.board);
  const tenantId = useAdminContextStore((s) => s.tenantId);
  const storeId = useAdminContextStore((s) => s.storeId);
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

  useEffect(() => {
    if (board !== 'store') return;
    if (canEditCatalog) return;
    snackbar.showMessage('无权限', 'error');
    navigate(`${routePrefix}/goods`, { replace: true });
  }, [board, canEditCatalog, navigate, routePrefix, snackbar]);

  const qCats = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories({ status: 'ACTIVE', page: 1, pageSize: 100 }),
  });
  const qGood = useQuery({
    queryKey: ['good', goodId],
    queryFn: () => getGood(goodId),
    enabled: props.mode === 'edit' && !!goodId,
  });
  const qSharedGroups = useQuery({
    queryKey: ['sharedSpecGroups'],
    queryFn: () => getSharedSpecGroups(),
  });

  const categories = useMemo(() => qCats.data?.list || [], [qCats.data]);
  const sharedGroups = useMemo(() => qSharedGroups.data?.list || [], [qSharedGroups.data]);

  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [detailMarkdown, setDetailMarkdown] = useState('');
  const [status, setStatus] = useState('ON_SHELF');
  const [basePriceYuan, setBasePriceYuan] = useState('0.00');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [groups, setGroups] = useState<GroupEditor[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (props.mode !== 'edit') return;
    if (!qGood.data) return;
    const g = qGood.data;
    setCategoryIds(
      Array.isArray(g.categoryIds) && g.categoryIds.length ? g.categoryIds : g.categoryId ? [g.categoryId] : [],
    );
    setName(g.name);
    setDescription(g.description || '');
    setDetailMarkdown(g.detailMarkdown || '');
    setStatus(g.status || 'OFF_SHELF');
    setBasePriceYuan(centsToYuanInput(g.basePriceCents || 0));
    setImageUrls(Array.isArray(g.imageUrls) && g.imageUrls.length ? g.imageUrls : []);
    setGroups(
      (g.optionGroups || []).map((og) => ({
        id: og.id,
        name: og.name,
        groupType: og.groupType === 'shared' || og.sharedSpecGroupId ? 'shared' : 'custom',
        sharedSpecGroupId: og.sharedSpecGroupId || (og.groupType === 'shared' ? og.id : undefined),
        isStock: og.groupType === 'shared' || og.sharedSpecGroupId ? false : og.isStock !== false,
        defaultOptionIds:
          og.groupType === 'shared' || og.sharedSpecGroupId
            ? Array.isArray(og.linkDefaultOptionIds)
              ? og.linkDefaultOptionIds
              : []
            : Array.isArray(og.defaultOptionIds)
              ? og.defaultOptionIds
              : [],
        disabledOptionIds: Array.isArray(og.disabledOptionIds) ? og.disabledOptionIds : [],
        isRequired: og.isRequired,
        minSelection: og.minSelection,
        maxSelection: og.maxSelection,
        options: (og.options || []).map((o) => ({
          id: o.id,
          name: o.name,
          priceYuan: centsToYuanInput(o.priceCents || 0),
        })),
      })),
    );
  }, [props.mode, qGood.data]);

  const mUpload = useMutation({
    mutationFn: (file: File) => uploadImage({ file, path: 'goods' }),
  });

  const mSave = useMutation({
    mutationFn: async () => {
      if (!categoryIds.length) throw new Error('请选择至少一个分类');
      for (const g of groups) {
        if (g.groupType === 'shared' && !g.sharedSpecGroupId) {
          throw new Error('请选择共享规格组');
        }
      }
      const basePriceCents = parseYuanToCents(basePriceYuan);
      const optionGroups: GoodOptionGroupDTO[] = groups.map((g, idx) => {
        const minSelection = g.isRequired ? Math.max(1, g.minSelection) : 0;
        const maxSelection = Math.max(minSelection, g.maxSelection);
        return {
          id: g.sharedSpecGroupId || g.id,
          sharedSpecGroupId: g.sharedSpecGroupId,
          groupType: g.groupType === 'shared' ? 'shared' : 'custom',
          name: g.name.trim(),
          sort: (groups.length - idx) * 10,
          isStock: g.groupType === 'shared' ? false : g.isStock,
          defaultOptionIds: (g.defaultOptionIds || []).slice(0, maxSelection),
          disabledOptionIds: g.groupType === 'shared' ? (g.disabledOptionIds || []).slice() : undefined,
          isRequired: g.isRequired,
          minSelection,
          maxSelection,
          options: g.options.map((o) => ({
            id: o.id,
            name: o.name.trim(),
            priceCents: parseYuanToCents(o.priceYuan),
          })),
        };
      });

      if (props.mode === 'create') {
        return await createGood({
          categoryId: categoryIds[0],
          categoryIds,
          name: name.trim(),
          description,
          detailMarkdown,
          imageUrls,
          status,
          basePriceCents,
          optionGroups,
        });
      }
      return await updateGood(goodId, {
        categoryId: categoryIds[0],
        categoryIds,
        name: name.trim(),
        description,
        detailMarkdown,
        imageUrls,
        status,
        basePriceCents,
        optionGroups,
      });
    },
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['goods'] });
      if (props.mode === 'create') navigate(`/goods/${r.goodId}`, { replace: true });
      else await queryClient.invalidateQueries({ queryKey: ['good', goodId] });
      if (r.skuRebuild?.skuRebuilt) snackbar.showMessage(`规格已变更，已重建 ${r.skuRebuild.skuCreatedCount} 个 SKU`);
      else if (r.skuRebuild?.skuPriceUpdatedCount)
        snackbar.showMessage(`已更新 ${r.skuRebuild.skuPriceUpdatedCount} 个 SKU 价格`);
      else snackbar.showMessage('保存成功');
    },
  });

  const skus = qGood.data?.skus || [];

  const normalizeStructure = (
    og: Array<{
      id: string;
      isRequired: boolean;
      minSelection: number;
      maxSelection: number;
      optionIds: string[];
    }>,
  ) => {
    const out = og
      .map((g) => ({
        id: g.id,
        isRequired: Boolean(g.isRequired),
        minSelection: g.minSelection,
        maxSelection: g.maxSelection,
        optionIds: [...g.optionIds].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(out);
  };

  const originalGroupsStructureSnapshot = useMemo(() => {
    const originalGroups = qGood.data?.optionGroups || [];
    const og = originalGroups
      .filter((g) => g.isStock !== false)
      .map((g) => ({
        id: g.id,
        isRequired: g.isRequired,
        minSelection: g.minSelection,
        maxSelection: g.maxSelection,
        optionIds: (g.options || []).map((o) => o.id),
      }));
    return normalizeStructure(og);
  }, [qGood.data?.optionGroups]);

  const currentGroupsStructureSnapshot = useMemo(() => {
    const og = groups
      .filter((g) => g.isStock)
      .map((g) => ({
        id: g.id,
        isRequired: g.isRequired,
        minSelection: g.isRequired ? Math.max(1, g.minSelection) : 0,
        maxSelection: Math.max(g.isRequired ? Math.max(1, g.minSelection) : 0, g.maxSelection),
        optionIds: g.options.map((o) => o.id),
      }));
    return normalizeStructure(og);
  }, [groups]);

  const optionGroupsStructureChanged =
    props.mode === 'edit' && originalGroupsStructureSnapshot !== currentGroupsStructureSnapshot;

  const estimateSkuCount = useMemo(() => {
    const cap = 100000;
    const nCk = (n: number, k: number) => {
      if (k < 0 || k > n) return 0;
      k = Math.min(k, n - k);
      let r = 1;
      for (let i = 1; i <= k; i += 1) {
        r = (r * (n - k + i)) / i;
        if (!Number.isFinite(r) || r > cap) return cap;
      }
      return Math.round(r);
    };
    const groupWays = (n: number, min: number, max: number) => {
      let sum = 0;
      for (let k = min; k <= max; k += 1) {
        sum += nCk(n, k);
        if (sum >= cap) return cap;
      }
      return sum;
    };
    let total = 1;
    for (const g of groups.filter((x) => x.isStock)) {
      const n = g.options.length;
      const min = g.isRequired ? Math.max(1, g.minSelection) : 0;
      const max = Math.min(Math.max(min, g.maxSelection), n);
      const w = n === 0 ? 0 : groupWays(n, min, max);
      total *= w;
      if (!Number.isFinite(total) || total >= cap) return cap;
    }
    return total;
  }, [groups]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="h6">{props.mode === 'create' ? '新增菜品' : '编辑菜品'}</Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => navigate(`${routePrefix}/goods`)}>返回列表</Button>
          {canEditCatalog ? (
            <Button
              variant="contained"
              disabled={mSave.isPending || !categoryIds.length || !name.trim()}
              onClick={() => {
                if (optionGroupsStructureChanged) setConfirmOpen(true);
                else mSave.mutate();
              }}
            >
              {mSave.isPending ? '保存中...' : '保存'}
            </Button>
          ) : null}
        </Stack>
      </Box>

      {mSave.isError ? <Alert severity="error">{getErrorMessage(mSave.error, '保存失败')}</Alert> : null}

      <Dialog
        open={confirmOpen}
        onClose={() => (mSave.isPending ? null : setConfirmOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" />
          变更规格组确认
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            此操作将删除该菜品所有历史 SKU，并基于新规格重新生成 SKU。库存、价格、上下架等设置将被清空并重置。
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            受影响内容：规格组合、SKU 库存、SKU 价格、SKU 上下架状态。
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            预计生成 SKU 数量：
            {estimateSkuCount >= 100000 ? '≥100000' : String(estimateSkuCount)}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={mSave.isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={mSave.isPending}
            onClick={() => {
              setConfirmOpen(false);
              mSave.mutate();
            }}
          >
            确认变更
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={mSave.isPending && optionGroupsStructureChanged} fullWidth maxWidth="xs">
        <DialogContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <CircularProgress size={24} />
          <Box>
            <Typography variant="subtitle2">正在重建 SKU...</Typography>
            <Typography variant="body2" color="text.secondary">
              预计生成 SKU：
              {estimateSkuCount >= 100000 ? '≥100000' : String(estimateSkuCount)}
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1">基础信息</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>分类</InputLabel>
              <Select
                multiple
                value={categoryIds}
                label="分类"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(selected as string[]).map((id) => {
                      const c = categories.find((x) => x.categoryId === id);
                      return <Chip key={id} size="small" label={c?.name || id} />;
                    })}
                  </Box>
                )}
                onChange={(e) => {
                  const v = e.target.value;
                  setCategoryIds(Array.isArray(v) ? (v as string[]) : [String(v)]);
                }}
              >
                {categories.map((c) => {
                  const checked = categoryIds.includes(c.categoryId);
                  return (
                    <MenuItem dense key={c.categoryId} value={c.categoryId}>
                      <Checkbox size="small" checked={checked} sx={{ p: 0, py: 0.5, pr: 1 }} />
                      {c.name}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>状态</InputLabel>
              <Select value={status} label="状态" onChange={(e) => setStatus(String(e.target.value))}>
                <MenuItem value="ON_SHELF">{labelGoodStatus('ON_SHELF')}</MenuItem>
                <MenuItem value="OFF_SHELF">{labelGoodStatus('OFF_SHELF')}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="基础价（元）"
              type="number"
              inputProps={{ step: 0.01, min: 0 }}
              value={basePriceYuan}
              onChange={(e) => setBasePriceYuan(e.target.value)}
              sx={{ minWidth: 180 }}
            />
          </Stack>
          <TextField
            size="small"
            label="菜品名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 40 }}
          />
          <TextField
            size="small"
            label={<TermTooltip term="oneLineDescription" />}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
          />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              菜品图片
            </Typography>
            <GoodImagesEditor
              value={imageUrls}
              goodName={name}
              uploading={mUpload.isPending}
              onChange={setImageUrls}
              onUpload={async (files) => {
                try {
                  const next: string[] = [];
                  for (const f of files) {
                    const r = await mUpload.mutateAsync(f);
                    next.push(r.publicUrl);
                  }
                  if (next.length) {
                    setImageUrls((cur) => [...cur, ...next]);
                    snackbar.showMessage('上传成功');
                  }
                } catch (e) {
                  snackbar.showMessage(getErrorMessage(e, '上传失败'));
                }
              }}
            />{' '}
            {mUpload.isError ? <Alert severity="error">{getErrorMessage(mUpload.error, '上传失败')}</Alert> : null}
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              菜品详情
            </Typography>
            <Box data-color-mode="light">
              <MDEditor value={detailMarkdown} onChange={(v) => setDetailMarkdown(v || '')} height={260} />
            </Box>
          </Box>
        </CardContent>
      </Card>

      <OptionGroupsEditor value={groups} onChange={setGroups} sharedGroups={sharedGroups} />

      {props.mode === 'edit' ? <SkuEditorSection goodId={goodId} skus={skus} /> : null}
    </Box>
  );
}

function GoodImagesEditor(props: {
  value: string[];
  goodName: string;
  uploading: boolean;
  onChange: (next: string[]) => void;
  onUpload: (files: File[]) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idsRef = useRef<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const maxCount = 9;

  const urls = props.value;

  if (idsRef.current.length !== urls.length) {
    const next = [...idsRef.current];
    while (next.length < urls.length) next.push(genId('img'));
    idsRef.current = next.slice(0, urls.length);
  }

  const ids = idsRef.current;
  const activeUrl = activeId ? urls[ids.indexOf(activeId)] || null : null;

  const moveById = (fromId: string, toId: string) => {
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    idsRef.current = arrayMove(ids, from, to);
    props.onChange(arrayMove(urls, from, to));
  };

  const setCover = (idx: number) => {
    if (idx <= 0 || idx >= urls.length) return;
    const movedId = idsRef.current[idx];
    idsRef.current = [movedId, ...idsRef.current.filter((_, i) => i !== idx)];
    props.onChange([urls[idx], ...urls.filter((_, i) => i !== idx)]);
  };

  const remove = (idx: number) => {
    idsRef.current = idsRef.current.filter((_, i) => i !== idx);
    props.onChange(urls.filter((_, i) => i !== idx));
  };

  const canAdd = urls.length < maxCount;
  const canDrop = canAdd && !props.uploading;
  const availableSlots = Math.max(0, maxCount - urls.length);

  const onDragOver = (e: React.DragEvent) => {
    if (!canDrop) return;
    const types = Array.from(e.dataTransfer.types || []);
    if (!types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setFileDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!fileDragOver) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    if (!canDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
    const files = Array.from(e.dataTransfer.files || [])
      .filter((f) => Boolean(f?.type) && String(f.type).startsWith('image/'))
      .slice(0, availableSlots);
    if (files.length) void props.onUpload(files);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={(e) => {
        setActiveId(null);
        if (props.uploading) return;
        if (!e.over) return;
        const fromId = String(e.active.id);
        const toId = String(e.over.id);
        if (fromId === toId) return;
        moveById(fromId, toId);
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <Box
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, 72px)',
            gap: 1,
            alignItems: 'start',
            outline: fileDragOver ? '2px dashed rgba(25,118,210,0.85)' : '2px dashed transparent',
            outlineOffset: 6,
            borderRadius: 1,
          }}
        >
          {urls.map((u, idx) => (
            <SortableImageTile
              key={ids[idx]}
              id={ids[idx]}
              url={u}
              idx={idx}
              goodName={props.goodName}
              disabled={props.uploading}
              onRemove={() => remove(idx)}
              onSetCover={() => setCover(idx)}
            />
          ))}

          {canAdd ? (
            <Box
              onClick={() => {
                if (props.uploading) return;
                inputRef.current?.click();
              }}
              sx={{
                width: 72,
                height: 72,
                borderRadius: 1,
                border: '1px dashed rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: props.uploading ? 'not-allowed' : 'pointer',
                color: 'rgba(0,0,0,0.6)',
                bgcolor: 'rgba(0,0,0,0.02)',
              }}
            >
              <AddPhotoAlternateIcon />
              <input
                ref={inputRef}
                hidden
                type="file"
                accept="image/*"
                multiple
                disabled={props.uploading}
                onChange={(e) => {
                  const files = e.target.files;
                  const arr = files ? Array.from(files) : [];
                  e.target.value = '';
                  if (arr.length) void props.onUpload(arr);
                }}
              />
            </Box>
          ) : null}
        </Box>
      </SortableContext>
      <DragOverlay>
        {activeUrl ? (
          <Box
            sx={{
              width: 72,
              height: 72,
              position: 'relative',
              borderRadius: 1,
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.12)',
              boxShadow: 4,
            }}
          >
            <Box sx={{ position: 'absolute', inset: 0 }}>
              <ImagePreview src={activeUrl} alt={props.goodName} height={72} />
            </Box>
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableImageTile(props: {
  id: string;
  url: string;
  idx: number;
  goodName: string;
  disabled: boolean;
  onRemove: () => void;
  onSetCover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    disabled: props.disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        width: 72,
        height: 72,
        position: 'relative',
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.12)',
        opacity: props.disabled ? 0.7 : 1,
        cursor: props.disabled ? 'default' : 'grab',
        touchAction: 'none',
        transformOrigin: '0 0',
        filter: isDragging ? 'brightness(0.9)' : 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <Box sx={{ position: 'absolute', inset: 0 }}>
        <ImagePreview src={props.url} alt={props.goodName} height={72} />
      </Box>

      <IconButton
        size="small"
        aria-label="删除图片"
        onClick={props.onRemove}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        sx={{
          position: 'absolute',
          top: 2,
          right: 2,
          bgcolor: 'rgba(0,0,0,0.55)',
          color: 'white',
          '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      {props.idx === 0 ? (
        <Chip
          label="封面"
          size="small"
          sx={{
            position: 'absolute',
            left: 4,
            bottom: 4,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: 'white',
          }}
        />
      ) : (
        <IconButton
          size="small"
          aria-label="设为封面"
          onClick={props.onSetCover}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          sx={{
            position: 'absolute',
            left: 2,
            bottom: 2,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
          }}
        >
          <StarIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

function OptionGroupsEditor(props: {
  value: GroupEditor[];
  onChange: (next: GroupEditor[]) => void;
  sharedGroups: Array<import('../../api/types').SharedSpecGroupDTO>;
}) {
  const groups = props.value;
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" component="div">
            <TermTooltip term="specGroup" />
          </Typography>
          <Button
            variant="outlined"
            onClick={() =>
              props.onChange([
                ...groups,
                {
                  id: genId('og'),
                  name: '',
                  groupType: 'custom',
                  sharedSpecGroupId: undefined,
                  isStock: true,
                  defaultOptionIds: [],
                  isRequired: true,
                  minSelection: 1,
                  maxSelection: 1,
                  options: [{ id: genId('opt'), name: '', priceYuan: '0.00' }],
                },
              ])
            }
          >
            新增规格组
          </Button>
        </Stack>
        {groups.length ? (
          <Stack spacing={2}>
            {groups.map((g, idx) => (
              <SpecGroupEditor
                key={g.id}
                group={g}
                index={idx}
                total={groups.length}
                mode="good"
                sharedGroups={props.sharedGroups}
                onChange={(next) => {
                  const copy = [...groups];
                  copy[idx] = next;
                  props.onChange(copy);
                }}
                onMoveUp={() => {
                  if (idx <= 0) return;
                  const next = [...groups];
                  const t = next[idx - 1];
                  next[idx - 1] = next[idx];
                  next[idx] = t;
                  props.onChange(next);
                }}
                onMoveDown={() => {
                  if (idx >= groups.length - 1) return;
                  const next = [...groups];
                  const t = next[idx + 1];
                  next[idx + 1] = next[idx];
                  next[idx] = t;
                  props.onChange(next);
                }}
                onRemove={() => {
                  props.onChange(groups.filter((_, i) => i !== idx));
                }}
              />
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            无规格
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function SkuEditorSection(props: {
  goodId: string;
  skus: Array<Pick<SKUDTO, 'skuId' | 'specCombination' | 'priceCents' | 'stock' | 'status'>>;
}) {
  const snackbar = useSnackbar();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<null | {
    skuId: string;
    stock: number;
  }>(null);
  const [bulkStockOpen, setBulkStockOpen] = useState(false);
  const [bulkStock, setBulkStock] = useState(0);

  const mUpdate = useMutation({
    mutationFn: (p: { skuId: string; stock: number }) => updateSku(p.skuId, { stock: p.stock }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['good', props.goodId] });
      setEditing(null);
      snackbar.showMessage('保存成功');
    },
  });
  const mBulk = useMutation({
    mutationFn: (p: { skuIds: string[]; stock?: number; stockDelta?: number; status?: string }) => bulkUpdateSkus(p),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['good', props.goodId] });
      snackbar.showMessage('保存成功');
    },
  });

  useEffect(() => {
    setPage(0);
    setKeyword('');
  }, [props.goodId, props.skus.length]);

  const selectedIds = useMemo(
    () => props.skus.filter((s) => Boolean(selected[s.skuId])).map((s) => s.skuId),
    [props.skus, selected],
  );
  const filteredSkus = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return props.skus;
    return props.skus.filter((s) => {
      const a = String(s.specCombination || '').toLowerCase();
      const b = String(s.skuId || '').toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [keyword, props.skus]);
  const filteredSelectedIds = useMemo(
    () => filteredSkus.filter((s) => Boolean(selected[s.skuId])).map((s) => s.skuId),
    [filteredSkus, selected],
  );
  const visibleSkus = useMemo(() => {
    const start = page * pageSize;
    return filteredSkus.slice(start, start + pageSize);
  }, [filteredSkus, page, pageSize]);

  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="subtitle1" component="div">
            <TermTooltip term="sku" label="SKU 列表" />
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              value={keyword}
              placeholder="搜索规格/skuId"
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(0);
              }}
              sx={{ width: 220 }}
            />
            <Button
              size="small"
              variant="outlined"
              disabled={!selectedIds.length || mBulk.isPending}
              onClick={() => mBulk.mutate({ skuIds: selectedIds, status: 'ON_SHELF' })}
            >
              批量上架
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!selectedIds.length || mBulk.isPending}
              onClick={() => mBulk.mutate({ skuIds: selectedIds, status: 'OFF_SHELF' })}
            >
              批量下架
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!selectedIds.length || mBulk.isPending}
              onClick={() => {
                setBulkStock(0);
                setBulkStockOpen(true);
              }}
            >
              批量设置库存
            </Button>
          </Stack>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={filteredSkus.length > 0 && filteredSelectedIds.length === filteredSkus.length}
                  indeterminate={filteredSelectedIds.length > 0 && filteredSelectedIds.length < filteredSkus.length}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelected((cur) => {
                      const next = { ...cur };
                      if (checked) filteredSkus.forEach((s) => (next[s.skuId] = true));
                      else filteredSkus.forEach((s) => delete next[s.skuId]);
                      return next;
                    });
                  }}
                />
              </TableCell>
              <TableCell>
                <TermTooltip term="specCombination" />
              </TableCell>
              <TableCell width={140}>价格</TableCell>
              <TableCell width={120}>库存</TableCell>
              <TableCell width={140}>状态</TableCell>
              <TableCell width={240} align="right">
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleSkus.map((s) => (
              <TableRow key={s.skuId}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={Boolean(selected[s.skuId])}
                    onChange={(e) =>
                      setSelected((cur) => ({
                        ...cur,
                        [s.skuId]: e.target.checked,
                      }))
                    }
                  />
                </TableCell>
                <TableCell>{s.specCombination || '-'}</TableCell>
                <TableCell>{formatCents(s.priceCents)}</TableCell>
                <TableCell>{s.stock}</TableCell>
                <TableCell>{labelSkuStatus(s.status)}</TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    disabled={mBulk.isPending}
                    onClick={() =>
                      mBulk.mutate({
                        skuIds: [s.skuId],
                        status: s.status === 'ON_SHELF' ? 'OFF_SHELF' : 'ON_SHELF',
                      })
                    }
                  >
                    {s.status === 'ON_SHELF' ? '下架' : '上架'}
                  </Button>
                  <Button
                    size="small"
                    disabled={mBulk.isPending}
                    onClick={() => mBulk.mutate({ skuIds: [s.skuId], stockDelta: 1 })}
                    sx={{ ml: 1 }}
                  >
                    +1
                  </Button>
                  <Button
                    size="small"
                    disabled={mUpdate.isPending || mBulk.isPending}
                    sx={{ ml: 1 }}
                    onClick={() => setEditing({ skuId: s.skuId, stock: s.stock })}
                  >
                    编辑库存
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredSkus.length}
          page={page}
          rowsPerPage={pageSize}
          onPageChange={(_, next) => setPage(next)}
          rowsPerPageOptions={[pageSize]}
          labelRowsPerPage="每页"
        />

        <Dialog open={!!editing} onClose={() => (mUpdate.isPending ? null : setEditing(null))} fullWidth maxWidth="sm">
          <DialogTitle>编辑库存</DialogTitle>
          <DialogContent>
            {mUpdate.isError ? <Alert severity="error">{getErrorMessage(mUpdate.error, '保存失败')}</Alert> : null}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                size="small"
                label="库存"
                type="number"
                value={editing?.stock || 0}
                onChange={(e) =>
                  setEditing((cur) =>
                    cur
                      ? {
                          ...cur,
                          stock: parseInt(e.target.value || '0', 10) || 0,
                        }
                      : cur,
                  )
                }
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditing(null)} disabled={mUpdate.isPending}>
              取消
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (!editing) return;
                mUpdate.mutate(editing);
              }}
              disabled={mUpdate.isPending}
            >
              保存
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={bulkStockOpen}
          onClose={() => (mBulk.isPending ? null : setBulkStockOpen(false))}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>批量设置库存</DialogTitle>
          <DialogContent>
            {mBulk.isError ? <Alert severity="error">{getErrorMessage(mBulk.error, '保存失败')}</Alert> : null}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                size="small"
                label="库存"
                type="number"
                value={bulkStock}
                onChange={(e) => setBulkStock(parseInt(e.target.value || '0', 10) || 0)}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBulkStockOpen(false)} disabled={mBulk.isPending}>
              取消
            </Button>
            <Button
              variant="contained"
              disabled={mBulk.isPending || !selectedIds.length}
              onClick={() => {
                mBulk.mutate({ skuIds: selectedIds, stock: bulkStock });
                setBulkStockOpen(false);
              }}
            >
              保存
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
