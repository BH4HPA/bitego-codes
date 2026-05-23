import { Button, Input, View } from "@tarojs/components";
import Taro, { getCurrentInstance, useDidShow, useLoad } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { ensureLogin } from "../../../../api/auth";
import { getOrder, getOrderRefunds, requestRefund } from "../../../../api/orders";
import type { OrderDetailDTO, RefundTransactionDTO } from "../../../../api/types";
import { useTableSessionStore } from "../../../../store/tableSessionStore";
import { genId } from "../../../../utils/id";
import { formatDateTime } from "../../../../utils/date";
import { formatCents } from "../../../../utils/money";
import { orderStatusText } from "../../../../utils/order";
import { getStoreDisplayName } from "../../../../utils/store";
import "./index.scss";

export default function OrderDetailPage() {
  const [orderId, setOrderId] = useState("");
  const [data, setData] = useState<OrderDetailDTO | null>(null);
  const [refunds, setRefunds] = useState<RefundTransactionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const sessionToken = useTableSessionStore((s) => s.table?.sessionToken || "");

  useLoad(() => {
    const inst = getCurrentInstance();
    setOrderId(String(inst?.router?.params?.orderId || ""));
  });

  useDidShow(() => {
    if (!orderId) return;
    void (async () => {
      setLoading(true);
      try {
        await ensureLogin();
        const r = await getOrder(orderId, sessionToken ? { sessionToken } : undefined);
        setData(r);
        try {
          const rr = await getOrderRefunds(orderId);
          setRefunds(rr.list || []);
        } catch {
          void 0;
        }
      } catch (e) {
        await Taro.showToast({ title: e instanceof Error ? e.message : "加载失败", icon: "none" });
      } finally {
        setLoading(false);
      }
    })();
  });

  const canRefund = data?.status === "Paid" && !submittingRefund;
  const showRefundSection = data?.status === "Paid" || data?.status === "Refunding";
  const lastRejected = useMemo(() => refunds.find((r) => r.status === "REJECTED") || null, [refunds]);
  const activeRefund = useMemo(
    () => refunds.find((r) => r.status === "REVIEWING" || r.status === "PENDING") || null,
    [refunds],
  );

  const totalCents = useMemo(() => data?.totalAmountCents || 0, [data?.totalAmountCents]);

  return (
    <View className='page-order-detail'>
      <View className='title'>订单详情</View>
      <View className='meta'>
        订单：
        {data?.orderNo ? (
          <View
            className='meta-link'
            onClick={async () => {
              await Taro.setClipboardData({ data: data.orderNo });
              await Taro.showToast({ title: "已复制订单号", icon: "none" });
            }}
          >
            {data.orderNo}
          </View>
        ) : (
          orderId || "-"
        )}
      </View>
      <View className='meta'>状态：{orderStatusText(data?.status) || "-"}</View>
      {data?.storeName ? (
        <View className='meta'>
          门店：
          {getStoreDisplayName({
            storeId: data.storeId,
            tenantId: data.tenantId,
            tenantBrandName: data.tenantBrandName,
            name: data.storeName,
            subName: data.storeSubName,
            displayName: data.storeDisplayName,
          }) || data.storeName}
        </View>
      ) : null}
      <View className='meta'>桌台：{data?.tableCode ? `${data.tableCode} 桌` : data?.tableId || "-"}</View>
      {data?.tableId ? <View className='meta'>桌台ID：{data.tableId}</View> : null}
      {data?.payerNickname || data?.payerUserId ? (
        <View className='meta'>支付方：{data.payerNickname || data.payerUserId}</View>
      ) : null}
      <View className='meta'>金额：{formatCents(totalCents)}</View>
      {data?.remark ? <View className='meta'>备注：{data.remark}</View> : null}
      {data?.createdAt ? <View className='meta'>下单时间：{formatDateTime(data.createdAt)}</View> : null}
      {data?.paidAt ? <View className='meta'>支付时间：{formatDateTime(data.paidAt)}</View> : null}
      {data?.completedAt ? <View className='meta'>完成时间：{formatDateTime(data.completedAt)}</View> : null}
      {data?.canceledAt ? <View className='meta'>取消时间：{formatDateTime(data.canceledAt)}</View> : null}
      {data?.refundedAt ? <View className='meta'>退款时间：{formatDateTime(data.refundedAt)}</View> : null}

      {showRefundSection ? (
        <View className='card'>
          <View className='card-title'>退款</View>
          {lastRejected?.reviewRejectReason ? (
            <View className='refund-hint'>上次审核不通过：{lastRejected.reviewRejectReason}</View>
          ) : null}
          {data?.status === "Refunding" ? (
            <View className='refund-hint'>
              当前状态：退款中
              {activeRefund?.status === "REVIEWING"
                ? "（待审核）"
                : activeRefund?.status === "PENDING"
                  ? "（处理中）"
                  : ""}
            </View>
          ) : null}
          {data?.status === "Paid" ? (
            <View className='refund-form'>
              <Input
                className='refund-input'
                value={refundReason}
                placeholder='退款原因（可选，最多 50 字）'
                maxlength={50}
                onInput={(e) => setRefundReason(String((e as any)?.detail?.value || ""))}
              />
              <Button
                className='refund-btn'
                disabled={!canRefund}
                loading={submittingRefund}
                onClick={async () => {
                  if (!data) return;
                  const r = await Taro.showModal({
                    title: "申请退款",
                    content: "确认申请退款？",
                    confirmText: "确认",
                    cancelText: "取消",
                  });
                  if (!r.confirm) return;
                  setSubmittingRefund(true);
                  try {
                    await requestRefund({
                      orderId: data.orderId,
                      reason: refundReason.trim() || undefined,
                      requestId: genId("req"),
                    });
                    await Taro.showToast({ title: "已提交退款", icon: "success" });
                    setRefundReason("");
                    const next = await getOrder(data.orderId, sessionToken ? { sessionToken } : undefined);
                    setData(next);
                    try {
                      const rr = await getOrderRefunds(data.orderId);
                      setRefunds(rr.list || []);
                    } catch {
                      void 0;
                    }
                  } catch (e) {
                    await Taro.showToast({ title: e instanceof Error ? e.message : "退款失败", icon: "none" });
                  } finally {
                    setSubmittingRefund(false);
                  }
                }}
              >
                申请退款
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}

      <View className='card'>
        <View className='card-title'>订单明细</View>
        {data?.items?.length ? (
          data.items.map((it) => (
            <View key={it.orderItemId} className='item'>
              <View className='item-title'>
                {it.goodNameSnapshot} × {it.qty}
              </View>
              <View className='item-desc'>{it.specTextSnapshot}</View>
              <View className='item-desc'>单价：{formatCents(it.unitPriceSnapshotCents || 0)}</View>
              <View className='item-desc'>
                上菜进度：{it.servedQty}/{it.qty}
              </View>
              <View className='item-desc'>由 {it.addedByNicknameSnapshot || "匿名"} 添加</View>
            </View>
          ))
        ) : (
          <View className='empty'>{loading ? "加载中..." : "暂无明细"}</View>
        )}
      </View>
    </View>
  );
}
