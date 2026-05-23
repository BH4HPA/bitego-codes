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

test('table-session ws allows concurrent ops from different clients', async () => {
  const sockets = []
  await withServer(
    async (ctx) => {
      const adminToken = await getDevToken(ctx.base, 'ADMIN')
      const authz = storeAdminAuthz(adminToken)

      const createTable = await fetch(`${ctx.base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ code: `T_${Date.now()}` })
      })
      assert.equal(createTable.status, 201)
      const tableId = (await createTable.json()).data.tableId

      const tableResp = await fetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(tableResp.status, 200)
      const sessionToken = (await tableResp.json()).data.sessionToken
      assert.ok(sessionToken)

      const goodId = `good_vm_${Date.now()}`
      const goodRepo = ctx.AppDataSource.getRepository(require('../dist/entities/Good').Good)
      await goodRepo.save(
        goodRepo.create({
          goodId,
          storeId: 'store_default',
          categoryId: 'cat_test',
          name: 'G',
          description: '',
          sales: 0,
          status: 'ON_SHELF'
        })
      )

      const skuCreate = await fetch(`${ctx.base}/api/v1/skus`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ goodId, specCombination: '默认', priceCents: 1000, stock: 99, status: 'ON_SHELF' })
      })
      assert.equal(skuCreate.status, 201)
      const skuId = (await skuCreate.json()).data.skuId
      assert.ok(skuId)

      const { ws: wsA, snapshot: snapA } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: `usrA_${Date.now()}`, tableId, sessionToken },
        { retries: 3, timeoutMs: 15000 }
      )
      const { ws: wsB, snapshot: snapB } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: `usrB_${Date.now()}`, tableId, sessionToken },
        { retries: 3, timeoutMs: 15000 }
      )
      sockets.push(wsA, wsB)

      assert.equal(typeof snapA.version, 'number')
      assert.equal(typeof snapB.version, 'number')
      assert.equal(snapA.version, snapB.version)

      const v1 = snapA.version
      wsA.send(
        JSON.stringify({ opId: `opA_${Date.now()}`, opType: 'ADD_ITEM', baseVersion: v1, payload: { skuId, qty: 1 } })
      )
      const a1 = await waitForWsMessage(wsA, (m) => m.type === 'CART_UPDATED' || m.type === 'ERROR', 15000)
      const b1 = await waitForWsMessage(wsB, (m) => m.type === 'CART_UPDATED' || m.type === 'ERROR', 15000)
      assert.equal(a1.type, 'CART_UPDATED')
      assert.equal(b1.type, 'CART_UPDATED')
      assert.equal(a1.version, v1 + 1)
      assert.equal(b1.version, v1 + 1)

      wsB.send(
        JSON.stringify({
          opId: `opB_${Date.now()}`,
          opType: 'ADD_ITEM',
          baseVersion: v1 + 1,
          payload: { skuId, qty: 1 }
        })
      )
      const a2 = await waitForWsMessage(wsA, (m) => m.type === 'CART_UPDATED' || m.type === 'ERROR', 15000)
      const b2 = await waitForWsMessage(wsB, (m) => m.type === 'CART_UPDATED' || m.type === 'ERROR', 15000)
      assert.equal(a2.type, 'CART_UPDATED')
      assert.equal(b2.type, 'CART_UPDATED')
      assert.equal(a2.version, v1 + 2)
      assert.equal(b2.version, v1 + 2)
    },
    null,
    async () => {
      for (const ws of sockets) terminateWs(ws)
    },
    { withTableSessionWs: true, withAdminDashboardWs: true }
  )
})
