import Taro from "@tarojs/taro";
import { getApiBaseUrl } from "../config/env";
import type { ApiResponse } from "./types";
import { ApiRequestError } from "../utils/error";
import { clearToken, getToken } from "../store/token";

type Method = "GET" | "POST" | "PUT" | "DELETE";

let lastMaintenancePromptAt = 0;

function isMaintenance(httpStatus: number, body: any) {
  const code = body?.code;
  return httpStatus === 503 || code === 50300;
}

function promptMaintenance(message: string) {
  const now = Date.now();
  if (now - lastMaintenancePromptAt < 5000) return;
  lastMaintenancePromptAt = now;
  void Taro.showModal({ title: "系统维护中", content: message || "系统维护中，请稍后重试", showCancel: false });
}

function toQueryString(q?: Record<string, string | number | boolean | undefined>) {
  if (!q) return "";
  const pairs = Object.entries(q)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

export async function request<T>(params: {
  path: string;
  method: Method;
  data?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}) {
  const baseUrl = getApiBaseUrl();
  const token = getToken();
  const url = `${baseUrl}${params.path}${toQueryString(params.query)}`;
  const resp = await Taro.request<ApiResponse<T>>({
    url,
    method: params.method,
    data: params.data,
    header: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(params.headers || {}),
    },
    dataType: "json",
    timeout: 15_000,
  });

  const httpStatus = resp.statusCode || 0;
  const body = resp.data as any;
  if (isMaintenance(httpStatus, body)) {
    const message = String(body?.message || "系统维护中，请稍后重试");
    promptMaintenance(message);
    throw new ApiRequestError({ message, code: Number(body?.code || 50300) || 50300, httpStatus: httpStatus || 503 });
  }
  if (httpStatus === 401) {
    clearToken();
    throw new ApiRequestError({ message: "未登录或登录已过期", code: 40100, httpStatus });
  }
  if (!body || typeof body !== "object") throw new ApiRequestError({ message: "响应格式错误", code: 0, httpStatus });
  if (!body.success)
    throw new ApiRequestError({ message: body.message || "请求失败", code: body.code || 0, httpStatus });
  return body.data as T;
}
