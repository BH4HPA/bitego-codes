import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { getAllTableConnCounts } from './tableSession'
import { onConnCountChanged } from './connCountBus'
import { onAdminNotification } from './notificationBus'
import { AppDataSource } from '../db'
import { Notification } from '../entities/Notification'
import { AdminScope } from '../entities/AdminScope'
import { Store } from '../entities/Store'
import {
  getMaintenanceState,
  getStoreMaintenanceState,
  getTenantMaintenanceState,
  onMaintenanceChanged
} from '../services/maintenance'
import { getGlobalTokenVersion } from '../services/tokenVersion'
import { getDashboardOverviewSnapshot } from '../services/dashboardOverviewService'
import { getPrimaryStoreById, getTenantSyncSharedCatalogStatus } from '../services/tenantSyncStatusService'

type AdminClient = {
  ws: WebSocket
  userId: string
  board: 'platform' | 'tenant' | 'store'
  tenantId: string | null
  storeId: string | null
  subs: { dashboardOverview: boolean; tenantSyncStoreId: string | null }
}
type AdminMaintenanceSnapshot = {
  platform: { enabled: boolean; message: string }
  tenant: { enabled: boolean; message: string }
  store: { enabled: boolean; message: string }
}

let adminClients: Set<AdminClient> | null = null

export function createConnCountBroadcaster(params: { maxDelayMs: number; sendToAll: (payload: unknown) => void }) {
  const pending = new Map<string, number>()
  let timer: NodeJS.Timeout | null = null
  let lastFlushAt = 0

  const flush = () => {
    timer = null
    lastFlushAt = Date.now()
    if (!pending.size) return
    const data: Record<string, number> = {}
    for (const [tableId, connCount] of pending.entries()) data[tableId] = connCount
    pending.clear()
    params.sendToAll({ type: 'TABLE_CONN_COUNTS', data })
  }

  const scheduleFlush = () => {
    if (timer) return
    const now = Date.now()
    const dueIn = Math.max(0, params.maxDelayMs - (now - lastFlushAt))
    timer = setTimeout(flush, dueIn)
  }

  return {
    onChange: (e: { tableId: string; connCount: number }) => {
      pending.set(e.tableId, e.connCount)
      scheduleFlush()
    },
    stop: () => {
      if (timer) clearTimeout(timer)
      timer = null
      pending.clear()
    }
  }
}

function decodeAdmin(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (p.role !== 'ADMIN') return null
  const userId = p.userId
  if (typeof userId !== 'string' || !userId) return null
  return { userId }
}

function decodeTokenVersion(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 1
  const p = payload as Record<string, unknown>
  const gtv = p.gtv
  if (typeof gtv === 'number' && Number.isFinite(gtv) && gtv > 0) return Math.floor(gtv)
  return 1
}

function send(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload))
}

export function broadcastTableStatusChanged(e: {
  tableId: string
  storeId: string
  tenantId: string | null
  status: string
}) {
  if (!adminClients || !adminClients.size) return
  for (const c of adminClients) {
    const matched =
      (!c.tenantId && !c.storeId) ||
      (c.storeId && c.storeId === e.storeId) ||
      (c.tenantId && !c.storeId && e.tenantId && c.tenantId === e.tenantId)
    if (!matched) continue
    try {
      send(c.ws, { type: 'TABLE_STATUS_CHANGED', data: e })
    } catch {}
  }
}

async function getAdminMaintenanceSnapshot(params: { tenantId: string | null; storeId: string | null }) {
  const platform = await getMaintenanceState()
  const tenant = params.tenantId ? await getTenantMaintenanceState(params.tenantId) : { enabled: false, message: '' }
  const store = params.storeId ? await getStoreMaintenanceState(params.storeId) : { enabled: false, message: '' }
  const snap: AdminMaintenanceSnapshot = { platform, tenant, store }
  return snap
}

export function initAdminDashboardWSS() {
  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<AdminClient>()
  const dashboardTimers = new Map<string, NodeJS.Timeout>()
  const syncTimers = new Map<string, NodeJS.Timeout>()
  adminClients = clients

  const getClientByWs = (ws: WebSocket) => {
    for (const c of clients) if (c.ws === ws) return c
    return null
  }

  const maybeStopDashboardTimer = (storeId: string) => {
    if (!dashboardTimers.has(storeId)) return
    for (const c of clients) {
      if (c.storeId === storeId && c.subs.dashboardOverview) return
    }
    const t = dashboardTimers.get(storeId)
    if (t) clearInterval(t)
    dashboardTimers.delete(storeId)
  }

  const ensureDashboardTimer = (storeId: string) => {
    if (dashboardTimers.has(storeId)) return
    const timer = setInterval(() => {
      if (!clients.size) return
      const subs = Array.from(clients).filter((c) => c.storeId === storeId && c.subs.dashboardOverview)
      if (!subs.length) {
        maybeStopDashboardTimer(storeId)
        return
      }
      void (async () => {
        try {
          const data = await getDashboardOverviewSnapshot(storeId)
          for (const c of subs) send(c.ws, { type: 'DASHBOARD_OVERVIEW_SNAPSHOT', data })
        } catch {}
      })()
    }, 3000)
    dashboardTimers.set(storeId, timer)
  }

  const maybeStopSyncTimer = (storeId: string) => {
    if (!syncTimers.has(storeId)) return
    for (const c of clients) {
      if (c.subs.tenantSyncStoreId === storeId) return
    }
    const t = syncTimers.get(storeId)
    if (t) clearInterval(t)
    syncTimers.delete(storeId)
  }

  const ensureSyncTimer = (storeId: string) => {
    if (syncTimers.has(storeId)) return
    const timer = setInterval(() => {
      if (!clients.size) return
      const subs = Array.from(clients).filter((c) => c.subs.tenantSyncStoreId === storeId)
      if (!subs.length) {
        maybeStopSyncTimer(storeId)
        return
      }
      void (async () => {
        try {
          const source = await getPrimaryStoreById(storeId)
          if (!source?.tenantId) return
          const status = await getTenantSyncSharedCatalogStatus({ tenantId: source.tenantId, sourceStoreId: storeId })
          if (!status) return
          for (const c of subs)
            send(c.ws, { type: 'TENANT_SYNC_STATUS_SNAPSHOT', data: { tenantId: source.tenantId, storeId, status } })
        } catch {}
      })()
    }, 30_000)
    syncTimers.set(storeId, timer)
  }

  const canSubscribeTenantSync = async (params: { userId: string; storeId: string }) => {
    const source = await getPrimaryStoreById(params.storeId)
    if (!source?.tenantId) return { ok: false as const, reason: 'FORBIDDEN', tenantId: null as string | null }
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const superCnt = await scopeRepo.count({
      where: { userId: params.userId, tenantId: 'store_default', role: 'SUPER_ADMIN', status: 'ACTIVE' }
    })
    if (superCnt > 0) return { ok: true as const, reason: null, tenantId: source.tenantId }
    const tenantCnt = await scopeRepo.count({
      where: { userId: params.userId, tenantId: source.tenantId, role: 'TENANT_ADMIN', status: 'ACTIVE' }
    })
    if (tenantCnt > 0) return { ok: true as const, reason: null, tenantId: source.tenantId }
    return { ok: false as const, reason: 'FORBIDDEN', tenantId: source.tenantId }
  }

  onMaintenanceChanged((e) => {
    if (!clients.size) return
    void (async () => {
      for (const c of Array.from(clients)) {
        const matched =
          e.scope === 'platform' ||
          (e.scope === 'tenant' && c.tenantId && c.tenantId === e.tenantId) ||
          (e.scope === 'store' && c.storeId && c.storeId === e.storeId)
        if (!matched) continue
        try {
          const snap = await getAdminMaintenanceSnapshot({ tenantId: c.tenantId, storeId: c.storeId })
          send(c.ws, { type: 'MAINTENANCE_CHANGED', data: snap })
          if (snap.platform.enabled || snap.tenant.enabled || snap.store.enabled) {
            send(c.ws, { type: 'ERROR', data: { code: 50300, message: e.message } })
            c.ws.close()
          }
        } catch {}
      }
    })()
  })

  const broadcaster = createConnCountBroadcaster({
    maxDelayMs: 200,
    sendToAll: (payload) => {
      for (const c of clients) send(c.ws, payload)
    }
  })

  const unsub = onConnCountChanged((e) => {
    if (!clients.size) return
    broadcaster.onChange(e)
  })

  const unsubNotif = onAdminNotification((e) => {
    if (!clients.size) return
    void (async () => {
      const repo = AppDataSource.getRepository(Notification)
      const row = await repo.findOne({ where: { notificationId: e.notificationId } })
      if (!row) return
      for (const c of clients) {
        const matched =
          (!row.tenantId && !row.storeId && !c.tenantId && !c.storeId) ||
          (row.tenantId && !row.storeId && c.tenantId === row.tenantId && !c.storeId) ||
          (row.storeId && c.storeId === row.storeId)
        if (!matched) continue
        send(c.ws, { type: 'NOTIFICATION', data: row })
      }
    })()
  })

  wss.on('close', () => {
    unsub()
    unsubNotif()
    broadcaster.stop()
    for (const t of dashboardTimers.values()) clearInterval(t)
    dashboardTimers.clear()
    for (const t of syncTimers.values()) clearInterval(t)
    syncTimers.clear()
    if (adminClients === clients) adminClients = null
  })

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', 'http://localhost')
    const token = url.searchParams.get('token') || ''
    const boardParam = url.searchParams.get('board')
    const tenantId = url.searchParams.get('tenantId') || ''
    const storeId = url.searchParams.get('storeId') || ''
    const board =
      boardParam === 'platform' || boardParam === 'tenant' || boardParam === 'store'
        ? boardParam
        : storeId
          ? 'store'
          : tenantId
            ? 'tenant'
            : 'platform'
    let payload: unknown
    try {
      payload = jwt.verify(token, config.jwtSecret)
    } catch {
      send(ws, { type: 'ERROR', data: { code: 40100, message: 'Unauthorized' } })
      ws.close()
      return
    }
    const gtv = decodeTokenVersion(payload)
    const cur = await getGlobalTokenVersion()
    if (gtv !== cur) {
      send(ws, { type: 'ERROR', data: { code: 40100, message: 'Unauthorized' } })
      ws.close()
      return
    }
    const admin = decodeAdmin(payload)
    if (!admin) {
      send(ws, { type: 'ERROR', data: { code: 40300, message: 'Forbidden' } })
      ws.close()
      return
    }
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const scopes = await scopeRepo.find({
      where: { userId: admin.userId, status: 'ACTIVE' },
      order: { createdAt: 'DESC' }
    })
    const hasSuper = scopes.some((s) => s.role === 'SUPER_ADMIN')
    if (board === 'platform' && !hasSuper) {
      send(ws, { type: 'ERROR', data: { code: 40000, message: 'Missing admin context' } })
      ws.close()
      return
    }
    if (board === 'tenant' && (!tenantId || Boolean(storeId))) {
      send(ws, { type: 'ERROR', data: { code: 40000, message: 'Invalid admin context' } })
      ws.close()
      return
    }
    if (board === 'store' && !storeId) {
      send(ws, { type: 'ERROR', data: { code: 40000, message: 'Missing admin context' } })
      ws.close()
      return
    }
    if (storeId) {
      const storeRepo = AppDataSource.getRepository(Store)
      const store = await storeRepo.findOne({ where: { storeId } })
      if (!store || !store.tenantId || (tenantId && tenantId !== store.tenantId)) {
        send(ws, { type: 'ERROR', data: { code: 40000, message: 'Invalid admin context' } })
        ws.close()
        return
      }
      const ok =
        hasSuper ||
        scopes.some((s) => s.role === 'TENANT_ADMIN' && s.tenantId === store.tenantId) ||
        scopes.some((s) => s.role === 'STORE_ADMIN' && s.storeId === storeId)
      if (!ok) {
        send(ws, { type: 'ERROR', data: { code: 40300, message: 'Forbidden' } })
        ws.close()
        return
      }
    } else if (tenantId) {
      const ok = hasSuper || scopes.some((s) => s.role === 'TENANT_ADMIN' && s.tenantId === tenantId)
      if (!ok) {
        send(ws, { type: 'ERROR', data: { code: 40300, message: 'Forbidden' } })
        ws.close()
        return
      }
    }

    const snap = await getAdminMaintenanceSnapshot({ tenantId: tenantId || null, storeId: storeId || null })
    send(ws, { type: 'MAINTENANCE_SNAPSHOT', data: snap })
    if (snap.platform.enabled) {
      send(ws, { type: 'ERROR', data: { code: 50300, message: snap.platform.message } })
      ws.close()
      return
    }
    if (snap.store.enabled) {
      send(ws, { type: 'ERROR', data: { code: 50300, message: snap.store.message } })
      ws.close()
      return
    }
    if (snap.tenant.enabled) {
      send(ws, { type: 'ERROR', data: { code: 50300, message: snap.tenant.message } })
      ws.close()
      return
    }

    const pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return
      try {
        ws.ping()
      } catch {}
    }, 5000)

    clients.add({
      ws,
      userId: admin.userId,
      board,
      tenantId: tenantId || null,
      storeId: storeId || null,
      subs: { dashboardOverview: false, tenantSyncStoreId: null }
    })
    send(ws, { type: 'TABLE_CONN_COUNTS_SNAPSHOT', data: getAllTableConnCounts() })

    ws.on('message', (data) => {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
      if (raw === 'PING') {
        send(ws, { type: 'PONG', ts: Date.now() })
        return
      }
      let msg: unknown = null
      try {
        msg = JSON.parse(raw)
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      const m = msg as Record<string, unknown>
      if (m.type === 'PING') {
        const ts = typeof m.ts === 'number' && Number.isFinite(m.ts) ? m.ts : Date.now()
        send(ws, { type: 'PONG', ts })
        return
      }
      const c = getClientByWs(ws)
      if (!c) return

      if (m.type === 'SUBSCRIBE_DASHBOARD_OVERVIEW') {
        if (!c.storeId) {
          send(ws, { type: 'SUBSCRIBE_RESULT', data: { topic: 'DASHBOARD_OVERVIEW', ok: false } })
          return
        }
        c.subs.dashboardOverview = true
        ensureDashboardTimer(c.storeId)
        void (async () => {
          try {
            const data = await getDashboardOverviewSnapshot(c.storeId as string)
            send(ws, { type: 'DASHBOARD_OVERVIEW_SNAPSHOT', data })
            send(ws, { type: 'SUBSCRIBE_RESULT', data: { topic: 'DASHBOARD_OVERVIEW', ok: true } })
          } catch {
            send(ws, { type: 'SUBSCRIBE_RESULT', data: { topic: 'DASHBOARD_OVERVIEW', ok: false } })
          }
        })()
        return
      }
      if (m.type === 'UNSUBSCRIBE_DASHBOARD_OVERVIEW') {
        if (!c.storeId) return
        c.subs.dashboardOverview = false
        maybeStopDashboardTimer(c.storeId)
        return
      }
      if (m.type === 'SUBSCRIBE_TENANT_SYNC_STATUS') {
        const storeIdRaw = typeof m.storeId === 'string' ? m.storeId.trim() : ''
        if (!storeIdRaw) {
          send(ws, { type: 'SUBSCRIBE_RESULT', data: { topic: 'TENANT_SYNC_STATUS', ok: false } })
          return
        }
        void (async () => {
          const check = await canSubscribeTenantSync({ userId: c.userId, storeId: storeIdRaw })
          if (!check.ok) {
            send(ws, { type: 'SUBSCRIBE_RESULT', data: { topic: 'TENANT_SYNC_STATUS', ok: false } })
            return
          }
          c.subs.tenantSyncStoreId = storeIdRaw
          ensureSyncTimer(storeIdRaw)
          const status = await getTenantSyncSharedCatalogStatus({
            tenantId: check.tenantId as string,
            sourceStoreId: storeIdRaw
          })
          if (!status) {
            send(ws, { type: 'SUBSCRIBE_RESULT', data: { topic: 'TENANT_SYNC_STATUS', ok: false } })
            return
          }
          send(ws, {
            type: 'TENANT_SYNC_STATUS_SNAPSHOT',
            data: { tenantId: check.tenantId, storeId: storeIdRaw, status }
          })
          send(ws, { type: 'SUBSCRIBE_RESULT', data: { topic: 'TENANT_SYNC_STATUS', ok: true } })
        })()
        return
      }
      if (m.type === 'UNSUBSCRIBE_TENANT_SYNC_STATUS') {
        const prev = c.subs.tenantSyncStoreId
        c.subs.tenantSyncStoreId = null
        if (prev) maybeStopSyncTimer(prev)
      }
    })

    ws.on('close', () => {
      clearInterval(pingTimer)
      const c = getClientByWs(ws)
      if (c?.storeId) maybeStopDashboardTimer(c.storeId)
      const syncStoreId = c?.subs.tenantSyncStoreId
      if (syncStoreId) maybeStopSyncTimer(syncStoreId)
      if (c) clients.delete(c)
    })
  })

  return wss
}
