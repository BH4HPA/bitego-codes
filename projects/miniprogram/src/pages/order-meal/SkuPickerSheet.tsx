import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo } from "react";
import type { GoodDetailDTO, GoodOptionGroupDTO, SKUDTO } from "../../api/types";
import { BottomSheet } from "../../components/common/BottomSheet";
import { centsToYuan, formatCents } from "../../utils/money";

type OptionGroup = GoodOptionGroupDTO;

type Props = {
  open: boolean;
  activeGood: GoodDetailDTO | null;
  selectedOptionIdsByGroupId: Record<string, string[]>;
  onSelectedOptionIdsChange: (next: Record<string, string[]>) => void;
  invalidGroupId: string;
  onInvalidGroupIdChange: (next: string) => void;
  qty: number;
  onQtyChange: (next: number) => void;
  selectedSku: SKUDTO | null;
  selectedSkuAvailable: boolean;
  maxAddQty: number;
  selectedPiUnitPriceCents: number;
  stockGroups: OptionGroup[];
  nonStockGroups: OptionGroup[];
  inStockCombos: Array<Record<string, string[]>>;
  onClose: () => void;
  onConfirm: () => void;
};

function parseHint(g: OptionGroup): string {
  const parts: string[] = [];
  if (!g.isRequired) parts.push("可选");
  if ((g.minSelection || 0) > 1) parts.push(`最少 ${g.minSelection} 个`);
  if ((g.maxSelection || 0) > 1) parts.push(`最多 ${g.maxSelection} 个`);
  return parts.join("，");
}

function minSelectionOf(g: OptionGroup): number {
  const base = Number(g.minSelection || 0) || 0;
  return g.isRequired ? Math.max(1, base) : base;
}

export function SkuPickerSheet(props: Props) {
  const {
    activeGood,
    selectedOptionIdsByGroupId,
    onSelectedOptionIdsChange,
    stockGroups,
    inStockCombos,
    selectedSku,
    selectedSkuAvailable,
    maxAddQty,
  } = props;

  const stockGroupIds = useMemo(() => stockGroups.map((g) => g.id), [stockGroups]);

  const isSelectionCompatibleWithInStock = (selected: Record<string, string[]>) => {
    if (!activeGood || !inStockCombos.length) return false;
    for (const combo of inStockCombos) {
      let ok = true;
      for (const gid of stockGroupIds) {
        const ids = selected[gid] || [];
        if (!ids.length) continue;
        const inCombo = combo[gid] || [];
        if (!ids.every((id) => inCombo.includes(id))) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  };

  const toggleOption = (g: OptionGroup, o: { id: string }) => {
    const next = { ...selectedOptionIdsByGroupId };
    const curIds = next[g.id] ? [...next[g.id]] : [];
    const min = minSelectionOf(g);
    if (g.maxSelection <= 1) {
      if (curIds.includes(o.id)) {
        if (curIds.length - 1 >= min) next[g.id] = [];
      } else {
        next[g.id] = [o.id];
      }
    } else if (curIds.includes(o.id)) {
      next[g.id] = curIds.filter((x) => x !== o.id);
    } else {
      next[g.id] = [...curIds, o.id].slice(0, g.maxSelection);
    }
    props.onInvalidGroupIdChange("");
    onSelectedOptionIdsChange(next);
  };

  return (
    <BottomSheet
      open={props.open}
      title='选择规格'
      onClose={props.onClose}
      height='70vh'
      footer={
        <Button
          className='sheet-btn'
          disabled={!selectedSkuAvailable || !maxAddQty || props.qty > maxAddQty}
          onClick={props.onConfirm}
        >
          加入购物车
        </Button>
      }
    >
      {activeGood ? (
        <View>
          {(activeGood.optionGroups || []).map((g) => {
            const picked = selectedOptionIdsByGroupId[g.id] || [];
            const hint = parseHint(g);
            return (
              <View key={g.id} className={`og ${props.invalidGroupId === g.id ? "og-invalid" : ""}`}>
                <View className='og-title'>
                  <View className='og-title-name'>{g.name}</View>
                  {hint ? <View className='og-title-hint'>{hint}</View> : null}
                </View>
                <View className='og-ops'>
                  {g.options.map((o) => {
                    const active = picked.includes(o.id);
                    const isMulti = g.maxSelection > 1;
                    const min = minSelectionOf(g);
                    const canRemove = !active || picked.length - 1 >= min;
                    const nextSelected = (() => {
                      const next = { ...selectedOptionIdsByGroupId };
                      const curIds = next[g.id] ? [...next[g.id]] : [];
                      if (g.maxSelection <= 1) {
                        next[g.id] = [o.id];
                        return next;
                      }
                      if (curIds.includes(o.id)) {
                        next[g.id] = curIds.filter((x) => x !== o.id);
                        return next;
                      }
                      next[g.id] = [...curIds, o.id].slice(0, g.maxSelection);
                      return next;
                    })();
                    const lockedActive = isMulti && active && !canRemove;
                    const incompatible = !inStockCombos.length || !isSelectionCompatibleWithInStock(nextSelected);
                    const disabled = (!active && incompatible) || lockedActive;
                    return (
                      <View
                        key={o.id}
                        className={`og-op ${active ? "og-op-active" : ""} ${
                          disabled && !active ? "og-op-disabled" : ""
                        }`}
                        onClick={() => {
                          if (disabled) {
                            if (!active) void Taro.showToast({ title: "该规格已售罄", icon: "none" });
                            return;
                          }
                          toggleOption(g, o);
                        }}
                      >
                        <Text>{o.name}</Text>
                        {o.priceCents > 0 ? <Text className='og-op-plus'>￥{centsToYuan(o.priceCents)}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          <View className='qty-row'>
            <View className='qty-title'>数量</View>
            <View className='qty-ctrl'>
              <Button className='qty-btn' onClick={() => props.onQtyChange(Math.max(1, props.qty - 1))}>
                -
              </Button>
              <View className='qty-val'>{props.qty}</View>
              <Button
                className='qty-btn'
                disabled={!selectedSkuAvailable || !maxAddQty || props.qty >= maxAddQty}
                onClick={() => {
                  if (!selectedSkuAvailable || !maxAddQty) return;
                  props.onQtyChange(Math.min(maxAddQty, props.qty + 1));
                }}
              >
                +
              </Button>
            </View>
          </View>

          <View className='sku-hint'>
            {selectedSku
              ? selectedSku.status !== "ON_SHELF"
                ? "已下架"
                : (selectedSku.stock || 0) <= 0
                  ? "已售罄"
                  : !maxAddQty
                    ? "库存不足"
                    : `单价 ${formatCents(props.selectedPiUnitPriceCents)} / 库存 ${selectedSku.stock}`
              : "请选择完整规格"}
          </View>
        </View>
      ) : (
        <View className='sheet-hint'>暂无规格</View>
      )}
    </BottomSheet>
  );
}
