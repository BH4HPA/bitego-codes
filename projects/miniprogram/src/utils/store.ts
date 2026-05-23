// Backend is the single source of truth for store display names (see
// backend utils/storeName.ts). We prefer the server-provided `displayName`
// and only fall back to local composition when the server field is absent.
export function getStoreDisplayName(
  store:
    | {
        storeId?: string | null;
        tenantId?: string | null;
        tenantType?: string | null;
        storeType?: string | null;
        tenantBrandName?: string | null;
        name?: string | null;
        subName?: string | null;
        displayName?: string | null;
      }
    | null
    | undefined,
) {
  if (!store) return "";
  const fromServer = String(store.displayName || "").trim();
  if (fromServer) return fromServer;
  const brand = String(store.tenantBrandName || "");
  const name = String(store.subName || store.name || "");
  const storeId = String(store.storeId || "");
  const tenantType = String(store.tenantType || "");
  if (brand && name && (tenantType === "CHAIN" || Boolean(store.subName))) return `${brand}(${name})`;
  return name || brand || storeId;
}
