import { Button, Input, View } from "@tarojs/components";
import Taro, { getCurrentInstance, useLoad } from "@tarojs/taro";
import { useMemo, useRef, useState } from "react";
import { createOrder } from "../../api/orders";
import { getGood } from "../../api/goods";
import { useTableSessionStore } from "../../store/tableSessionStore";
import { useAppRouter } from "../../hooks/useAppRouter";
import { ApiRequestError } from "../../utils/error";
import { genId } from "../../utils/id";
import { formatCents } from "../../utils/money";
import "./index.scss";

export default function CheckoutPage() {
  const router = useAppRouter();
  const [tableId, setTableId] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingRequestIdRef = useRef<string | null>(null);
  const cart = useTableSessionStore((s) => s.cart);
  const version = useTableSessionStore((s) => s.cartVersion);
  const tableCode = useTableSessionStore((s) => s.table?.code || "");
  const storeId = useTableSessionStore((s) => s.table?.storeId || "");

  useLoad(() => {
    const inst = getCurrentInstance();
    setTableId(String(inst?.router?.params?.tableId || ""));
  });

  const totalCents = useMemo(() => {
    const items = cart?.items || [];
    return items.reduce((s, it) => s + (Number(it.unitPriceSnapshot || 0) || 0) * (Number(it.qty) || 0), 0);
  }, [cart?.items]);

  const canSubmit = Boolean(tableId) && Boolean(cart?.items?.length) && !submitting;

  return (
    <View className='page-checkout'>
      <View className='title'>确认并提交</View>

      <View className='card'>
        <View className='card-title'>菜品清单</View>
        {(cart?.items || []).length ? (
          (cart?.items || []).map((it) => {
            const unit = Number(it.unitPriceSnapshot || 0) || 0;
            const qty = Number(it.qty || 0) || 0;
            const subtotal = unit * qty;
            return (
              <View key={it.cartItemId} className='item-row'>
                <View className='item-main'>
                  <View className='item-name'>{it.goodNameSnapshot}</View>
                  {it.specTextSnapshot ? <View className='item-spec'>{it.specTextSnapshot}</View> : null}
                  <View className='item-by'>
                    <View
                      className='by-avatar'
                      style={
                        it.addedByAvatarSnapshot ? { backgroundImage: `url(${it.addedByAvatarSnapshot})` } : undefined
                      }
                    >
                      {!it.addedByAvatarSnapshot ? <View className='by-avatar-text'>匿</View> : null}
                    </View>
                    <View className='by-name'>{it.addedByNicknameSnapshot || "匿名"}</View>
                  </View>
                </View>
                <View className='item-right'>
                  <View className='item-qty'>×{qty}</View>
                  <View className='item-unit'>单价 {formatCents(unit)}</View>
                  <View className='item-subtotal'>{formatCents(subtotal)}</View>
                </View>
              </View>
            );
          })
        ) : (
          <View className='empty'>购物车为空</View>
        )}
      </View>

      <View className='card'>
        <View className='row'>
          <View className='label'>桌台</View>
          <View className='value'>{tableCode ? `${tableCode} 桌` : tableId}</View>
        </View>
        <View className='row'>
          <View className='label'>合计</View>
          <View className='value price'>{formatCents(totalCents)}</View>
        </View>
      </View>

      <View className='bottom'>
        <View className='bottom-inner'>
          <View className='label'>备注（可选）</View>
          <Input
            className='input'
            placeholder='例如：少冰/不要吸管'
            value={remark}
            onInput={(e) => setRemark(String(e.detail.value || ""))}
          />
          <Button
            className='submit-btn'
            disabled={!canSubmit}
            loading={submitting}
            onClick={async () => {
              if (!tableId) return;
              if (!cart?.items?.length) {
                await Taro.showToast({ title: "购物车为空", icon: "none" });
                return;
              }
              const items = cart.items || [];
              try {
                const goodIds = Array.from(new Set(items.map((x) => x.goodId).filter(Boolean)));
                const goods = await Promise.all(goodIds.map((id) => getGood(id, storeId ? { storeId } : undefined)));
                const skuById = new Map<string, { skuId: string; stock: number; status: string }>();
                for (const g of goods) {
                  for (const s of g.skus || []) {
                    skuById.set(s.skuId, { skuId: s.skuId, stock: Number(s.stock || 0) || 0, status: s.status });
                  }
                }
                for (const it of items) {
                  const sku = skuById.get(it.skuId);
                  if (!sku || sku.status !== "ON_SHELF") {
                    await Taro.showModal({
                      title: "库存不足",
                      content: `${it.goodNameSnapshot}${it.specTextSnapshot ? `（${it.specTextSnapshot}）` : ""} 已下架或不可售`,
                      showCancel: false,
                    });
                    return;
                  }
                  if (sku.stock < it.qty) {
                    await Taro.showModal({
                      title: "库存不足",
                      content: `${it.goodNameSnapshot}${it.specTextSnapshot ? `（${it.specTextSnapshot}）` : ""} 库存仅剩 ${sku.stock}`,
                      showCancel: false,
                    });
                    return;
                  }
                }
              } catch (e) {
                await Taro.showToast({ title: e instanceof Error ? e.message : "库存校验失败", icon: "none" });
                return;
              }
              setSubmitting(true);
              if (!pendingRequestIdRef.current) pendingRequestIdRef.current = genId("req");
              try {
                const r = await createOrder({
                  tableId,
                  cartVersion: version,
                  remark: remark.trim() || undefined,
                  paymentMethod: "WECHAT",
                  requestId: pendingRequestIdRef.current,
                });
                pendingRequestIdRef.current = null;
                await Taro.showToast({ title: "下单成功", icon: "success" });
                await router.replaceToTableOrders({ tableId });
                void r;
              } catch (e) {
                if (e instanceof ApiRequestError) pendingRequestIdRef.current = null;
                await Taro.showToast({ title: e instanceof Error ? e.message : "下单失败", icon: "none" });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            提交订单
          </Button>
        </View>
      </View>
    </View>
  );
}
