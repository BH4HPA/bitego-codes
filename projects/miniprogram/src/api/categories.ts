import { request } from "./request";
import type { ApiList, CategoryDTO } from "./types";

export async function getCategories(params: { storeId?: string; status?: string; page?: number; pageSize?: number }) {
  return await request<ApiList<CategoryDTO>>({ path: "/categories", method: "GET", query: params });
}
