import Taro from "@tarojs/taro";
import { request } from "./request";
import type { UserDTO } from "./types";
import { clearToken, getToken, setToken } from "../store/token";
import { clearUser, setUser } from "../store/user";
import { clearRecentStore } from "../store/recentStore";
import { ApiRequestError } from "../utils/error";
import { genId } from "../utils/id";

export async function devLoginCustomer() {
  const data = await request<{ token: string }>({
    path: "/auth/dev-token",
    method: "POST",
    data: { role: "CUSTOMER", nickname: "顾客" },
  });
  setToken(data.token);
  clearUser();
  return data.token;
}

const h5UserIdKey = "bitego_h5_user_id";

export async function h5LoginCustomer() {
  let userId = "";
  try {
    userId = String(Taro.getStorageSync(h5UserIdKey) || "");
  } catch {
    userId = "";
  }
  if (!userId) {
    userId = genId("usr");
    try {
      Taro.setStorageSync(h5UserIdKey, userId);
    } catch {}
  }

  const data = await request<{ token: string; user: UserDTO }>({
    path: "/auth/h5/login",
    method: "POST",
    data: { userId },
  });
  setToken(data.token);
  setUser({ userId: data.user.userId, nickname: data.user.nickname || "", avatarUrl: data.user.avatarUrl || "" });
  return data;
}

export async function wechatLogin(params: { code: string; nickname?: string; avatarUrl?: string }) {
  const data = await request<{ token: string; user: UserDTO }>({
    path: "/auth/wechat/login",
    method: "POST",
    data: params,
  });
  setToken(data.token);
  setUser({ userId: data.user.userId, nickname: data.user.nickname || "", avatarUrl: data.user.avatarUrl || "" });
  return data;
}

export async function ensureLogin() {
  const token = getToken();
  if (token) {
    try {
      const me = await getMe();
      setUser({ userId: me.userId, nickname: me.nickname || "", avatarUrl: me.avatarUrl || "" });
      return;
    } catch (e) {
      if (e instanceof ApiRequestError && (e.httpStatus === 503 || e.code === 50300)) return;
      clearToken();
      clearUser();
      clearRecentStore();
    }
  }
  if (process.env.TARO_ENV === "h5") {
    await h5LoginCustomer();
    return;
  }
  if (process.env.TARO_ENV !== "weapp") {
    await devLoginCustomer();
    return;
  }
  const r = await Taro.login();
  const code = String(r.code || "");
  if (!code) throw new Error("微信登录失败");
  const login = await wechatLogin({ code });
  void login;
}

export async function getMe() {
  return await request<UserDTO>({ path: "/users/me", method: "GET" });
}
