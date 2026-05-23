type TenantLike = { type?: string | null; brandName?: string | null } | null | undefined
type StoreLike = { name?: string | null; subName?: string | null; storeId?: string | null } | null | undefined

// Chain tenants render as "品牌名称(门店名称)"; others use the store name directly.
export function buildStoreDisplayName(tenant: TenantLike, store: StoreLike): string {
  const brand = String(tenant?.brandName || '').trim()
  const name = String(store?.subName || store?.name || '').trim()
  const tenantType = String(tenant?.type || '')
  if (brand && name && (tenantType === 'CHAIN' || Boolean(store?.subName))) return `${brand}(${name})`
  return name || brand || String(store?.storeId || '')
}
