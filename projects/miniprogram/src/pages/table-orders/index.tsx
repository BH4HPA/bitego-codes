import { Button, View } from "@tarojs/components";
import Taro, { getCurrentInstance, useLoad } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { ensureLogin } from "../../api/auth";
import { getOrder, getOrders } from "../../api/orders";
import type { OrderDetailDTO } from "../../api/types";
import { useTableSessionStore } from "../../store/tableSessionStore";
import { useAppRouter } from "../../hooks/useAppRouter";
import { orderStatusText } from "../../utils/order";
import { formatCents } from "../../utils/money";
import { formatDateTime } from "../../utils/date";
import "./index.scss";

export default function TableOrdersPage() {
  const router = useAppRouter();
  const [tableId, setTableId] = useState("");
  const acquire = useTableSessionStore((s) => s.acquire);
  const release = useTableSessionStore((s) => s.release);
  const table = useTableSessionStore((s) => s.table);
  const orders = useTableSessionStore((s) => s.tableOrders);
  const lastOrderItemServed = useTableSessionStore((s) => s.lastOrderItemServed);
  const disconnect = useTableSessionStore((s) => s.disconnect);
  const sessionClosedAt = useTableSessionStore((s) => s.sessionClosedAt);
  const sessionClosedMessage = useTableSessionStore((s) => s.sessionClosedMessage);

  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<OrderDetailDTO[]>([]);

  useLoad(() => {
    const inst = getCurrentInstance();
    const tid = String(inst?.router?.params?.tableId || "");
    setTableId(tid);
  });

  useEffect(() => {
    if (!tableId) return;
    void (async () => {
      try {
        await acquire(tableId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "初始化失败";
        await Taro.showToast({ title: msg, icon: "none" });
        if (msg === "桌台不存在") router.toIndex();
      }
    })();
    return () => {
      release();
    };
  }, [acquire, release, router, tableId]);

  useEffect(() => {
    if (!sessionClosedAt) return;
    void (async () => {
      await Taro.showModal({
        title: "提示",
        content: sessionClosedMessage || "桌台已关闭",
        showCancel: false,
        confirmText: "返回首页",
      });
      disconnect();
      router.toIndex();
    })();
  }, [disconnect, router, sessionClosedAt, sessionClosedMessage]);

  useEffect(() => {
    if (!tableId) return;
    void (async () => {
      setLoading(true);
      try {
        await ensureLogin();
        const r = await getOrders({
          tableId,
          tableSessionVersion: table?.sessionVersion,
          sessionToken: table?.sessionToken,
          page: 1,
          pageSize: 50,
        });
        const ids = (r.list || []).map((x) => x.orderId);
        const list = await Promise.all(ids.map((id) => getOrder(id, { sessionToken: table?.sessionToken })));
        setDetails(list);
      } catch (e) {
        await Taro.showToast({ title: e instanceof Error ? e.message : "加载订单失败", icon: "none" });
        setDetails([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [table?.sessionToken, table?.sessionVersion, tableId]);

  useEffect(() => {
    if (!orders.length) return;
    void (async () => {
      const existed = new Set(details.map((d) => d.orderId));
      const missing = orders.filter((o) => !existed.has(o.orderId)).map((o) => o.orderId);
      if (!missing.length) return;
      try {
        const list = await Promise.all(missing.map((id) => getOrder(id, { sessionToken: table?.sessionToken })));
        setDetails((cur) => {
          const next = [...list, ...cur];
          const seen = new Set<string>();
          return next.filter((x) => {
            if (seen.has(x.orderId)) return false;
            seen.add(x.orderId);
            return true;
          });
        });
      } catch {
        void 0;
      }
    })();
  }, [details, orders, table?.sessionToken]);

  useEffect(() => {
    if (!orders.length) return;
    setDetails((cur) =>
      cur.map((d) => {
        const s = orders.find((x) => x.orderId === d.orderId);
        if (!s) return d;
        if (s.status === d.status && (s.orderNo || "") === (d.orderNo || "")) return d;
        return { ...d, status: s.status, orderNo: s.orderNo || d.orderNo };
      }),
    );
  }, [orders]);

  useEffect(() => {
    if (!lastOrderItemServed) return;
    setDetails((cur) =>
      cur.map((d) => {
        if (d.orderId !== lastOrderItemServed.orderId) return d;
        return {
          ...d,
          items: (d.items || []).map((it) =>
            it.orderItemId === lastOrderItemServed.orderItemId
              ? { ...it, servedQty: lastOrderItemServed.servedQty }
              : it,
          ),
        };
      }),
    );
  }, [lastOrderItemServed]);

  const title = useMemo(() => {
    if (table?.code) return `${table.code} 桌订单`;
    return "本桌订单";
  }, [table?.code]);

  const summary = useMemo(() => {
    const validOrders = (details || []).filter((o) => o.status !== "Refunded" && o.status !== "Canceled");
    const totalQty = validOrders.reduce(
      (s, o) => s + (o.items || []).reduce((ss, it) => ss + (Number(it.qty) || 0), 0),
      0,
    );
    const totalCents = validOrders.reduce((s, o) => s + (Number(o.totalAmountCents) || 0), 0);
    return { totalQty, totalCents };
  }, [details]);

  const orderIndexById = useMemo(() => {
    const getTs = (o: OrderDetailDTO) => {
      const v = o.paidAt || o.createdAt;
      if (!v) return Number.POSITIVE_INFINITY;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    const list = [...details].sort((a, b) => {
      const ta = getTs(a);
      const tb = getTs(b);
      if (ta !== tb) return ta - tb;
      return (a.orderNo || a.orderId).localeCompare(b.orderNo || b.orderId);
    });
    const map = new Map<string, number>();
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      map.set(o.orderId, i + 1);
    }
    return map;
  }, [details]);

  return (
    <View className='page-table-orders'>
      <View className='title'>{title}</View>
      <View className='list'>
        {loading ? (
          <View className='empty'>加载中...</View>
        ) : details.length ? (
          details.map((o) => (
            <View key={o.orderId} className='order-card'>
              <View className='order-head'>
                <View className='order-left'>
                  <View className='order-no'>{`第 ${orderIndexById.get(o.orderId) || 1} 次下单`}</View>
                  <View className='order-payer'>
                    <View
                      className='payer-avatar'
                      style={o.payerAvatarUrl ? { backgroundImage: `url(${o.payerAvatarUrl})` } : undefined}
                    >
                      {!o.payerAvatarUrl ? <View className='payer-avatar-text'>匿</View> : null}
                    </View>
                    <View className='payer-name'>{o.payerNickname || o.payerUserId || "匿名"}</View>
                  </View>
                  <View className='order-meta'>下单时间：{formatDateTime(o.paidAt || o.createdAt)}</View>
                </View>
                <View className='order-status'>{orderStatusText(o.status)}</View>
              </View>
              {o.items?.length ? (
                <View className='order-items'>
                  {o.items.map((it) => (
                    <View key={it.orderItemId} className='item-row'>
                      <View className='item-main'>
                        <View className='item-name'>
                          {it.goodNameSnapshot} × {it.qty}
                        </View>
                        <View className='item-spec'>{it.specTextSnapshot}</View>
                        <View className='item-by'>
                          <View
                            className='by-avatar'
                            style={
                              it.addedByAvatarSnapshot
                                ? { backgroundImage: `url(${it.addedByAvatarSnapshot})` }
                                : undefined
                            }
                          >
                            {!it.addedByAvatarSnapshot ? <View className='by-avatar-text'>匿</View> : null}
                          </View>
                          <View className='by-name'>{it.addedByNicknameSnapshot || "匿名"}</View>
                        </View>
                      </View>
                      <View className='item-served'>
                        {it.servedQty}/{it.qty}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className='empty'>暂无明细</View>
              )}
              <View className='order-foot'>
                <View className='order-amount'>合计 {o.totalAmount}</View>
                <View className='order-actions'>
                  <Button className='link-btn' onClick={() => router.toOrderDetail({ orderId: o.orderId })}>
                    查看详情
                  </Button>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View className='empty'>暂无订单</View>
        )}
      </View>
      <View className='bottom-bar'>
        <View className='bottom-meta'>
          <View className='bottom-qty'>共 {summary.totalQty} 份</View>
          <View className='bottom-total'>合计 {formatCents(summary.totalCents)}</View>
        </View>
        <Button
          className='bottom-btn'
          onClick={() =>
            router.back({
              expect: router.routes.orderMeal,
              fallback: { url: router.routes.orderMeal, query: { tableId }, mode: "reLaunch" },
            })
          }
        >
          返回点餐
        </Button>
      </View>
    </View>
  );
}
