import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { ApiRequestError } from "../utils/error";
import { request } from "./request";

vi.mock("@tarojs/taro", () => ({
  default: {
    request: vi.fn(),
    showModal: vi.fn(() => Promise.resolve({ confirm: true, cancel: false })),
  },
}));

vi.mock("../config/env", () => ({
  getApiBaseUrl: () => "http://api.test/api/v1",
}));

vi.mock("../store/token", () => ({
  getToken: () => "t1",
  clearToken: vi.fn(),
}));

type TaroMock = { request: Mock };

describe("request", () => {
  it("adds Authorization header and encodes query string", async () => {
    const taro = Taro as unknown as TaroMock;
    vi.mocked(taro.request).mockResolvedValueOnce({
      statusCode: 200,
      data: { success: true, code: 0, message: "ok", data: { ok: 1 } },
    });

    const data = await request<{ ok: number }>({
      path: "/goods",
      method: "GET",
      query: { page: 1, keyword: "奶茶", disabled: undefined },
    });
    expect(data.ok).toBe(1);
    const arg = vi.mocked(taro.request).mock.calls[0][0];
    expect(arg.url).toContain("http://api.test/api/v1/goods?page=1&keyword=%E5%A5%B6%E8%8C%B6");
    expect(arg.header.Authorization).toBe("Bearer t1");
  });

  it("clears token and throws on 401", async () => {
    const { clearToken } = await import("../store/token");
    const taro = Taro as unknown as TaroMock;
    vi.mocked(taro.request).mockResolvedValueOnce({
      statusCode: 401,
      data: { success: false, code: 40100, message: "unauthorized", data: null },
    });

    await expect(request({ path: "/users/me", method: "GET" })).rejects.toBeInstanceOf(ApiRequestError);
    expect(vi.mocked(clearToken)).toHaveBeenCalled();
  });

  it("shows maintenance prompt and throws on 503", async () => {
    const taro = Taro as unknown as TaroMock & { showModal: Mock };
    vi.mocked(taro.request).mockResolvedValueOnce({
      statusCode: 503,
      data: { success: false, code: 50300, message: "maint", data: null },
    });
    await expect(request({ path: "/categories", method: "GET" })).rejects.toBeInstanceOf(ApiRequestError);
    expect(vi.mocked(taro.showModal)).toHaveBeenCalled();
  });
});
