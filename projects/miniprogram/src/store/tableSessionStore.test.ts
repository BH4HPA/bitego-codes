import { beforeEach, expect, test, vi } from "vitest";
import { useTableSessionStore } from "./tableSessionStore";
import { useToastStore } from "./toastStore";

const sendMock = vi.fn();
let handlers: { open?: () => void; message?: (evt: any) => void } = {};

vi.mock("@tarojs/taro", () => ({
  default: {
    showToast: vi.fn(async () => void 0),
    connectSocket: vi.fn(() => ({
      send: sendMock,
      close: vi.fn(),
      onOpen: (cb: () => void) => {
        handlers.open = cb;
      },
      onClose: vi.fn(),
      onError: vi.fn(),
      onMessage: (cb: (evt: any) => void) => {
        handlers.message = cb;
      },
    })),
  },
}));

vi.mock("../api/auth", () => ({
  ensureLogin: vi.fn(async () => void 0),
}));

vi.mock("../api/tables", () => ({
  getTable: vi.fn(async (tableId: string) => ({
    tableId,
    code: "A1",
    status: "OPEN",
    sessionVersion: 1,
    sessionToken: "sess_token",
    qrcodeUrl: null,
  })),
}));

vi.mock("./token", () => ({
  getToken: vi.fn(() => "token"),
}));

vi.mock("../config/env", () => ({
  getWsTableSessionUrl: vi.fn(() => "ws://example.invalid"),
}));

vi.mock("./user", () => ({
  getUser: vi.fn(() => ({ userId: "usr_me", nickname: "我", avatarUrl: "" })),
}));

beforeEach(() => {
  sendMock.mockReset();
  handlers = {};
  useTableSessionStore.getState().disconnect();
  useTableSessionStore.setState({
    table: null,
    cart: null,
    cartVersion: 0,
    tableOrders: [],
    lastOrderItemServed: null,
    sessionClosedAt: 0,
    sessionClosedMessage: null,
    wsConnected: false,
    lastError: null,
  });
  useToastStore.getState().clear();
});

test("sends ws ops with baseVersion", async () => {
  await useTableSessionStore.getState().init("table_test");
  handlers.open?.();

  useTableSessionStore.setState({ cartVersion: 7 });

  expect(await useTableSessionStore.getState().addItem("sku_1", 2)).toBe(true);
  expect(await useTableSessionStore.getState().updateQty("ci_1", 3)).toBe(true);
  expect(await useTableSessionStore.getState().removeItem("ci_2")).toBe(true);

  const sent = sendMock.mock.calls
    .map((args) => {
      const a = args[0] as any;
      try {
        return JSON.parse(String(a?.data || ""));
      } catch {
        return null;
      }
    })
    .filter(Boolean) as any[];
  const ops = sent.filter((x) => typeof x?.opType === "string");
  expect(ops.length).toBe(3);

  const addOp = ops[0];
  expect(addOp.opType).toBe("ADD_ITEM");
  expect(addOp.baseVersion).toBe(7);
  expect(addOp.payload).toEqual({ skuId: "sku_1", qty: 2 });

  const updOp = ops[1];
  expect(updOp.opType).toBe("UPDATE_QTY");
  expect(updOp.baseVersion).toBe(7);
  expect(updOp.payload).toEqual({ cartItemId: "ci_1", qty: 3 });

  const rmOp = ops[2];
  expect(rmOp.opType).toBe("REMOVE_ITEM");
  expect(rmOp.baseVersion).toBe(7);
  expect(rmOp.payload).toEqual({ cartItemId: "ci_2" });
});

test("marks session closed on TABLE_CLOSED message", async () => {
  await useTableSessionStore.getState().init("table_test");
  handlers.open?.();

  handlers.message?.({ data: JSON.stringify({ type: "TABLE_CLOSED", data: { tableId: "table_test" } }) });

  const s = useTableSessionStore.getState();
  expect(s.wsConnected).toBe(false);
  expect(s.sessionClosedAt).toBeGreaterThan(0);
  expect(s.sessionClosedMessage).toBe("桌台已关闭");
});

test("reads ws ERROR message from data.message", async () => {
  await useTableSessionStore.getState().init("table_test");
  handlers.open?.();

  handlers.message?.({ data: JSON.stringify({ type: "ERROR", data: { code: 40001, message: "Out of stock" } }) });

  const s = useTableSessionStore.getState();
  expect(s.lastError).toBe("Out of stock");
});

test("pushes global toast on CART_UPDATED add item delta", async () => {
  await useTableSessionStore.getState().init("table_test");
  handlers.open?.();

  handlers.message?.({
    data: JSON.stringify({
      type: "CART_SNAPSHOT",
      version: 1,
      data: {
        cartId: "cart_1",
        tableId: "table_test",
        openedAt: null,
        updatedAt: null,
        items: [
          {
            cartItemId: "ci_1",
            skuId: "sku_1",
            goodId: "good_1",
            goodNameSnapshot: "奶茶",
            specTextSnapshot: "默认",
            unitPriceSnapshot: "1000",
            qty: 1,
            addedByUserId: "usr_1",
            addedByNicknameSnapshot: "小明",
            addedByAvatarSnapshot: "",
          },
        ],
      },
    }),
  });

  handlers.message?.({
    data: JSON.stringify({
      type: "CART_UPDATED",
      version: 2,
      actor: { userId: "usr_1", nickname: "小明" },
      data: {
        cartId: "cart_1",
        tableId: "table_test",
        openedAt: null,
        updatedAt: null,
        items: [
          {
            cartItemId: "ci_1",
            skuId: "sku_1",
            goodId: "good_1",
            goodNameSnapshot: "奶茶",
            specTextSnapshot: "默认",
            unitPriceSnapshot: "1000",
            qty: 3,
            addedByUserId: "usr_1",
            addedByNicknameSnapshot: "小明",
            addedByAvatarSnapshot: "",
          },
        ],
      },
    }),
  });

  const q = useToastStore.getState().queue;
  expect(q.length).toBe(1);
  expect(q[0].message).toBe("小明 添加了 奶茶 x2");
});

test("pushes global toast on ORDER_CREATED", async () => {
  await useTableSessionStore.getState().init("table_test");
  handlers.open?.();

  handlers.message?.({
    data: JSON.stringify({
      type: "ORDER_CREATED",
      data: {
        orderId: "ord_1",
        orderNo: "O1",
        status: "Paid",
        tableId: "table_test",
        payerNickname: "小明",
        payerUserId: "usr_1",
      },
    }),
  });

  const q = useToastStore.getState().queue;
  expect(q.length).toBe(1);
  expect(q[0].message).toBe("小明 下单了购物车内的所有菜品");
});

test("does not push toast for my own add item", async () => {
  await useTableSessionStore.getState().init("table_test");
  handlers.open?.();

  handlers.message?.({
    data: JSON.stringify({
      type: "CART_SNAPSHOT",
      version: 1,
      data: { cartId: "cart_1", tableId: "table_test", openedAt: null, updatedAt: null, items: [] },
    }),
  });

  handlers.message?.({
    data: JSON.stringify({
      type: "CART_UPDATED",
      version: 2,
      data: {
        cartId: "cart_1",
        tableId: "table_test",
        openedAt: null,
        updatedAt: null,
        items: [
          {
            cartItemId: "ci_1",
            skuId: "sku_1",
            goodId: "good_1",
            goodNameSnapshot: "奶茶",
            specTextSnapshot: "默认",
            unitPriceSnapshot: "1000",
            qty: 1,
            addedByUserId: "usr_me",
            addedByNicknameSnapshot: "我",
            addedByAvatarSnapshot: "",
          },
        ],
      },
    }),
  });

  const q = useToastStore.getState().queue;
  expect(q.length).toBe(0);
});

test("does not push toast for my own order created", async () => {
  await useTableSessionStore.getState().init("table_test");
  handlers.open?.();

  handlers.message?.({
    data: JSON.stringify({
      type: "ORDER_CREATED",
      data: {
        orderId: "ord_1",
        orderNo: "O1",
        status: "Paid",
        tableId: "table_test",
        payerNickname: "我",
        payerUserId: "usr_me",
      },
    }),
  });

  const q = useToastStore.getState().queue;
  expect(q.length).toBe(0);
});
