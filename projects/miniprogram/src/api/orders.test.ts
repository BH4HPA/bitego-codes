import { describe, expect, it, vi } from "vitest";

vi.mock("./request", () => ({ request: vi.fn(async () => ({})) }));

describe("api/orders", () => {
  it("passes sessionToken for table-session orders", async () => {
    const { getOrders } = await import("./orders");
    const req = (await import("./request")) as any;
    await getOrders({ tableId: "t1", tableSessionVersion: 2, sessionToken: "sess", page: 1, pageSize: 50 });
    expect(req.request).toHaveBeenCalledWith({
      path: "/orders",
      method: "GET",
      query: { tableId: "t1", tableSessionVersion: 2, sessionToken: "sess", page: 1, pageSize: 50 },
    });
  });

  it("passes sessionToken for order detail when provided", async () => {
    const { getOrder } = await import("./orders");
    const req = (await import("./request")) as any;
    await getOrder("ord_1", { sessionToken: "sess" });
    expect(req.request).toHaveBeenCalledWith({ path: "/orders/ord_1", method: "GET", query: { sessionToken: "sess" } });
  });
});
