const test = require('node:test')
const assert = require('node:assert/strict')
const { WebSocket } = require('ws')
const {
  withServer,
  getDevToken,
  terminateWs,
  waitForWsMessage,
  connectTableSessionWs,
  storeAdminAuthz
} = require('./testUtils')

test('table-session ws supports PING/PONG heartbeat', async () => {
  const sockets = []
  await withServer(
    async (ctx) => {
      const adminToken = await getDevToken(ctx.base, 'ADMIN')
      const adminAuthz = storeAdminAuthz(adminToken)

      const createTable = await fetch(`${ctx.base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ code: `T_${Date.now()}` })
      })
      assert.equal(createTable.status, 201)
      const tableId = (await createTable.json()).data.tableId

      const tableResp = await fetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(tableResp.status, 200)
      const sessionToken = (await tableResp.json()).data.sessionToken
      assert.ok(sessionToken)

      const { ws, snapshot: snap } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: `usr_${Date.now()}`, tableId, sessionToken },
        { retries: 3, timeoutMs: 12000 }
      )
      sockets.push(ws)

      assert.equal(snap.type, 'CART_SNAPSHOT')
      ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }))

      const pong = await waitForWsMessage(ws, (m) => m.type === 'PONG' || m.type === 'ERROR')
      assert.equal(pong.type, 'PONG')

      ws.send(JSON.stringify({ type: 'SYNC', ts: Date.now() }))
      const syncSnap = await waitForWsMessage(ws, (m) => m.type === 'CART_SNAPSHOT' || m.type === 'ERROR')
      assert.equal(syncSnap.type, 'CART_SNAPSHOT')
      assert.equal(typeof syncSnap.version, 'number')
    },
    null,
    async () => {
      for (const ws of sockets) terminateWs(ws)
    },
    { withTableSessionWs: true }
  )
})
