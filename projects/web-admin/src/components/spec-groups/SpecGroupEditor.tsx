import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { genId } from '../../utils/id';
import { centsToYuanInput } from '../../utils/money';
import type { SharedSpecGroupDTO } from '../../api/types';
import { TermTooltip } from '../term-tooltip/TermTooltip';

export type OptionEditor = { id: string; name: string; priceYuan: string };
export type GroupEditor = {
  id: string;
  name: string;
  isStock: boolean;
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  options: OptionEditor[];
  defaultOptionIds: string[];
  disabledOptionIds?: string[];
  groupType?: 'custom' | 'shared';
  sharedSpecGroupId?: string;
};

export function SpecGroupEditor(props: {
  group: GroupEditor;
  index: number;
  total: number;
  mode: 'good' | 'shared';
  sharedGroups?: SharedSpecGroupDTO[];
  onChange: (next: GroupEditor) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
}) {
  const { group } = props;
  const isShared = props.mode === 'good' && group.groupType === 'shared';
  const sharedGroups = props.sharedGroups || [];
  const disabledOptionIdSet = new Set(group.disabledOptionIds || []);
  const availableOptions = group.options || [];
  const enabledOptions = availableOptions.filter((o) => !disabledOptionIdSet.has(o.id));
  return (
    <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" component="div">
          <TermTooltip term="specGroup" label={`规格组 ${props.index + 1}`} />
        </Typography>
        <Stack direction="row" spacing={1}>
          <IconButton size="small" disabled={props.index <= 0} onClick={props.onMoveUp}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" disabled={props.index >= props.total - 1} onClick={props.onMoveDown}>
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
          {props.onRemove ? (
            <IconButton size="small" color="error" onClick={props.onRemove}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          ) : null}
        </Stack>
      </Stack>

      <Stack spacing={2} sx={{ mt: 2 }}>
        {props.mode === 'good' ? (
          <FormControl size="small" sx={{ width: 260 }}>
            <InputLabel>类型</InputLabel>
            <Select
              label="类型"
              value={group.groupType === 'shared' ? 'shared' : group.isStock ? 'stock' : 'nonStock'}
              renderValue={(v) => {
                if (v === 'stock') return '库存规格组';
                if (v === 'nonStock') return '非库存规格组';
                return '共享非库存规格组';
              }}
              onChange={(e) => {
                const v = String(e.target.value);
                if (v === 'shared') {
                  props.onChange({
                    ...group,
                    groupType: 'shared',
                    isStock: false,
                  });
                } else if (v === 'stock') {
                  props.onChange({
                    ...group,
                    groupType: 'custom',
                    isStock: true,
                  });
                } else {
                  props.onChange({
                    ...group,
                    groupType: 'custom',
                    isStock: false,
                  });
                }
              }}
            >
              <MenuItem value="stock">
                <TermTooltip term="stockSpecGroup" />
              </MenuItem>
              <MenuItem value="nonStock">
                <TermTooltip term="nonStockSpecGroup" />
              </MenuItem>
              <MenuItem value="shared">
                <TermTooltip term="sharedNonStockSpecGroup" />
              </MenuItem>
            </Select>
          </FormControl>
        ) : null}

        {isShared ? (
          <FormControl size="small" sx={{ width: 320 }}>
            <InputLabel>共享规格组名称</InputLabel>
            <Select
              label="共享规格组名称"
              value={group.sharedSpecGroupId || ''}
              onChange={(e) => {
                const id = String(e.target.value);
                const sg = sharedGroups.find((x) => x.sharedSpecGroupId === id);
                if (!sg) return;
                props.onChange({
                  ...group,
                  groupType: 'shared',
                  sharedSpecGroupId: id,
                  name: sg.name,
                  isStock: false,
                  isRequired: sg.isRequired,
                  minSelection: sg.minSelection,
                  maxSelection: sg.maxSelection,
                  defaultOptionIds: [],
                  disabledOptionIds: [],
                  options: sg.options.map((o) => ({
                    id: o.id,
                    name: o.name,
                    priceYuan: centsToYuanInput(o.priceCents),
                  })),
                });
              }}
            >
              {sharedGroups.map((x) => (
                <MenuItem key={x.sharedSpecGroupId} value={x.sharedSpecGroupId}>
                  <Tooltip title={x.description || ''} disableHoverListener={!x.description} placement="right">
                    <span>{x.name}</span>
                  </Tooltip>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            size="small"
            label="规格组名称"
            value={group.name}
            onChange={(e) => props.onChange({ ...group, name: e.target.value })}
            sx={{ width: 320 }}
          />
        )}

        {isShared ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary" component="div">
              <TermTooltip term="sharedSpecGroupBindOptions" />
            </Typography>
            <FormControl size="small" sx={{ width: 360 }}>
              <InputLabel>禁用规格项</InputLabel>
              <Select
                multiple
                label="禁用规格项"
                value={group.disabledOptionIds || []}
                renderValue={(selected) =>
                  (selected as string[]).map((id) => availableOptions.find((o) => o.id === id)?.name || id).join('、')
                }
                onChange={(e) => {
                  const raw = e.target.value as string[];
                  const uniq = Array.from(new Set(raw.map((x) => String(x || '')).filter((x) => x)));
                  const enabledCount = Math.max(0, availableOptions.length - uniq.length);
                  if (enabledCount < Math.max(0, group.minSelection)) return;
                  props.onChange({
                    ...group,
                    disabledOptionIds: uniq,
                    defaultOptionIds: (group.defaultOptionIds || []).filter((id) => !uniq.includes(id)),
                  });
                }}
              >
                {availableOptions.map((o) => {
                  const checked = (group.disabledOptionIds || []).includes(o.id);
                  return (
                    <MenuItem key={o.id} value={o.id}>
                      <Checkbox checked={checked} />
                      {o.name || o.id}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ width: 360 }}>
              <InputLabel>默认规格（覆盖）</InputLabel>
              {group.maxSelection <= 1 ? (
                <Select
                  label="默认规格（覆盖）"
                  value={(group.defaultOptionIds || [])[0] || ''}
                  onChange={(e) => {
                    const v = String(e.target.value || '');
                    props.onChange({
                      ...group,
                      defaultOptionIds: v ? [v] : [],
                    });
                  }}
                >
                  <MenuItem value="">不设置</MenuItem>
                  {enabledOptions.map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.name || o.id}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <Select
                  multiple
                  label="默认规格（覆盖）"
                  value={group.defaultOptionIds || []}
                  renderValue={(selected) =>
                    (selected as string[]).map((id) => enabledOptions.find((o) => o.id === id)?.name || id).join('、')
                  }
                  onChange={(e) => {
                    const raw = e.target.value as string[];
                    const uniq = Array.from(new Set(raw.map((x) => String(x || '')).filter((x) => x)))
                      .filter((id) => enabledOptions.some((o) => o.id === id))
                      .slice(0, Math.max(0, group.maxSelection));
                    props.onChange({ ...group, defaultOptionIds: uniq });
                  }}
                >
                  {enabledOptions.map((o) => {
                    const checked = (group.defaultOptionIds || []).includes(o.id);
                    return (
                      <MenuItem key={o.id} value={o.id}>
                        <Checkbox checked={checked} />
                        {o.name || o.id}
                      </MenuItem>
                    );
                  })}
                </Select>
              )}
            </FormControl>
            <Typography variant="body2" color="text.secondary">
              不设置默认规格时，将使用共享规格组自身默认规格
            </Typography>
          </Stack>
        ) : props.mode === 'shared' || !isShared ? (
          <>
            <Typography variant="body2" color="text.secondary">
              规格设置
            </Typography>
            <FormControlLabel
              sx={{ mt: 0 }}
              control={
                <Checkbox
                  sx={{ pl: 0 }}
                  checked={group.isRequired}
                  onChange={(e) =>
                    props.onChange({
                      ...group,
                      isRequired: e.target.checked,
                      minSelection: e.target.checked ? Math.max(1, group.minSelection) : 0,
                    })
                  }
                />
              }
              label="规格组必选"
            />

            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="至少选择数"
                type="number"
                value={group.minSelection}
                onChange={(e) => {
                  const n = parseInt(e.target.value || '0', 10) || 0;
                  const nextMin = group.isRequired ? Math.max(1, n) : Math.max(0, n);
                  const nextMax = Math.max(nextMin, group.maxSelection);
                  props.onChange({
                    ...group,
                    minSelection: nextMin,
                    maxSelection: nextMax,
                    defaultOptionIds: (group.defaultOptionIds || []).slice(0, Math.max(0, nextMax)),
                  });
                }}
                sx={{ width: 172 }}
              />
              <TextField
                size="small"
                label="最多选择数"
                type="number"
                value={group.maxSelection}
                onChange={(e) => {
                  const n = parseInt(e.target.value || '0', 10) || 0;
                  const nextMax = Math.max(group.minSelection, n);
                  props.onChange({
                    ...group,
                    maxSelection: nextMax,
                    defaultOptionIds: (group.defaultOptionIds || []).slice(0, Math.max(0, nextMax)),
                  });
                }}
                sx={{ width: 172 }}
              />
            </Stack>

            <FormControl size="small" sx={{ width: 360 }}>
              <InputLabel>默认选项</InputLabel>
              {group.maxSelection <= 1 ? (
                <Select
                  label="默认选项"
                  value={group.defaultOptionIds[0] || ''}
                  onChange={(e) => {
                    const v = String(e.target.value || '');
                    props.onChange({
                      ...group,
                      defaultOptionIds: v ? [v] : [],
                    });
                  }}
                >
                  <MenuItem value="">不设置</MenuItem>
                  {group.options.map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.name || o.id}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <Select
                  multiple
                  label="默认选项"
                  value={group.defaultOptionIds}
                  renderValue={(selected) =>
                    (selected as string[]).map((id) => group.options.find((o) => o.id === id)?.name || id).join('、')
                  }
                  onChange={(e) => {
                    const raw = e.target.value as unknown as string[];
                    const uniq = Array.from(new Set(raw.map((x) => String(x || '')).filter((x) => x)));
                    props.onChange({
                      ...group,
                      defaultOptionIds: uniq.slice(0, Math.max(0, group.maxSelection)),
                    });
                  }}
                >
                  {group.options.map((o) => {
                    const checked = group.defaultOptionIds.includes(o.id);
                    return (
                      <MenuItem key={o.id} value={o.id}>
                        <Checkbox checked={checked} />
                        {o.name || o.id}
                      </MenuItem>
                    );
                  })}
                </Select>
              )}
            </FormControl>

            <Typography variant="body2" color="text.secondary">
              规格选项
            </Typography>
            <Stack spacing={1}>
              {group.options.map((o) => (
                <Stack key={o.id} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    label="规格名称"
                    value={o.name}
                    onChange={(e) => {
                      props.onChange({
                        ...group,
                        options: group.options.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)),
                      });
                    }}
                    sx={{ width: 220 }}
                  />
                  <TextField
                    size="small"
                    label="加价"
                    value={o.priceYuan}
                    onChange={(e) => {
                      props.onChange({
                        ...group,
                        options: group.options.map((x) => (x.id === o.id ? { ...x, priceYuan: e.target.value } : x)),
                      });
                    }}
                    sx={{ width: 140 }}
                  />
                  <Button
                    color="error"
                    onClick={() => {
                      const nextOptions = group.options.filter((x) => x.id !== o.id);
                      props.onChange({
                        ...group,
                        options: nextOptions,
                        defaultOptionIds: (group.defaultOptionIds || []).filter((x) => x !== o.id),
                      });
                    }}
                  >
                    <DeleteIcon />
                  </Button>
                </Stack>
              ))}
              <Button
                variant="outlined"
                onClick={() =>
                  props.onChange({
                    ...group,
                    options: [...group.options, { id: genId('opt'), name: '', priceYuan: '0.00' }],
                  })
                }
                sx={{ alignSelf: 'flex-start' }}
                startIcon={<AddIcon />}
              >
                添加规格选项
              </Button>
            </Stack>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}
