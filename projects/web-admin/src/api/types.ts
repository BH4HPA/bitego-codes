export type ApiResponse<T> = {
  success: boolean;
  code: number;
  message: string;
  data: T;
};

export type ApiPagination = { page: number; pageSize: number; total: number };

export type ApiList<T> = { list: T[]; pagination: ApiPagination };

export type UserMe = {
  userId: string;
  userType: 'ADMIN' | 'CUSTOMER';
  nickname: string;
  avatarUrl: string;
};

export type LoginResp = { token: string };

export type CategoryDTO = {
  categoryId: string;
  name: string;
  subtitle?: string | null;
  badgeText?: string | null;
  sort: number;
};

export type TableDTO = {
  tableId: string;
  code: string;
  status: 'FREE' | 'OCCUPIED' | string;
  sessionVersion: number;
  qrcodeUrl: string | null;
  h5QrcodeUrl: string | null;
};

export type StoreDTO = {
  storeId: string;
  tenantId?: string | null;
  tenantType?: 'SINGLE' | 'CHAIN' | string | null;
  tenantBrandName?: string | null;
  isPrimary?: number;
  subName?: string | null;
  name: string;
  displayName?: string | null;
  logoUrl: string;
  phone: string;
  address: string;
  description: string;
};

export type GoodOptionDTO = { id: string; name: string; priceCents: number };

export type GoodOptionGroupDTO = {
  id: string;
  name: string;
  sort?: number;
  isStock?: boolean;
  defaultOptionIds?: string[];
  disabledOptionIds?: string[];
  options: GoodOptionDTO[];
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  groupType?: 'custom' | 'shared';
  sharedSpecGroupId?: string;
};

export type SKUStatus = 'ON_SHELF' | 'OFF_SHELF' | string;

export type SKUDTO = {
  skuId: string;
  goodId: string;
  specCombination: string;
  priceCents: number;
  stock: number;
  status: SKUStatus;
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
  sales: number;
  status: string;
  basePriceCents: number;
  minPriceCents: number;
  soldOut?: boolean;
};

export type SharedSpecOptionDTO = {
  id: string;
  name: string;
  priceCents: number;
  sort?: number;
};

export type SharedSpecGroupDTO = {
  sharedSpecGroupId: string;
  name: string;
  description?: string | null;
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  sort: number;
  defaultOptionIds?: string[];
  status: string;
  options: SharedSpecOptionDTO[];
  goodsCount?: number;
};

export type SharedSpecGroupDetailDTO = SharedSpecGroupDTO & {
  goods: Array<{ goodId: string; name: string }>;
};

export type GoodDetailDTO = GoodListItemDTO & {
  status: string;
  detailMarkdown: string;
  optionGroups: Array<{
    id: string;
    name: string;
    sort?: number;
    isStock?: boolean;
    defaultOptionIds?: string[];
    linkDefaultOptionIds?: string[];
    disabledOptionIds?: string[];
    isRequired: boolean;
    minSelection: number;
    maxSelection: number;
    options: Array<{ id: string; name: string; priceCents: number }>;
    groupType?: 'custom' | 'shared';
    sharedSpecGroupId?: string;
  }>;
  skus: Array<{
    skuId: string;
    specCombination: string;
    priceCents: number;
    stock: number;
    status: SKUStatus;
  }>;
};

export type DashboardCartItemDTO = {
  cartItemId: string;
  skuId: string;
  goodNameSnapshot: string;
  specTextSnapshot: string;
  unitPriceSnapshot: string;
  qty: number;
  addedByNicknameSnapshot: string;
  addedByAvatarSnapshot: string;
};

export type DashboardTableDTO = {
  tableId: string;
  code: string;
  status: string;
  sessionVersion: number;
  openedAt: string | null;
  cart: null | { cartId: string; version: number; updatedAt: string; items: DashboardCartItemDTO[] };
  activeOrders: Array<{
    orderId: string;
    orderNo: string;
    status: string;
    totalAmount: string;
    remark: string | null;
    createdAt: string;
  }>;
  totalOrderCount: number;
  totalAmountExRefunded: string;
};

export type DashboardActiveOrderDTO = {
  orderId: string;
  orderNo: string;
  tableCode: string;
  status: string;
  remark: string | null;
  pendingItems: Array<{
    orderItemId: string;
    goodNameSnapshot: string;
    specTextSnapshot: string;
    qty: number;
    servedQty: number;
  }>;
};

export type DashboardOverviewDTO = { tables: DashboardTableDTO[]; activeOrders: DashboardActiveOrderDTO[] };

export type OrderListItemDTO = {
  orderId: string;
  orderNo: string;
  status: string;
  tableId: string;
  tableSessionVersion?: number | null;
  tableCode?: string | null;
  totalAmount: string;
  totalAmountCents: number;
  totalQty?: number;
  remark?: string | null;
  paidAt: string | null;
  createdAt: string | null;
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
