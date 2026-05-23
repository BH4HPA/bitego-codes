import Taro from "@tarojs/taro";
import type { StoreDTO } from "../api/types";

const KEY = "bitego:recentStore";

export type StoredRecentStore = StoreDTO & { ts: number };

export function getRecentStore() {
  try {
    const raw = Taro.getStorageSync(KEY);
    if (!raw) return null;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return null;
    const o = v as any;
    const storeId = String(o.storeId || "");
    if (!storeId) return null;
    return {
      storeId,
      tenantId: o.tenantId ? String(o.tenantId || "") : null,
      tenantBrandName: o.tenantBrandName ? String(o.tenantBrandName || "") : null,
      subName: o.subName ? String(o.subName || "") : null,
      name: String(o.name || ""),
      displayName: o.displayName ? String(o.displayName || "") : null,
      logoUrl: String(o.logoUrl || ""),
      phone: String(o.phone || ""),
      address: String(o.address || ""),
      description: String(o.description || ""),
      ts: Number(o.ts || 0) || 0,
    } as StoredRecentStore;
  } catch {
    return null;
  }
}

export function setRecentStore(store: StoreDTO) {
  try {
    const payload: StoredRecentStore = { ...store, ts: Date.now() };
    Taro.setStorageSync(KEY, JSON.stringify(payload));
  } catch {
    void 0;
  }
}

export function clearRecentStore() {
  try {
    Taro.removeStorageSync(KEY);
  } catch {
    void 0;
  }
}
