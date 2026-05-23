import Taro from "@tarojs/taro";
import { getApiBaseUrl } from "../config/env";
import { getToken } from "../store/token";
import type { ApiResponse } from "./types";
import { ApiRequestError } from "../utils/error";

export async function uploadImage(params: { filePath: string; path?: string }) {
  const baseUrl = getApiBaseUrl();
  const token = getToken();
  const url = `${baseUrl}/files`;
  const resp = await Taro.uploadFile({
    url,
    filePath: params.filePath,
    name: "file",
    formData: { path: params.path || "avatars" },
    header: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const httpStatus = resp.statusCode || 0;
  let body: ApiResponse<{ publicUrl: string }> | null = null;
  try {
    body = JSON.parse(String(resp.data || "null")) as ApiResponse<{ publicUrl: string }>;
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") throw new ApiRequestError({ message: "响应格式错误", code: 0, httpStatus });
  if (!body.success)
    throw new ApiRequestError({ message: body.message || "请求失败", code: body.code || 0, httpStatus });
  const publicUrl = (body.data as any)?.publicUrl;
  return String(publicUrl || "");
}
