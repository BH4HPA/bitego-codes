import Taro from "@tarojs/taro";

type Query = Record<string, string | number | boolean | undefined | null>;

function toQueryString(q: Query) {
  const pairs = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

function normalizeRoute(input: string) {
  return String(input || "")
    .trim()
    .replace(/^\//, "")
    .split("?")[0];
}

const routes = {
  index: "/pages/index/index",
  orderMeal: "/pages/order-meal/index",
  checkout: "/pages/checkout/index",
  tableOrders: "/pages/table-orders/index",
  historyOrders: "/subpackages/profile/pages/history-orders/index",
  orderDetail: "/subpackages/profile/pages/order-detail/index",
  profileEdit: "/subpackages/profile/pages/profile-edit/index",
};

type BackOptions = {
  delta?: number;
  expect?: string | string[];
  fallback?: { url: string; query?: Query; mode?: "redirectTo" | "reLaunch" | "navigateTo" };
};

export const router = {
  routes,
  toIndex() {
    return Taro.reLaunch({ url: routes.index });
  },
  toOrderMeal(params: { tableId: string }) {
    return Taro.navigateTo({ url: `${routes.orderMeal}${toQueryString(params)}` });
  },
  relaunchOrderMeal(params: { tableId: string }) {
    return Taro.reLaunch({ url: `${routes.orderMeal}${toQueryString(params)}` });
  },
  toCheckout(params: { tableId: string }) {
    return Taro.navigateTo({ url: `${routes.checkout}${toQueryString(params)}` });
  },
  toTableOrders(params: { tableId: string }) {
    return Taro.navigateTo({ url: `${routes.tableOrders}${toQueryString(params)}` });
  },
  replaceToTableOrders(params: { tableId: string }) {
    return Taro.redirectTo({ url: `${routes.tableOrders}${toQueryString(params)}` });
  },
  toHistoryOrders() {
    return Taro.navigateTo({ url: routes.historyOrders });
  },
  toOrderDetail(params: { orderId: string }) {
    return Taro.navigateTo({ url: `${routes.orderDetail}${toQueryString(params)}` });
  },
  toProfileEdit() {
    return Taro.navigateTo({ url: routes.profileEdit });
  },
  back(options: BackOptions | number = 1) {
    if (typeof options === "number") return Taro.navigateBack({ delta: options });
    const delta = options.delta ?? 1;
    const expect = options.expect;
    if (!expect) return Taro.navigateBack({ delta });

    const pages = Taro.getCurrentPages();
    const prev = pages.length >= delta + 1 ? (pages as any[])[pages.length - (delta + 1)] : null;
    const prevRoute = normalizeRoute(prev?.route || "");
    const expects = Array.isArray(expect) ? expect : [expect];
    const matched = expects.some((e) => normalizeRoute(e) === prevRoute);

    if (matched) return Taro.navigateBack({ delta });
    const fb = options.fallback;
    if (!fb) return Taro.navigateBack({ delta });

    const url = `${fb.url}${toQueryString(fb.query || {})}`;
    const mode = fb.mode || "redirectTo";
    if (mode === "reLaunch") return Taro.reLaunch({ url });
    if (mode === "navigateTo") return Taro.navigateTo({ url });
    return Taro.redirectTo({ url });
  },
};
