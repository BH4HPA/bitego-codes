import { create } from "zustand";
import Taro from "@tarojs/taro";
import type { TableDTO } from "../api/types";
import { getTable } from "../api/tables";
import { ensureLogin } from "../api/auth";
import { getToken } from "./token";
import { getWsTableSessionUrl } from "../config/env";
import { genId } from "../utils/id";
import { logger } from "../utils/logger";
import { ApiRequestError } from "../utils/error";
import { useToastStore } from "./toastStore";
import { getUser } from "./user";
import { router } from "../utils/router";

export type TableCartItem = {
  cartItemId: string;
  skuId: string;
  goodId: string;
  goodNameSnapshot: string;
  specTextSnapshot: string;
  unitPriceSnapshot: string;
  qty: number;
  addedByUserId: string;
  addedByNicknameSnapshot: string;
  addedByAvatarSnapshot: string;
};

export type TableCart = {
  cartId: string;
  tableId: string;
  openedAt: string | null;
  updatedAt: string | null;
  items: TableCartItem[];
};

type WsInbound =
  | {
      type: "CART_SNAPSHOT" | "CART_UPDATED";
      version: number;
      data: TableCart;
      actor?: { userId: string; nickname?: string };
    }
  | { type: "USER_JOINED"; data: { userId: string; nickname?: string } }
  | { type: "PONG"; ts?: number }
  | {
      type: "ORDER_CREATED";
      data: {
        orderId: string;
        orderNo: string;
        status: string;
        tableId: string;
        payerNickname?: string;
        payerUserId?: string;
      };
    }
  | { type: "ORDER_STATUS_CHANGED"; data: { orderId: string; status: string } }
  | { type: "ORDER_ITEM_SERVED"; data: { orderId: string; orderItemId: string; servedQty: number } }
  | { type: "TABLE_CLOSED"; data?: any }
  | { type: "ERROR"; message?: string; code?: number; data?: any };

type WsOp =
  | {
      opId: string;
      opType: "ADD_ITEM";
      baseVersion: number;
      payload: { skuId: string; qty: number; nonStockSelectionsByGroupId?: Record<string, string[]> };
    }
  | { opId: string; opType: "UPDATE_QTY"; baseVersion: number; payload: { cartItemId: string; qty: number } }
  | { opId: string; opType: "REMOVE_ITEM"; baseVersion: number; payload: { cartItemId: string } };

type State = {
  table: TableDTO | null;
  cart: TableCart | null;
  cartVersion: number;
  tableOrders: Array<{ orderId: string; orderNo?: string; status: string }>;
  lastOrderItemServed: { orderId: string; orderItemId: string; servedQty: number } | null;
  sessionClosedAt: number;
  sessionClosedMessage: string | null;
  wsConnected: boolean;
  lastError: string | null;
  acquire: (tableId: string) => Promise<void>;
  release: () => void;
  init: (tableId: string) => Promise<void>;
  disconnect: () => void;
  probeConnection: () => void;
  isWsOpen: () => boolean;
  addItem: (skuId: string, qty: number, nonStockSelectionsByGroupId?: Record<string, string[]>) => Promise<boolean>;
  updateQty: (cartItemId: string, qty: number) => Promise<boolean>;
  removeItem: (cartItemId: string) => Promise<boolean>;
};

let socketTask: Taro.SocketTask | null = null;
let heartbeatTimer: any = null;
let sessionHoldCount = 0;
let sessionCloseTimer: any = null;
let currentSessionKey: string | null = null;
let connectingKey: string | null = null;
let connectingPromise: Promise<void> | null = null;
let lastWsErrorAt = 0;
let lastWsErrorMessage: string | null = null;
let lastWsMaintenanceAt = 0;
let lastPongAt = 0;
let lastInboundAt = 0;
let lastSyncAt = 0;
let lastProbeAt = 0;
let networkListenerAttached = false;

function clearSessionCloseTimer() {
  if (sessionCloseTimer) {
    clearTimeout(sessionCloseTimer);
    sessionCloseTimer = null;
  }
}

function safeCloseSocketTask(task: Taro.SocketTask | null) {
  if (!task) return;
  const rs = (task as any)?.readyState;
  if (typeof rs === "number") {
    if (rs !== 0 && rs !== 1) return;
  } else {
    if (!useTableSessionStore.getState().wsConnected) return;
  }
  try {
    task.close({});
  } catch {
    void 0;
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function isSocketOpen() {
  const rs = (socketTask as any)?.readyState;
  if (typeof rs === "number") return rs === 1;
  return useTableSessionStore.getState().wsConnected;
}

function sendWs(data: any) {
  if (!socketTask) return false;
  if (!isSocketOpen()) return false;
  try {
    socketTask?.send({ data: typeof data === "string" ? data : JSON.stringify(data) });
    return true;
  } catch {
    return false;
  }
}

async function waitForSocketOpen(timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isSocketOpen()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return isSocketOpen();
}

async function ensureSocketOpen(timeoutMs = 6_000) {
  if (isSocketOpen()) return { ok: true, waited: false };
  const s = useTableSessionStore.getState();
  const tableId = s.table?.tableId || "";
  if (!tableId || sessionHoldCount <= 0) return { ok: false, waited: false };
  try {
    await s.init(tableId);
  } catch {
    return { ok: false, waited: true };
  }
  const ok = await waitForSocketOpen(timeoutMs);
  return { ok, waited: true };
}

async function sendWithReconnect(data: any) {
  const r1 = await ensureSocketOpen(6_000);
  if (!r1.ok) return { ok: false, waited: r1.waited };
  if (sendWs(data)) return { ok: true, waited: r1.waited };
  const r2 = await ensureSocketOpen(6_000);
  if (!r2.ok) return { ok: false, waited: true };
  return { ok: sendWs(data), waited: true };
}

function syncNow() {
  const now = Date.now();
  if (now - lastSyncAt < 3_000) return;
  lastSyncAt = now;
  sendWs({ type: "SYNC", cartVersion: useTableSessionStore.getState().cartVersion, ts: now });
}

function probeConnection() {
  const now = Date.now();
  if (now - lastProbeAt < 800) return;
  lastProbeAt = now;
  const s = useTableSessionStore.getState();
  const tableId = s.table?.tableId || "";
  if (!isSocketOpen()) {
    if (tableId && sessionHoldCount > 0) void s.init(tableId);
    return;
  }
  sendWs({ type: "PING", ts: now });
  const aliveAt = Math.max(lastPongAt || 0, lastInboundAt || 0);
  if (aliveAt > 0 && now - aliveAt > 7_000) {
    syncNow();
    if (tableId && now - aliveAt > 15_000) {
      void s.init(tableId);
    }
  }
}

function ensureNetworkListener() {
  if (networkListenerAttached) return;
  networkListenerAttached = true;
  try {
    Taro.onNetworkStatusChange((res) => {
      if (!res?.isConnected) return;
      const s = useTableSessionStore.getState();
      const tableId = s.table?.tableId || "";
      if (!tableId) return;
      if (sessionHoldCount <= 0) return;
      if (s.wsConnected) {
        probeConnection();
        return;
      }
      void s.init(tableId);
    });
  } catch {
    void 0;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  probeConnection();
  heartbeatTimer = setInterval(() => {
    probeConnection();
  }, 5_000);
}

function resetSocketOnClose() {
  stopHeartbeat();
  safeCloseSocketTask(socketTask);
  socketTask = null;
  connectingPromise = null;
  connectingKey = null;
  currentSessionKey = null;
}

type StoreSet = (partial: Partial<State> | ((s: State) => Partial<State>)) => void;
type StoreGet = () => State;

function handleCartUpdate(
  set: StoreSet,
  get: StoreGet,
  msg: Extract<WsInbound, { type: "CART_SNAPSHOT" | "CART_UPDATED" }>,
) {
  const prev = get().cart;
  set({ cart: msg.data, cartVersion: msg.version });
  if (msg.type !== "CART_UPDATED" || !prev || prev.cartId !== msg.data.cartId) return;
  const myUserId = getUser()?.userId || "";
  const actor = msg.actor;
  if (!actor || actor.userId === myUserId) return;
  const actorName = actor.nickname || "匿名";
  const prevQty = new Map<string, number>();
  for (const it of prev.items || []) prevQty.set(it.cartItemId, Number(it.qty || 0) || 0);
  const addToasts: Array<{ goodName: string; delta: number }> = [];
  const removeToasts: Array<{ goodName: string; delta: number }> = [];
  const nextIds = new Set<string>();
  for (const it of msg.data.items || []) {
    nextIds.add(it.cartItemId);
    const oldQty = prevQty.get(it.cartItemId) || 0;
    const nextQty = Number(it.qty || 0) || 0;
    const delta = nextQty - oldQty;
    if (delta > 0) {
      addToasts.push({ goodName: it.goodNameSnapshot || "", delta });
    } else if (delta < 0) {
      removeToasts.push({ goodName: it.goodNameSnapshot || "", delta: -delta });
    }
  }
  for (const it of prev.items || []) {
    if (nextIds.has(it.cartItemId)) continue;
    const oldQty = Number(it.qty || 0) || 0;
    if (oldQty <= 0) continue;
    removeToasts.push({ goodName: it.goodNameSnapshot || "", delta: oldQty });
  }
  for (const t of addToasts.slice(0, 2)) {
    useToastStore.getState().push(`${actorName} 添加了 ${t.goodName} x${t.delta}`);
  }
  for (const t of removeToasts.slice(0, 2)) {
    useToastStore.getState().push(`${actorName} 删除了 ${t.goodName} x${t.delta}`);
  }
}

function handleOrderCreated(set: StoreSet, msg: Extract<WsInbound, { type: "ORDER_CREATED" }>) {
  set((s) => {
    const next = s.tableOrders.filter((x) => x.orderId !== msg.data.orderId);
    next.unshift({ orderId: msg.data.orderId, orderNo: msg.data.orderNo, status: msg.data.status });
    return { tableOrders: next };
  });
  const myUserId = getUser()?.userId || "";
  if (!myUserId || msg.data.payerUserId !== myUserId) {
    useToastStore
      .getState()
      .push(`${msg.data.payerNickname || msg.data.payerUserId || "匿名"} 下单了购物车内的所有菜品`);
  }
}

function handleUserJoined(msg: Extract<WsInbound, { type: "USER_JOINED" }>) {
  const myUserId = getUser()?.userId || "";
  const joinedUserId = msg.data?.userId || "";
  if (!joinedUserId || (myUserId && joinedUserId === myUserId)) return;
  useToastStore.getState().push(`${msg.data?.nickname || joinedUserId || "匿名"} 加入了桌台`);
}

function handleOrderStatusChanged(set: StoreSet, msg: Extract<WsInbound, { type: "ORDER_STATUS_CHANGED" }>) {
  set((s) => {
    const existed = s.tableOrders.some((x) => x.orderId === msg.data.orderId);
    if (!existed) {
      return { tableOrders: [{ orderId: msg.data.orderId, status: msg.data.status }, ...s.tableOrders] };
    }
    return {
      tableOrders: s.tableOrders.map((x) => (x.orderId === msg.data.orderId ? { ...x, status: msg.data.status } : x)),
    };
  });
}

function handleOrderItemServed(set: StoreSet, msg: Extract<WsInbound, { type: "ORDER_ITEM_SERVED" }>) {
  set({
    lastOrderItemServed: {
      orderId: msg.data.orderId,
      orderItemId: msg.data.orderItemId,
      servedQty: msg.data.servedQty,
    },
  });
}

function handleTableClosed(set: StoreSet) {
  set({ sessionClosedAt: Date.now(), sessionClosedMessage: "桌台已关闭", wsConnected: false });
  resetSocketOnClose();
}

function handleServerError(set: StoreSet, get: StoreGet, msg: Extract<WsInbound, { type: "ERROR" }>) {
  const code = (msg as any).code ?? (msg as any).data?.code;
  const message = msg.message || msg.data?.message || "操作失败";
  set({ lastError: message });
  const now = Date.now();
  if (code === 50300) {
    if (now - lastWsMaintenanceAt > 5000) {
      lastWsMaintenanceAt = now;
      void Taro.showModal({
        title: "系统维护中",
        content: message || "系统维护中，请稍后重试",
        showCancel: false,
      }).then(() => {
        void router.toIndex();
      });
    }
    get().disconnect();
    return;
  }
  if (now - lastWsErrorAt > 1500 || lastWsErrorMessage !== message) {
    lastWsErrorAt = now;
    lastWsErrorMessage = message;
    void Taro.showToast({ title: message, icon: "none" });
  }
}

function dispatchWsMessage(set: StoreSet, get: StoreGet, msg: WsInbound) {
  switch (msg.type) {
    case "PONG":
      lastPongAt = lastInboundAt;
      return;
    case "CART_SNAPSHOT":
    case "CART_UPDATED":
      return handleCartUpdate(set, get, msg);
    case "ORDER_CREATED":
      return handleOrderCreated(set, msg);
    case "USER_JOINED":
      return handleUserJoined(msg);
    case "ORDER_STATUS_CHANGED":
      return handleOrderStatusChanged(set, msg);
    case "ORDER_ITEM_SERVED":
      return handleOrderItemServed(set, msg);
    case "TABLE_CLOSED":
      return handleTableClosed(set);
    case "ERROR":
      return handleServerError(set, get, msg);
  }
}

export const useTableSessionStore = create<State>((set, get) => ({
  table: null,
  cart: null,
  cartVersion: 0,
  tableOrders: [],
  lastOrderItemServed: null,
  sessionClosedAt: 0,
  sessionClosedMessage: null,
  wsConnected: false,
  lastError: null,

  acquire: async (tableId: string) => {
    sessionHoldCount += 1;
    clearSessionCloseTimer();
    await get().init(tableId);
  },

  release: () => {
    sessionHoldCount = Math.max(0, sessionHoldCount - 1);
    if (sessionHoldCount > 0) return;
    clearSessionCloseTimer();
    sessionCloseTimer = setTimeout(() => {
      if (sessionHoldCount > 0) return;
      get().disconnect();
      currentSessionKey = null;
    }, 30_000);
  },

  init: async (tableId: string) => {
    set({ lastError: null, sessionClosedAt: 0, sessionClosedMessage: null });
    ensureNetworkListener();
    await ensureLogin();
    let table: TableDTO;
    try {
      table = await getTable(tableId);
    } catch (e) {
      if (e instanceof ApiRequestError && e.httpStatus === 404) throw new Error("桌台不存在");
      throw e;
    }
    if (!table.sessionToken) throw new Error("桌台会话不可用");
    const token = getToken();
    if (!token) throw new Error("未登录");

    const nextKey = `${table.tableId}:${token}:${String(table.sessionToken)}`;
    if (connectingPromise && connectingKey === nextKey) {
      await connectingPromise;
      return;
    }

    if (socketTask && currentSessionKey === nextKey) {
      set({ table });
      return;
    }

    connectingKey = nextKey;
    connectingPromise = (async () => {
      if (socketTask) {
        safeCloseSocketTask(socketTask);
        socketTask = null;
      }
      stopHeartbeat();
      set({ table, cart: null, cartVersion: 0, tableOrders: [], wsConnected: false });

      const url = getWsTableSessionUrl({ token, tableId: table.tableId, sessionToken: String(table.sessionToken) });
      socketTask = await Taro.connectSocket({ url });
      currentSessionKey = nextKey;

      socketTask.onOpen(() => {
        set({ wsConnected: true });
        lastPongAt = Date.now();
        lastInboundAt = lastPongAt;
        startHeartbeat();
      });

      socketTask.onClose(() => {
        stopHeartbeat();
        lastPongAt = 0;
        lastInboundAt = 0;
        set({ wsConnected: false });
      });

      socketTask.onError(() => {
        stopHeartbeat();
        lastPongAt = 0;
        lastInboundAt = 0;
        set({ wsConnected: false, lastError: "连接失败" });
      });

      socketTask.onMessage((evt) => {
        try {
          const msg: WsInbound = JSON.parse(String((evt as any).data || "{}"));
          lastInboundAt = Date.now();
          dispatchWsMessage(set, get, msg);
        } catch (e) {
          logger.warn("ws message parse failed", { err: logger.dump(e) });
        }
      });
    })();

    try {
      await connectingPromise;
    } finally {
      connectingPromise = null;
      connectingKey = null;
    }
  },

  disconnect: () => {
    clearSessionCloseTimer();
    stopHeartbeat();
    lastPongAt = 0;
    lastInboundAt = 0;
    if (socketTask) {
      safeCloseSocketTask(socketTask);
      socketTask = null;
    }
    connectingPromise = null;
    connectingKey = null;
    currentSessionKey = null;
    set({ wsConnected: false, lastOrderItemServed: null, sessionClosedAt: 0, sessionClosedMessage: null });
  },

  probeConnection: () => {
    probeConnection();
  },

  isWsOpen: () => {
    return isSocketOpen();
  },

  addItem: async (skuId: string, qty: number, nonStockSelectionsByGroupId?: Record<string, string[]>) => {
    const v = get().cartVersion;
    const op: WsOp = {
      opId: genId("op"),
      opType: "ADD_ITEM",
      baseVersion: v,
      payload: { skuId, qty, nonStockSelectionsByGroupId },
    };
    const r = await sendWithReconnect(op);
    if (!r.ok) {
      set({ lastError: "发送失败" });
      return false;
    }
    return true;
  },

  updateQty: async (cartItemId: string, qty: number) => {
    const v = get().cartVersion;
    const op: WsOp = { opId: genId("op"), opType: "UPDATE_QTY", baseVersion: v, payload: { cartItemId, qty } };
    const r = await sendWithReconnect(op);
    if (!r.ok) {
      set({ lastError: "发送失败" });
      return false;
    }
    return true;
  },

  removeItem: async (cartItemId: string) => {
    const v = get().cartVersion;
    const op: WsOp = { opId: genId("op"), opType: "REMOVE_ITEM", baseVersion: v, payload: { cartItemId } };
    const r = await sendWithReconnect(op);
    if (!r.ok) {
      set({ lastError: "发送失败" });
      return false;
    }
    return true;
  },
}));
