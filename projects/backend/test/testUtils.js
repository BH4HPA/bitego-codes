const http = require('node:http')
const https = require('node:https')

function ensureEnv() {
  process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'
  process.env.DB_PORT = process.env.DB_PORT || '3306'
  process.env.DB_USER = process.env.DB_USER || 'bitego'
  process.env.DB_PASS = process.env.DB_PASS || 'bitego'
  process.env.DB_NAME = process.env.DB_NAME || 'bitego'
  process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'bitego-secret'
  process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin'
}

function closeServerConnections(server) {
  if (!server) return
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections()
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
}

function terminateWs(ws) {
  try {
    if (!ws) return
    if (ws.readyState <= 1 && typeof ws.terminate === 'function') ws.terminate()
    else if (ws.readyState <= 1 && typeof ws.close === 'function') ws.close()
  } catch {}
}

function makeRequestId(prefix = 'req') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`
}

function waitForWsMessage(ws, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, timeoutMs)
    const onMessage = (data) => {
      let msg = null
      try {
        msg = JSON.parse(String(data))
      } catch {
        msg = null
      }
      if (!msg) return
      if (!predicate(msg)) return
      cleanup()
      resolve(msg)
    }
    const onError = (e) => {
      cleanup()
      reject(e)
    }
    const cleanup = () => {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
  })
}

function waitForWsOpen(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('open timeout'))
    }, timeoutMs)
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = (e) => {
      cleanup()
      reject(e)
    }
    const cleanup = () => {
      clearTimeout(timer)
      ws.off('open', onOpen)
      ws.off('error', onError)
    }
    ws.on('open', onOpen)
    ws.on('error', onError)
  })
}

async function startServer(opts) {
  const options =
    opts && typeof opts === 'object'
      ? {
          withRedis: opts.withRedis !== false,
          withDb: opts.withDb !== false,
          withTableSessionWs: Boolean(opts.withTableSessionWs),
          withAdminDashboardWs: Boolean(opts.withAdminDashboardWs)
        }
      : { withRedis: true, withDb: true, withTableSessionWs: false, withAdminDashboardWs: false }
  ensureEnv()
  const { initRedis, closeRedis } = require('../dist/redis')
  const { AppDataSource } = require('../dist/db')
  const { createApp } = require('../dist/app')

  if (options.withRedis) await initRedis()
  if (options.withDb) await AppDataSource.initialize()

  const app = createApp()
  const server = http.createServer(app)
  let upgradeHandler = null
  let tableWss = null
  let adminWss = null
  if (options.withTableSessionWs || options.withAdminDashboardWs) {
    const { initTableSessionWSS } = require('../dist/ws/tableSession')
    const { initAdminDashboardWSS } = require('../dist/ws/adminDashboard')
    if (options.withTableSessionWs) tableWss = initTableSessionWSS()
    if (options.withAdminDashboardWs) adminWss = initAdminDashboardWSS()
    upgradeHandler = (req, socket, head) => {
      const url = req.url || ''
      const index = url.indexOf('?')
      const pathname = index !== -1 ? url.slice(0, index) : url
      if (pathname === '/ws/table-session' && tableWss) {
        tableWss.handleUpgrade(req, socket, head, (ws) => tableWss.emit('connection', ws, req))
        return
      }
      if (pathname === '/ws/admin-dashboard' && adminWss) {
        adminWss.handleUpgrade(req, socket, head, (ws) => adminWss.emit('connection', ws, req))
        return
      }
      socket.destroy()
    }
    server.on('upgrade', upgradeHandler)
  }
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`

  const close = async () => {
    if (upgradeHandler) server.off('upgrade', upgradeHandler)
    if (tableWss) await new Promise((resolve) => tableWss.close(resolve))
    if (adminWss) await new Promise((resolve) => adminWss.close(resolve))
    if (options.withDb) await AppDataSource.destroy()
    closeServerConnections(server)
    await new Promise((resolve) => server.close(resolve))
    if (options.withRedis) await closeRedis()
  }

  return { base, server, AppDataSource, close, tableWss, adminWss }
}

async function withHttpServer(app, fn) {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    return await fn({ base, server })
  } finally {
    closeServerConnections(server)
    await new Promise((resolve) => server.close(resolve))
  }
}

async function jsonFetch(url, opts) {
  const o = opts && typeof opts === 'object' ? opts : {}
  const body = o.body
  const isSimpleBody = body == null || typeof body === 'string' || Buffer.isBuffer(body)
  const tryHttp1 = async () => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const method = typeof o.method === 'string' && o.method ? o.method : 'GET'
    const headers = o.headers && typeof o.headers === 'object' ? o.headers : {}
    const reqBody = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body))
    return await new Promise((resolve, reject) => {
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          method,
          path: `${u.pathname}${u.search}`,
          headers
        },
        (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(Buffer.from(c)))
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            const headerMap = {}
            for (const [k, v] of Object.entries(res.headers || {})) headerMap[String(k).toLowerCase()] = v
            const resp = {
              status: Number(res.statusCode || 0),
              ok: Number(res.statusCode || 0) >= 200 && Number(res.statusCode || 0) < 300,
              headers: { get: (k) => headerMap[String(k || '').toLowerCase()] || null }
            }
            let json = null
            try {
              json = text ? JSON.parse(text) : null
            } catch {
              json = null
            }
            resolve({ resp, json, text })
          })
        }
      )
      req.on('error', reject)
      if (reqBody) req.write(reqBody)
      req.end()
    })
  }

  try {
    const resp = await fetch(url, o)
    const text = await resp.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { resp, json, text }
  } catch (e) {
    const err = e
    const cause = err && typeof err === 'object' ? err.cause : null
    const code = cause && typeof cause === 'object' ? cause.code : null
    const msg = err instanceof Error ? err.message : ''
    const shouldFallback = isSimpleBody && (code === 'HPE_INVALID_CONSTANT' || String(msg).includes('Expected HTTP/'))
    if (!shouldFallback) throw e
    return await tryHttp1()
  }
}

async function getDevToken(base, role = 'ADMIN', userId) {
  const { resp, json } = await jsonFetch(`${base}/api/v1/auth/dev-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, userId })
  })
  if (!resp.ok) throw new Error(`dev-token failed: ${resp.status}`)
  return json.data.token
}

function adminContextHeaders(params) {
  const p = params && typeof params === 'object' ? params : {}
  const headers = {}
  if (typeof p.board === 'string' && p.board) headers['x-board'] = p.board
  if (typeof p.tenantId === 'string' && p.tenantId) headers['x-tenant-id'] = p.tenantId
  if (typeof p.storeId === 'string' && p.storeId) headers['x-store-id'] = p.storeId
  return headers
}

function adminAuthz(token, params) {
  const p = params && typeof params === 'object' ? params : {}
  return { authorization: `Bearer ${token}`, ...adminContextHeaders(p), ...(p.headers || {}) }
}

function bearerAuthz(token, headers) {
  const h = headers && typeof headers === 'object' ? headers : {}
  return { authorization: `Bearer ${token}`, ...h }
}

function customerAuthz(token, headers) {
  return bearerAuthz(token, headers)
}

function platformAdminAuthz(token, headers) {
  return adminAuthz(token, { board: 'platform', headers })
}

function tenantAdminAuthz(token, tenantId = 'store_default', headers) {
  return adminAuthz(token, { board: 'tenant', tenantId, headers })
}

function storeAdminAuthz(token, tenantId = 'store_default', storeId = tenantId, headers) {
  return adminAuthz(token, { board: 'store', tenantId, storeId, headers })
}

async function getAuthz(base, role = 'ADMIN', userId) {
  const token = await getDevToken(base, role, userId)
  if (role === 'ADMIN' && !userId) {
    return storeAdminAuthz(token)
  }
  return { authorization: `Bearer ${token}` }
}

async function connectTableSessionWs(base, WebSocketCtor, params, opts) {
  const p = params && typeof params === 'object' ? params : {}
  const role = typeof p.role === 'string' && p.role ? p.role : 'USER'
  const userId = typeof p.userId === 'string' && p.userId ? p.userId : undefined
  const tableId = typeof p.tableId === 'string' ? p.tableId : ''
  const sessionToken = typeof p.sessionToken === 'string' ? p.sessionToken : ''
  const o = opts && typeof opts === 'object' ? opts : {}
  const retries = Number.isInteger(o.retries) ? o.retries : 2
  const timeoutMs = Number.isInteger(o.timeoutMs) ? o.timeoutMs : 12000
  if (!base) throw new Error('connectTableSessionWs: invalid base')
  if (!WebSocketCtor) throw new Error('connectTableSessionWs: invalid WebSocketCtor')
  if (!tableId || !sessionToken) throw new Error('connectTableSessionWs: invalid table session')

  let lastError = null
  for (let i = 0; i < retries; i += 1) {
    const token = await getDevToken(base, role, userId)
    const wsUrl = `${base.replace('http://', 'ws://')}/ws/table-session?token=${encodeURIComponent(token)}&tableId=${encodeURIComponent(
      tableId
    )}&sessionToken=${encodeURIComponent(sessionToken)}`
    const ws = new WebSocketCtor(wsUrl)
    try {
      await waitForWsOpen(ws, Math.min(5000, timeoutMs))
      const msg = await waitForWsMessage(ws, (m) => m && (m.type === 'CART_SNAPSHOT' || m.type === 'ERROR'), timeoutMs)
      if (msg.type === 'CART_SNAPSHOT') return { ws, snapshot: msg, token }
      terminateWs(ws)
      if (msg && msg.data && msg.data.code === 40100) {
        lastError = new Error('Unauthorized')
        continue
      }
      throw new Error(`ws error: ${JSON.stringify(msg)}`)
    } catch (e) {
      lastError = e
      terminateWs(ws)
    }
  }
  throw lastError || new Error('connectTableSessionWs: failed')
}

async function withRedis(arg1, arg2, arg3) {
  if (typeof arg1 !== 'function') throw new Error('withRedis: invalid args')
  const fn = arg1
  const beforeInit = typeof arg2 === 'function' ? arg2 : null
  const finallyHook = typeof arg3 === 'function' ? arg3 : null
  ensureEnv()
  if (beforeInit) await beforeInit()
  const { initRedis, closeRedis } = require('../dist/redis')
  await initRedis()
  try {
    return await fn()
  } finally {
    try {
      if (finallyHook) await finallyHook()
    } finally {
      await closeRedis()
    }
  }
}

async function loginAdmin(base, username, password) {
  const { resp, json } = await jsonFetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  return { resp, json }
}

async function withServer(arg1, arg2, arg3, arg4) {
  if (arg1 && typeof arg1 === 'object' && typeof arg2 === 'function') {
    const ctx = await startServer(arg1)
    try {
      return await arg2(ctx)
    } finally {
      await ctx.close()
    }
  }
  if (typeof arg1 !== 'function') throw new Error('withServer: invalid args')
  const fn = arg1
  const beforeInit = typeof arg2 === 'function' ? arg2 : null
  const finallyHook = typeof arg3 === 'function' ? arg3 : null
  const opts = arg4 && typeof arg4 === 'object' ? arg4 : undefined
  if (beforeInit) await beforeInit()
  const ctx = await startServer(opts)
  try {
    return await fn(ctx)
  } finally {
    try {
      if (finallyHook) await finallyHook(ctx)
    } finally {
      await ctx.close()
    }
  }
}

module.exports = {
  ensureEnv,
  startServer,
  withServer,
  withHttpServer,
  withRedis,
  closeServerConnections,
  terminateWs,
  makeRequestId,
  waitForWsMessage,
  waitForWsOpen,
  jsonFetch,
  getDevToken,
  adminContextHeaders,
  adminAuthz,
  bearerAuthz,
  customerAuthz,
  platformAdminAuthz,
  tenantAdminAuthz,
  storeAdminAuthz,
  getAuthz,
  connectTableSessionWs,
  loginAdmin
}
