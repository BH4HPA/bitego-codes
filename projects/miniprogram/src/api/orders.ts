import { request } from "./request";
import type { ApiList, OrderDetailDTO, OrderListItemDTO, RefundTransactionDTO } from "./types";

export async function getOrders(params: {
  status?: string;
  tableId?: string;
  tableSessionVersion?: number;
  sessionToken?: string;
  page?: number;
  pageSize?: number;
}) {
  return await request<ApiList<OrderListItemDTO>>({ path: "/orders", method: "GET", query: params });
}

export async function getOrder(orderId: string, params?: { sessionToken?: string }) {
  return await request<OrderDetailDTO>({
    path: `/orders/${encodeURIComponent(orderId)}`,
    method: "GET",
    query: params?.sessionToken ? { sessionToken: params.sessionToken } : undefined,
  });
}

export async function createOrder(params: {
  tableId: string;
  cartVersion: number;
  remark?: string;
  paymentMethod?: string;
  requestId: string;
}) {
  return await request<{ orderId: string; orderNo: string; status: string; paidAt: string | null; paymentId?: string }>(
    {
      path: "/orders",
      method: "POST",
      data: {
        tableId: params.tableId,
        cartVersion: params.cartVersion,
        remark: params.remark,
        paymentMethod: params.paymentMethod,
      },
      headers: { "x-request-id": params.requestId },
    },
  );
}

export async function requestRefund(params: { orderId: string; reason?: string; requestId: string }) {
  return await request<{ orderId: string; refundId: string; status: string; etaSeconds?: number }>({
    path: `/orders/${encodeURIComponent(params.orderId)}/refunds`,
    method: "POST",
    data: { reason: params.reason || null },
    headers: { "x-request-id": params.requestId },
  });
}

export async function getOrderRefunds(orderId: string) {
  return await request<{ list: RefundTransactionDTO[] }>({
    path: `/orders/${encodeURIComponent(orderId)}/refunds`,
    method: "GET",
  });
}
