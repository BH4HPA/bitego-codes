import { ScrollView, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { ensureLogin } from "../../../../api/auth";
import { getOrders } from "../../../../api/orders";
import type { OrderListItemDTO } from "../../../../api/types";
import { formatCents } from "../../../../utils/money";
import { orderStatusText } from "../../../../utils/order";
import "./index.scss";
import { useAppRouter } from "../../../../hooks/useAppRouter";
import { getStoreDisplayName } from "../../../../utils/store";

export default function HistoryOrdersPage() {
  const router = useAppRouter();
  const [orders, setOrders] = useState<OrderListItemDTO[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const hasMore = orders.length < total;

  const load = async (p: number, reset: boolean) => {
    if (loading) return;
    setLoading(true);
    try {
      await ensureLogin();
      const r = await getOrders({ page: p, pageSize });
      setTotal(r.pagination?.total || 0);
      if (reset) setOrders(r.list || []);
      else setOrders((cur) => [...cur, ...(r.list || [])]);
      setPage(p);
    } catch (e) {
      await Taro.showToast({ title: e instanceof Error ? e.message : "加载失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    void load(1, true);
  });

  return (
    <View className='page-history-orders'>
      <View className='title'>历史订单</View>
      <ScrollView
        className='list'
        scrollY
        enhanced
        showScrollbar={false}
        lowerThreshold={80}
        onScrollToLower={() => {
          if (loading || !hasMore) return;
          void load(page + 1, false);
        }}
      >
        {orders.length ? (
          orders.map((o) => (
            <View key={o.orderId} className='row' onClick={() => router.toOrderDetail({ orderId: o.orderId })}>
              <View className='row-top'>
                <View className='row-title'>{o.orderNo || o.orderId}</View>
                <View className='row-status'>{orderStatusText(o.status)}</View>
              </View>
              {o.storeName ? (
                <View className='row-mid'>
                  <View className='store-pill'>
                    <View
                      className='store-logo'
                      style={o.storeLogoUrl ? ({ backgroundImage: `url(${o.storeLogoUrl})` } as any) : undefined}
                    />
                    <View className='store-name'>
                      {getStoreDisplayName({
                        storeId: o.storeId,
                        tenantId: o.tenantId,
                        tenantBrandName: o.tenantBrandName,
                        name: o.storeName,
                        subName: o.storeSubName,
                        displayName: o.storeDisplayName,
                      }) || o.storeName}
                    </View>
                  </View>
                </View>
              ) : null}
              <View className='row-bottom'>
                <View className='row-meta'>桌台：{o.tableCode ? `${o.tableCode} 桌` : o.tableId}</View>
                <View className='row-amount'>{formatCents(o.totalAmountCents || 0)}</View>
              </View>
            </View>
          ))
        ) : (
          <View className='empty'>{loading ? "加载中..." : "暂无订单"}</View>
        )}
        <View className='hint'>{loading ? "加载中..." : hasMore ? "上拉加载更多" : "没有更多了"}</View>
      </ScrollView>
    </View>
  );
}
