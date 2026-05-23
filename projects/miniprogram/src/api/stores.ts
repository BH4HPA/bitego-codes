import { request } from "./request";
import type { StoreDTO } from "./types";

export async function getCurrentStore() {
  return await request<StoreDTO>({ path: "/stores/current", method: "GET" });
}
