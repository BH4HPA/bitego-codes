import Taro from "@tarojs/taro";
import { expect, test, vi } from "vitest";
import { router } from "./router";

vi.mock("@tarojs/taro", () => ({
  default: {
    getCurrentPages: vi.fn(),
    navigateBack: vi.fn(async () => void 0),
    redirectTo: vi.fn(async () => void 0),
    navigateTo: vi.fn(async () => void 0),
    reLaunch: vi.fn(async () => void 0),
  },
}));

test("back() navigates back when prev route matches expect", async () => {
  (Taro.getCurrentPages as any).mockReturnValue([{ route: "pages/index/index" }, { route: "pages/checkout/index" }]);
  await router.back({ expect: "/pages/index/index" });
  expect(Taro.navigateBack).toHaveBeenCalledWith({ delta: 1 });
});

test("back() redirects when prev route mismatches expect", async () => {
  (Taro.getCurrentPages as any).mockReturnValue([{ route: "pages/index/index" }, { route: "pages/checkout/index" }]);
  await router.back({ expect: "/pages/order-meal/index", fallback: { url: "/pages/index/index" } });
  expect(Taro.redirectTo).toHaveBeenCalledWith({ url: "/pages/index/index" });
});
