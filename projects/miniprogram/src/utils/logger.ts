import Taro from "@tarojs/taro";

export type LogLevel = "info" | "warn" | "error";

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return '"[unserializable]"';
  }
}

export const logger = {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const payload = { level, message, meta: meta || null, ts: Date.now(), env: process.env.TARO_ENV };
    if (level === "error") console.error(payload);
    else if (level === "warn") console.warn(payload);
    else console.info(payload);
  },
  info(message: string, meta?: Record<string, unknown>) {
    this.log("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    this.log("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    this.log("error", message, meta);
  },
  async toastError(title: string) {
    try {
      await Taro.showToast({ title, icon: "none" });
    } catch {
      void 0;
    }
  },
  dump(e: unknown) {
    return safeJson(e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e);
  },
};
