import { request } from "./request";
import type { ApiList, GoodDetailDTO, GoodListItemDTO } from "./types";

export async function getGoods(params: {
  storeId?: string;
  status?: string;
  categoryId?: string;
  name?: string;
  page?: number;
  pageSize?: number;
}) {
  return await request<ApiList<GoodListItemDTO>>({ path: "/goods", method: "GET", query: params });
}

export async function getGood(goodId: string, params?: { storeId?: string }) {
  return await request<GoodDetailDTO>({
    path: `/goods/${encodeURIComponent(goodId)}`,
    method: "GET",
    query: params,
  });
}
