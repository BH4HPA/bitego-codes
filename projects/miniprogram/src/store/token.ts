import Taro from "@tarojs/taro";

const KEY = "bitego:token";

export function getToken() {
  try {
    return String(Taro.getStorageSync(KEY) || "");
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    Taro.setStorageSync(KEY, token);
  } catch {
    void 0;
  }
}

export function clearToken() {
  try {
    Taro.removeStorageSync(KEY);
  } catch {
    void 0;
  }
}
