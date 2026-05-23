const test = require('node:test')
const assert = require('node:assert/strict')
const { WebSocket } = require('ws')
const { withServer, getDevToken, terminateWs, connectTableSessionWs, storeAdminAuthz } = require('./testUtils')

test('table-session ws de-duplicates USER_JOINED for the same user reconnecting', async () => {
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

      const userIdA = `usr_a_${Date.now()}`
      const userIdB = `usr_b_${Date.now()}`

      const { ws: wsA } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: userIdA, tableId, sessionToken },
        { retries: 3, timeoutMs: 12000 }
      )
      sockets.push(wsA)

      const userJoinedB = []
      wsA.on('message', (raw) => {
        let msg = null
        try {
          msg = JSON.parse(String(raw))
        } catch {
          return
        }
        if (msg && msg.type === 'USER_JOINED' && msg.data && msg.data.userId === userIdB) {
          userJoinedB.push(msg)
        }
      })

      const { ws: wsB1 } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: userIdB, tableId, sessionToken },
        { retries: 3, timeoutMs: 12000 }
      )
      sockets.push(wsB1)
      await new Promise((r) => setTimeout(r, 300))
      assert.equal(userJoinedB.length, 1, 'peer A should receive USER_JOINED once for user B on first connect')

      const { ws: wsB2 } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: userIdB, tableId, sessionToken },
        { retries: 3, timeoutMs: 12000 }
      )
      sockets.push(wsB2)
      await new Promise((r) => setTimeout(r, 500))
      assert.equal(
        userJoinedB.length,
        1,
        'peer A should not receive another USER_JOINED when user B opens a second connection'
      )
    },
    null,
    async () => {
      for (const ws of sockets) terminateWs(ws)
    },
    { withTableSessionWs: true }
  )
})

test('GET /api/v1/tables/:id returns a stable sessionToken for the same session version', async () => {
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

      const first = await fetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(first.status, 200)
      const tokenA = (await first.json()).data.sessionToken
      await new Promise((r) => setTimeout(r, 1100))
      const second = await fetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(second.status, 200)
      const tokenB = (await second.json()).data.sessionToken

      assert.ok(tokenA && tokenB)
      assert.equal(tokenA, tokenB, 'sessionToken should be deterministic for the same session version')
    },
    null,
    null,
    { withTableSessionWs: true }
  )
})
