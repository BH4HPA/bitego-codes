import { api, unwrap } from './client';
import type { ApiList, ApiResponse, OrderListItemDTO, RefundTransactionDTO } from './types';

export type OrderDetailDTO = {
  orderId: string;
  orderNo: string;
  status: string;
  totalAmount: string;
  totalAmountCents: number;
  remark: string | null;
  createdAt: string | null;
  paidAt: string | null;
  items: Array<{
    orderItemId: string;
    goodNameSnapshot: string;
    specTextSnapshot: string;
    unitPriceSnapshot: string;
    unitPriceSnapshotCents: number;
    qty: number;
    servedQty: number;
    addedByNicknameSnapshot: string;
    addedByAvatarSnapshot: string;
  }>;
};

export async function getOrders(params: {
  status?: string;
  tableId?: string;
  tableSessionVersion?: number;
  orderNo?: string;
  page?: number;
  pageSize?: number;
}) {
  const resp = await api.get<ApiResponse<ApiList<OrderListItemDTO>>>('/orders', { params });
  return unwrap(resp.data);
}

export async function getOrder(orderId: string) {
  const resp = await api.get<ApiResponse<OrderDetailDTO>>(`/orders/${encodeURIComponent(orderId)}`);
  return unwrap(resp.data);
}

export async function updateOrderStatus(
  orderId: string,
  params: { status: 'Making' | 'Completed' | 'Canceled'; reason?: string },
) {
  const resp = await api.put<ApiResponse<{ orderId: string; status: string }>>(
    `/orders/${encodeURIComponent(orderId)}/status`,
    params,
  );
  return unwrap(resp.data);
}

export async function serveOrderItem(params: { orderId: string; orderItemId: string; mode?: 'SET_ALL'; qty?: number }) {
  const resp = await api.post<
    ApiResponse<{ orderId: string; orderItemId: string; servedQty: number; orderStatus: string }>
  >(`/orders/${encodeURIComponent(params.orderId)}/items/${encodeURIComponent(params.orderItemId)}/serve`, {
    mode: params.mode,
    qty: params.qty,
  });
  return unwrap(resp.data);
}

export async function requestRefund(params: { orderId: string; reason?: string; requestId: string }) {
  const resp = await api.post<ApiResponse<{ orderId: string; refundId: string; status: string; etaSeconds?: number }>>(
    `/orders/${encodeURIComponent(params.orderId)}/refunds`,
    { reason: params.reason || null },
    { headers: { 'x-request-id': params.requestId } },
  );
  return unwrap(resp.data);
}

export async function getOrderRefunds(orderId: string) {
  const resp = await api.get<ApiResponse<{ list: RefundTransactionDTO[] }>>(
    `/orders/${encodeURIComponent(orderId)}/refunds`,
  );
  return unwrap(resp.data);
}

export async function reviewRefund(params: {
  orderId: string;
  refundId: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}) {
  const resp = await api.put<ApiResponse<{ orderId: string; refundId: string; status: string; orderStatus: string }>>(
    `/orders/${encodeURIComponent(params.orderId)}/refunds/${encodeURIComponent(params.refundId)}/review`,
    { decision: params.decision, reason: params.reason || null },
  );
  return unwrap(resp.data);
}
