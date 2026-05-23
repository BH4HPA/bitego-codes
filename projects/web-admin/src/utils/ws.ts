function toWsOrigin(httpBase: string) {
  const u = new URL(httpBase);
  const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${u.host}`;
}

export function startWsHeartbeat(ws: WebSocket, intervalMs = 5000) {
  const timer = window.setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
    } catch {
      return;
    }
  }, intervalMs);
  return () => window.clearInterval(timer);
}

export function getAdminDashboardWsUrl(params: {
  apiBaseUrl: string;
  token: string;
  board: 'platform' | 'tenant' | 'store';
  tenantId?: string | null;
  storeId?: string | null;
}) {
  const base = params.apiBaseUrl.replace(/\/+$/, '');
  const httpBase = base.endsWith('/api/v1') ? base.slice(0, -'/api/v1'.length) : base;
  const wsOrigin = toWsOrigin(httpBase);
  const q = new URLSearchParams();
  q.set('token', params.token);
  q.set('board', params.board);
  if (params.tenantId) q.set('tenantId', params.tenantId);
  if (params.storeId) q.set('storeId', params.storeId);
  return `${wsOrigin}/ws/admin-dashboard?${q.toString()}`;
}
