import Taro from "@tarojs/taro";

const KEY = "bitego:user";
const KEY_VER = "bitego:userProfileVer";

export type StoredUser = { userId: string; nickname: string; avatarUrl: string };

export function getUser() {
  try {
    const raw = Taro.getStorageSync(KEY);
    if (!raw) return null;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return null;
    const o = v as any;
    return {
      userId: String(o.userId || ""),
      nickname: String(o.nickname || ""),
      avatarUrl: String(o.avatarUrl || ""),
    } as StoredUser;
  } catch {
    return null;
  }
}

export function setUser(user: StoredUser) {
  try {
    Taro.setStorageSync(KEY, JSON.stringify(user));
  } catch {
    void 0;
  }
}

export function clearUser() {
  try {
    Taro.removeStorageSync(KEY);
  } catch {
    void 0;
  }
}

export function bumpUserProfileVer() {
  try {
    Taro.setStorageSync(KEY_VER, Date.now());
  } catch {
    void 0;
  }
}

export function getUserProfileVer() {
  try {
    return Number(Taro.getStorageSync(KEY_VER) || 0) || 0;
  } catch {
    return 0;
  }
}
