const test = require('node:test')
const assert = require('node:assert/strict')
const WebSocket = require('ws')
const {
  withServer,
  getDevToken,
  getAuthz,
  jsonFetch,
  terminateWs,
  waitForWsMessage,
  waitForWsOpen
} = require('./testUtils')

test('admin dashboard websocket broadcasts table status changes', async () => {
  let ws = null
  await withServer(
    async (ctx) => {
      const token = await getDevToken(ctx.base, 'ADMIN')
      ws = new WebSocket(
        `${ctx.base.replace('http://', 'ws://')}/ws/admin-dashboard?token=${encodeURIComponent(token)}`
      )
      await waitForWsOpen(ws)
      await waitForWsMessage(ws, (m) => m && (m.type === 'TABLE_CONN_COUNTS_SNAPSHOT' || m.type === 'ERROR'), 12000)

      const authz = await getAuthz(ctx.base, 'ADMIN')
      const headers = {
        ...authz,
        'content-type': 'application/json',
        'x-tenant-id': 'store_default',
        'x-store-id': 'store_default'
      }
      const { resp: cResp, json: cJson } = await jsonFetch(`${ctx.base}/api/v1/tables`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: 'T-WS-1' })
      })
      assert.equal(cResp.status, 201)
      const tableId = cJson.data.tableId
      assert.ok(typeof tableId === 'string' && tableId)

      const p1 = waitForWsMessage(
        ws,
        (m) =>
          m &&
          m.type === 'TABLE_STATUS_CHANGED' &&
          m.data &&
          m.data.tableId === tableId &&
          m.data.status === 'OCCUPIED',
        12000
      )
      const { resp: gResp } = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`, {
        method: 'GET'
      })
      assert.equal(gResp.status, 200)
      const msg1 = await p1
      assert.equal(msg1.data.tableId, tableId)

      const p2 = waitForWsMessage(
        ws,
        (m) =>
          m && m.type === 'TABLE_STATUS_CHANGED' && m.data && m.data.tableId === tableId && m.data.status === 'FREE',
        12000
      )
      const { resp: fResp } = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}/force-clear`, {
        method: 'POST',
        headers
      })
      assert.equal(fResp.status, 200)
      const msg2 = await p2
      assert.equal(msg2.data.tableId, tableId)
    },
    null,
    async () => {
      terminateWs(ws)
    },
    { withAdminDashboardWs: true }
  )
})
