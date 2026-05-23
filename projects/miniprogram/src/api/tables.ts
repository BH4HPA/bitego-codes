import { request } from "./request";
import type { TableDTO } from "./types";

export async function getTable(tableId: string) {
  return await request<TableDTO>({ path: `/tables/${encodeURIComponent(tableId)}`, method: "GET" });
}

export async function resetTableSession(tableId: string) {
  return await request<{ tableId: string; status: string; sessionVersion: number }>({
    path: `/tables/${encodeURIComponent(tableId)}/reset-session`,
    method: "POST",
  });
}
