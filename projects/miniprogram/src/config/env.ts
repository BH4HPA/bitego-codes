function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const raw = process.env.TARO_APP_API_BASE_URL;
  if (raw && typeof raw === "string" && raw.trim()) return trimSlash(raw.trim());
  return "/api/v1";
}

export function getWsTableSessionUrl(params: { token: string; tableId: string; sessionToken: string }) {
  const raw = process.env.TARO_APP_WS_BASE_URL;
  const api = getApiBaseUrl();
  let base = raw && typeof raw === "string" && raw.trim() ? trimSlash(raw.trim()) : "";
  if (!base) {
    if (api.startsWith("http://")) base = api.replace(/^http:\/\//, "ws://");
    else if (api.startsWith("https://")) base = api.replace(/^https:\/\//, "wss://");
    else base = "";
    if (base.endsWith("/api/v1")) base = base.slice(0, -"/api/v1".length);
  }
  const q = `token=${encodeURIComponent(params.token)}&tableId=${encodeURIComponent(params.tableId)}&sessionToken=${encodeURIComponent(params.sessionToken)}`;
  return `${base}/ws/table-session?${q}`;
}
