export type ApiResponse<T> = {
  success: boolean;
  code: number;
  message: string;
  data: T;
};

export type ApiPagination = { page: number; pageSize: number; total: number };

export type ApiList<T> = { list: T[]; pagination: ApiPagination };

export type UserDTO = { userId: string; userType: "ADMIN" | "CUSTOMER"; nickname: string; avatarUrl: string };

export type CategoryDTO = {
  categoryId: string;
  name: string;
  subtitle?: string | null;
  badgeText?: string | null;
  sort: number;
};

export type GoodListItemDTO = {
  goodId: string;
  name: string;
  description: string;
  imageUrls: string[];
  categoryId: string;
  categoryIds?: string[];
  categorySortById?: Record<string, number>;
  defaultSkuId?: string | null;
  createdAt?: string;
  sales: number;
  status: string;
  basePriceCents: number;
  minPriceCents: number;
  soldOut?: boolean;
};

export type GoodOptionGroupDTO = {
  id: string;
  name: string;
  sort?: number;
  isStock?: boolean;
  defaultOptionIds?: string[];
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  options: Array<{ id: string; name: string; priceCents: number }>;
  groupType?: "custom" | "shared";
  sharedSpecGroupId?: string;
};

export type SKUDTO = {
  skuId: string;
  specCombination: string;
  priceCents: number;
  stock: number;
  status: "ON_SHELF" | "OFF_SHELF" | string;
};

export type GoodDetailDTO = GoodListItemDTO & {
  detailMarkdown: string;
  optionGroups: GoodOptionGroupDTO[];
  skus: SKUDTO[];
};

export type TableDTO = {
  tableId: string;
  code: string;
  status: string;
  sessionVersion: number;
  sessionToken?: string;
  qrcodeUrl: string | null;
  storeId?: string;
  store?: StoreDTO | null;
  wasFree?: boolean;
  connCount?: number;
  activeOrderCount?: number;
};

export type StoreDTO = {
  storeId: string;
  tenantId?: string | null;
  tenantType?: "SINGLE" | "CHAIN" | string | null;
  storeType?: "SINGLE_STORE" | "CHAIN_PRIMARY" | "CHAIN_BRANCH" | string | null;
  tenantBrandName?: string | null;
  subName?: string | null;
  name: string;
  displayName?: string | null;
  logoUrl: string;
  phone: string;
  address: string;
  description: string;
};

export type OrderListItemDTO = {
  orderId: string;
  orderNo: string;
  status: string;
  storeId?: string | null;
  tenantId?: string | null;
  tenantBrandName?: string | null;
  storeSubName?: string | null;
  storeName?: string | null;
  storeDisplayName?: string | null;
  storeLogoUrl?: string | null;
  tableId: string;
  tableSessionVersion?: number;
  tableCode: string | null;
  payerUserId?: string;
  payerNickname?: string | null;
  payerAvatarUrl?: string | null;
  totalAmount: string;
  totalAmountCents: number;
  totalQty?: number;
  remark?: string | null;
  paidAt: string | null;
  createdAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;
};

export type OrderDetailDTO = {
  orderId: string;
  orderNo: string;
  status: string;
  storeId?: string | null;
  tenantId?: string | null;
  tenantBrandName?: string | null;
  storeSubName?: string | null;
  storeName?: string | null;
  storeDisplayName?: string | null;
  storeLogoUrl?: string | null;
  tableId: string | null;
  tableCode: string | null;
  payerUserId?: string;
  payerNickname?: string | null;
  payerAvatarUrl?: string | null;
  totalAmount: string;
  totalAmountCents: number;
  remark: string | null;
  createdAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;
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

export type RefundTransactionDTO = {
  refundId: string;
  orderId: string;
  amount: string;
  status: string;
  reason: string | null;
  requestedAt: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewRejectReason: string | null;
  succeededAt: string | null;
};
